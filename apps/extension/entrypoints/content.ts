import { shouldCapture } from "@lazarus/core";
import type {
  CaptureMessage,
  CaptureResponse,
  VersionsMessage,
  VersionsResponse,
  SnapshotMessage,
  SnapshotResponse,
} from "../lib/protocol.js";
import { showResurrectionOverlay } from "../lib/resurrection-overlay.js";
import { showScrubber } from "../lib/scrubber-overlay.js";

/**
 * Content script — captures the rendered page, then surfaces the two hero
 * features over the resulting data:
 *   - dead page  → Resurrection overlay
 *   - live page with 2+ preserved versions → Time-Travel Scrubber
 *
 * It never persists anything itself (storage here hits the visited site's
 * origin); all reads/writes go through the service worker.
 */
export default defineContentScript({
  matches: ["<all_urls>"],
  runAt: "document_idle",
  async main() {
    if (!shouldCapture(location.href)) return;
    try {
      const captureMsg: CaptureMessage = {
        type: "lazarus:capture",
        page: {
          url: location.href,
          html: document.documentElement.outerHTML,
          text: document.body?.innerText ?? "",
          title: document.title,
          capturedAt: Date.now(),
        },
      };
      const capture = (await browser.runtime.sendMessage(captureMsg)) as
        | CaptureResponse
        | undefined;

      if (capture?.resurrect) {
        showResurrectionOverlay(capture.resurrect);
        return; // a dead page has no live timeline to scrub
      }

      const versionsMsg: VersionsMessage = {
        type: "lazarus:versions",
        url: location.href,
      };
      const { versions } = ((await browser.runtime.sendMessage(versionsMsg)) as
        | VersionsResponse
        | undefined) ?? { versions: [] };

      if (versions.length >= 2) {
        showScrubber({
          versions: versions.map((v) => ({
            cid: v.cid,
            capturedAt: v.capturedAt,
            ...(v.title !== undefined && { title: v.title }),
          })),
          fetchSnapshot: async (cid) => {
            const msg: SnapshotMessage = { type: "lazarus:snapshot", cid };
            const res = (await browser.runtime.sendMessage(msg)) as
              | SnapshotResponse
              | undefined;
            return res?.html ?? null;
          },
        });
      }
    } catch (err) {
      // Never break the host page.
      console.debug("[lazarus] content script error:", err);
    }
  },
});
