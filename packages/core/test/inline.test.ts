import { describe, it, expect } from "vitest";
import { inlineResources } from "../src/inline.js";

describe("inlineResources", () => {
  it("replaces a referenced URL with its data URI", () => {
    const html = `<img src="https://cdn.example.com/logo.png">`;
    const out = inlineResources(html, {
      "https://cdn.example.com/logo.png": "data:image/png;base64,AAAA",
    });
    expect(out).toBe(`<img src="data:image/png;base64,AAAA">`);
  });

  it("replaces every occurrence of a URL", () => {
    const html = `<img src="https://x/a.png"><img src="https://x/a.png">`;
    const out = inlineResources(html, { "https://x/a.png": "data:,Z" });
    expect(out).toBe(`<img src="data:,Z"><img src="data:,Z">`);
  });

  it("leaves URLs not in the map untouched", () => {
    const html = `<img src="https://x/keep.png">`;
    const out = inlineResources(html, { "https://x/other.png": "data:,Z" });
    expect(out).toBe(html);
  });

  it("handles an empty resource map", () => {
    const html = `<p>no resources</p>`;
    expect(inlineResources(html, {})).toBe(html);
  });
});
