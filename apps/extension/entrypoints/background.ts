import {
  recordCapture,
  resurrect,
  listVersions,
  getEditFeed,
  mergeVersions,
  mergeEdits,
  shouldCapture,
  inlineResources,
  sampleLinks,
  summarizeMortality,
  IdbObservationStore,
} from "@lazarus/core";
import type {
  LazarusMessage,
  CaptureResponse,
  VersionsResponse,
  SnapshotResponse,
  FeedResponse,
  MortalityResponse,
} from "../lib/protocol.js";
import { scanMortality } from "../lib/mortality-scan.js";
import { IndexClient } from "../lib/index-client.js";
import { getWitnessToken } from "../lib/witness.js";
import { base64ToBytes, bytesToBase64 } from "../lib/base64.js";

/** Fetch the collected resources (host permissions bypass page CORS) and inline
 * them as data URIs, making the snapshot self-contained. */
const MAX_RESOURCES = 60;
const MAX_RESOURCE_BYTES = 3 * 1024 * 1024;

async function inlineSnapshot(html: string, urls: string[]): Promise<string> {
  const map: Record<string, string> = {};
  await Promise.all(
    urls.slice(0, MAX_RESOURCES).map(async (url) => {
      try {
        const res = await fetch(url);
        if (!res.ok) return;
        const blob = await res.blob();
        if (blob.size > MAX_RESOURCE_BYTES) return;
        const bytes = new Uint8Array(await blob.arrayBuffer());
        const type = blob.type || "application/octet-stream";
        map[url] = `data:${type};base64,${bytesToBase64(bytes)}`;
      } catch {
        /* skip unreachable resource */
      }
    }),
  );
  return inlineResources(html, map);
}

/**
 * Service worker — the thin coordinator. Owns the single extension-origin store,
 * tracks main-frame HTTP status so it can (a) avoid capturing error pages and
 * (b) offer Resurrection when a dead page has a preserved copy.
 */
export default defineBackground(() => {
  const store = new IdbObservationStore("lazarus");
  const index = new IndexClient();

  // Show the "Digital Mortality" onboarding on first install.
  browser.runtime.onInstalled.addListener((details) => {
    if (details.reason === "install") {
      void browser.tabs.create({ url: browser.runtime.getURL("/onboarding.html") });
    }
  });

  // Stand up the long-lived offscreen document that hosts P2P (WebRTC).
  // chrome.offscreen typings vary across builds, so access it untyped.
  const offscreenApi = (
    globalThis as unknown as {
      chrome: {
        offscreen: {
          hasDocument(): Promise<boolean>;
          createDocument(opts: {
            url: string;
            reasons: string[];
            justification: string;
          }): Promise<void>;
        };
      };
    }
  ).chrome.offscreen;

  async function ensureOffscreen(): Promise<void> {
    try {
      if (await offscreenApi.hasDocument()) return;
      await offscreenApi.createDocument({
        url: "offscreen.html",
        reasons: ["WEB_RTC"],
        justification: "Maintain peer connections to share preserved snapshots.",
      });
    } catch {
      /* already exists or unsupported */
    }
  }
  void ensureOffscreen();

  // Ask the offscreen peer to fetch a blob by CID; returns the HTML or null.
  async function p2pFetchHtml(cid: string): Promise<string | null> {
    const res = (await browser.runtime
      .sendMessage({ type: "p2p:fetch", cid })
      .catch(() => null)) as { ok: boolean; base64: string | null } | null;
    if (!res?.ok || !res.base64) return null;
    return new TextDecoder().decode(base64ToBytes(res.base64));
  }

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
      | MortalityResponse
      | undefined
    > => {
      if (message?.type === "lazarus:mortality") {
        return scanMortality(message.sample ?? 60);
      }

      if (message?.type === "lazarus:feed") {
        // Global feed = your local edits unioned with the crowd-witnessed remote
        // feed. Remote failure degrades to local-only (never rejects).
        const limit = message.limit ?? 50;
        const [local, remote] = await Promise.all([
          getEditFeed(store, limit),
          index.feed(limit).catch(() => []),
        ]);
        return { edits: mergeEdits(local, remote, limit) };
      }

      if (message?.type === "lazarus:versions") {
        // Cross-user timeline = local versions unioned with the network's.
        const [local, remote] = await Promise.all([
          listVersions(store, message.url),
          index.listVersions(message.url).catch(() => []),
        ]);
        return { versions: mergeVersions(local, remote) };
      }

      if (message?.type === "lazarus:snapshot") {
        const bytes = await store.getSnapshot(message.cid);
        if (bytes) return { html: new TextDecoder().decode(bytes) };
        // Not held locally (a version preserved by others): try a peer first,
        // then the central blob endpoint (which serves promoted cids only).
        const remoteHtml =
          (await p2pFetchHtml(message.cid)) ??
          (await index.fetchBlobHtml(message.cid).catch(() => null));
        return { html: remoteHtml ?? null };
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
        // Locate the CID via the index, then fetch the blob peer-to-peer.
        // Fall back to a central fetch only if no peer can serve it.
        const located = await index.locate(page.url).catch(() => null);
        if (located) {
          const p2pHtml = await p2pFetchHtml(located.cid);
          const html =
            p2pHtml ??
            (await index.resurrectLatest(page.url).catch(() => null))?.html ??
            null;
          if (html) {
            return {
              recorded: false,
              resurrect: {
                html,
                ...(located.title !== undefined && { title: located.title }),
                capturedAt: located.capturedAt,
              },
            };
          }
        }
        return { recorded: false };
      }

      // Live page: inline its resources, then record the self-contained snapshot.
      const inlinedHtml = await inlineSnapshot(page.html, page.resourceUrls ?? []);
      const snapshotBytes = new TextEncoder().encode(inlinedHtml);
      const result = await recordCapture(store, {
        url: page.url,
        snapshotBytes,
        text: page.text,
        title: page.title,
        capturedAt: page.capturedAt,
        readerable: page.readerable,
      });
      console.log(
        `[lazarus] ${result.change}: ${result.observation.urlKey} (${result.observation.sizeBytes}B)`,
      );

      // Contribute new/changed versions to the shared index (best-effort).
      // Sends raw fields; the server derives the content address from the bytes.
      if (result.change !== "unchanged") {
        void getWitnessToken(index)
          .then((witnessToken) =>
            index.submit({
              url: page.url,
              snapshotBytes,
              text: page.text,
              capturedAt: page.capturedAt,
              title: page.title,
              witnessToken,
            }),
          )
          .catch(() => {});
        // Tell our offscreen peer to announce this new CID to the swarm.
        void browser.runtime
          .sendMessage({ type: "p2p:announce", cid: result.observation.cid })
          .catch(() => {});
      }

      return { recorded: true };
    },
  );

  console.log("[lazarus] background coordinator ready");
});
