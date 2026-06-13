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
    permissions: ["storage", "unlimitedStorage", "alarms", "offscreen"],
    // Broad host access is required to capture + inline subresources across sites.
    // This surfaces the "read your data" warning — a known, accepted tradeoff.
    host_permissions: ["<all_urls>"],
  },
});
