import { normalizeUrl } from "./url.js";
import { shouldCapture } from "./privacy.js";

/**
 * "Digital Mortality" — how much of the user's own browsing past is already dead.
 *
 * Pure helpers: pick which history links are worth checking (public, deduped),
 * and turn liveness results into the shareable stat. The actual liveness probing
 * (history API + fetch) lives in the extension background.
 */

/** Normalize, keep only capturable public links, dedupe, and cap the sample. */
export function sampleLinks(urls: string[], limit = 100): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of urls) {
    if (!shouldCapture(raw)) continue;
    const key = normalizeUrl(raw);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(key);
    if (out.length >= limit) break;
  }
  return out;
}

export interface MortalitySummary {
  checked: number;
  dead: number;
  deadPercent: number;
}

/** Summarize liveness checks into the dead-percentage stat. */
export function summarizeMortality(checks: { alive: boolean }[]): MortalitySummary {
  const checked = checks.length;
  const dead = checks.filter((c) => !c.alive).length;
  const deadPercent = checked === 0 ? 0 : Math.round((dead / checked) * 100);
  return { checked, dead, deadPercent };
}
