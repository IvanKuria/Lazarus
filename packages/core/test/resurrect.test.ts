import { describe, it, expect } from "vitest";
import { resurrect } from "../src/resurrect.js";
import { recordCapture } from "../src/record.js";
import { MemoryObservationStore } from "../src/store.js";

const bytes = (s: string) => new TextEncoder().encode(s);

describe("resurrect", () => {
  it("returns null when nothing is preserved for the URL", async () => {
    const store = new MemoryObservationStore();
    expect(await resurrect(store, "https://example.com/gone")).toBeNull();
  });

  it("returns the latest snapshot + observation for a preserved URL", async () => {
    const store = new MemoryObservationStore();
    const snapshot = bytes("<html><body>the original article</body></html>");
    await recordCapture(store, {
      url: "https://example.com/article",
      snapshotBytes: snapshot,
      text: "the original article body text long enough to fingerprint",
      capturedAt: 1,
      title: "Original",
    });

    const result = await resurrect(store, "https://example.com/article");
    expect(result).not.toBeNull();
    expect(result!.snapshot).toEqual(snapshot);
    expect(result!.observation.title).toBe("Original");
  });

  it("normalizes the lookup URL (tracking params/fragments still resolve)", async () => {
    const store = new MemoryObservationStore();
    await recordCapture(store, {
      url: "https://example.com/article",
      snapshotBytes: bytes("<html>preserved</html>"),
      text: "preserved content here that is sufficiently long to hash",
      capturedAt: 1,
    });

    const result = await resurrect(
      store,
      "https://example.com/article?utm_source=newsletter#top",
    );
    expect(result).not.toBeNull();
  });

  it("resurrects the most recent version when several exist", async () => {
    const store = new MemoryObservationStore();
    await recordCapture(store, {
      url: "https://example.com/p",
      snapshotBytes: bytes("v1 content for the page that is long enough"),
      text: "version one content that is long enough to fingerprint well",
      capturedAt: 1,
    });
    await recordCapture(store, {
      url: "https://example.com/p",
      snapshotBytes: bytes("v2 totally different replaced content entirely"),
      text: "a completely different replacement recipe for chocolate cake batter",
      capturedAt: 2,
    });

    const result = await resurrect(store, "https://example.com/p");
    expect(new TextDecoder().decode(result!.snapshot)).toContain("v2");
  });
});
