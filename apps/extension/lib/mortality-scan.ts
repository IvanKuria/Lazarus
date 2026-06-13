import { browser } from "wxt/browser";
import { sampleLinks, summarizeMortality } from "@lazarus/core";
import type { MortalityResponse } from "./protocol.js";

/**
 * "Digital Mortality" scan — measures how much of the user's browsing past is
 * already dead. Runs entirely in the background: read history, sample public
 * links, probe each for liveness. Nothing leaves the device.
 *
 * Liveness uses the background's host permissions to fetch cross-origin without
 * CORS, so we read real status codes. A bot-blocked 403 can read as "dead" — the
 * stat is intentionally a rough, shareable signal, not an audit.
 */
const PROBE_TIMEOUT_MS = 8000;
const CONCURRENCY = 10;

async function isAlive(url: string): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const res = await fetch(url, { redirect: "follow", signal: controller.signal });
    return res.status < 400;
  } catch {
    return false; // network error, DNS failure, connection refused → dead
  } finally {
    clearTimeout(timer);
  }
}

export async function scanMortality(sample: number): Promise<MortalityResponse> {
  const items = await browser.history.search({
    text: "",
    startTime: 0,
    maxResults: Math.max(sample * 5, 500),
  });
  const urls = sampleLinks(
    items.map((i) => i.url ?? "").filter(Boolean),
    sample,
  );

  const checks: { url: string; alive: boolean }[] = [];
  for (let i = 0; i < urls.length; i += CONCURRENCY) {
    const batch = urls.slice(i, i + CONCURRENCY);
    checks.push(
      ...(await Promise.all(
        batch.map(async (url) => ({ url, alive: await isAlive(url) })),
      )),
    );
  }

  const summary = summarizeMortality(checks);
  const examples = checks
    .filter((c) => !c.alive)
    .slice(0, 5)
    .map((c) => c.url);
  return { ...summary, examples };
}
