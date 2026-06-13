import { buildApp } from "./app.js";
import { MemoryIndexService } from "./index-service.js";

/**
 * Dev entrypoint. Uses the in-memory index for now; a Postgres/Redis-backed
 * IndexService will slot in here behind the same interface.
 */
const k = Number(process.env.LAZARUS_K) || 3;
const port = Number(process.env.PORT) || 8787;
// Bind to loopback by default; only expose on a public interface explicitly.
// Before any public deploy this needs: auth on POST /v1/observations
// (attestation / signed install token), @fastify/rate-limit, @fastify/cors,
// and a bounded/persistent store. Tracked as the Sybil-resistance + hardening axis.
const host = process.env.HOST || "127.0.0.1";

const app = buildApp(new MemoryIndexService({ k }));

app
  .listen({ port, host })
  .then((addr) => console.log(`[lazarus] index API listening on ${addr} (k=${k})`))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
