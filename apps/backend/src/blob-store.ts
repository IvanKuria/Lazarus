import type { Pool } from "pg";

/**
 * Content-addressed blob storage, keyed by CID. The CID is derived from the
 * bytes, so `put` is idempotent and dedup is automatic. Snapshots live here
 * rather than in the index tables so the index DB stays metadata-only.
 */
export interface BlobStore {
  /** Idempotent schema setup; a no-op for stores with no migration (e.g. R2). */
  migrate(): Promise<void>;
  put(cid: string, bytes: Uint8Array): Promise<void>;
  get(cid: string): Promise<Uint8Array | null>;
}

/**
 * Postgres-backed blobs (base64 in a text column). The default store and the
 * one used in tests (pg-mem). Fine for local/dev and small datasets; for
 * production scale, R2BlobStore keeps bytes out of the metered DB.
 */
export class PostgresBlobStore implements BlobStore {
  constructor(private readonly pool: Pool) {}

  async migrate(): Promise<void> {
    await this.pool.query(
      `CREATE TABLE IF NOT EXISTS snapshots (cid text PRIMARY KEY, b64 text NOT NULL)`,
    );
  }

  async put(cid: string, bytes: Uint8Array): Promise<void> {
    await this.pool.query(
      `INSERT INTO snapshots(cid,b64) VALUES($1,$2) ON CONFLICT (cid) DO NOTHING`,
      [cid, Buffer.from(bytes).toString("base64")],
    );
  }

  async get(cid: string): Promise<Uint8Array | null> {
    const res = await this.pool.query(
      `SELECT b64 FROM snapshots WHERE cid=$1`,
      [cid],
    );
    const row = res.rows[0];
    if (!row || row.b64 == null) return null;
    return new Uint8Array(Buffer.from(row.b64 as string, "base64"));
  }
}
