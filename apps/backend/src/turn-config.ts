import { createHmac } from "node:crypto";

/**
 * TURN server config. The shared secret is a long-term credential that stays
 * server-side and is NEVER shipped to clients — instead the server mints a
 * short-lived (ttlSeconds) username/credential pair per client request, the
 * standard coturn REST/ephemeral scheme.
 */
export interface TurnConfig {
  urls: string[];
  secret: string;
  ttlSeconds: number;
}

/** Public Google STUN. Free, stateless, no credentials — always safe to ship. */
export const PUBLIC_STUN: string[] = [
  "stun:stun.l.google.com:19302",
  "stun:stun1.l.google.com:19302",
];

/**
 * Reads TURN config from env; returns null when TURN_URLS or TURN_SHARED_SECRET
 * is missing/empty (→ caller falls back to STUN-only).
 */
export function turnConfigFromEnv(): TurnConfig | null {
  const rawUrls = process.env.TURN_URLS;
  const secret = process.env.TURN_SHARED_SECRET;
  if (!rawUrls || !secret) return null;

  const urls = rawUrls
    .split(",")
    .map((u) => u.trim())
    .filter((u) => u.length > 0);
  if (urls.length === 0) return null;

  const ttlSeconds = Number(process.env.TURN_TTL_SECONDS) || 600;
  return { urls, secret, ttlSeconds };
}

/** One ICE server entry as consumed by RTCPeerConnection's iceServers. */
export interface IceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}

/**
 * Builds the ICE server list for the extension. Always includes public STUN;
 * appends an ephemeral TURN entry only when configured. The TURN credential is
 * time-bound (expires after ttlSeconds), so leaking it to a client is low-risk
 * compared to the long-term shared secret, which never leaves the server.
 */
export function buildIceServers(
  config: TurnConfig | null,
  now: number = Date.now(),
): IceServer[] {
  const servers: IceServer[] = [{ urls: PUBLIC_STUN }];
  if (!config) return servers;

  const expiry = Math.floor(now / 1000) + config.ttlSeconds;
  const username = `${expiry}:lazarus`;
  const credential = createHmac("sha1", config.secret)
    .update(username)
    .digest("base64");

  servers.push({ urls: config.urls, username, credential });
  return servers;
}
