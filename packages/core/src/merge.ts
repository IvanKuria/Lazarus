import type { Observation, EditEvent } from "./types.js";

/**
 * Merge a page's LOCAL version timeline with the REMOTE (network) one into a
 * single cross-user timeline. Deduped by `cid` (versions with the same cid are
 * byte-identical by construction — the server derives the cid from the bytes),
 * sorted oldest → newest, which is what the Time-Travel Scrubber expects.
 */
export function mergeVersions(
  local: Observation[],
  remote: Observation[],
): Observation[] {
  const byCid = new Map<string, Observation>();
  for (const o of [...local, ...remote]) byCid.set(o.cid, o);
  return [...byCid.values()].sort((a, b) => a.capturedAt - b.capturedAt);
}

/**
 * Merge the LOCAL edit feed (changes in your own browsing) with the REMOTE
 * crowd-witnessed feed into one global Stealth-Edit Feed. Deduped by
 * (urlKey, prevCid, nextCid), newest first, then truncated to `limit`.
 */
export function mergeEdits(
  local: EditEvent[],
  remote: EditEvent[],
  limit?: number,
): EditEvent[] {
  const byKey = new Map<string, EditEvent>();
  for (const e of [...local, ...remote]) {
    byKey.set(`${e.urlKey}\n${e.prevCid}\n${e.nextCid}`, e);
  }
  const sorted = [...byKey.values()].sort(
    (a, b) => b.nextCapturedAt - a.nextCapturedAt,
  );
  return limit === undefined ? sorted : sorted.slice(0, limit);
}
