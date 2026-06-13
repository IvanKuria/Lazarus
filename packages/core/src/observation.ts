import { computeCid } from "./cid.js";
import { normalizeUrl } from "./url.js";
import { simhash, hammingDistance } from "./fingerprint.js";
import type { CapturedPage, Observation, ChangeKind } from "./types.js";

/**
 * Maximum SimHash Hamming distance still considered "the same page, edited"
 * rather than "replaced by different content". Calibrated so that small textual
 * edits to a long document stay under it while unrelated content exceeds it.
 */
export const EDIT_DISTANCE_MAX = 12;

/** Build the canonical, content-addressed observation record for a captured page. */
export async function buildObservation(page: CapturedPage): Promise<Observation> {
  const obs: Observation = {
    urlKey: normalizeUrl(page.url),
    cid: await computeCid(page.snapshotBytes),
    fingerprint: simhash(page.text),
    capturedAt: page.capturedAt,
    sizeBytes: page.snapshotBytes.length,
  };
  if (page.title !== undefined) obs.title = page.title;
  return obs;
}

/** Classify how a new version relates to the previous one for the same page. */
export function classifyChange(
  prev: Pick<Observation, "cid" | "fingerprint">,
  next: Pick<Observation, "cid" | "fingerprint">,
): ChangeKind {
  if (prev.cid === next.cid) return "unchanged";
  const distance = hammingDistance(prev.fingerprint, next.fingerprint);
  return distance <= EDIT_DISTANCE_MAX ? "edited" : "replaced";
}
