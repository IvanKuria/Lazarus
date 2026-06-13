import { normalizeUrl } from "./url.js";
import type { ObservationStore } from "./store.js";
import type { Observation } from "./types.js";

/** A resurrected page: the latest preserved snapshot and its observation record. */
export interface ResurrectResult {
  observation: Observation;
  snapshot: Uint8Array;
}

/**
 * Look up the most recent preserved version of a URL.
 *
 * Returns null when nothing is preserved (or the metadata exists but its blob is
 * missing locally — a later phase fetches that blob from a peer). The URL is
 * normalized first, so tracking params and fragments still resolve to the page.
 */
export async function resurrect(
  store: ObservationStore,
  url: string,
): Promise<ResurrectResult | null> {
  const urlKey = normalizeUrl(url);
  const observation = await store.getLatestObservation(urlKey);
  if (!observation) return null;

  const snapshot = await store.getSnapshot(observation.cid);
  if (!snapshot) return null;

  return { observation, snapshot };
}
