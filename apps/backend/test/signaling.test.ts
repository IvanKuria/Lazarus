import { describe, it, expect, vi } from "vitest";
import { SignalingHub } from "../src/signaling.js";

describe("SignalingHub", () => {
  it("relays a signal to the target peer", () => {
    const hub = new SignalingHub();
    const sendA = vi.fn();
    const sendB = vi.fn();
    hub.register("A", sendA);
    hub.register("B", sendB);

    hub.relay("A", "B", { kind: "offer", sdp: "x" });

    expect(sendB).toHaveBeenCalledWith({
      type: "signal",
      from: "A",
      signal: { kind: "offer", sdp: "x" },
    });
    expect(sendA).not.toHaveBeenCalled();
  });

  it("drops a relay to an unknown peer without throwing", () => {
    const hub = new SignalingHub();
    hub.register("A", vi.fn());
    expect(() => hub.relay("A", "ghost", { kind: "ice" })).not.toThrow();
  });

  it("returns providers of a cid, excluding the asker", () => {
    const hub = new SignalingHub();
    hub.register("A", vi.fn());
    hub.register("B", vi.fn());
    hub.register("C", vi.fn());
    hub.announce("A", "cid1");
    hub.announce("B", "cid1");
    hub.announce("C", "cid2");

    expect(hub.providers("cid1", "A").sort()).toEqual(["B"]);
    expect(hub.providers("cid1").sort()).toEqual(["A", "B"]);
    expect(hub.providers("cid2")).toEqual(["C"]);
  });

  it("removes a peer as a provider when it unregisters", () => {
    const hub = new SignalingHub();
    hub.register("A", vi.fn());
    hub.announce("A", "cid1");
    expect(hub.providers("cid1")).toEqual(["A"]);

    hub.unregister("A");
    expect(hub.providers("cid1")).toEqual([]);
  });
});
