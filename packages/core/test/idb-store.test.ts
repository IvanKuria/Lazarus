import "fake-indexeddb/auto";
import { describe, it, expect } from "vitest";
import { IdbObservationStore } from "../src/idb-store.js";
import type { Observation } from "../src/types.js";

let dbCounter = 0;
const freshDb = () => `lazarus-test-${dbCounter++}`;

const obs = (over: Partial<Observation> = {}): Observation => ({
  urlKey: "https://example.com/a",
  cid: "cid-1",
  fingerprint: "0000000000000000",
  capturedAt: 1,
  sizeBytes: 10,
  ...over,
});

describe("IdbObservationStore", () => {
  it("round-trips a snapshot blob by cid and returns undefined for unknown cids", async () => {
    const store = new IdbObservationStore(freshDb());
    const bytes = new TextEncoder().encode("hello snapshot");
    await store.putSnapshot("cid-x", bytes);
    expect(await store.getSnapshot("cid-x")).toEqual(bytes);
    expect(await store.getSnapshot("missing")).toBeUndefined();
  });

  it("returns a timeline ordered oldest → newest", async () => {
    const store = new IdbObservationStore(freshDb());
    await store.putObservation(obs({ cid: "b", capturedAt: 2 }));
    await store.putObservation(obs({ cid: "a", capturedAt: 1 }));
    await store.putObservation(obs({ cid: "c", capturedAt: 3 }));

    const timeline = await store.getTimeline("https://example.com/a");
    expect(timeline.map((o) => o.cid)).toEqual(["a", "b", "c"]);
  });

  it("getLatestObservation returns the newest version", async () => {
    const store = new IdbObservationStore(freshDb());
    await store.putObservation(obs({ cid: "old", capturedAt: 1 }));
    await store.putObservation(obs({ cid: "new", capturedAt: 99 }));

    expect((await store.getLatestObservation("https://example.com/a"))?.cid).toBe(
      "new",
    );
    expect(await store.getLatestObservation("https://example.com/none")).toBeUndefined();
  });

  it("persists across store instances backed by the same database", async () => {
    const name = freshDb();
    const a = new IdbObservationStore(name);
    await a.putObservation(obs({ cid: "persisted", capturedAt: 5 }));

    const b = new IdbObservationStore(name);
    const timeline = await b.getTimeline("https://example.com/a");
    expect(timeline.map((o) => o.cid)).toEqual(["persisted"]);
  });

  it("stores and lists edits newest-first with a limit", async () => {
    const store = new IdbObservationStore(freshDb());
    await store.putEdit({
      urlKey: "https://example.com/a",
      kind: "edited",
      prevCid: "p1",
      nextCid: "n1",
      distance: 2,
      prevCapturedAt: 1,
      nextCapturedAt: 10,
    });
    await store.putEdit({
      urlKey: "https://example.com/b",
      kind: "replaced",
      prevCid: "p2",
      nextCid: "n2",
      distance: 40,
      prevCapturedAt: 5,
      nextCapturedAt: 20,
    });

    const feed = await store.listEdits();
    expect(feed.map((e) => e.nextCapturedAt)).toEqual([20, 10]);
    expect(await store.listEdits(1)).toHaveLength(1);
  });
});
