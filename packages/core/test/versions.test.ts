import { describe, it, expect } from "vitest";
import { listVersions } from "../src/versions.js";
import { recordCapture } from "../src/record.js";
import { MemoryObservationStore } from "../src/store.js";

const bytes = (s: string) => new TextEncoder().encode(s);

describe("listVersions", () => {
  it("returns an empty array when the URL was never seen", async () => {
    const store = new MemoryObservationStore();
    expect(await listVersions(store, "https://example.com/x")).toEqual([]);
  });

  it("returns versions oldest → newest, normalizing the URL", async () => {
    const store = new MemoryObservationStore();
    await recordCapture(store, {
      url: "https://example.com/p",
      snapshotBytes: bytes("v1 original content long enough to fingerprint here"),
      text: "version one content that is sufficiently long to fingerprint well",
      capturedAt: 100,
    });
    await recordCapture(store, {
      url: "https://example.com/p",
      snapshotBytes: bytes("v2 totally different replacement content entirely now"),
      text: "a completely different replacement recipe for chocolate cake batter yum",
      capturedAt: 200,
    });

    const versions = await listVersions(
      store,
      "https://example.com/p?utm_source=x#frag",
    );
    expect(versions.map((v) => v.capturedAt)).toEqual([100, 200]);
  });
});
