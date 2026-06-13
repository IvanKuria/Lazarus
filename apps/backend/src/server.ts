import crypto from "node:crypto";
import pg from "pg";
import { buildApp, type BuildOpts } from "./app.js";
import { MemoryIndexService } from "./index-service.js";
import { PostgresIndexService } from "./postgres-index-service.js";
import type { IndexService } from "./index-service.js";
import { PostgresBlobStore, type BlobStore } from "./blob-store.js";
import { S3BlobStore, s3ConfigFromEnv } from "./s3-blob-store.js";
import { witnessSecretFromEnv } from "./witness-token.js";
import { turnConfigFromEnv } from "./turn-config.js";

/**
 * Dev/prod entrypoint. Uses Postgres when DATABASE_URL is set (docker-compose),
 * otherwise an in-memory index — both behind the same IndexService interface.
 */
const k = Number(process.env.LAZARUS_K) || 3;
const port = Number(process.env.PORT) || 8787;
// Bind to loopback by default; expose publicly only behind auth + rate limiting.
const host = process.env.HOST || "127.0.0.1";

/**
 * Privacy-safe analytics sink. Wires PostHog only when POSTHOG_API_KEY is set;
 * otherwise a no-op. The app layer guarantees only counts/sizes are passed —
 * never urls, cids, titles, text, or witness ids. Backend events use a fixed
 * server distinctId (these are ops events, not user identities).
 */
async function makeAnalytics(): Promise<{
  capture: (event: string, props?: Record<string, unknown>) => void;
  shutdown: () => Promise<void>;
}> {
  const key = process.env.POSTHOG_API_KEY;
  if (!key) return { capture: () => {}, shutdown: async () => {} };
  const { PostHog } = await import("posthog-node");
  const client = new PostHog(key, { host: process.env.POSTHOG_HOST });
  console.log("[lazarus] PostHog analytics enabled");
  return {
    capture: (event, properties) =>
      client.capture({ distinctId: "lazarus-backend", event, properties }),
    shutdown: () => client.shutdown(),
  };
}

function resolveWitnessSecret(): string {
  const fromEnv = witnessSecretFromEnv();
  if (fromEnv) return fromEnv;
  console.warn(
    "[lazarus] LAZARUS_WITNESS_SECRET unset — using an ephemeral per-process secret " +
      "(witness tokens won't survive restarts). Set it in production.",
  );
  return crypto.randomBytes(32).toString("hex");
}

async function makeService(): Promise<IndexService> {
  if (process.env.DATABASE_URL) {
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
    const s3 = s3ConfigFromEnv();
    // Blobs go to S3-compatible object storage when configured (keeps bytes out
    // of metered Postgres), else fall back to storing them in Postgres.
    const blobStore: BlobStore = s3
      ? new S3BlobStore(s3)
      : new PostgresBlobStore(pool);
    const service = new PostgresIndexService(pool, { k, blobStore });
    await service.migrate();
    console.log(
      `[lazarus] using Postgres index (blobs: ${s3 ? "S3" : "Postgres"})`,
    );
    return service;
  }
  console.log("[lazarus] using in-memory index");
  return new MemoryIndexService({ k });
}

const analytics = await makeAnalytics();
const turnConfig = turnConfigFromEnv();
if (turnConfig) console.log("[lazarus] TURN relay configured");

const opts: BuildOpts = {
  witnessSecret: resolveWitnessSecret(),
  ...(process.env.LAZARUS_WITNESS_TTL_MS && {
    witnessTtlMs: Number(process.env.LAZARUS_WITNESS_TTL_MS),
  }),
  turnConfig,
  analytics: analytics.capture,
  logger: { level: process.env.LOG_LEVEL || "info" },
};

const app = buildApp(await makeService(), opts);

app
  .listen({ port, host })
  .then((addr) => console.log(`[lazarus] index API + signaling on ${addr} (k=${k})`))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });

// Flush analytics on shutdown so events aren't lost.
for (const sig of ["SIGTERM", "SIGINT"] as const) {
  process.on(sig, () => {
    void analytics.shutdown().finally(() => process.exit(0));
  });
}
