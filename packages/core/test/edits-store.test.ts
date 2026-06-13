import { describe, it, expect } from "vitest";
import { MemoryObservationStore } from "../src/store.js";
import type { EditEvent } from "../src/types.js";

const edit = (over: Partial<EditEvent> = {}): EditEvent => ({
  urlKey: "https://example.com/a",
  kind: "edited",
  prevCid: "p",
  nextCid: "n",
  distance: 3,
  prevCapturedAt: 1,
  nextCapturedAt: 2,
  ...over,
});

describe("MemoryObservationStore edit log", () => {
  it("lists edits newest-first by nextCapturedAt", async () => {
    const store = new MemoryObservationStore();
    await store.putEdit(edit({ nextCapturedAt: 10 }));
    await store.putEdit(edit({ nextCapturedAt: 30 }));
    await store.putEdit(edit({ nextCapturedAt: 20 }));

    const feed = await store.listEdits();
    expect(feed.map((e) => e.nextCapturedAt)).toEqual([30, 20, 10]);
  });

  it("respects the limit", async () => {
    const store = new MemoryObservationStore();
    for (let i = 1; i <= 5; i++) await store.putEdit(edit({ nextCapturedAt: i }));
    expect(await store.listEdits(2)).toHaveLength(2);
  });
});
