import { test, expect, chromium, type BrowserContext } from "@playwright/test";
import { buildApp, MemoryIndexService } from "@lazarus/backend";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const EXT_PATH = path.resolve(dir, "../.output/chrome-mv3");

const BACKEND_PORT = 8787;
const SHARED_URL = "http://news.example.com/p2p";
const LIVE_HTML = `<!doctype html><html><head><title>P2P Story</title></head>
<body><h1>P2P Story</h1><p>p2p-marker-DELTA42 moved peer-to-peer.</p></body></html>`;

let sharedMode: "live" | "dead" = "live";
let pageServer: http.Server;
let pagePort = 0;
let backend: ReturnType<typeof buildApp>;
let ctxA: BrowserContext;
let ctxB: BrowserContext;

async function launchContext(): Promise<BrowserContext> {
  const ctx = await chromium.launchPersistentContext("", {
    channel: "chromium",
    args: [
      `--disable-extensions-except=${EXT_PATH}`,
      `--load-extension=${EXT_PATH}`,
      `--host-resolver-rules=MAP news.example.com 127.0.0.1:${pagePort}`,
      // Expose loopback ICE candidates so WebRTC works between local profiles.
      "--disable-features=WebRtcHideLocalIpsWithMdns",
    ],
  });
  if (ctx.serviceWorkers().length === 0) await ctx.waitForEvent("serviceworker");
  return ctx;
}

test.beforeAll(async () => {
  pageServer = http.createServer((req, res) => {
    if (req.url?.startsWith("/p2p")) {
      if (sharedMode === "live") {
        res.writeHead(200, { "content-type": "text/html" });
        res.end(LIVE_HTML);
      } else {
        res.writeHead(404, { "content-type": "text/html" });
        res.end("<!doctype html><html><body><h1>404</h1></body></html>");
      }
      return;
    }
    res.writeHead(404);
    res.end("nope");
  });
  await new Promise<void>((r) => pageServer.listen(0, "127.0.0.1", r));
  pagePort = (pageServer.address() as { port: number }).port;

  // storeBlobs:false → the index holds only metadata, so the blob MUST move P2P.
  backend = buildApp(new MemoryIndexService({ k: 1, storeBlobs: false }));
  await backend.listen({ port: BACKEND_PORT, host: "127.0.0.1" });

  ctxA = await launchContext();
  ctxB = await launchContext();
});

test.afterAll(async () => {
  await ctxA?.close();
  await ctxB?.close();
  await backend?.close();
  await new Promise<void>((r) => pageServer.close(() => r()));
});

test("blob moves peer-to-peer: B resurrects A's page with no central blob", async () => {
  // A captures the live page (metadata → index, blob stays only on A).
  const a = await ctxA.newPage();
  await a.goto(SHARED_URL, { waitUntil: "networkidle" });
  await expect(a.getByText("p2p-marker-DELTA42")).toBeVisible();

  // Wait until the index has the metadata (locate returns 200).
  await expect
    .poll(
      async () =>
        (
          await fetch(
            `http://127.0.0.1:${BACKEND_PORT}/v1/locate?url=${encodeURIComponent(SHARED_URL)}`,
          )
        ).status,
      { timeout: 15_000 },
    )
    .toBe(200);
  // Confirm the index truly has NO blob — proving any resurrection is P2P.
  expect(
    (
      await fetch(
        `http://127.0.0.1:${BACKEND_PORT}/v1/resurrect?url=${encodeURIComponent(SHARED_URL)}`,
      )
    ).status,
  ).toBe(404);

  // Give A's peer a moment to announce the CID to the signaling hub.
  await a.waitForTimeout(2500);

  sharedMode = "dead";

  // B (fresh profile) hits the dead URL → must fetch the blob from A over WebRTC.
  const b = await ctxB.newPage();
  await b.goto(SHARED_URL, { waitUntil: "domcontentloaded" });
  await expect(b.getByText("This page is gone")).toBeVisible({ timeout: 30_000 });

  await b.getByRole("button", { name: "View preserved version" }).click();
  const preserved = b.frameLocator("#__lazarus_resurrection__ iframe");
  await expect(preserved.getByText("p2p-marker-DELTA42")).toBeVisible({
    timeout: 15_000,
  });
});
