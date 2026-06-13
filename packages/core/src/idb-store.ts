import type { ObservationStore } from "./store.js";
import type { Observation } from "./types.js";

/**
 * IndexedDB-backed observation store — the extension's real persistence layer.
 *
 * Two object stores: `snapshots` (cid → bytes, the heavy blobs) and
 * `observations` (the metadata timeline, indexed by urlKey). Kept in @lazarus/core
 * because IndexedDB is a portable web standard (faked in tests); the Node backend
 * simply never instantiates this class.
 */
const SNAPSHOTS = "snapshots";
const OBSERVATIONS = "observations";

function reqToPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export class IdbObservationStore implements ObservationStore {
  private dbPromise?: Promise<IDBDatabase>;

  constructor(private readonly name = "lazarus") {}

  private open(): Promise<IDBDatabase> {
    if (!this.dbPromise) {
      this.dbPromise = new Promise((resolve, reject) => {
        const req = indexedDB.open(this.name, 1);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(SNAPSHOTS)) {
            db.createObjectStore(SNAPSHOTS);
          }
          if (!db.objectStoreNames.contains(OBSERVATIONS)) {
            const os = db.createObjectStore(OBSERVATIONS, { autoIncrement: true });
            os.createIndex("urlKey", "urlKey", { unique: false });
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    }
    return this.dbPromise;
  }

  async putSnapshot(cid: string, bytes: Uint8Array): Promise<void> {
    const db = await this.open();
    const tx = db.transaction(SNAPSHOTS, "readwrite");
    tx.objectStore(SNAPSHOTS).put(bytes, cid);
    await txDone(tx);
  }

  async getSnapshot(cid: string): Promise<Uint8Array | undefined> {
    const db = await this.open();
    const tx = db.transaction(SNAPSHOTS, "readonly");
    const result = await reqToPromise(tx.objectStore(SNAPSHOTS).get(cid));
    return result as Uint8Array | undefined;
  }

  async putObservation(obs: Observation): Promise<void> {
    const db = await this.open();
    const tx = db.transaction(OBSERVATIONS, "readwrite");
    tx.objectStore(OBSERVATIONS).add(obs);
    await txDone(tx);
  }

  async getTimeline(urlKey: string): Promise<Observation[]> {
    const db = await this.open();
    const tx = db.transaction(OBSERVATIONS, "readonly");
    const index = tx.objectStore(OBSERVATIONS).index("urlKey");
    const all = (await reqToPromise(index.getAll(urlKey))) as Observation[];
    return all.sort((a, b) => a.capturedAt - b.capturedAt);
  }

  async getLatestObservation(urlKey: string): Promise<Observation | undefined> {
    return (await this.getTimeline(urlKey)).at(-1);
  }
}
