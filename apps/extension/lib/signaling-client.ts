/**
 * WebSocket client for the signaling hub. Used by the offscreen peer to
 * register, announce held CIDs, discover providers, and relay WebRTC SDP/ICE.
 */
export type Signal = Record<string, unknown>;
type SignalHandler = (from: string, signal: Signal) => void;

// Prod uses wss:// at the deployed origin (WXT_PUBLIC_* is inlined at build);
// dev and tests fall back to the local docker-compose signaling hub.
const DEFAULT_URL =
  import.meta.env.WXT_PUBLIC_SIGNAL_URL ?? "ws://localhost:8787/signal";

export class SignalingClient {
  private ws?: WebSocket;
  private ready?: Promise<void>;
  private readonly providerWaiters = new Map<string, (peers: string[]) => void>();
  private signalHandler?: SignalHandler;

  constructor(
    private readonly peerId: string,
    private readonly url: string = DEFAULT_URL,
  ) {}

  connect(): Promise<void> {
    if (this.ready) return this.ready;
    this.ready = new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(this.url);
      this.ws = ws;
      ws.onopen = () => {
        ws.send(JSON.stringify({ type: "register", peerId: this.peerId }));
        resolve();
      };
      ws.onerror = (e) => reject(e);
      ws.onmessage = (ev) => {
        const msg = JSON.parse(ev.data as string);
        if (msg.type === "providers" && msg.reqId) {
          this.providerWaiters.get(msg.reqId)?.(msg.peers ?? []);
          this.providerWaiters.delete(msg.reqId);
        } else if (msg.type === "signal") {
          this.signalHandler?.(msg.from, msg.signal);
        }
      };
    });
    return this.ready;
  }

  announce(cid: string): void {
    this.ws?.send(JSON.stringify({ type: "announce", cid }));
  }

  sendSignal(to: string, signal: Signal): void {
    this.ws?.send(JSON.stringify({ type: "signal", to, signal }));
  }

  onSignal(handler: SignalHandler): void {
    this.signalHandler = handler;
  }

  requestProviders(cid: string): Promise<string[]> {
    const reqId = crypto.randomUUID();
    return new Promise<string[]>((resolve) => {
      this.providerWaiters.set(reqId, resolve);
      this.ws?.send(JSON.stringify({ type: "providers", cid, reqId }));
      setTimeout(() => {
        if (this.providerWaiters.delete(reqId)) resolve([]);
      }, 5000);
    });
  }
}
