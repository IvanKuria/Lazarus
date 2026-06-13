import { describe, it, expect } from "vitest";
import { splitChunks, BlobAssembler, CHUNK_SIZE } from "../src/chunk.js";
import { computeCid } from "../src/cid.js";

function ramp(n: number): Uint8Array {
  const a = new Uint8Array(n);
  for (let i = 0; i < n; i++) a[i] = i % 251;
  return a;
}

function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

describe("splitChunks", () => {
  it("splits so concatenation reproduces the original", () => {
    const data = ramp(CHUNK_SIZE * 2 + 123);
    const chunks = splitChunks(data);
    expect(chunks).toHaveLength(3);
    expect(concat(chunks)).toEqual(data);
  });

  it("returns one chunk for data smaller than the chunk size", () => {
    expect(splitChunks(ramp(10))).toHaveLength(1);
  });

  it("returns no chunks for empty data", () => {
    expect(splitChunks(new Uint8Array(0))).toHaveLength(0);
  });
});

describe("BlobAssembler", () => {
  it("reassembles out-of-order chunks and verifies the cid", async () => {
    const data = ramp(CHUNK_SIZE * 2 + 50);
    const cid = await computeCid(data);
    const chunks = splitChunks(data);

    const asm = new BlobAssembler(cid, chunks.length);
    asm.add(2, chunks[2]!);
    asm.add(0, chunks[0]!);
    expect(asm.complete).toBe(false);
    asm.add(1, chunks[1]!);
    expect(asm.complete).toBe(true);

    expect(await asm.assemble()).toEqual(data);
  });

  it("rejects assembly when a chunk is corrupted (cid mismatch)", async () => {
    const data = ramp(CHUNK_SIZE + 10);
    const cid = await computeCid(data);
    const chunks = splitChunks(data);
    const corrupt = chunks[0]!.slice();
    corrupt[0] = corrupt[0]! ^ 0xff;

    const asm = new BlobAssembler(cid, chunks.length);
    asm.add(0, corrupt);
    asm.add(1, chunks[1]!);
    await expect(asm.assemble()).rejects.toThrow();
  });

  it("throws if assembled before all chunks arrive", async () => {
    const asm = new BlobAssembler("anycid", 2);
    asm.add(0, new Uint8Array([1, 2, 3]));
    await expect(asm.assemble()).rejects.toThrow(/incomplete/i);
  });

  it("ignores duplicate chunks for the completeness count", () => {
    const asm = new BlobAssembler("cid", 2);
    asm.add(0, new Uint8Array([1]));
    asm.add(0, new Uint8Array([1]));
    expect(asm.complete).toBe(false);
  });
});
