/**
 * Signaling hub — the rendezvous for the P2P data plane.
 *
 * Peers register a connection, announce which CIDs they hold, and relay WebRTC
 * SDP/ICE to each other. The hub never sees snapshot bytes — only the metadata
 * needed to introduce two peers, who then transfer blobs directly. Kept pure
 * (transport injected as `send`) so it's testable without real sockets.
 */
export type Signal = Record<string, unknown>;

export interface RelayMessage {
  type: "signal";
  from: string;
  signal: Signal;
}

type Send = (message: RelayMessage) => void;

export class SignalingHub {
  private readonly peers = new Map<string, Send>();
  private readonly providers_ = new Map<string, Set<string>>(); // cid → peerIds

  register(peerId: string, send: Send): void {
    this.peers.set(peerId, send);
  }

  unregister(peerId: string): void {
    this.peers.delete(peerId);
    for (const holders of this.providers_.values()) holders.delete(peerId);
  }

  /** Forward a WebRTC signal from one peer to another, if the target is connected. */
  relay(from: string, to: string, signal: Signal): void {
    const send = this.peers.get(to);
    if (send) send({ type: "signal", from, signal });
  }

  /** Record that a peer holds a CID. */
  announce(peerId: string, cid: string): void {
    let holders = this.providers_.get(cid);
    if (!holders) {
      holders = new Set();
      this.providers_.set(cid, holders);
    }
    holders.add(peerId);
  }

  /** Peers holding a CID, optionally excluding the asking peer. */
  providers(cid: string, exclude?: string): string[] {
    const holders = this.providers_.get(cid);
    if (!holders) return [];
    return [...holders].filter((id) => id !== exclude);
  }
}
