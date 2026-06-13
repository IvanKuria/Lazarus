import { shouldCapture } from "@lazarus/core";
import type { CaptureMessage } from "../lib/protocol.js";

/**
 * Content script — captures the rendered page and hands it to the background.
 *
 * It must NOT persist anything itself: storage APIs here run against the visited
 * site's origin. It only reads the DOM and message-passes to the service worker,
 * which owns the extension-origin store.
 */
export default defineContentScript({
  matches: ["<all_urls>"],
  runAt: "document_idle",
  main() {
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
      void browser.runtime.sendMessage(message);
    } catch (err) {
      // Never break the host page.
      console.debug("[lazarus] capture skipped:", err);
    }
  },
});
