import { describe, it, expect } from "vitest";
import { mergeVersions, mergeEdits } from "../src/merge.js";
import type { Observation, EditEvent } from "../src/types.js";

const obs = (cid: string, capturedAt: number): Observation => ({
  urlKey: "https://x.com/a",
  cid,
  fingerprint: "f",
  capturedAt,
  sizeBytes: 1,
});

const edit = (prevCid: string, nextCid: string, nextCapturedAt: number): EditEvent => ({
  urlKey: "https://x.com/a",
  kind: "edited",
  prevCid,
  nextCid,
  distance: 1,
  prevCapturedAt: nextCapturedAt - 1,
  nextCapturedAt,
});

describe("mergeVersions", () => {
  it("unions local + remote, dedupes by cid, sorts oldest→newest", () => {
    const local = [obs("c2", 2), obs("c1", 1)];
    const remote = [obs("c3", 3), obs("c2", 2)]; // c2 overlaps
    const merged = mergeVersions(local, remote);
    expect(merged.map((o) => o.cid)).toEqual(["c1", "c2", "c3"]);
  });

  it("returns local-only when remote is empty", () => {
    expect(mergeVersions([obs("c1", 1)], []).map((o) => o.cid)).toEqual(["c1"]);
  });
});

describe("mergeEdits", () => {
  it("unions, dedupes by (urlKey,prevCid,nextCid), sorts newest first", () => {
    const local = [edit("a", "b", 10)];
    const remote = [edit("a", "b", 10), edit("b", "c", 20)]; // first overlaps
    const merged = mergeEdits(local, remote);
    expect(merged.map((e) => e.nextCid)).toEqual(["c", "b"]);
  });

  it("applies a limit after merge+sort", () => {
    const merged = mergeEdits([edit("a", "b", 10)], [edit("b", "c", 20), edit("c", "d", 30)], 2);
    expect(merged.map((e) => e.nextCid)).toEqual(["d", "c"]);
  });
});
