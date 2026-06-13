import { describe, it, expect } from "vitest";
import { normalizeUrl } from "../src/url.js";

describe("normalizeUrl", () => {
  it("strips the URL fragment", () => {
    expect(normalizeUrl("https://example.com/article#section-2")).toBe(
      "https://example.com/article",
    );
  });

  it("lowercases scheme and host but preserves path case", () => {
    expect(normalizeUrl("HTTPS://Example.COM/Article")).toBe(
      "https://example.com/Article",
    );
  });

  it("removes the default port", () => {
    expect(normalizeUrl("https://example.com:443/article")).toBe(
      "https://example.com/article",
    );
    expect(normalizeUrl("http://example.com:80/article")).toBe(
      "http://example.com/article",
    );
  });

  it("strips tracking query params but keeps meaningful ones", () => {
    expect(
      normalizeUrl(
        "https://example.com/p?utm_source=tw&fbclid=abc&id=42&gclid=z",
      ),
    ).toBe("https://example.com/p?id=42");
  });

  it("sorts remaining query params for stability", () => {
    expect(normalizeUrl("https://example.com/p?b=2&a=1")).toBe(
      "https://example.com/p?a=1&b=2",
    );
  });

  it("removes a single trailing slash except on root", () => {
    expect(normalizeUrl("https://example.com/article/")).toBe(
      "https://example.com/article",
    );
    expect(normalizeUrl("https://example.com/")).toBe("https://example.com/");
  });

  it("collapses links that differ only by tracking/order/fragment to one key", () => {
    const a = normalizeUrl("https://Example.com/Post/?utm_campaign=x&b=2&a=1#top");
    const b = normalizeUrl("https://example.com:443/Post?a=1&b=2");
    expect(a).toBe(b);
  });
});
