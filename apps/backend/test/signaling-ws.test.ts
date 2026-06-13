import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { buildApp } from "../src/app.js";
import { MemoryIndexService } from "../src/index-service.js";
import WebSocket, { type RawData } from "ws";
import type { FastifyInstance } from "fastify";

let app: FastifyInstance;
let port = 0;

beforeAll(async () => {
  app = buildApp(new MemoryIndexService());
  await app.listen({ port: 0, host: "127.0.0.1" });
  port = (app.server.address() as { port: number }).port;
});

afterAll(async () => {
  await app.close();
});

function connect(): WebSocket {
  return new WebSocket(`ws://127.0.0.1:${port}/signal`);
}
const open = (ws: WebSocket) => new Promise((r) => ws.once("open", r));
const nextMessage = (ws: WebSocket) =>
  new Promise<Record<string, unknown>>((r) =>
    ws.once("message", (d: RawData) => r(JSON.parse(d.toString()))),
  );

describe("signaling over WebSocket", () => {
  it("resolves providers and relays a signal between peers", async () => {
    const a = connect();
    const b = connect();
    await Promise.all([open(a), open(b)]);

    a.send(JSON.stringify({ type: "register", peerId: "A" }));
    b.send(JSON.stringify({ type: "register", peerId: "B" }));
    a.send(JSON.stringify({ type: "announce", cid: "cid1" }));
    await new Promise((r) => setTimeout(r, 50));

    // B looks up who holds cid1 → A.
    b.send(JSON.stringify({ type: "providers", cid: "cid1", reqId: "r1" }));
    expect(await nextMessage(b)).toMatchObject({
      type: "providers",
      reqId: "r1",
      peers: ["A"],
    });

    // B relays an offer to A.
    const aGot = nextMessage(a);
    b.send(JSON.stringify({ type: "signal", to: "A", signal: { kind: "offer" } }));
    expect(await aGot).toMatchObject({
      type: "signal",
      from: "B",
      signal: { kind: "offer" },
    });

    a.close();
    b.close();
  });
});
