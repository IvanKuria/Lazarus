import { describe, it, expect } from "vitest";
import { MemoryObservationStore } from "../src/store.js";
import type { Observation } from "../src/types.js";

const obs = (urlKey: string, cid: string, capturedAt: number, title?: string): Observation => ({
  urlKey,
  cid,
  fingerprint: "f",
  capturedAt,
  sizeBytes: 1,
  ...(title !== undefined && { title }),
});

describe("ObservationStore.listPages", () => {
  it("groups observations by urlKey with version count, latest title + time", async () => {
    const store = new MemoryObservationStore();
    await store.putObservation(obs("https://a.com", "c1", 1, "A v1"));
    await store.putObservation(obs("https://a.com", "c2", 5, "A v2"));
    await store.putObservation(obs("https://b.com", "c3", 3, "B"));

    const pages = await store.listPages();
    expect(pages).toHaveLength(2);

    const a = pages.find((p) => p.urlKey === "https://a.com")!;
    expect(a.versionCount).toBe(2);
    expect(a.latestCapturedAt).toBe(5);
    expect(a.title).toBe("A v2"); // title from the most recent version
  });

  it("sorts pages by most-recently-preserved first", async () => {
    const store = new MemoryObservationStore();
    await store.putObservation(obs("https://old.com", "c1", 1));
    await store.putObservation(obs("https://new.com", "c2", 9));
    const pages = await store.listPages();
    expect(pages.map((p) => p.urlKey)).toEqual(["https://new.com", "https://old.com"]);
  });

  it("returns an empty list when nothing is preserved", async () => {
    expect(await new MemoryObservationStore().listPages()).toEqual([]);
  });
});
