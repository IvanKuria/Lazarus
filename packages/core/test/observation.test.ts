import { describe, it, expect } from "vitest";
import { buildObservation, classifyChange } from "../src/observation.js";
import { computeCid } from "../src/cid.js";
import { simhash } from "../src/fingerprint.js";

const bytes = (s: string) => new TextEncoder().encode(s);

describe("buildObservation", () => {
  it("composes a normalized, content-addressed, fingerprinted record", async () => {
    const snapshot = bytes("<html><body>the full page snapshot</body></html>");
    const obs = await buildObservation({
      url: "https://Example.com/Post/?utm_source=x#top",
      snapshotBytes: snapshot,
      text: "the quick brown fox jumps over the lazy dog",
      capturedAt: 1_700_000_000_000,
      title: "A Post",
    });

    expect(obs.urlKey).toBe("https://example.com/Post");
    expect(obs.cid).toBe(await computeCid(snapshot));
    expect(obs.fingerprint).toBe(
      simhash("the quick brown fox jumps over the lazy dog"),
    );
    expect(obs.sizeBytes).toBe(snapshot.length);
    expect(obs.capturedAt).toBe(1_700_000_000_000);
    expect(obs.title).toBe("A Post");
  });
});

describe("classifyChange", () => {
  const longText = Array.from(
    { length: 60 },
    (_, i) => `paragraph ${i} discusses the policy implications of the regulation`,
  ).join(". ");

  it("is 'unchanged' when the content id is identical", () => {
    expect(
      classifyChange(
        { cid: "abc", fingerprint: simhash(longText) },
        { cid: "abc", fingerprint: simhash(longText) },
      ),
    ).toBe("unchanged");
  });

  it("is 'edited' for a small fingerprint move (a stealth edit)", () => {
    const edited = longText.replace("paragraph 0", "paragraph zero");
    expect(
      classifyChange(
        { cid: "old", fingerprint: simhash(longText) },
        { cid: "new", fingerprint: simhash(edited) },
      ),
    ).toBe("edited");
  });

  it("is 'replaced' when the content is entirely different", () => {
    expect(
      classifyChange(
        { cid: "old", fingerprint: simhash(longText) },
        {
          cid: "new",
          fingerprint: simhash("a totally unrelated recipe for chocolate cake"),
        },
      ),
    ).toBe("replaced");
  });
});
