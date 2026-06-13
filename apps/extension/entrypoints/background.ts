import { recordCapture, shouldCapture, IdbObservationStore } from "@lazarus/core";
import type { LazarusMessage } from "../lib/protocol.js";

/**
 * Service worker — the thin coordinator. Owns the single extension-origin store
 * and records captures pushed from content scripts. MV3 service workers are
 * ephemeral, but IndexedDB persists across restarts, so the store is reopened
 * lazily on each wake.
 */
export default defineBackground(() => {
  const store = new IdbObservationStore("lazarus");

  browser.runtime.onMessage.addListener(async (message: LazarusMessage) => {
    if (message?.type !== "lazarus:capture") return;

    const { page } = message;
    if (!shouldCapture(page.url)) return;

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
  });

  console.log("[lazarus] background coordinator ready");
});
