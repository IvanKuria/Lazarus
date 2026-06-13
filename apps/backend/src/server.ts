import { buildApp } from "./app.js";
import { MemoryIndexService } from "./index-service.js";

/**
 * Dev entrypoint. Uses the in-memory index for now; a Postgres/Redis-backed
 * IndexService will slot in here behind the same interface.
 */
const k = Number(process.env.LAZARUS_K) || 3;
const port = Number(process.env.PORT) || 8787;

const app = buildApp(new MemoryIndexService({ k }));

app
  .listen({ port, host: "0.0.0.0" })
  .then((addr) => console.log(`[lazarus] index API listening on ${addr} (k=${k})`))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
