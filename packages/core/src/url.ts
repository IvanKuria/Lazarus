/**
 * URL normalization for Lazarus.
 *
 * Every version of "the same page" must normalize to an identical string so the
 * index can group observations into one timeline. Different users arriving via
 * different tracking links, fragments, or query orderings must collapse to one key.
 */

/** Query params that carry no page identity — pure tracking/attribution noise. */
const TRACKING_PARAMS = new Set([
  "fbclid",
  "gclid",
  "dclid",
  "gbraid",
  "wbraid",
  "msclkid",
  "mc_eid",
  "mc_cid",
  "igshid",
  "ref",
  "ref_src",
  "ref_url",
  "_ga",
]);

function isTrackingParam(key: string): boolean {
  return key.startsWith("utm_") || TRACKING_PARAMS.has(key);
}

/** Normalize a URL into a stable canonical form for grouping observations. */
export function normalizeUrl(raw: string): string {
  const u = new URL(raw);

  // The URL API already lowercases scheme + host and drops default ports.
  u.hash = "";

  // Drop tracking params, then sort the rest for order-independence.
  for (const key of [...u.searchParams.keys()]) {
    if (isTrackingParam(key)) u.searchParams.delete(key);
  }
  u.searchParams.sort();

  // Collapse a single trailing slash, except for the root path.
  if (u.pathname !== "/" && u.pathname.endsWith("/")) {
    u.pathname = u.pathname.replace(/\/+$/, "");
  }

  return u.toString();
}
