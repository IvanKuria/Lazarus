import type { Observation, ChangeKind } from "./types.js";

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
  putObservation(obs: Observation): Promise<void>;
  /** Most recent observation for a urlKey, or undefined if never seen. */
  getLatestObservation(urlKey: string): Promise<Observation | undefined>;
  /** All observations for a urlKey, ordered oldest → newest. */
  getTimeline(urlKey: string): Promise<Observation[]>;
}

/** In-memory store for tests and ephemeral use. */
export class MemoryObservationStore implements ObservationStore {
  private readonly snapshots = new Map<string, Uint8Array>();
  private readonly timelines = new Map<string, Observation[]>();

  async putSnapshot(cid: string, bytes: Uint8Array): Promise<void> {
    this.snapshots.set(cid, bytes);
  }

  async getSnapshot(cid: string): Promise<Uint8Array | undefined> {
    return this.snapshots.get(cid);
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
}
