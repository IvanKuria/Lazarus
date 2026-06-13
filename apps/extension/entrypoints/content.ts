import { shouldCapture } from "@lazarus/core";
import type { CaptureMessage, CaptureResponse } from "../lib/protocol.js";
import { showResurrectionOverlay } from "../lib/resurrection-overlay.js";

/**
 * Content script — captures the rendered page and hands it to the background.
 *
 * It must NOT persist anything itself (storage here runs against the visited
 * site's origin). It reads the DOM, message-passes to the service worker, and —
 * if the SW reports this was a dead page with a preserved copy — renders the
 * Resurrection overlay.
 */
export default defineContentScript({
  matches: ["<all_urls>"],
  runAt: "document_idle",
  async main() {
    if (!shouldCapture(location.href)) return;
    try {
      const message: CaptureMessage = {
        type: "lazarus:capture",
        page: {
          url: location.href,
          html: document.documentElement.outerHTML,
          text: document.body?.innerText ?? "",
          title: document.title,
          capturedAt: Date.now(),
        },
      };
      const response = (await browser.runtime.sendMessage(message)) as
        | CaptureResponse
        | undefined;
      if (response?.resurrect) {
        showResurrectionOverlay(response.resurrect);
      }
    } catch (err) {
      // Never break the host page.
      console.debug("[lazarus] capture skipped:", err);
    }
  },
});
