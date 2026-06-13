import { browser } from "wxt/browser";
import type { IndexClient } from "./index-client.js";

/**
 * Server-issued witness token for k-anonymity.
 *
 * The index counts DISTINCT witnesses from the server-signed `wid` inside this
 * token — never a client-chosen value — so k-anonymity can't be defeated by
 * forging identities. We mint a short-lived token from the backend and cache it
 * locally, re-minting when it nears expiry. Tokens identify no user.
 */
const KEY = "lazarus:witnessToken";
const REFRESH_BUFFER_MS = 60_000; // re-mint a minute before expiry

interface CachedToken {
  token: string;
  exp: number; // epoch ms
}

export async function getWitnessToken(index: IndexClient): Promise<string> {
  const got = await browser.storage.local.get(KEY);
  const cached = got[KEY] as CachedToken | undefined;
  if (cached && cached.exp > Date.now() + REFRESH_BUFFER_MS) {
    return cached.token;
  }
  const { token, expiresInMs } = await index.mintWitnessToken();
  const fresh: CachedToken = { token, exp: Date.now() + expiresInMs };
  await browser.storage.local.set({ [KEY]: fresh });
  return token;
}
