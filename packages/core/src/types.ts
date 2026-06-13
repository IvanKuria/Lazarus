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
}

/** How a new version relates to the previous one for the same urlKey. */
export type ChangeKind = "unchanged" | "edited" | "replaced";
