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

  if (latest) {
    const distance = hammingDistance(latest.fingerprint, observation.fingerprint);
    // Identical meaningful text (even if the raw HTML differs — rotating tokens,
    // ads, session ids) is NOT a new version and NOT an edit. This is what keeps
    // dynamic-page churn out of the timeline and the feed.
    if (latest.cid === observation.cid || distance === 0) {
      return { change: "unchanged", observation: latest };
    }

    await store.putSnapshot(observation.cid, page.snapshotBytes);
    await store.putObservation(observation);

    const change = classifyChange(latest, observation) as "edited" | "replaced";
    // Only surface the change in the Stealth-Edit Feed for article-like pages —
    // search results, dashboards, and app UIs change by design, not stealth.
    if (page.readerable !== false) {
      await store.putEdit({
        urlKey: observation.urlKey,
        ...(observation.title !== undefined && { title: observation.title }),
        kind: change,
        prevCid: latest.cid,
        nextCid: observation.cid,
        distance,
        prevCapturedAt: latest.capturedAt,
        nextCapturedAt: observation.capturedAt,
      });
    }
    return { change, observation };
  }

  await store.putSnapshot(observation.cid, page.snapshotBytes);
  await store.putObservation(observation);
  return { change: "new", observation };
}
