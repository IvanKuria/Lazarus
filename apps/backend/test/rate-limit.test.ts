import { describe, it, expect } from "vitest";
import { createRateLimiter } from "../src/rate-limit.js";

describe("createRateLimiter (fixed-window, in-memory)", () => {
  it("allows up to `limit` calls for one key, rejects the next", () => {
    const rl = createRateLimiter({ limit: 3, windowMs: 1000 });
    const now = 1000;
    expect(rl.check("ip-1", now)).toBe(true);
    expect(rl.check("ip-1", now)).toBe(true);
    expect(rl.check("ip-1", now)).toBe(true);
    expect(rl.check("ip-1", now)).toBe(false);
  });

  it("gives each key an independent budget", () => {
    const rl = createRateLimiter({ limit: 2, windowMs: 1000 });
    const now = 5000;
    expect(rl.check("ip-a", now)).toBe(true);
    expect(rl.check("ip-a", now)).toBe(true);
    expect(rl.check("ip-a", now)).toBe(false);
    // ip-b is untouched and has its own full budget.
    expect(rl.check("ip-b", now)).toBe(true);
    expect(rl.check("ip-b", now)).toBe(true);
    expect(rl.check("ip-b", now)).toBe(false);
  });

  it("resets a key's budget after the window elapses", () => {
    const rl = createRateLimiter({ limit: 1, windowMs: 1000 });
    const start = 10_000;
    expect(rl.check("ip-1", start)).toBe(true);
    expect(rl.check("ip-1", start)).toBe(false);
    // Still inside the window.
    expect(rl.check("ip-1", start + 999)).toBe(false);
    // Window has elapsed -> budget resets.
    expect(rl.check("ip-1", start + 1000)).toBe(true);
    expect(rl.check("ip-1", start + 1000)).toBe(false);
  });

  it("reset() clears all state", () => {
    const rl = createRateLimiter({ limit: 1, windowMs: 1000 });
    const now = 2000;
    expect(rl.check("ip-1", now)).toBe(true);
    expect(rl.check("ip-1", now)).toBe(false);
    rl.reset();
    // Fresh budget at the same instant after reset.
    expect(rl.check("ip-1", now)).toBe(true);
  });
});
