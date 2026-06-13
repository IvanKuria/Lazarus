import { computeCid } from "./cid.js";

/**
 * Blob chunking for peer-to-peer transfer over an RTCDataChannel.
 *
 * Large snapshots are split into ~16KiB frames (the cross-browser-safe data
 * channel message size). The receiver reassembles them and verifies the result
 * against the expected CID — so a corrupted or malicious peer can never pass off
 * wrong bytes, because the content address is the hash of the content.
 */
export const CHUNK_SIZE = 16 * 1024;

/** Split bytes into ordered chunks of at most `size` bytes. */
export function splitChunks(bytes: Uint8Array, size = CHUNK_SIZE): Uint8Array[] {
  const chunks: Uint8Array[] = [];
  for (let i = 0; i < bytes.length; i += size) {
    chunks.push(bytes.subarray(i, Math.min(i + size, bytes.length)));
  }
  return chunks;
}

/** Reassembles chunks (received in any order) and verifies the CID on completion. */
export class BlobAssembler {
  private readonly chunks: Array<Uint8Array | undefined>;
  private received = 0;

  constructor(
    private readonly expectedCid: string,
    public readonly total: number,
  ) {
    this.chunks = new Array<Uint8Array | undefined>(total).fill(undefined);
  }

  add(seq: number, data: Uint8Array): void {
    if (seq < 0 || seq >= this.total) {
      throw new RangeError(`chunk seq ${seq} out of range [0, ${this.total})`);
    }
    if (this.chunks[seq] === undefined) this.received++;
    this.chunks[seq] = data;
  }

  get complete(): boolean {
    return this.received === this.total;
  }

  /** Concatenate and verify against the expected CID. Throws on incomplete or mismatch. */
  async assemble(): Promise<Uint8Array> {
    if (!this.complete) {
      throw new Error(`incomplete: ${this.received}/${this.total} chunks`);
    }
    const totalBytes = this.chunks.reduce((s, c) => s + (c?.length ?? 0), 0);
    const out = new Uint8Array(totalBytes);
    let off = 0;
    for (const c of this.chunks) {
      out.set(c!, off);
      off += c!.length;
    }
    const cid = await computeCid(out);
    if (cid !== this.expectedCid) {
      throw new Error(`cid mismatch: expected ${this.expectedCid}, got ${cid}`);
    }
    return out;
  }
}
