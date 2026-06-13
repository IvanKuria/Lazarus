import { describe, it, expect } from "vitest";
import { buildApp } from "../src/app.js";
import { MemoryIndexService } from "../src/index-service.js";

const bytes = (s: string) => new TextEncoder().encode(s);
const b64 = (u: Uint8Array) => Buffer.from(u).toString("base64");

// The server derives the observation (cid/urlKey/fingerprint) from these raw
// fields — clients never supply content-addressing fields.
function submissionBody(url: string, body: string, witnessId: string) {
  return {
    url,
    snapshotBase64: b64(bytes(body)),
    text: "content long enough to fingerprint meaningfully for the test here",
    capturedAt: 1,
    title: "T",
    witnessId,
  };
}

describe("index HTTP API", () => {
  it("serves a resurrected snapshot after k distinct submissions", async () => {
    const app = buildApp(new MemoryIndexService({ k: 2 }));

    const body = await submissionBody("https://x.com/a", "<h1>preserved</h1>", "w1");

    const post1 = await app.inject({
      method: "POST",
      url: "/v1/observations",
      payload: body,
    });
    expect(post1.statusCode).toBe(202);

    // Only one witness so far → not yet served.
    const miss = await app.inject({
      method: "GET",
      url: "/v1/resurrect?url=" + encodeURIComponent("https://x.com/a"),
    });
    expect(miss.statusCode).toBe(404);

    // Second distinct witness promotes it.
    await app.inject({
      method: "POST",
      url: "/v1/observations",
      payload: { ...body, witnessId: "w2" },
    });

    const hit = await app.inject({
      method: "GET",
      url: "/v1/resurrect?url=" + encodeURIComponent("https://x.com/a"),
    });
    expect(hit.statusCode).toBe(200);
    const decoded = Buffer.from(hit.json().snapshotBase64, "base64").toString();
    expect(decoded).toBe("<h1>preserved</h1>");

    await app.close();
  });

  it("returns versions and the feed as JSON", async () => {
    const app = buildApp(new MemoryIndexService({ k: 1 }));
    await app.inject({
      method: "POST",
      url: "/v1/observations",
      payload: await submissionBody("https://x.com/p", "<p>v1</p>", "w1"),
    });

    const versions = await app.inject({
      method: "GET",
      url: "/v1/versions?url=" + encodeURIComponent("https://x.com/p"),
    });
    expect(versions.statusCode).toBe(200);
    expect(versions.json().versions).toHaveLength(1);

    const feed = await app.inject({ method: "GET", url: "/v1/feed" });
    expect(feed.statusCode).toBe(200);
    expect(Array.isArray(feed.json().edits)).toBe(true);

    await app.close();
  });
});
