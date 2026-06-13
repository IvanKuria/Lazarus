import "fake-indexeddb/auto";
import { describe, it, expect } from "vitest";
import { MemoryObservationStore } from "../src/store.js";
import { IdbObservationStore } from "../src/idb-store.js";

const bytes = (s: string) => new TextEncoder().encode(s);

describe("listSnapshotCids", () => {
  it("returns held cids from the memory store", async () => {
    const store = new MemoryObservationStore();
    await store.putSnapshot("a", bytes("x"));
    await store.putSnapshot("b", bytes("y"));
    expect((await store.listSnapshotCids()).sort()).toEqual(["a", "b"]);
  });

  it("returns held cids from the IndexedDB store", async () => {
    const store = new IdbObservationStore("cids-test");
    await store.putSnapshot("c", bytes("z"));
    expect(await store.listSnapshotCids()).toEqual(["c"]);
  });
});
