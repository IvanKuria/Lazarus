import { describe, it, expect } from "vitest";
import { buildApp } from "../src/app.js";
import { MemoryIndexService } from "../src/index-service.js";
import { buildObservation } from "@lazarus/core";

const bytes = (s: string) => new TextEncoder().encode(s);
const b64 = (u: Uint8Array) => Buffer.from(u).toString("base64");

function rawBody(url: string, body: string) {
  return {
    url,
    snapshotBase64: b64(bytes(body)),
    text: "content long enough to fingerprint meaningfully for the test here",
    capturedAt: 1,
    title: "T",
  };
}

async function mint(app: ReturnType<typeof buildApp>): Promise<string> {
  const res = await app.inject({ method: "POST", url: "/v1/witness" });
  expect(res.statusCode).toBe(200);
  return res.json().token as string;
}

describe("Sybil-resistant witness tokens", () => {
  it("promotes after k submissions with distinct server-issued tokens", async () => {
    const app = buildApp(new MemoryIndexService({ k: 2 }), {
      witnessSecret: "test-secret",
    });
    const body = rawBody("https://x.com/a", "<h1>preserved</h1>");

    const t1 = await mint(app);
    const p1 = await app.inject({
      method: "POST",
      url: "/v1/observations",
      payload: { ...body, witnessToken: t1 },
    });
    expect(p1.statusCode).toBe(202);

    // one witness → not served
    const miss = await app.inject({
      method: "GET",
      url: "/v1/resurrect?url=" + encodeURIComponent("https://x.com/a"),
    });
    expect(miss.statusCode).toBe(404);

    const t2 = await mint(app);
    await app.inject({
      method: "POST",
      url: "/v1/observations",
      payload: { ...body, witnessToken: t2 },
    });

    const hit = await app.inject({
      method: "GET",
      url: "/v1/resurrect?url=" + encodeURIComponent("https://x.com/a"),
    });
    expect(hit.statusCode).toBe(200);
    await app.close();
  });

  it("rejects a forged/garbage token with 401 and does not promote", async () => {
    const app = buildApp(new MemoryIndexService({ k: 1 }), {
      witnessSecret: "test-secret",
    });
    const res = await app.inject({
      method: "POST",
      url: "/v1/observations",
      payload: { ...rawBody("https://x.com/b", "<h1>x</h1>"), witnessToken: "forged.token" },
    });
    expect(res.statusCode).toBe(401);
    const miss = await app.inject({
      method: "GET",
      url: "/v1/resurrect?url=" + encodeURIComponent("https://x.com/b"),
    });
    expect(miss.statusCode).toBe(404);
    await app.close();
  });

  it("counts one token as one witness — replaying it cannot reach k", async () => {
    const app = buildApp(new MemoryIndexService({ k: 2 }), {
      witnessSecret: "test-secret",
    });
    const body = rawBody("https://x.com/c", "<h1>x</h1>");
    const t = await mint(app);
    await app.inject({ method: "POST", url: "/v1/observations", payload: { ...body, witnessToken: t } });
    await app.inject({ method: "POST", url: "/v1/observations", payload: { ...body, witnessToken: t } });
    const miss = await app.inject({
      method: "GET",
      url: "/v1/resurrect?url=" + encodeURIComponent("https://x.com/c"),
    });
    expect(miss.statusCode).toBe(404); // same wid twice ≠ 2 witnesses
    await app.close();
  });

  it("dual-accepts a legacy witnessId during migration", async () => {
    const app = buildApp(new MemoryIndexService({ k: 1 }), {
      witnessSecret: "test-secret",
    });
    const res = await app.inject({
      method: "POST",
      url: "/v1/observations",
      payload: { ...rawBody("https://x.com/d", "<h1>x</h1>"), witnessId: "legacy-1" },
    });
    expect(res.statusCode).toBe(202);
    const hit = await app.inject({
      method: "GET",
      url: "/v1/resurrect?url=" + encodeURIComponent("https://x.com/d"),
    });
    expect(hit.statusCode).toBe(200);
    await app.close();
  });

  it("enforces a per-IP mint cap", async () => {
    const app = buildApp(new MemoryIndexService({ k: 1 }), {
      witnessSecret: "test-secret",
      mintLimitPerWindow: 2,
    });
    expect((await app.inject({ method: "POST", url: "/v1/witness" })).statusCode).toBe(200);
    expect((await app.inject({ method: "POST", url: "/v1/witness" })).statusCode).toBe(200);
    expect((await app.inject({ method: "POST", url: "/v1/witness" })).statusCode).toBe(429);
    await app.close();
  });
});

describe("GET /v1/blob?cid= (cid-addressed historical blobs)", () => {
  it("serves a promoted cid's blob but withholds an un-promoted one (k-anonymity gate)", async () => {
    const app = buildApp(new MemoryIndexService({ k: 2 }), { witnessSecret: "s" });
    const html = "<h1>versioned</h1>";
    const body = { ...rawBody("https://x.com/v", html) };
    const { cid } = await buildObservation({
      url: "https://x.com/v",
      snapshotBytes: bytes(html),
      text: body.text,
      capturedAt: body.capturedAt,
      title: body.title,
    });

    // one witness → cid exists but NOT promoted → blob withheld
    await app.inject({ method: "POST", url: "/v1/observations", payload: { ...body, witnessId: "w1" } });
    const early = await app.inject({ method: "GET", url: "/v1/blob?cid=" + cid });
    expect(early.statusCode).toBe(404);

    // second witness → promoted → blob served
    await app.inject({ method: "POST", url: "/v1/observations", payload: { ...body, witnessId: "w2" } });
    const ok = await app.inject({ method: "GET", url: "/v1/blob?cid=" + cid });
    expect(ok.statusCode).toBe(200);
    expect(Buffer.from(ok.json().snapshotBase64, "base64").toString()).toBe(html);

    // unknown cid → 404
    const miss = await app.inject({ method: "GET", url: "/v1/blob?cid=deadbeef" });
    expect(miss.statusCode).toBe(404);
    await app.close();
  });
});

describe("operability endpoints", () => {
  it("GET /health returns ok with db status", async () => {
    const app = buildApp(new MemoryIndexService({ k: 1 }));
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: "ok", db: "ok" });
    await app.close();
  });

  it("GET /v1/turn-credentials returns STUN-only by default", async () => {
    const app = buildApp(new MemoryIndexService({ k: 1 }));
    const res = await app.inject({ method: "GET", url: "/v1/turn-credentials" });
    expect(res.statusCode).toBe(200);
    const iceServers = res.json().iceServers as { urls: string | string[] }[];
    expect(iceServers.length).toBe(1);
    expect(JSON.stringify(iceServers[0])).toContain("stun:");
    expect(JSON.stringify(iceServers)).not.toContain("turn:");
    await app.close();
  });

  it("GET /metrics returns in-process counters and increments", async () => {
    const app = buildApp(new MemoryIndexService({ k: 1 }), { witnessSecret: "s" });
    await app.inject({
      method: "POST",
      url: "/v1/observations",
      payload: { ...rawBody("https://x.com/m", "<h1>x</h1>"), witnessId: "w1" },
    });
    const res = await app.inject({ method: "GET", url: "/metrics" });
    expect(res.statusCode).toBe(200);
    expect(res.json().observationsAccepted).toBeGreaterThanOrEqual(1);
    await app.close();
  });

  it("calls the analytics hook without leaking urls/cids", async () => {
    const events: { event: string; props?: Record<string, unknown> }[] = [];
    const app = buildApp(new MemoryIndexService({ k: 1 }), {
      witnessSecret: "s",
      analytics: (event, props) => events.push({ event, props }),
    });
    await app.inject({
      method: "POST",
      url: "/v1/observations",
      payload: { ...rawBody("https://secret.example/path", "<h1>x</h1>"), witnessId: "w1" },
    });
    expect(events.some((e) => e.event === "observation_submitted")).toBe(true);
    const serialized = JSON.stringify(events);
    expect(serialized).not.toContain("secret.example");
    await app.close();
  });
});
