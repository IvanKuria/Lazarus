import { browser } from "wxt/browser";

/**
 * Per-install anonymous witness token.
 *
 * Used by the index only to count DISTINCT witnesses for k-anonymity — never to
 * identify a user. Generated once and stored locally. (A future phase rotates it
 * for stronger unlinkability.)
 */
const KEY = "lazarus:witnessId";

export async function getWitnessId(): Promise<string> {
  const got = await browser.storage.local.get(KEY);
  let id = got[KEY] as string | undefined;
  if (!id) {
    id = crypto.randomUUID();
    await browser.storage.local.set({ [KEY]: id });
  }
  return id;
}
