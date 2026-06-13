import { describe, it, expect } from "vitest";
import { recordCapture } from "../src/record.js";
import { MemoryObservationStore } from "../src/store.js";
import type { CapturedPage } from "../src/types.js";

const bytes = (s: string) => new TextEncoder().encode(s);

function page(overrides: Partial<CapturedPage> = {}): CapturedPage {
  return {
    url: "https://example.com/article",
    snapshotBytes: bytes("<html><body>original content here</body></html>"),
    text: "original content here that is long enough to fingerprint meaningfully",
    capturedAt: 1_700_000_000_000,
    title: "Article",
    ...overrides,
  };
}

describe("recordCapture", () => {
  it("stores snapshot + observation on first capture and reports 'new'", async () => {
    const store = new MemoryObservationStore();
    const result = await recordCapture(store, page());

    expect(result.change).toBe("new");
    const timeline = await store.getTimeline("https://example.com/article");
    expect(timeline).toHaveLength(1);
    expect(await store.getSnapshot(result.observation.cid)).toEqual(
      page().snapshotBytes,
    );
  });

  it("does not add a second version when the page is unchanged", async () => {
    const store = new MemoryObservationStore();
    await recordCapture(store, page({ capturedAt: 1 }));
    const second = await recordCapture(store, page({ capturedAt: 2 }));

    expect(second.change).toBe("unchanged");
    expect(await store.getTimeline("https://example.com/article")).toHaveLength(1);
  });

  it("adds a new version and reports 'edited' on a small change", async () => {
    const store = new MemoryObservationStore();
    const longText = Array.from(
      { length: 60 },
      (_, i) => `paragraph ${i} discusses the policy implications of the regulation`,
    ).join(". ");
    await recordCapture(
      store,
      page({ snapshotBytes: bytes("v1-" + longText), text: longText, capturedAt: 1 }),
    );
    const edited = longText.replace("paragraph 0", "paragraph zero");
    const second = await recordCapture(
      store,
      page({ snapshotBytes: bytes("v2-" + edited), text: edited, capturedAt: 2 }),
    );

    expect(second.change).toBe("edited");
    expect(await store.getTimeline("https://example.com/article")).toHaveLength(2);
  });
});
