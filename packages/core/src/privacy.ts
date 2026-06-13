/**
 * Capture eligibility — the privacy gate.
 *
 * Lazarus only ever captures PUBLIC pages. This is the first line of the privacy
 * model (the k-anonymity promotion gate is the second): a page that fails this
 * check is never snapshotted, fingerprinted, or shared. We err heavily toward
 * NOT capturing — a missed public page costs little; capturing a private one is
 * unacceptable.
 */

/** Host label prefixes that signal an auth/account/webmail surface. */
const SENSITIVE_PREFIXES = [
  "mail",
  "webmail",
  "accounts",
  "account",
  "login",
  "signin",
  "auth",
  "secure",
];

/** Domains we never capture regardless of path (extend over time). */
const SENSITIVE_DOMAINS = new Set([
  "chase.com",
  "bankofamerica.com",
  "wellsfargo.com",
  "paypal.com",
]);

function stripBrackets(host: string): string {
  return host.startsWith("[") && host.endsWith("]") ? host.slice(1, -1) : host;
}

function isLoopbackOrPrivate(host: string): boolean {
  const h = stripBrackets(host).toLowerCase();
  if (h === "localhost" || h.endsWith(".localhost")) return true;
  if (h === "::1") return true;
  if (h.endsWith(".local")) return true;
  // IPv4 loopback + RFC1918 private ranges.
  if (/^127\./.test(h)) return true;
  if (/^10\./.test(h)) return true;
  if (/^192\.168\./.test(h)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true;
  return false;
}

function isSensitiveHost(host: string): boolean {
  const h = host.toLowerCase();
  const firstLabel = h.split(".")[0] ?? "";
  if (SENSITIVE_PREFIXES.includes(firstLabel)) return true;
  for (const d of SENSITIVE_DOMAINS) {
    if (h === d || h.endsWith("." + d)) return true;
  }
  return false;
}

/** Whether a URL is eligible for public capture. */
export function shouldCapture(rawUrl: string): boolean {
  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    return false;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return false;
  if (isLoopbackOrPrivate(u.hostname)) return false;
  if (isSensitiveHost(u.hostname)) return false;
  return true;
}
