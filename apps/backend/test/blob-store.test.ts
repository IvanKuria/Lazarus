import { describe, it, expect } from "vitest";
import { newDb } from "pg-mem";
import { PostgresBlobStore } from "../src/blob-store.js";

function makeStore() {
  const db = newDb();
  const { Pool } = db.adapters.createPg();
  return new PostgresBlobStore(new Pool());
}

describe("PostgresBlobStore (pg-mem)", () => {
  it("round-trips bytes by cid", async () => {
    const store = makeStore();
    await store.migrate();
    await store.put("cid1", new TextEncoder().encode("<h1>hi</h1>"));
    const got = await store.get("cid1");
    expect(got).not.toBeNull();
    expect(new TextDecoder().decode(got!)).toBe("<h1>hi</h1>");
  });

  it("returns null for an unknown cid", async () => {
    const store = makeStore();
    await store.migrate();
    expect(await store.get("missing")).toBeNull();
  });

  it("is idempotent on repeated put of the same cid", async () => {
    const store = makeStore();
    await store.migrate();
    const bytes = new TextEncoder().encode("x");
    await store.put("c", bytes);
    await store.put("c", bytes); // must not throw on PK conflict
    expect(new TextDecoder().decode((await store.get("c"))!)).toBe("x");
  });
});
