import crypto from "node:crypto";
import Fastify, { type FastifyInstance } from "fastify";
import { buildObservation } from "@lazarus/core";
import type { IndexService } from "./index-service.js";
import { attachSignaling } from "./signaling-ws.js";
import { mintToken, verifyToken } from "./witness-token.js";
import { createRateLimiter } from "./rate-limit.js";
import { buildIceServers, type TurnConfig } from "./turn-config.js";

/**
 * The client submits only RAW fields. The server derives the observation
 * (cid, urlKey, fingerprint) from the bytes itself — it never trusts a
 * client-claimed content address, so a forged CID is impossible by construction.
 *
 * The witness identity is taken from a server-issued `witnessToken` (the `wid`
 * inside it), NOT a client-chosen string — that's what makes k-anonymity
 * Sybil-resistant. A legacy client-chosen `witnessId` is still accepted during
 * migration (dual-accept) so older builds keep working.
 */
interface SubmitBody {
  url: string;
  snapshotBase64: string;
  text: string;
  capturedAt: number;
  title?: string;
  witnessToken?: string;
  witnessId?: string;
}

function isValidSubmit(b: unknown): b is SubmitBody {
  const x = b as Partial<SubmitBody>;
  const base =
    typeof x?.url === "string" &&
    typeof x?.snapshotBase64 === "string" &&
    typeof x?.text === "string" &&
    typeof x?.capturedAt === "number" &&
    (x.title === undefined || typeof x.title === "string");
  const hasWitness =
    typeof x?.witnessToken === "string" || typeof x?.witnessId === "string";
  return base && hasWitness;
}

export interface BuildOpts {
  /** HMAC secret for witness tokens. Defaults to a random per-process secret
   *  (fine for dev/tests; production must set a stable secret via env). */
  witnessSecret?: string;
  witnessTtlMs?: number;
  /** Max witness-token mints per IP per window (generous; protects against
   *  cheap Sybil minting without blocking shared NATs). */
  mintLimitPerWindow?: number;
  mintWindowMs?: number;
  /** TURN config; null → STUN-only ICE servers. */
  turnConfig?: TurnConfig | null;
  /** Privacy-safe analytics sink. MUST only ever receive counts/kinds/sizes —
   *  never urls, cids, titles, text, or witness ids. Default: no-op. */
  analytics?: (event: string, props?: Record<string, unknown>) => void;
  logger?: boolean | object;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Build the index HTTP API over an IndexService (injectable for tests). */
export function buildApp(service: IndexService, opts: BuildOpts = {}): FastifyInstance {
  const witnessSecret = opts.witnessSecret ?? crypto.randomBytes(32).toString("hex");
  const witnessTtlMs = opts.witnessTtlMs ?? DAY_MS;
  const mintLimiter = createRateLimiter({
    limit: opts.mintLimitPerWindow ?? 100,
    windowMs: opts.mintWindowMs ?? DAY_MS,
  });
  const turnConfig: TurnConfig | null = opts.turnConfig ?? null;
  const analytics = opts.analytics ?? (() => {});

  const metrics = {
    observationsAccepted: 0,
    resurrectionsServed: 0,
    resurrectionsMissed: 0,
    witnessTokensMinted: 0,
    badTokens: 0,
  };

  // Snapshots can be large; allow generous bodies.
  const app = Fastify({
    bodyLimit: 25 * 1024 * 1024,
    ...(opts.logger !== undefined ? { logger: opts.logger } : {}),
  });

  // Mint a short-lived, server-signed witness token. Rate-limited per IP so an
  // attacker can't cheaply mint k distinct identities to defeat k-anonymity.
  app.post("/v1/witness", async (req, reply) => {
    if (!mintLimiter.check(req.ip)) {
      return reply.code(429).send({ error: "rate limited" });
    }
    metrics.witnessTokensMinted++;
    return reply.send({ token: mintToken(witnessSecret, witnessTtlMs), expiresInMs: witnessTtlMs });
  });

  app.post("/v1/observations", async (req, reply) => {
    if (!isValidSubmit(req.body)) {
      return reply.code(400).send({ error: "invalid submission" });
    }
    const body = req.body;

    // Resolve the witness identity. Prefer the signed token (wid is server-issued
    // and unforgeable); fall back to a legacy client-chosen id during migration.
    let witnessId: string;
    if (typeof body.witnessToken === "string") {
      const verified = verifyToken(body.witnessToken, witnessSecret);
      if (!verified) {
        metrics.badTokens++;
        return reply.code(401).send({ error: "invalid witness token" });
      }
      witnessId = verified.wid;
    } else if (typeof body.witnessId === "string") {
      req.log?.warn?.("legacy witnessId submission (no token)");
      witnessId = body.witnessId;
    } else {
      return reply.code(400).send({ error: "invalid submission" });
    }

    const snapshotBytes = new Uint8Array(Buffer.from(body.snapshotBase64, "base64"));
    // Derive the observation server-side from the bytes — do not trust the client.
    const observation = await buildObservation({
      url: body.url,
      snapshotBytes,
      text: body.text,
      capturedAt: body.capturedAt,
      ...(body.title !== undefined && { title: body.title }),
    });
    await service.submit({ observation, snapshotBytes, witnessId });
    metrics.observationsAccepted++;
    // Privacy: counts/sizes only — never the url, cid, title, or witness id.
    analytics("observation_submitted", { sizeBytes: snapshotBytes.length });
    return reply.code(202).send({ ok: true });
  });

  app.get("/v1/resurrect", async (req, reply) => {
    const url = (req.query as { url?: string }).url;
    if (!url) return reply.code(400).send({ error: "url required" });
    const hit = await service.resurrectLatest(url);
    if (!hit) {
      metrics.resurrectionsMissed++;
      analytics("resurrection_missed");
      return reply.code(404).send({ found: false });
    }
    metrics.resurrectionsServed++;
    analytics("resurrection_served", { sizeBytes: hit.snapshot.length });
    return reply.send({
      observation: hit.observation,
      snapshotBase64: Buffer.from(hit.snapshot).toString("base64"),
    });
  });

  app.get("/v1/locate", async (req, reply) => {
    const url = (req.query as { url?: string }).url;
    if (!url) return reply.code(400).send({ error: "url required" });
    const observation = await service.locateLatest(url);
    if (!observation) return reply.code(404).send({ found: false });
    return reply.send({ observation });
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

  // ICE servers for the P2P data plane: public STUN always, ephemeral TURN creds
  // when configured. The TURN shared secret stays server-side and is never sent.
  app.get("/v1/turn-credentials", async (_req, reply) => {
    return reply.send({ iceServers: buildIceServers(turnConfig) });
  });

  app.get("/health", async (_req, reply) => {
    const db = await service.ping();
    return reply
      .code(db ? 200 : 503)
      .send({ status: db ? "ok" : "degraded", db: db ? "ok" : "down", uptime: process.uptime() });
  });

  app.get("/metrics", async (_req, reply) => {
    return reply.send({ ...metrics });
  });

  // P2P signaling lives on the same server, at /signal.
  attachSignaling(app.server);

  return app;
}
