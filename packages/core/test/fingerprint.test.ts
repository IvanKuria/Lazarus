import { describe, it, expect } from "vitest";
import { simhash, hammingDistance } from "../src/fingerprint.js";

describe("simhash", () => {
  it("is deterministic for the same text", () => {
    expect(simhash("the quick brown fox jumps over the lazy dog")).toBe(
      simhash("the quick brown fox jumps over the lazy dog"),
    );
  });

  it("produces a 16-char hex string (64-bit fingerprint)", () => {
    expect(simhash("hello world")).toMatch(/^[0-9a-f]{16}$/);
  });
});

const LONG_ARTICLE = Array.from(
  { length: 60 },
  (_, i) => `paragraph ${i} discusses the policy implications of the new regulation`,
).join(". ");

describe("hammingDistance", () => {
  it("is zero for identical fingerprints", () => {
    const fp = simhash(LONG_ARTICLE);
    expect(hammingDistance(fp, fp)).toBe(0);
  });

  it("is small when a long article changes only slightly (a stealth edit)", () => {
    const edited = LONG_ARTICLE.replace("paragraph 0", "paragraph zero");
    const d = hammingDistance(simhash(LONG_ARTICLE), simhash(edited));
    expect(d).toBeGreaterThan(0);
    expect(d).toBeLessThan(10);
  });

  it("is large for completely different content", () => {
    const a = simhash(LONG_ARTICLE);
    const b = simhash(
      "an unrelated recipe for chocolate cake with butter sugar eggs and vanilla",
    );
    expect(hammingDistance(a, b)).toBeGreaterThan(15);
  });
});
