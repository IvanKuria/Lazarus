import { describe, it, expect } from "vitest";
import { newDb } from "pg-mem";
import { PostgresIndexService } from "../src/postgres-index-service.js";
import type { BlobStore } from "../src/blob-store.js";
import { buildObservation } from "@lazarus/core";

async function makeService(opts: { k?: number; storeBlobs?: boolean } = {}) {
  const db = newDb();
  const { Pool } = db.adapters.createPg();
  const svc = new PostgresIndexService(new Pool(), opts);
  await svc.migrate();
  return svc;
}

async function sub(
  url: string,
  body: string,
  text: string,
  capturedAt: number,
  title?: string,
) {
  const snapshotBytes = new TextEncoder().encode(body);
  const observation = await buildObservation({
    url,
    snapshotBytes,
    text,
    capturedAt,
    ...(title !== undefined && { title }),
  });
  return { observation, snapshotBytes };
}

const TEXT = "hello content that is long enough to fingerprint meaningfully here";

describe("PostgresIndexService (pg-mem)", () => {
  it("enforces k-anonymity before serving a snapshot", async () => {
    const svc = await makeService({ k: 2 });
    const s = await sub("https://x.com/a", "<h1>hi</h1>", TEXT, 1);

    await svc.submit({ ...s, witnessId: "w1" });
    expect(await svc.resurrectLatest("https://x.com/a")).toBeNull();

    await svc.submit({ ...s, witnessId: "w2" });
    const r = await svc.resurrectLatest("https://x.com/a");
    expect(r).not.toBeNull();
    expect(new TextDecoder().decode(r!.snapshot)).toBe("<h1>hi</h1>");
  });

  it("counts distinct witnesses only", async () => {
    const svc = await makeService({ k: 2 });
    const s = await sub("https://x.com/a", "<h1>hi</h1>", TEXT, 1);
    await svc.submit({ ...s, witnessId: "w1" });
    await svc.submit({ ...s, witnessId: "w1" });
    expect(await svc.resurrectLatest("https://x.com/a")).toBeNull();
  });

  it("locates metadata without a blob (storeBlobs: false)", async () => {
    const svc = await makeService({ k: 1, storeBlobs: false });
    const s = await sub("https://x.com/p", "<p>x</p>", TEXT, 7);
    await svc.submit({ ...s, witnessId: "w1" });

    expect(await svc.resurrectLatest("https://x.com/p")).toBeNull(); // no blob
    const located = await svc.locateLatest("https://x.com/p");
    expect(located?.cid).toBe(s.observation.cid);
  });

  it("delegates blob storage to an injected BlobStore", async () => {
    const blobs = new Map<string, Uint8Array>();
    const spy: BlobStore = {
      async migrate() {},
      async put(cid, bytes) {
        blobs.set(cid, bytes);
      },
      async get(cid) {
        return blobs.get(cid) ?? null;
      },
    };
    const db = newDb();
    const { Pool } = db.adapters.createPg();
    const svc = new PostgresIndexService(new Pool(), { k: 1, blobStore: spy });
    await svc.migrate();

    const s = await sub("https://x.com/a", "<h1>hi</h1>", TEXT, 1);
    await svc.submit({ ...s, witnessId: "w1" });

    // The blob went through the injected store, not an inlined snapshots INSERT.
    expect(blobs.has(s.observation.cid)).toBe(true);
    const r = await svc.resurrectLatest("https://x.com/a");
    expect(new TextDecoder().decode(r!.snapshot)).toBe("<h1>hi</h1>");
  });

  it("lists promoted versions and emits an edit on change", async () => {
    const svc = await makeService({ k: 1 });
    const v1 = await sub("https://x.com/p", "<p>one</p>", TEXT, 1, "Post");
    const v2 = await sub(
      "https://x.com/p",
      "<p>two</p>",
      "a completely different replacement recipe for chocolate cake batter yum",
      2,
      "Post",
    );
    await svc.submit({ ...v1, witnessId: "w1" });
    await svc.submit({ ...v2, witnessId: "w1" });

    const versions = await svc.listVersions("https://x.com/p");
    expect(versions.map((o) => o.capturedAt)).toEqual([1, 2]);

    const feed = await svc.feed();
    expect(feed).toHaveLength(1);
    expect(feed[0]!.prevCid).toBe(v1.observation.cid);
    expect(feed[0]!.nextCid).toBe(v2.observation.cid);
  });
});
