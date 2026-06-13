import { describe, it, expect } from "vitest";
import { sampleLinks, summarizeMortality } from "../src/mortality.js";

describe("sampleLinks", () => {
  it("normalizes, dedupes, and keeps only capturable public links", () => {
    const out = sampleLinks([
      "https://example.com/a?utm_source=x",
      "https://example.com/a#frag", // dup of the first after normalization
      "http://localhost:3000/dev", // private → dropped
      "chrome://extensions", // non-http → dropped
      "https://news.site/story",
    ]);
    expect(out).toEqual(["https://example.com/a", "https://news.site/story"]);
  });

  it("caps the sample at the given limit", () => {
    const urls = Array.from({ length: 500 }, (_, i) => `https://s${i}.com/p`);
    expect(sampleLinks(urls, 50)).toHaveLength(50);
  });
});

describe("summarizeMortality", () => {
  it("computes the dead percentage", () => {
    const checks = [
      { alive: true },
      { alive: false },
      { alive: false },
      { alive: true },
    ];
    expect(summarizeMortality(checks)).toEqual({
      checked: 4,
      dead: 2,
      deadPercent: 50,
    });
  });

  it("rounds to the nearest percent and handles the empty case", () => {
    expect(summarizeMortality([]).deadPercent).toBe(0);
    expect(
      summarizeMortality([{ alive: false }, { alive: true }, { alive: true }])
        .deadPercent,
    ).toBe(33);
  });
});
