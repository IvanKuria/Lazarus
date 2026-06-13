import { normalizeUrl, classifyChange, hammingDistance } from "@lazarus/core";
import type { Observation, EditEvent } from "@lazarus/core";

export interface Submission {
  observation: Observation;
  snapshotBytes: Uint8Array;
  /** Anonymous, rotating per-user token used only to count distinct witnesses. */
  witnessId: string;
}

export interface ResurrectResult {
  observation: Observation;
  snapshot: Uint8Array;
}

/** The central index/witness plane: stores submissions, enforces k-anonymity. */
export interface IndexService {
  submit(submission: Submission): Promise<void>;
  resurrectLatest(url: string): Promise<ResurrectResult | null>;
  listVersions(url: string): Promise<Observation[]>;
  feed(limit?: number): Promise<EditEvent[]>;
}

/**
 * In-memory index — the testable reference implementation. A Postgres/Redis/Kafka
 * backed version will implement the same interface.
 *
 * Privacy core: a (urlKey, cid) is only ever *served* once `k` DISTINCT witnesses
 * have independently submitted it. Until then it's invisible — so content only
 * one person saw is never exposed.
 */
export class MemoryIndexService implements IndexService {
  private readonly k: number;
  private readonly snapshots = new Map<string, Uint8Array>(); // cid → bytes
  private readonly witnesses = new Map<string, Set<string>>(); // `urlKey\ncid` → witnessIds
  private readonly promotedKeys = new Set<string>(); // `urlKey\ncid` already promoted
  private readonly promoted = new Map<string, Observation[]>(); // urlKey → promoted versions
  private readonly edits: EditEvent[] = [];

  constructor(opts: { k?: number } = {}) {
    this.k = opts.k ?? 3;
  }

  async submit({ observation, snapshotBytes, witnessId }: Submission): Promise<void> {
    const { urlKey, cid } = observation;
    const key = `${urlKey}\n${cid}`;

    if (!this.snapshots.has(cid)) this.snapshots.set(cid, snapshotBytes);

    let seen = this.witnesses.get(key);
    if (!seen) {
      seen = new Set();
      this.witnesses.set(key, seen);
    }
    seen.add(witnessId);

    if (seen.size >= this.k && !this.promotedKeys.has(key)) {
      this.promotedKeys.add(key);
      this.promote(urlKey, observation);
    }
  }

  private promote(urlKey: string, observation: Observation): void {
    const list = this.promoted.get(urlKey) ?? [];
    list.push(observation);
    list.sort((a, b) => a.capturedAt - b.capturedAt);
    this.promoted.set(urlKey, list);

    // Emit an edit relative to the chronologically-previous promoted version.
    const idx = list.indexOf(observation);
    const before = idx > 0 ? list[idx - 1] : undefined;
    if (before && before.cid !== observation.cid) {
      const kind = classifyChange(before, observation) as "edited" | "replaced";
      this.edits.push({
        urlKey,
        ...(observation.title !== undefined && { title: observation.title }),
        kind,
        prevCid: before.cid,
        nextCid: observation.cid,
        distance: hammingDistance(before.fingerprint, observation.fingerprint),
        prevCapturedAt: before.capturedAt,
        nextCapturedAt: observation.capturedAt,
      });
    }
  }

  async resurrectLatest(url: string): Promise<ResurrectResult | null> {
    const list = this.promoted.get(normalizeUrl(url));
    const observation = list?.at(-1);
    if (!observation) return null;
    const snapshot = this.snapshots.get(observation.cid);
    if (!snapshot) return null;
    return { observation, snapshot };
  }

  async listVersions(url: string): Promise<Observation[]> {
    return [...(this.promoted.get(normalizeUrl(url)) ?? [])];
  }

  async feed(limit?: number): Promise<EditEvent[]> {
    const sorted = [...this.edits].sort(
      (a, b) => b.nextCapturedAt - a.nextCapturedAt,
    );
    return limit === undefined ? sorted : sorted.slice(0, limit);
  }
}
