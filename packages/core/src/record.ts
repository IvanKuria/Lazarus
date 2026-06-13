import { buildObservation, classifyChange } from "./observation.js";
import { hammingDistance } from "./fingerprint.js";
import type { ObservationStore, RecordResult } from "./store.js";
import type { CapturedPage } from "./types.js";

/**
 * Record a captured page: dedup against the latest known version, store a new
 * version + snapshot only when the content actually changed, and report how it
 * changed. This is the heart of the capture loop — and where dedup keeps the
 * store from exploding on every reload.
 */
export async function recordCapture(
  store: ObservationStore,
  page: CapturedPage,
): Promise<RecordResult> {
  const observation = await buildObservation(page);
  const latest = await store.getLatestObservation(observation.urlKey);

  if (latest && latest.cid === observation.cid) {
    return { change: "unchanged", observation: latest };
  }

  await store.putSnapshot(observation.cid, page.snapshotBytes);
  await store.putObservation(observation);

  if (latest) {
    // latest exists and cids differ → change is "edited" or "replaced".
    const change = classifyChange(latest, observation) as "edited" | "replaced";
    await store.putEdit({
      urlKey: observation.urlKey,
      ...(observation.title !== undefined && { title: observation.title }),
      kind: change,
      prevCid: latest.cid,
      nextCid: observation.cid,
      distance: hammingDistance(latest.fingerprint, observation.fingerprint),
      prevCapturedAt: latest.capturedAt,
      nextCapturedAt: observation.capturedAt,
    });
    return { change, observation };
  }

  return { change: "new", observation };
}
