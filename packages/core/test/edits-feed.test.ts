import { describe, it, expect } from "vitest";
import { recordCapture } from "../src/record.js";
import { getEditFeed } from "../src/feed.js";
import { MemoryObservationStore } from "../src/store.js";
import type { CapturedPage } from "../src/types.js";

const bytes = (s: string) => new TextEncoder().encode(s);
const longText = Array.from(
  { length: 60 },
  (_, i) => `paragraph ${i} discusses the policy implications of the regulation`,
).join(". ");

function page(over: Partial<CapturedPage> = {}): CapturedPage {
  return {
    url: "https://example.com/p",
    snapshotBytes: bytes("v1-" + longText),
    text: longText,
    capturedAt: 1,
    title: "The Post",
    ...over,
  };
}

describe("edit feed", () => {
  it("logs no edit for a first-ever or unchanged capture", async () => {
    const store = new MemoryObservationStore();
    await recordCapture(store, page({ capturedAt: 1 })); // new
    await recordCapture(store, page({ capturedAt: 2 })); // unchanged (same bytes)
    expect(await getEditFeed(store)).toEqual([]);
  });

  it("logs an edit when a page's content changes", async () => {
    const store = new MemoryObservationStore();
    await recordCapture(store, page({ capturedAt: 1 }));
    const edited = longText.replace("paragraph 0", "paragraph zero");
    await recordCapture(
      store,
      page({ snapshotBytes: bytes("v2-" + edited), text: edited, capturedAt: 2 }),
    );

    const feed = await getEditFeed(store);
    expect(feed).toHaveLength(1);
    expect(feed[0]!.kind).toBe("edited");
    expect(feed[0]!.urlKey).toBe("https://example.com/p");
    expect(feed[0]!.title).toBe("The Post");
    expect(feed[0]!.distance).toBeGreaterThan(0);
    expect(feed[0]!.prevCapturedAt).toBe(1);
    expect(feed[0]!.nextCapturedAt).toBe(2);
  });

  it("returns edits across pages newest-first", async () => {
    const store = new MemoryObservationStore();
    await recordCapture(store, page({ url: "https://a.com/x", capturedAt: 1 }));
    await recordCapture(
      store,
      page({ url: "https://a.com/x", snapshotBytes: bytes("changed a"), text: "different content a entirely now replaced", capturedAt: 5 }),
    );
    await recordCapture(store, page({ url: "https://b.com/y", capturedAt: 2 }));
    await recordCapture(
      store,
      page({ url: "https://b.com/y", snapshotBytes: bytes("changed b"), text: "different content b entirely now replaced", capturedAt: 9 }),
    );

    const feed = await getEditFeed(store);
    expect(feed.map((e) => e.nextCapturedAt)).toEqual([9, 5]);
  });
});
