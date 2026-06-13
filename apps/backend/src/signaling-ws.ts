import { WebSocketServer } from "ws";
import type { Server } from "node:http";
import { SignalingHub } from "./signaling.js";

/**
 * WebSocket transport for the SignalingHub. Peers connect to /signal, register,
 * announce the CIDs they hold, look up providers, and relay WebRTC SDP/ICE.
 */
interface ClientMessage {
  type: "register" | "announce" | "providers" | "signal";
  peerId?: string;
  cid?: string;
  reqId?: string;
  to?: string;
  signal?: Record<string, unknown>;
}

export function attachSignaling(
  server: Server,
  hub: SignalingHub = new SignalingHub(),
): WebSocketServer {
  const wss = new WebSocketServer({ server, path: "/signal" });

  wss.on("connection", (socket) => {
    let peerId: string | undefined;

    socket.on("message", (raw) => {
      let msg: ClientMessage;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }

      if (msg.type === "register" && msg.peerId) {
        peerId = msg.peerId;
        hub.register(peerId, (m) => socket.send(JSON.stringify(m)));
      } else if (msg.type === "announce" && peerId && msg.cid) {
        hub.announce(peerId, msg.cid);
      } else if (msg.type === "providers" && msg.cid) {
        socket.send(
          JSON.stringify({
            type: "providers",
            reqId: msg.reqId,
            peers: hub.providers(msg.cid, peerId),
          }),
        );
      } else if (msg.type === "signal" && peerId && msg.to && msg.signal) {
        hub.relay(peerId, msg.to, msg.signal);
      }
    });

    socket.on("close", () => {
      if (peerId) hub.unregister(peerId);
    });
  });

  return wss;
}
