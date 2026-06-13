/**
 * SimHash content fingerprinting.
 *
 * A SimHash maps text to a 64-bit fingerprint where *similar* text yields
 * *similar* fingerprints (small Hamming distance). Lazarus uses it twice:
 *   - dedup: is a new snapshot meaningfully different from the last version?
 *   - Stealth-Edit Feed: how far did a page's content move between versions?
 */

const MASK64 = (1n << 64n) - 1n;
const FNV_OFFSET = 0xcbf29ce484222325n;
const FNV_PRIME = 0x100000001b3n;

/** Deterministic 64-bit FNV-1a hash of a token. */
function hashToken(token: string): bigint {
  let h = FNV_OFFSET;
  for (let i = 0; i < token.length; i++) {
    h ^= BigInt(token.charCodeAt(i) & 0xff);
    h = (h * FNV_PRIME) & MASK64;
  }
  return h;
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 0);
}

/** Compute a 64-bit SimHash of text, returned as a 16-char hex string. */
export function simhash(text: string): string {
  const v = new Array<number>(64).fill(0);
  for (const token of tokenize(text)) {
    const h = hashToken(token);
    for (let i = 0; i < 64; i++) {
      const bit = (h >> BigInt(i)) & 1n;
      v[i]! += bit === 1n ? 1 : -1;
    }
  }
  let fingerprint = 0n;
  for (let i = 0; i < 64; i++) {
    if (v[i]! > 0) fingerprint |= 1n << BigInt(i);
  }
  return fingerprint.toString(16).padStart(16, "0");
}

/** Number of differing bits between two hex fingerprints. */
export function hammingDistance(a: string, b: string): number {
  let x = BigInt("0x" + a) ^ BigInt("0x" + b);
  let count = 0;
  while (x > 0n) {
    count += Number(x & 1n);
    x >>= 1n;
  }
  return count;
}
