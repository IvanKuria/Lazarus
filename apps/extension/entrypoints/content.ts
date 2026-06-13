/**
 * Content script — runs on every page.
 *
 * Responsibilities (built out over Phase 1):
 *   - privacy-gate the page (public only)
 *   - capture a faithful, canonical snapshot + fingerprint
 *   - detect load failures and inject the Resurrection panel
 *   - host the Time-Travel Scrubber UI
 */
export default defineContentScript({
  matches: ["<all_urls>"],
  runAt: "document_idle",
  main() {
    console.log("[lazarus] content script active on", location.href);
  },
});
