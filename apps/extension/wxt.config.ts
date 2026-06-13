import { defineConfig } from "wxt";

// WXT auto-generates the MV3 manifest from this config + the entrypoints/ dir.
// See docs/superpowers/specs for the full architecture; this is the Phase-1 skeleton.
export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  manifest: {
    name: "Lazarus",
    description:
      "The distributed memory & integrity network for the web. Preserve, time-travel, and resurrect the pages you read.",
    // storage/unlimitedStorage: GB-scale local snapshot store (IndexedDB/OPFS).
    // alarms: keep-alive watchdog for the offscreen P2P document (later phases).
    // offscreen: long-lived WebRTC host (later phases).
    // webRequest/webNavigation: detect dead main-frame loads (4xx/5xx + network
    //   errors) to gate capture and trigger Resurrection.
    // history: the "Digital Mortality" scan reads your past URLs to measure how
    //   many are already dead (checked locally; nothing leaves the device).
    permissions: [
      "storage",
      "unlimitedStorage",
      "alarms",
      "offscreen",
      "webRequest",
      "webNavigation",
      "history",
    ],
    // Broad host access is required to capture + inline subresources across sites.
    // This surfaces the "read your data" warning — a known, accepted tradeoff.
    host_permissions: ["<all_urls>"],
  },
});
