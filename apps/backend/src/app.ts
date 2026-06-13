import Fastify, { type FastifyInstance } from "fastify";
import { buildObservation } from "@lazarus/core";
import type { IndexService } from "./index-service.js";

/**
 * The client submits only RAW fields. The server derives the observation
 * (cid, urlKey, fingerprint) from the bytes itself — it never trusts a
 * client-claimed content address, so a forged CID is impossible by construction
 * and submit/lookup keys can't desync.
 */
interface SubmitBody {
  url: string;
  snapshotBase64: string;
  text: string;
  capturedAt: number;
  title?: string;
  witnessId: string;
}

function isValidSubmit(b: unknown): b is SubmitBody {
  const x = b as Partial<SubmitBody>;
  return (
    typeof x?.url === "string" &&
    typeof x?.snapshotBase64 === "string" &&
    typeof x?.text === "string" &&
    typeof x?.capturedAt === "number" &&
    typeof x?.witnessId === "string" &&
    (x.title === undefined || typeof x.title === "string")
  );
}

/** Build the index HTTP API over an IndexService (injectable for tests). */
export function buildApp(service: IndexService): FastifyInstance {
  // Snapshots can be large; allow generous bodies.
  const app = Fastify({ bodyLimit: 25 * 1024 * 1024 });

  app.post("/v1/observations", async (req, reply) => {
    if (!isValidSubmit(req.body)) {
      return reply.code(400).send({ error: "invalid submission" });
    }
    const body = req.body;
    const snapshotBytes = new Uint8Array(Buffer.from(body.snapshotBase64, "base64"));
    // Derive the observation server-side from the bytes — do not trust the client.
    const observation = await buildObservation({
      url: body.url,
      snapshotBytes,
      text: body.text,
      capturedAt: body.capturedAt,
      ...(body.title !== undefined && { title: body.title }),
    });
    await service.submit({ observation, snapshotBytes, witnessId: body.witnessId });
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
