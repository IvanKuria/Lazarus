import { Readability } from "@mozilla/readability";

/**
 * Builds a high-fidelity, self-contained-ish snapshot from the live DOM.
 *
 * Runs in the content script (which has the DOM but can't fetch cross-origin):
 * it strips scripts, makes resource URLs absolute, and collects image URLs for
 * the background to fetch + inline. Readability gives clean article text for the
 * fingerprint. Cross-origin CSS inlining is a known follow-up.
 */
export interface CapturedDom {
  html: string;
  text: string;
  resourceUrls: string[];
}

export function captureDom(doc: Document): CapturedDom {
  let text = doc.body?.innerText ?? "";
  try {
    const parsed = new Readability(doc.cloneNode(true) as Document).parse();
    if (parsed?.textContent && parsed.textContent.trim().length > 0) {
      text = parsed.textContent;
    }
  } catch {
    /* fall back to innerText */
  }

  const root = doc.documentElement.cloneNode(true) as HTMLElement;
  root.querySelectorAll("script, noscript").forEach((n) => n.remove());

  const resourceUrls = new Set<string>();
  root.querySelectorAll("img").forEach((img) => {
    const src = img.getAttribute("src");
    img.removeAttribute("srcset"); // avoid inconsistent responsive variants
    if (!src) return;
    try {
      const abs = new URL(src, doc.baseURI).href;
      img.setAttribute("src", abs);
      if (abs.startsWith("http")) resourceUrls.add(abs);
    } catch {
      /* skip unparseable src */
    }
  });

  // Absolutize stylesheet/anchor hrefs so any non-inlined refs still resolve.
  root.querySelectorAll("link[href], a[href]").forEach((el) => {
    const href = el.getAttribute("href");
    if (!href) return;
    try {
      el.setAttribute("href", new URL(href, doc.baseURI).href);
    } catch {
      /* skip */
    }
  });

  return {
    html: "<!doctype html>" + root.outerHTML,
    text,
    resourceUrls: [...resourceUrls],
  };
}
