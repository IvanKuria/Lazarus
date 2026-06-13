import { recordCapture, resurrect, shouldCapture, IdbObservationStore } from "@lazarus/core";
import type { CaptureMessage, CaptureResponse } from "../lib/protocol.js";

/**
 * Service worker — the thin coordinator. Owns the single extension-origin store,
 * tracks main-frame HTTP status so it can (a) avoid capturing error pages and
 * (b) offer Resurrection when a dead page has a preserved copy.
 */
export default defineBackground(() => {
  const store = new IdbObservationStore("lazarus");

  // tabId → status code of the most recent main-frame response in that tab.
  const mainFrameStatus = new Map<number, number>();

  browser.webRequest.onCompleted.addListener(
    (details) => {
      if (details.type === "main_frame" && details.tabId >= 0) {
        mainFrameStatus.set(details.tabId, details.statusCode);
      }
    },
    { urls: ["<all_urls>"], types: ["main_frame"] },
  );

  // Network/DNS failures: no content script loads, so flag the toolbar badge.
  browser.webNavigation.onErrorOccurred.addListener(async (details) => {
    if (details.frameId !== 0) return;
    const hit = await resurrect(store, details.url);
    if (hit && details.tabId >= 0) {
      await browser.action.setBadgeText({ tabId: details.tabId, text: "↺" });
      await browser.action.setBadgeBackgroundColor({
        tabId: details.tabId,
        color: "#7c3aed",
      });
    }
  });

  browser.runtime.onMessage.addListener(
    async (message: CaptureMessage, sender): Promise<CaptureResponse | undefined> => {
      if (message?.type !== "lazarus:capture") return;
      const { page } = message;
      if (!shouldCapture(page.url)) return { recorded: false };

      const tabId = sender.tab?.id;
      const status = tabId !== undefined ? mainFrameStatus.get(tabId) : undefined;

      // Dead page: don't capture the error page; offer a preserved copy instead.
      if (status !== undefined && status >= 400) {
        const hit = await resurrect(store, page.url);
        if (!hit) return { recorded: false };
        return {
          recorded: false,
          resurrect: {
            html: new TextDecoder().decode(hit.snapshot),
            ...(hit.observation.title !== undefined && {
              title: hit.observation.title,
            }),
            capturedAt: hit.observation.capturedAt,
          },
        };
      }

      // Live page: record it.
      const snapshotBytes = new TextEncoder().encode(page.html);
      const result = await recordCapture(store, {
        url: page.url,
        snapshotBytes,
        text: page.text,
        title: page.title,
        capturedAt: page.capturedAt,
      });
      console.log(
        `[lazarus] ${result.change}: ${result.observation.urlKey} (${result.observation.sizeBytes}B)`,
      );
      return { recorded: true };
    },
  );

  console.log("[lazarus] background coordinator ready");
});
