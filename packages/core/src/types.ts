/** Core shared data model for Lazarus observations. */

/**
 * One observation = one browser's record of seeing a page at a moment in time.
 * This is the unit aggregated into the shared index; many observations of the
 * same `urlKey` over time form that page's version timeline.
 */
export interface Observation {
  /** Normalized canonical URL — groups every version of "the same page". */
  urlKey: string;
  /** Content identifier (hash) of the canonical snapshot bytes. */
  cid: string;
  /** SimHash of the page's readable text — for change-magnitude comparison. */
  fingerprint: string;
  /** Unix epoch milliseconds when the page was captured. */
  capturedAt: number;
  /** Size of the snapshot in bytes. */
  sizeBytes: number;
  /** Human-readable page title, if available. */
  title?: string;
}

/** Input to building an observation from a captured page. */
export interface CapturedPage {
  url: string;
  snapshotBytes: Uint8Array;
  /** Readable text extracted from the page (Readability-style). */
  text: string;
  capturedAt: number;
  title?: string;
  /**
   * Whether the page is article-like (Readability "readerable"). Dynamic pages
   * (search results, dashboards, app UIs) are not, and are excluded from the
   * Stealth-Edit Feed to suppress noise. Undefined is treated as readerable.
   */
  readerable?: boolean;
}

/** A preserved page summarized for the Memory view — one row per urlKey. */
export interface PreservedPage {
  urlKey: string;
  /** Title of the most recently preserved version, if any. */
  title?: string;
  /** capturedAt of the most recent version. */
  latestCapturedAt: number;
  /** How many versions of this page are preserved locally. */
  versionCount: number;
}

/** How a new version relates to the previous one for the same urlKey. */
export type ChangeKind = "unchanged" | "edited" | "replaced";

/**
 * A detected change between two consecutive versions of a page — the unit of the
 * Stealth-Edit Feed. Recorded whenever a capture supersedes a different prior
 * version (kind "edited" or "replaced"), never for first-ever or unchanged captures.
 */
export interface EditEvent {
  urlKey: string;
  title?: string;
  kind: Exclude<ChangeKind, "unchanged">;
  prevCid: string;
  nextCid: string;
  /** SimHash Hamming distance between the two versions. */
  distance: number;
  prevCapturedAt: number;
  nextCapturedAt: number;
}
