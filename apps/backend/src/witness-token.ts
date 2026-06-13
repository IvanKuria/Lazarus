import { randomBytes, createHmac, timingSafeEqual } from "node:crypto";

/**
 * Server-issued, short-lived, HMAC-signed witness tokens for Sybil-resistant
 * k-anonymity. The witness identity (`wid`) counted by the index is generated
 * server-side here — never chosen by the client — so a single client cannot
 * inflate the witness count by minting its own identities.
 *
 * Token wire format:  base64url(payload JSON) "." base64url(HMAC-SHA256)
 * where the HMAC is computed over the base64url payload segment string.
 */

interface TokenPayload {
  /** Server-generated random 128-bit identity, hex-encoded. */
  wid: string;
  /** Issued-at (ms epoch). */
  iat: number;
  /** Expiry (ms epoch). */
  exp: number;
}

function b64url(buf: Buffer): string {
  return buf.toString("base64url");
}

function sign(secret: string, payloadSegment: string): string {
  return b64url(createHmac("sha256", secret).update(payloadSegment).digest());
}

/** Mint a fresh witness token valid for `ttlMs` from `now`. */
export function mintToken(
  secret: string,
  ttlMs: number,
  now: number = Date.now(),
): string {
  const payload: TokenPayload = {
    wid: randomBytes(16).toString("hex"),
    iat: now,
    exp: now + ttlMs,
  };
  const payloadSegment = b64url(Buffer.from(JSON.stringify(payload), "utf8"));
  return `${payloadSegment}.${sign(secret, payloadSegment)}`;
}

/**
 * Verify a witness token. Returns `{ wid }` on success, or `null` on any
 * failure (malformed, bad signature, expired). Never throws.
 */
export function verifyToken(
  token: string,
  secret: string,
  now: number = Date.now(),
): { wid: string } | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 2) return null;
    const payloadSegment = parts[0]!;
    const sigSegment = parts[1]!;

    const expected = Buffer.from(sign(secret, payloadSegment), "utf8");
    const provided = Buffer.from(sigSegment, "utf8");
    // timingSafeEqual throws on length mismatch — guard it explicitly.
    if (expected.length !== provided.length) return null;
    if (!timingSafeEqual(expected, provided)) return null;

    const payload = JSON.parse(
      Buffer.from(payloadSegment, "base64url").toString("utf8"),
    ) as TokenPayload;

    if (typeof payload.exp !== "number" || typeof payload.wid !== "string") {
      return null;
    }
    if (!(payload.exp > now)) return null;

    return { wid: payload.wid };
  } catch {
    return null;
  }
}

/** Reads the witness secret from env; returns null when unset/empty (caller decides dev behavior). */
export function witnessSecretFromEnv(): string | null {
  const secret = process.env.LAZARUS_WITNESS_SECRET;
  if (!secret) return null;
  return secret;
}
