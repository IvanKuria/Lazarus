import { describe, it, expect } from "vitest";
import {
  mintToken,
  verifyToken,
  witnessSecretFromEnv,
} from "../src/witness-token.js";

const SECRET = "test-secret-key";

describe("witness-token", () => {
  it("round-trips: mint → verify returns the same wid", () => {
    const token = mintToken(SECRET, 60_000);
    const result = verifyToken(token, SECRET);
    expect(result).not.toBeNull();
    expect(typeof result!.wid).toBe("string");
    expect(result!.wid).toMatch(/^[0-9a-f]{32}$/);

    // Re-verifying yields the identical wid carried in the token.
    const again = verifyToken(token, SECRET);
    expect(again!.wid).toBe(result!.wid);
  });

  it("rejects a tampered payload (flipped char in payload segment)", () => {
    const token = mintToken(SECRET, 60_000);
    const [payload, sig] = token.split(".") as [string, string];
    const flipped =
      (payload[0] === "A" ? "B" : "A") + payload.slice(1);
    const tampered = `${flipped}.${sig}`;
    expect(verifyToken(tampered, SECRET)).toBeNull();
  });

  it("rejects a forged/tampered signature", () => {
    const token = mintToken(SECRET, 60_000);
    const [payload, sig] = token.split(".") as [string, string];
    const forged =
      payload + "." + (sig[0] === "A" ? "B" : "A") + sig.slice(1);
    expect(verifyToken(forged, SECRET)).toBeNull();
  });

  it("rejects an expired token", () => {
    const now = 1_000_000;
    const token = mintToken(SECRET, 1_000, now);
    // Verify well past expiry.
    expect(verifyToken(token, SECRET, now + 5_000)).toBeNull();
    // Sanity: still valid before expiry.
    expect(verifyToken(token, SECRET, now + 500)).not.toBeNull();
  });

  it("returns null (no throw) for malformed inputs", () => {
    expect(verifyToken("", SECRET)).toBeNull();
    expect(verifyToken("no-dot", SECRET)).toBeNull();
    expect(verifyToken("a.b.c", SECRET)).toBeNull();
  });

  it("produces different wids across two mints", () => {
    const a = verifyToken(mintToken(SECRET, 60_000), SECRET)!;
    const b = verifyToken(mintToken(SECRET, 60_000), SECRET)!;
    expect(a.wid).not.toBe(b.wid);
  });

  it("witnessSecretFromEnv: null when unset, value when set", () => {
    const saved = process.env.LAZARUS_WITNESS_SECRET;
    try {
      delete process.env.LAZARUS_WITNESS_SECRET;
      expect(witnessSecretFromEnv()).toBeNull();

      process.env.LAZARUS_WITNESS_SECRET = "";
      expect(witnessSecretFromEnv()).toBeNull();

      process.env.LAZARUS_WITNESS_SECRET = "s3cr3t";
      expect(witnessSecretFromEnv()).toBe("s3cr3t");
    } finally {
      if (saved === undefined) delete process.env.LAZARUS_WITNESS_SECRET;
      else process.env.LAZARUS_WITNESS_SECRET = saved;
    }
  });
});
