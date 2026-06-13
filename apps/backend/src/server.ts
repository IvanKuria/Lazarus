import pg from "pg";
import { buildApp } from "./app.js";
import { MemoryIndexService } from "./index-service.js";
import { PostgresIndexService } from "./postgres-index-service.js";
import type { IndexService } from "./index-service.js";

/**
 * Dev/prod entrypoint. Uses Postgres when DATABASE_URL is set (docker-compose),
 * otherwise an in-memory index — both behind the same IndexService interface.
 */
const k = Number(process.env.LAZARUS_K) || 3;
const port = Number(process.env.PORT) || 8787;
// Bind to loopback by default; expose publicly only behind auth + rate limiting.
const host = process.env.HOST || "127.0.0.1";

async function makeService(): Promise<IndexService> {
  if (process.env.DATABASE_URL) {
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
    const service = new PostgresIndexService(pool, { k });
    await service.migrate();
    console.log("[lazarus] using Postgres index");
    return service;
  }
  console.log("[lazarus] using in-memory index");
  return new MemoryIndexService({ k });
}

const app = buildApp(await makeService());

app
  .listen({ port, host })
  .then((addr) => console.log(`[lazarus] index API + signaling on ${addr} (k=${k})`))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
