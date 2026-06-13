/**
 * Service worker — the thin, event-driven coordinator.
 *
 * MV3 service workers are ephemeral (terminate after ~30s idle) and have no DOM,
 * so this never holds P2P connections or heavy state. It routes messages, reacts
 * to navigation events, and schedules work. Long-lived P2P lives in the offscreen
 * document (later phase).
 */
export default defineBackground(() => {
  console.log("[lazarus] background coordinator ready");
});
