import type { Pool } from "pg";
import { normalizeUrl, classifyChange, hammingDistance } from "@lazarus/core";
import type { Observation, EditEvent } from "@lazarus/core";
import type { IndexService, Submission, ResurrectResult } from "./index-service.js";
import { PostgresBlobStore, type BlobStore } from "./blob-store.js";

/**
 * Postgres-backed index. Same k-anonymity + content-addressing contract as
 * MemoryIndexService, durable across restarts. Snapshot bytes live behind a
 * BlobStore (Postgres by default, S3-compatible object storage in production) so the index tables stay
 * metadata-only; pass `storeBlobs: false` for a metadata-only node with no blob
 * retrieval (blobs then come via the P2P data plane).
 *
 * Tested in-process against pg-mem (a Postgres emulator) and runs against the
 * real Postgres from docker-compose when DATABASE_URL is set.
 */
export class PostgresIndexService implements IndexService {
  private readonly k: number;
  private readonly blobs: BlobStore | null;

  constructor(
    private readonly pool: Pool,
    opts: { k?: number; storeBlobs?: boolean; blobStore?: BlobStore } = {},
  ) {
    this.k = opts.k ?? 3;
    // storeBlobs:false → metadata-only node (no blob store at all). Otherwise use
    // the injected store, defaulting to Postgres so existing callers are unchanged.
    this.blobs =
      opts.storeBlobs === false
        ? null
        : (opts.blobStore ?? new PostgresBlobStore(pool));
  }

  async migrate(): Promise<void> {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS observations (
        urlkey text NOT NULL, cid text NOT NULL, fingerprint text NOT NULL,
        captured_at bigint NOT NULL, size_bytes bigint NOT NULL, title text,
        promoted boolean NOT NULL DEFAULT false,
        PRIMARY KEY (urlkey, cid)
      )`);
    await this.blobs?.migrate();
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS witnesses (
        urlkey text NOT NULL, cid text NOT NULL, witness text NOT NULL,
        PRIMARY KEY (urlkey, cid, witness)
      )`);
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS edits (
        urlkey text NOT NULL, title text, kind text NOT NULL,
        prev_cid text NOT NULL, next_cid text NOT NULL, distance int NOT NULL,
        prev_captured_at bigint NOT NULL, next_captured_at bigint NOT NULL
      )`);
  }

  async submit({ observation, snapshotBytes, witnessId }: Submission): Promise<void> {
    const { urlKey, cid, fingerprint, capturedAt, sizeBytes, title } = observation;

    await this.pool.query(
      `INSERT INTO observations(urlkey,cid,fingerprint,captured_at,size_bytes,title)
       VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT (urlkey,cid) DO NOTHING`,
      [urlKey, cid, fingerprint, capturedAt, sizeBytes, title ?? null],
    );
    await this.blobs?.put(cid, snapshotBytes);
    await this.pool.query(
      `INSERT INTO witnesses(urlkey,cid,witness) VALUES($1,$2,$3)
       ON CONFLICT (urlkey,cid,witness) DO NOTHING`,
      [urlKey, cid, witnessId],
    );

    const countRes = await this.pool.query(
      `SELECT count(*) AS n FROM witnesses WHERE urlkey=$1 AND cid=$2`,
      [urlKey, cid],
    );
    const distinct = Number(countRes.rows[0].n);

    const promRes = await this.pool.query(
      `SELECT promoted FROM observations WHERE urlkey=$1 AND cid=$2`,
      [urlKey, cid],
    );
    const alreadyPromoted = promRes.rows[0]?.promoted === true;

    if (distinct >= this.k && !alreadyPromoted) {
      const prevRes = await this.pool.query(
        `SELECT cid,fingerprint,captured_at FROM observations
         WHERE urlkey=$1 AND promoted=true ORDER BY captured_at DESC LIMIT 1`,
        [urlKey],
      );
      const prev = prevRes.rows[0];

      await this.pool.query(
        `UPDATE observations SET promoted=true WHERE urlkey=$1 AND cid=$2`,
        [urlKey, cid],
      );

      if (prev && prev.cid !== cid) {
        const kind = classifyChange(
          { cid: prev.cid, fingerprint: prev.fingerprint },
          { cid, fingerprint },
        ) as "edited" | "replaced";
        await this.pool.query(
          `INSERT INTO edits(urlkey,title,kind,prev_cid,next_cid,distance,prev_captured_at,next_captured_at)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
          [
            urlKey,
            title ?? null,
            kind,
            prev.cid,
            cid,
            hammingDistance(prev.fingerprint, fingerprint),
            Number(prev.captured_at),
            capturedAt,
          ],
        );
      }
    }
  }

  async resurrectLatest(url: string): Promise<ResurrectResult | null> {
    if (!this.blobs) return null;
    const res = await this.pool.query(
      `SELECT urlkey,cid,fingerprint,captured_at,size_bytes,title FROM observations
       WHERE urlkey=$1 AND promoted=true ORDER BY captured_at DESC LIMIT 1`,
      [normalizeUrl(url)],
    );
    const row = res.rows[0];
    if (!row) return null;
    const snapshot = await this.blobs.get(row.cid as string);
    if (!snapshot) return null;
    return { observation: rowToObservation(row), snapshot };
  }

  async locateLatest(url: string): Promise<Observation | null> {
    const res = await this.pool.query(
      `SELECT urlkey,cid,fingerprint,captured_at,size_bytes,title FROM observations
       WHERE urlkey=$1 AND promoted=true ORDER BY captured_at DESC LIMIT 1`,
      [normalizeUrl(url)],
    );
    return res.rows[0] ? rowToObservation(res.rows[0]) : null;
  }

  async listVersions(url: string): Promise<Observation[]> {
    const res = await this.pool.query(
      `SELECT urlkey,cid,fingerprint,captured_at,size_bytes,title FROM observations
       WHERE urlkey=$1 AND promoted=true ORDER BY captured_at ASC`,
      [normalizeUrl(url)],
    );
    return res.rows.map(rowToObservation);
  }

  async feed(limit?: number): Promise<EditEvent[]> {
    const base = `SELECT urlkey,title,kind,prev_cid,next_cid,distance,prev_captured_at,next_captured_at
                  FROM edits ORDER BY next_captured_at DESC`;
    const res =
      limit === undefined
        ? await this.pool.query(base)
        : await this.pool.query(`${base} LIMIT $1`, [limit]);
    return res.rows.map(rowToEdit);
  }

  async ping(): Promise<boolean> {
    try {
      await this.pool.query("SELECT 1");
      return true;
    } catch {
      return false;
    }
  }
}

function rowToObservation(row: Record<string, unknown>): Observation {
  const obs: Observation = {
    urlKey: row.urlkey as string,
    cid: row.cid as string,
    fingerprint: row.fingerprint as string,
    capturedAt: Number(row.captured_at),
    sizeBytes: Number(row.size_bytes),
  };
  if (row.title != null) obs.title = row.title as string;
  return obs;
}

function rowToEdit(row: Record<string, unknown>): EditEvent {
  const edit: EditEvent = {
    urlKey: row.urlkey as string,
    kind: row.kind as "edited" | "replaced",
    prevCid: row.prev_cid as string,
    nextCid: row.next_cid as string,
    distance: Number(row.distance),
    prevCapturedAt: Number(row.prev_captured_at),
    nextCapturedAt: Number(row.next_captured_at),
  };
  if (row.title != null) edit.title = row.title as string;
  return edit;
}
