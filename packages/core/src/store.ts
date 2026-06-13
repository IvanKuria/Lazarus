import type { Observation, ChangeKind, EditEvent } from "./types.js";

/** Outcome of recording a capture: what changed, and the resulting observation. */
export interface RecordResult {
  change: ChangeKind | "new";
  observation: Observation;
}

/**
 * Persistence boundary for observations + snapshot blobs.
 *
 * The orchestration logic depends only on this interface, so it can be tested
 * against an in-memory store and run in the extension against IndexedDB/OPFS.
 */
export interface ObservationStore {
  putSnapshot(cid: string, bytes: Uint8Array): Promise<void>;
  getSnapshot(cid: string): Promise<Uint8Array | undefined>;
  /** All snapshot CIDs held locally — used to announce holdings to peers. */
  listSnapshotCids(): Promise<string[]>;
  putObservation(obs: Observation): Promise<void>;
  /** Most recent observation for a urlKey, or undefined if never seen. */
  getLatestObservation(urlKey: string): Promise<Observation | undefined>;
  /** All observations for a urlKey, ordered oldest → newest. */
  getTimeline(urlKey: string): Promise<Observation[]>;
  /** Append a detected edit to the feed log. */
  putEdit(event: EditEvent): Promise<void>;
  /** Recent edits, newest-first, optionally capped at `limit`. */
  listEdits(limit?: number): Promise<EditEvent[]>;
}

/** In-memory store for tests and ephemeral use. */
export class MemoryObservationStore implements ObservationStore {
  private readonly snapshots = new Map<string, Uint8Array>();
  private readonly timelines = new Map<string, Observation[]>();
  private readonly edits: EditEvent[] = [];

  async putSnapshot(cid: string, bytes: Uint8Array): Promise<void> {
    this.snapshots.set(cid, bytes);
  }

  async getSnapshot(cid: string): Promise<Uint8Array | undefined> {
    return this.snapshots.get(cid);
  }

  async listSnapshotCids(): Promise<string[]> {
    return [...this.snapshots.keys()];
  }

  async putObservation(obs: Observation): Promise<void> {
    const list = this.timelines.get(obs.urlKey) ?? [];
    list.push(obs);
    list.sort((a, b) => a.capturedAt - b.capturedAt);
    this.timelines.set(obs.urlKey, list);
  }

  async getLatestObservation(urlKey: string): Promise<Observation | undefined> {
    return this.timelines.get(urlKey)?.at(-1);
  }

  async getTimeline(urlKey: string): Promise<Observation[]> {
    return [...(this.timelines.get(urlKey) ?? [])];
  }

  async putEdit(event: EditEvent): Promise<void> {
    this.edits.push(event);
  }

  async listEdits(limit?: number): Promise<EditEvent[]> {
    const sorted = [...this.edits].sort(
      (a, b) => b.nextCapturedAt - a.nextCapturedAt,
    );
    return limit === undefined ? sorted : sorted.slice(0, limit);
  }
}
