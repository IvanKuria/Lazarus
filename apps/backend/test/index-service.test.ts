import { describe, it, expect } from "vitest";
import { MemoryIndexService } from "../src/index-service.js";
import { buildObservation } from "@lazarus/core";

const bytes = (s: string) => new TextEncoder().encode(s);

async function submission(
  url: string,
  body: string,
  text: string,
  capturedAt: number,
  title?: string,
) {
  const snapshotBytes = bytes(body);
  const observation = await buildObservation({
    url,
    snapshotBytes,
    text,
    capturedAt,
    ...(title !== undefined && { title }),
  });
  return { observation, snapshotBytes };
}

const PAGE = ["https://x.com/a", "<h1>hello</h1>", "hello world content long enough to fingerprint here", 1] as const;

describe("MemoryIndexService — k-anonymity promotion", () => {
  it("does not serve content until k distinct witnesses submit it", async () => {
    const svc = new MemoryIndexService({ k: 2 });
    const s = await submission(...PAGE);

    await svc.submit({ ...s, witnessId: "w1" });
    expect(await svc.resurrectLatest("https://x.com/a")).toBeNull();

    await svc.submit({ ...s, witnessId: "w2" });
    const r = await svc.resurrectLatest("https://x.com/a");
    expect(r).not.toBeNull();
    expect(r!.snapshot).toEqual(s.snapshotBytes);
  });

  it("counts distinct witnesses only — the same witness twice doesn't promote", async () => {
    const svc = new MemoryIndexService({ k: 2 });
    const s = await submission(...PAGE);
    await svc.submit({ ...s, witnessId: "w1" });
    await svc.submit({ ...s, witnessId: "w1" });
    expect(await svc.resurrectLatest("https://x.com/a")).toBeNull();
  });

  it("normalizes the lookup URL", async () => {
    const svc = new MemoryIndexService({ k: 1 });
    const s = await submission(...PAGE);
    await svc.submit({ ...s, witnessId: "w1" });
    expect(
      await svc.resurrectLatest("https://x.com/a?utm_source=x#frag"),
    ).not.toBeNull();
  });
});

describe("MemoryIndexService — versions + feed", () => {
  it("lists only promoted versions, oldest → newest", async () => {
    const svc = new MemoryIndexService({ k: 2 });
    const v1 = await submission("https://x.com/p", "<p>one</p>", "version one content long enough to fingerprint", 1);
    const v2 = await submission("https://x.com/p", "<p>two replaced</p>", "completely different replaced content recipe cake", 2);

    await svc.submit({ ...v1, witnessId: "w1" });
    await svc.submit({ ...v2, witnessId: "w1" }); // only 1 witness → not promoted
    expect((await svc.listVersions("https://x.com/p")).length).toBe(0);

    await svc.submit({ ...v1, witnessId: "w2" }); // v1 now has 2 → promoted
    expect((await svc.listVersions("https://x.com/p")).map((o) => o.capturedAt)).toEqual([1]);
  });

  it("emits an edit when a second version gets promoted for a page", async () => {
    const svc = new MemoryIndexService({ k: 1 });
    const v1 = await submission("https://x.com/p", "<p>one</p>", "version one content long enough to fingerprint", 1);
    const v2 = await submission("https://x.com/p", "<p>two</p>", "completely different replaced content recipe cake batter", 2);
    await svc.submit({ ...v1, witnessId: "w1" });
    await svc.submit({ ...v2, witnessId: "w1" });

    const feed = await svc.feed();
    expect(feed).toHaveLength(1);
    expect(feed[0]!.prevCid).toBe(v1.observation.cid);
    expect(feed[0]!.nextCid).toBe(v2.observation.cid);
  });
});
