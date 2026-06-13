import { test, expect, chromium, type BrowserContext } from "@playwright/test";
import { buildApp, MemoryIndexService } from "@lazarus/backend";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const EXT_PATH = path.resolve(dir, "../.output/chrome-mv3");

// Must match IndexClient's DEFAULT_BASE so the extension talks to this backend.
const BACKEND_PORT = 8787;
const SHARED_URL = "http://news.example.com/shared";
const SHARED_LIVE = `<!doctype html><html><head><title>Shared Story</title></head>
<body><h1>Shared Story</h1><p>cross-user-marker-XYZ789 preserved by the network.</p></body></html>`;

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
    ],
  });
  if (ctx.serviceWorkers().length === 0) await ctx.waitForEvent("serviceworker");
  return ctx;
}

test.beforeAll(async () => {
  pageServer = http.createServer((req, res) => {
    if (req.url?.startsWith("/shared")) {
      if (sharedMode === "live") {
        res.writeHead(200, { "content-type": "text/html" });
        res.end(SHARED_LIVE);
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

  // k=1 so a single witness (profile A) promotes — proving cross-user sharing.
  backend = buildApp(new MemoryIndexService({ k: 1 }));
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

test("profile B resurrects a page that only profile A ever saw", async () => {
  // Profile A visits the live page → captured locally + submitted to the index.
  const a = await ctxA.newPage();
  await a.goto(SHARED_URL, { waitUntil: "networkidle" });
  await expect(a.getByText("cross-user-marker-XYZ789")).toBeVisible();

  // Wait until the index has promoted it (A's submission landed).
  await expect
    .poll(
      async () => {
        const res = await fetch(
          `http://127.0.0.1:${BACKEND_PORT}/v1/resurrect?url=${encodeURIComponent(SHARED_URL)}`,
        );
        return res.status;
      },
      { timeout: 15_000 },
    )
    .toBe(200);

  // The page dies.
  sharedMode = "dead";

  // Profile B (fresh profile, empty local store) hits the dead URL → it must
  // resurrect from the shared index, i.e. from what A preserved.
  const b = await ctxB.newPage();
  await b.goto(SHARED_URL, { waitUntil: "domcontentloaded" });
  await expect(b.getByText("This page is gone")).toBeVisible({ timeout: 15_000 });

  await b.getByRole("button", { name: "View preserved version" }).click();
  const preserved = b.frameLocator("#__lazarus_resurrection__ iframe");
  await expect(preserved.getByText("cross-user-marker-XYZ789")).toBeVisible({
    timeout: 10_000,
  });
});
