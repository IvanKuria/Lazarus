// Lazarus local demo server.
//   node apps/extension/demo/server.mjs      (serves on 127.0.0.1:8799)
// Reached in the browser as http://demo.lazarus.test/ via Chrome's
// --host-resolver-rules (see launch.sh) so the privacy gate (which ignores
// localhost) still captures it.
import http from "node:http";

const PORT = 8799;
let mode = "live"; // "live" | "edited" | "dead"

const page = (title, bodyHtml) =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${title}</title></head>
<body style="font:18px/1.6 system-ui,sans-serif;max-width:680px;margin:48px auto;padding:0 16px;color:#1f2937">
${bodyHtml}</body></html>`;

const V1 = page(
  "The Quiet Announcement",
  `<h1>The Quiet Announcement</h1>
   <p><b>Version 1.</b> The committee said the budget is <b>on track</b> for the Q3 launch.</p>
   <p>This is the original article text that Lazarus preserved. marker-ORIGINAL.</p>`,
);

const V2 = page(
  "The Quiet Announcement",
  `<h1>The Quiet Announcement</h1>
   <p><b>Version 2.</b> The committee now says the budget is <b>delayed to Q4</b> after scope changes.</p>
   <p>This paragraph was quietly added in the edit — Lazarus caught the change. marker-EDITED.</p>`,
);

const DEAD = page("404 Not Found", `<h1>404 — Not Found</h1><p>This page is gone.</p>`);

function panel() {
  const badge = { live: "#16a34a", edited: "#b45309", dead: "#dc2626" }[mode];
  return page(
    "Lazarus Demo Control",
    `<h1>🪦 Lazarus Demo Control</h1>
     <p>Current article state: <b style="color:${badge}">${mode.toUpperCase()}</b></p>
     <p>
       <a href="/set?mode=live"   style="margin-right:8px">① Set Version 1</a>
       <a href="/set?mode=edited" style="margin-right:8px">② Edit → Version 2</a>
       <a href="/set?mode=dead">③ Delete (404)</a>
     </p>
     <p style="margin-top:24px"><a href="http://demo.lazarus.test/article" target="_blank"
        style="display:inline-block;background:#7c3aed;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">
        ↗ Open the article in a new tab</a></p>
     <hr style="margin:28px 0;border:none;border-top:1px solid #eee">
     <h3>Try this</h3>
     <ol>
       <li>Click <b>Open the article</b> (state = Version 1). Wait ~2s — Lazarus captures it.
           <br><small>(Watch chrome://extensions → Lazarus → “service worker” console for <code>[lazarus] new: …</code>)</small></li>
       <li>Come back here, click <b>② Edit → Version 2</b>, then <b>reload the article tab</b>.
           A <b>⏳ 2 versions</b> pill appears (the <b>Time-Travel Scrubber</b>); drag it between versions.
           The Lazarus toolbar popup now shows the edit in the <b>Stealth-Edit Feed</b>.</li>
       <li>Come back here, click <b>③ Delete (404)</b>, then <b>reload the article tab</b>.
           The <b>Resurrection</b> banner appears — “This page is gone” — click <b>View preserved version</b>.</li>
     </ol>`,
  );
}

http
  .createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://x");
    if (url.pathname === "/set") {
      const m = url.searchParams.get("mode");
      if (m === "live" || m === "edited" || m === "dead") mode = m;
      res.writeHead(302, { Location: "/" });
      return res.end();
    }
    if (url.pathname === "/article") {
      if (mode === "dead") {
        res.writeHead(404, { "content-type": "text/html" });
        return res.end(DEAD);
      }
      res.writeHead(200, { "content-type": "text/html" });
      return res.end(mode === "edited" ? V2 : V1);
    }
    if (url.pathname === "/") {
      res.writeHead(200, { "content-type": "text/html" });
      return res.end(panel());
    }
    res.writeHead(404);
    res.end("not found");
  })
  .listen(PORT, "127.0.0.1", () =>
    console.log(`[lazarus-demo] control panel on http://127.0.0.1:${PORT} (open via launch.sh)`),
  );
