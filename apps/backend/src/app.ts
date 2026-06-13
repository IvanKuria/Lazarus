import Fastify, { type FastifyInstance } from "fastify";
import type { IndexService } from "./index-service.js";
import type { Observation } from "@lazarus/core";

interface SubmitBody {
  observation: Observation;
  snapshotBase64: string;
  witnessId: string;
}

/** Build the index HTTP API over an IndexService (injectable for tests). */
export function buildApp(service: IndexService): FastifyInstance {
  // Snapshots can be large; allow generous bodies.
  const app = Fastify({ bodyLimit: 25 * 1024 * 1024 });

  app.post("/v1/observations", async (req, reply) => {
    const { observation, snapshotBase64, witnessId } = req.body as SubmitBody;
    const snapshotBytes = new Uint8Array(Buffer.from(snapshotBase64, "base64"));
    await service.submit({ observation, snapshotBytes, witnessId });
    return reply.code(202).send({ ok: true });
  });

  app.get("/v1/resurrect", async (req, reply) => {
    const url = (req.query as { url?: string }).url;
    if (!url) return reply.code(400).send({ error: "url required" });
    const hit = await service.resurrectLatest(url);
    if (!hit) return reply.code(404).send({ found: false });
    return reply.send({
      observation: hit.observation,
      snapshotBase64: Buffer.from(hit.snapshot).toString("base64"),
    });
  });

  app.get("/v1/versions", async (req, reply) => {
    const url = (req.query as { url?: string }).url;
    if (!url) return reply.code(400).send({ error: "url required" });
    return reply.send({ versions: await service.listVersions(url) });
  });

  app.get("/v1/feed", async (req, reply) => {
    const limit = Number((req.query as { limit?: string }).limit) || undefined;
    return reply.send({ edits: await service.feed(limit) });
  });

  return app;
}
