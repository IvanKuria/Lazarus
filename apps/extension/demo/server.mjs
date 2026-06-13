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

const LOGO = `<p><img src="http://demo.lazarus.test/logo.svg" width="160" height="60" alt="Lazarus logo"></p>`;

const V1 = page(
  "The Quiet Announcement",
  `<article><h1>The Quiet Announcement</h1>${LOGO}
   <p><b>Version 1.</b> The budget committee confirmed this morning that the flagship initiative remains firmly on track for its third-quarter launch, pointing to steady progress and a comfortable financial runway across every contributing team.</p>
   <p>Officials stressed that no significant changes to the plan are expected, and that the published schedule should be treated as accurate and stable for anyone planning around the announcement in the months ahead.</p>
   <p>This is the original article text that Lazarus preserved at capture time. marker-ORIGINAL.</p></article>`,
);

const V2 = page(
  "The Quiet Announcement",
  `<article><h1>The Quiet Announcement</h1>${LOGO}
   <p><b>Version 2.</b> The budget committee now concedes that the flagship initiative has slipped to the fourth quarter, blaming an unexpected expansion in scope and a series of dependency delays that surfaced across several contributing teams.</p>
   <p>Officials acknowledge meaningful changes to the plan, and caution that the previously published schedule should no longer be relied upon by anyone planning around the announcement this year.</p>
   <p>This paragraph was quietly rewritten in the edit — Lazarus caught the change. marker-EDITED.</p></article>`,
);

const LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="60"><rect width="160" height="60" rx="8" fill="#7c3aed"/><text x="80" y="38" font-family="system-ui,sans-serif" font-size="22" fill="#fff" text-anchor="middle">LAZARUS</text></svg>`;

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
    if (url.pathname === "/logo.svg") {
      res.writeHead(200, { "content-type": "image/svg+xml" });
      return res.end(LOGO_SVG);
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
