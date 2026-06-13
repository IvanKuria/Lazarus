/**
 * Inline fetched subresources into a snapshot.
 *
 * The content script collects absolute resource URLs (it can't fetch cross-origin
 * itself); the background fetches them via its host permissions and passes a
 * `url → dataURI` map here. Replacing every reference makes the snapshot fully
 * self-contained — so a resurrected page renders even after the original (and its
 * images/CSS) are gone.
 */
export function inlineResources(
  html: string,
  resources: Record<string, string>,
): string {
  let out = html;
  for (const [url, dataUri] of Object.entries(resources)) {
    out = out.split(url).join(dataUri);
  }
  return out;
}
