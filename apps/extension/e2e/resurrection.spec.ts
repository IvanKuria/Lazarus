import { test, expect, chromium, type BrowserContext } from "@playwright/test";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const EXT_PATH = path.resolve(dir, "../.output/chrome-mv3");

const ARTICLE_HTML = `<!doctype html><html><head><title>The Original Article</title></head>
<body><h1>The Original Article</h1><p>unique-marker-A1B2C3</p>
<img src="http://news.example.com/logo.png" alt="logo"></body></html>`;

// A 1x1 PNG, served so the background can fetch + inline it as a data URI.
const PNG_1x1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

const POST_V1 = `<!doctype html><html><head><title>Breaking News</title></head>
<body><h1>Breaking News</h1><p>The mayor approved the budget. marker-VERSION-ONE.</p></body></html>`;
const POST_V2 = `<!doctype html><html><head><title>Breaking News</title></head>
<body><h1>Breaking News</h1><p>The mayor vetoed the budget instead. marker-VERSION-TWO entirely rewritten.</p></body></html>`;

const MEMO_V1 = `<!doctype html><html><head><title>Project Memo</title></head>
<body><h1>Project Memo</h1><p>Status: on track for the Q3 launch. memo-original baseline text.</p></body></html>`;
const MEMO_V2 = `<!doctype html><html><head><title>Project Memo</title></head>
<body><h1>Project Memo</h1><p>Status: quietly delayed to Q4 after scope changes. memo-revised replacement text entirely.</p></body></html>`;
let memoVersion: 1 | 2 = 1;

// The test server flips between serving the article (200) and a 404.
let mode: "live" | "dead" = "live";
// And serves two distinct versions of /post for the Scrubber test.
let postVersion: 1 | 2 = 1;
let server: http.Server;
let port = 0;
let context: BrowserContext;

test.beforeAll(async () => {
  server = http.createServer((req, res) => {
    if (req.url?.startsWith("/article")) {
      if (mode === "live") {
        res.writeHead(200, { "content-type": "text/html" });
        res.end(ARTICLE_HTML);
      } else {
        res.writeHead(404, { "content-type": "text/html" });
        res.end("<!doctype html><html><body><h1>404 Not Found</h1></body></html>");
      }
      return;
    }
    if (req.url?.startsWith("/post")) {
      res.writeHead(200, { "content-type": "text/html" });
      res.end(postVersion === 1 ? POST_V1 : POST_V2);
      return;
    }
    if (req.url?.startsWith("/memo")) {
      res.writeHead(200, { "content-type": "text/html" });
      res.end(memoVersion === 1 ? MEMO_V1 : MEMO_V2);
      return;
    }
    if (req.url?.startsWith("/logo.png")) {
      res.writeHead(200, { "content-type": "image/png" });
      res.end(PNG_1x1);
      return;
    }
    res.writeHead(404);
    res.end("nope");
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  port = (server.address() as { port: number }).port;

  context = await chromium.launchPersistentContext("", {
    channel: "chromium",
    args: [
      `--disable-extensions-except=${EXT_PATH}`,
      `--load-extension=${EXT_PATH}`,
      // Make a public-looking host resolve to our local server, so the privacy
      // gate (which rejects localhost) still allows capture.
      `--host-resolver-rules=MAP news.example.com 127.0.0.1:${port}`,
    ],
  });

  // Ensure the background service worker is up before we navigate.
  if (context.serviceWorkers().length === 0) {
    await context.waitForEvent("serviceworker");
  }
});

test.afterAll(async () => {
  await context?.close();
  await new Promise<void>((r) => server.close(() => r()));
});

test("captures a live page, then resurrects it once it 404s", async () => {
  const page = await context.newPage();

  // 1. Visit the live article → the extension captures + stores it.
  await page.goto("http://news.example.com/article", { waitUntil: "networkidle" });
  await expect(
    page.getByRole("heading", { name: "The Original Article" }),
  ).toBeVisible();
  // Allow the capture round-trip (content → SW → IndexedDB) to complete.
  await page.waitForTimeout(2500);

  // 2. The page dies.
  mode = "dead";

  // 3. Revisit the now-dead URL → Resurrection overlay appears.
  await page.goto("http://news.example.com/article", {
    waitUntil: "domcontentloaded",
  });
  await expect(page.getByText("This page is gone")).toBeVisible({ timeout: 15_000 });

  // 4. Reveal the preserved snapshot; its unique marker proves it's our capture.
  await page.getByRole("button", { name: "View preserved version" }).click();
  const preserved = page.frameLocator("#__lazarus_resurrection__ iframe");
  await expect(preserved.getByText("unique-marker-A1B2C3")).toBeVisible({
    timeout: 10_000,
  });
  // Fidelity: the image was inlined at capture, so it's a data: URI that
  // survives even though the page (and its image) are now 404.
  await expect(preserved.locator("img")).toHaveAttribute("src", /^data:image\/png/);
});

test("scrubs back to an earlier version of a changed page", async () => {
  const page = await context.newPage();

  // 1. Capture version 1.
  postVersion = 1;
  await page.goto("http://news.example.com/post", { waitUntil: "networkidle" });
  await expect(page.getByText("marker-VERSION-ONE")).toBeVisible();
  await page.waitForTimeout(2500);

  // 2. The page changes; capture version 2.
  postVersion = 2;
  await page.goto("http://news.example.com/post", { waitUntil: "networkidle" });
  await expect(page.getByText("marker-VERSION-TWO")).toBeVisible();
  await page.waitForTimeout(2500);

  // 3. The Scrubber pill appears (2 preserved versions). Open it.
  await expect(page.getByText(/\d+ versions/)).toBeVisible({ timeout: 10_000 });
  await page.getByText(/\d+ versions/).click();

  // 4. Scrub to the oldest version → the iframe shows version 1's content.
  const range = page.locator("#__lazarus_scrubber__ input[type=range]");
  await range.evaluate((el) => {
    const input = el as HTMLInputElement;
    input.value = "0";
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });

  const frame = page.frameLocator("#__lazarus_scrubber__ iframe");
  await expect(frame.getByText("marker-VERSION-ONE")).toBeVisible({
    timeout: 10_000,
  });
});

test("surfaces a stealth edit in the popup feed", async () => {
  const page = await context.newPage();

  // Capture the memo, then capture a quietly-changed version.
  memoVersion = 1;
  await page.goto("http://news.example.com/memo", { waitUntil: "networkidle" });
  await page.waitForTimeout(2500);
  memoVersion = 2;
  await page.goto("http://news.example.com/memo", { waitUntil: "networkidle" });
  await page.waitForTimeout(2500);

  // Open the real extension popup and assert the edit shows up.
  const sw = context.serviceWorkers()[0];
  const extId = new URL(sw!.url()).host;
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extId}/popup.html`);

  await expect(popup.getByText("Project Memo")).toBeVisible({ timeout: 10_000 });
  await expect(popup.getByText(/edited|replaced/i).first()).toBeVisible();
});
