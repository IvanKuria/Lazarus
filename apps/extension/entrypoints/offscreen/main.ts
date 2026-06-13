import { browser } from "wxt/browser";
import { IdbObservationStore, splitChunks, BlobAssembler } from "@lazarus/core";
import { SignalingClient, type Signal } from "../../lib/signaling-client.js";
import { IndexClient } from "../../lib/index-client.js";
import { bytesToBase64 } from "../../lib/base64.js";

/**
 * Offscreen P2P peer.
 *
 * Lives in a long-lived offscreen document (the only place MV3 allows persistent
 * WebRTC). Each node both SERVES snapshots it holds and FETCHES snapshots it
 * lacks from peers — transferred directly over an RTCDataChannel, verified
 * against the CID on arrival. The signaling hub only introduces peers; bytes
 * never touch the server.
 */
const HIGH_WATER = 8 * 1024 * 1024;
const peerId = crypto.randomUUID();
const store = new IdbObservationStore("lazarus");
const signaling = new SignalingClient(peerId);
const index = new IndexClient();

// ICE servers for NAT traversal: public STUN by default, refreshed from the
// backend (which adds ephemeral TURN creds when configured). TURN creds are
// short-lived, so re-fetch periodically. `iceReady` lets connection setup wait
// for the best-available servers before the first offer/answer.
let iceServers: RTCIceServer[] = [{ urls: ["stun:stun.l.google.com:19302"] }];
let iceReady: Promise<void> = refreshIce();
async function refreshIce(): Promise<void> {
  const servers = await index.getIceServers().catch(() => null);
  if (servers && servers.length) iceServers = servers;
}
setInterval(() => {
  iceReady = refreshIce();
}, 8 * 60 * 1000);

interface Conn {
  pc: RTCPeerConnection;
  pendingIce: RTCIceCandidateInit[];
  remoteSet: boolean;
}
const conns = new Map<string, Conn>();

function newConn(remoteId: string): Conn {
  const pc = new RTCPeerConnection({ iceServers });
  const conn: Conn = { pc, pendingIce: [], remoteSet: false };
  pc.onicecandidate = (e) => {
    if (e.candidate) signaling.sendSignal(remoteId, { ice: e.candidate.toJSON() });
  };
  conns.set(remoteId, conn);
  return conn;
}

async function flushIce(conn: Conn): Promise<void> {
  for (const ice of conn.pendingIce) {
    try {
      await conn.pc.addIceCandidate(ice);
    } catch {
      /* ignore */
    }
  }
  conn.pendingIce = [];
}

/** Provider side: answer "want" requests by streaming the snapshot in chunks. */
function serveOn(pc: RTCPeerConnection): void {
  pc.ondatachannel = (e) => {
    const dc = e.channel;
    dc.binaryType = "arraybuffer";
    dc.onmessage = async (ev) => {
      if (typeof ev.data !== "string") return;
      const req = JSON.parse(ev.data);
      if (req.type !== "want") return;
      const bytes = await store.getSnapshot(req.cid);
      if (!bytes) {
        dc.send(JSON.stringify({ type: "miss" }));
        return;
      }
      const chunks = splitChunks(bytes);
      dc.send(JSON.stringify({ type: "head", cid: req.cid, total: chunks.length }));
      for (const chunk of chunks) {
        if (dc.bufferedAmount > HIGH_WATER) {
          await new Promise<void>((resolve) => {
            dc.bufferedAmountLowThreshold = 1024 * 1024;
            dc.onbufferedamountlow = () => resolve();
          });
        }
        dc.send(chunk.slice());
      }
    };
  };
}

signaling.onSignal(async (from, signal: Signal) => {
  const sdp = signal.sdp as RTCSessionDescriptionInit | undefined;
  const ice = signal.ice as RTCIceCandidateInit | undefined;
  let conn = conns.get(from);

  if (sdp?.type === "offer") {
    await iceReady;
    conn = conn ?? newConn(from);
    serveOn(conn.pc);
    await conn.pc.setRemoteDescription(sdp);
    conn.remoteSet = true;
    await flushIce(conn);
    const answer = await conn.pc.createAnswer();
    await conn.pc.setLocalDescription(answer);
    signaling.sendSignal(from, { sdp: conn.pc.localDescription?.toJSON() });
  } else if (sdp?.type === "answer" && conn) {
    await conn.pc.setRemoteDescription(sdp);
    conn.remoteSet = true;
    await flushIce(conn);
  } else if (ice && conn) {
    if (conn.remoteSet) {
      try {
        await conn.pc.addIceCandidate(ice);
      } catch {
        /* ignore */
      }
    } else {
      conn.pendingIce.push(ice);
    }
  }
});

/** Fetcher side: pull a blob by CID from whichever peer holds it. */
async function fetchBlob(cid: string): Promise<Uint8Array | null> {
  await signaling.connect();
  await iceReady;
  const providers = await signaling.requestProviders(cid);
  const providerId = providers[0];
  if (!providerId) return null;

  const conn = newConn(providerId);
  const dc = conn.pc.createDataChannel("lazarus-blob");
  dc.binaryType = "arraybuffer";

  const result = new Promise<Uint8Array | null>((resolve) => {
    let assembler: BlobAssembler | null = null;
    let seq = 0;
    const timer = setTimeout(() => resolve(null), 15000);
    const done = (v: Uint8Array | null) => {
      clearTimeout(timer);
      resolve(v);
    };

    dc.onopen = () => dc.send(JSON.stringify({ type: "want", cid }));
    dc.onmessage = async (ev) => {
      if (typeof ev.data === "string") {
        const m = JSON.parse(ev.data);
        if (m.type === "head") {
          assembler = new BlobAssembler(cid, m.total);
          seq = 0;
          if (m.total === 0) done(new Uint8Array(0));
        } else if (m.type === "miss") {
          done(null);
        }
      } else if (assembler) {
        assembler.add(seq++, new Uint8Array(ev.data as ArrayBuffer));
        if (assembler.complete) {
          try {
            done(await assembler.assemble());
          } catch {
            done(null);
          }
        }
      }
    };
  });

  const offer = await conn.pc.createOffer();
  await conn.pc.setLocalDescription(offer);
  signaling.sendSignal(providerId, { sdp: conn.pc.localDescription?.toJSON() });
  return result;
}

// Announce everything we already hold, so peers can find us.
void (async () => {
  await signaling.connect();
  for (const cid of await store.listSnapshotCids()) signaling.announce(cid);
})();

browser.runtime.onMessage.addListener((msg: { type?: string; cid?: string }) => {
  if (msg?.type === "p2p:announce" && msg.cid) {
    void signaling.connect().then(() => signaling.announce(msg.cid!));
    return;
  }
  if (msg?.type === "p2p:fetch" && msg.cid) {
    return fetchBlob(msg.cid).then((bytes) => ({
      ok: bytes !== null,
      base64: bytes ? bytesToBase64(bytes) : null,
    }));
  }
  return undefined;
});
