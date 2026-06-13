import {
  recordCapture,
  resurrect,
  listVersions,
  getEditFeed,
  shouldCapture,
  IdbObservationStore,
} from "@lazarus/core";
import type {
  LazarusMessage,
  CaptureResponse,
  VersionsResponse,
  SnapshotResponse,
  FeedResponse,
} from "../lib/protocol.js";
import { IndexClient } from "../lib/index-client.js";
import { getWitnessId } from "../lib/witness.js";

/**
 * Service worker — the thin coordinator. Owns the single extension-origin store,
 * tracks main-frame HTTP status so it can (a) avoid capturing error pages and
 * (b) offer Resurrection when a dead page has a preserved copy.
 */
export default defineBackground(() => {
  const store = new IdbObservationStore("lazarus");
  const index = new IndexClient();

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
    async (
      message: LazarusMessage,
      sender,
    ): Promise<
      | CaptureResponse
      | VersionsResponse
      | SnapshotResponse
      | FeedResponse
      | undefined
    > => {
      if (message?.type === "lazarus:feed") {
        return { edits: await getEditFeed(store, message.limit ?? 50) };
      }

      if (message?.type === "lazarus:versions") {
        return { versions: await listVersions(store, message.url) };
      }

      if (message?.type === "lazarus:snapshot") {
        const bytes = await store.getSnapshot(message.cid);
        return { html: bytes ? new TextDecoder().decode(bytes) : null };
      }

      if (message?.type !== "lazarus:capture") return;
      const { page } = message;
      if (!shouldCapture(page.url)) return { recorded: false };

      const tabId = sender.tab?.id;
      const status = tabId !== undefined ? mainFrameStatus.get(tabId) : undefined;

      // Dead page: don't capture the error page; offer a preserved copy. Try the
      // local store first, then the shared index (what another browser saw).
      if (status !== undefined && status >= 400) {
        const local = await resurrect(store, page.url);
        if (local) {
          return {
            recorded: false,
            resurrect: {
              html: new TextDecoder().decode(local.snapshot),
              ...(local.observation.title !== undefined && {
                title: local.observation.title,
              }),
              capturedAt: local.observation.capturedAt,
            },
          };
        }
        const remote = await index.resurrectLatest(page.url).catch(() => null);
        if (!remote) return { recorded: false };
        return {
          recorded: false,
          resurrect: {
            html: remote.html,
            ...(remote.observation.title !== undefined && {
              title: remote.observation.title,
            }),
            capturedAt: remote.observation.capturedAt,
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

      // Contribute new/changed versions to the shared index (best-effort).
      // Sends raw fields; the server derives the content address from the bytes.
      if (result.change !== "unchanged") {
        void getWitnessId()
          .then((witnessId) =>
            index.submit({
              url: page.url,
              snapshotBytes,
              text: page.text,
              capturedAt: page.capturedAt,
              title: page.title,
              witnessId,
            }),
          )
          .catch(() => {});
      }

      return { recorded: true };
    },
  );

  console.log("[lazarus] background coordinator ready");
});
