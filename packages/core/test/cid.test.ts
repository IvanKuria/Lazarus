import { describe, it, expect } from "vitest";
import { computeCid } from "../src/cid.js";

const enc = (s: string) => new TextEncoder().encode(s);

describe("computeCid", () => {
  it("is deterministic for identical input", async () => {
    const a = await computeCid(enc("hello world"));
    const b = await computeCid(enc("hello world"));
    expect(a).toBe(b);
  });

  it("differs for different input", async () => {
    const a = await computeCid(enc("hello world"));
    const b = await computeCid(enc("goodbye world"));
    expect(a).not.toBe(b);
  });
});
