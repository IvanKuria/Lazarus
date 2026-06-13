import type { ObservationStore } from "./store.js";
import type { EditEvent } from "./types.js";

/**
 * The Stealth-Edit Feed: detected changes across all observed pages, newest
 * first. On a single node this is "edits in your own browsing"; backed by the
 * shared index it becomes the global, crowd-witnessed feed.
 */
export async function getEditFeed(
  store: ObservationStore,
  limit?: number,
): Promise<EditEvent[]> {
  return store.listEdits(limit);
}
