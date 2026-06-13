# Lazarus

**The distributed memory & integrity network for the web.**

> The web has no memory, and no honesty. Lazarus gives it both.

Lazarus is a browser extension where every installed browser is a **node in a peer-to-peer
network** that passively preserves the public web a human actually sees, and aggregates
timestamped, fingerprinted observations into a shared index — turning the userbase into a
distributed version-control + memory layer for the internet.

## Why

The web is neither permanent nor honest. Pages die (the Internet Archive recovered only ~5% of
one 100M-video set), articles are stealth-edited after publishing, prices and Terms of Service
change in the dark. Centralized archives can only see the logged-out, crawlable web and must pay
to store all of it. Lazarus captures the **human-side** web — what people actually read — and
distributes the storage across the userbase's spare disk, so capacity grows with adoption.

## Hero features

- **Resurrection** — hit a dead link or deleted post and the crowd-preserved snapshot renders inline.
- **Time-Travel Scrubber** — a slider on any page; drag to watch it morph through every crowd-witnessed version (`git blame` for the internet).
- **Stealth-Edit Feed** — a live feed of secret edits across the web: rewritten headlines, quiet ToS changes, shifting prices.

## Architecture (one substrate, many lenses)

A crowd-witnessed index of `(url, time, content-hash, snapshot, fingerprints, witnesses)` — split
into a cheap central **index plane** (metadata, provider sets, witness counts) and a distributed
P2P **data plane** (the heavy snapshot blobs, with a pinned fallback only for the endangered tail).
Privacy is enforced by a **k-anonymity gate**: a snapshot is only ever shared once *k* independent
users have witnessed the identical page, so Lazarus never exposes anything only you saw.

See [`docs`](./docs) / the design spec for the full breakdown, including the MV3 feasibility
constraints that shaped the design (no streaming-video byte capture; policy-safe payload).

## Repo layout

```
packages/core        Pure, shared logic — content-addressing (CID), URL normalization,
                     SimHash fingerprints. Fully unit-tested, runs in browser + backend.
apps/extension       WXT (Vite) MV3 extension — content script, service worker,
                     offscreen P2P document, React popup + Memory view.
```

## Stack

TypeScript · WXT (MV3, cross-browser) · React · IndexedDB/OPFS · WebRTC · WASM perceptual hashing ·
Postgres · Redis · Kafka · coturn (STUN/TURN) · object-storage pinning · Docker/Kubernetes.

## Development

```bash
pnpm install
pnpm -r test            # run all unit tests
pnpm --filter @lazarus/extension dev   # launch the extension in a dev browser
```

---

Built by [Ivan Kuria](https://github.com/IvanKuria).
