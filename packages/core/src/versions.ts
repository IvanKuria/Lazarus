import { normalizeUrl } from "./url.js";
import type { ObservationStore } from "./store.js";
import type { Observation } from "./types.js";

/**
 * List every preserved version of a URL, oldest → newest.
 *
 * This is the data behind the Time-Travel Scrubber: each entry is one witnessed
 * version's metadata; the heavy snapshot for a given version is fetched lazily
 * by its `cid` only when the user scrubs to it.
 */
export async function listVersions(
  store: ObservationStore,
  url: string,
): Promise<Observation[]> {
  return store.getTimeline(normalizeUrl(url));
}
