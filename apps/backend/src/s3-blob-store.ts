import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import type { BlobStore } from "./blob-store.js";

export interface S3Config {
  /** Full S3 endpoint URL (e.g. Railway "https://t3.storageapi.dev",
   *  Cloudflare R2 "https://<account>.r2.cloudflarestorage.com"). */
  endpoint: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** S3 region; "auto" for R2/Railway. */
  region: string;
}

/**
 * S3-compatible blob store. Keeps snapshot bytes out of the metered Postgres —
 * /resurrect serves blobs back out, so object storage with cheap egress wins.
 * The CID is the object key, so PUT is idempotent and dedup is automatic.
 *
 * Provider-neutral: works with Railway buckets, Cloudflare R2, AWS S3, MinIO —
 * the provider is the endpoint, not baked into the code.
 *
 * Thin I/O adapter: behavior is verified by the live smoke test (see the plan),
 * not unit tests, since it talks to a real bucket. The non-trivial blob logic
 * lives in PostgresBlobStore, which is unit-tested against pg-mem.
 */
export class S3BlobStore implements BlobStore {
  private readonly client: S3Client;

  constructor(private readonly cfg: S3Config) {
    this.client = new S3Client({
      region: cfg.region,
      endpoint: cfg.endpoint,
      credentials: {
        accessKeyId: cfg.accessKeyId,
        secretAccessKey: cfg.secretAccessKey,
      },
    });
  }

  // The bucket is provisioned out-of-band (Railway/Cloudflare); nothing to migrate.
  async migrate(): Promise<void> {}

  async put(cid: string, bytes: Uint8Array): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.cfg.bucket,
        Key: cid,
        Body: bytes,
      }),
    );
  }

  async get(cid: string): Promise<Uint8Array | null> {
    try {
      const obj = await this.client.send(
        new GetObjectCommand({ Bucket: this.cfg.bucket, Key: cid }),
      );
      if (!obj.Body) return null;
      return await obj.Body.transformToByteArray();
    } catch (err) {
      // Missing object → null; any other failure is a real error worth surfacing.
      const name = (err as { name?: string }).name;
      if (name === "NoSuchKey" || name === "NotFound") return null;
      throw err;
    }
  }
}

/** Reads S3 config from env; returns null when any required var is missing (→ fall back to Postgres). */
export function s3ConfigFromEnv(): S3Config | null {
  const endpoint = process.env.S3_ENDPOINT;
  const bucket = process.env.S3_BUCKET;
  const accessKeyId = process.env.S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
  const region = process.env.S3_REGION || "auto";
  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) return null;
  return { endpoint, bucket, accessKeyId, secretAccessKey, region };
}
