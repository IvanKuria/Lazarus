import type { Observation, EditEvent, MortalitySummary } from "@lazarus/core";

/** Message contract between extension contexts (content script ⇄ background). */

export interface CapturePayload {
  url: string;
  html: string;
  text: string;
  title: string;
  capturedAt: number;
  /** Absolute image URLs for the background to fetch + inline as data URIs. */
  resourceUrls: string[];
  /** Article-like? Non-readerable pages are excluded from the Stealth-Edit Feed. */
  readerable: boolean;
}

export interface CaptureMessage {
  type: "lazarus:capture";
  page: CapturePayload;
}

/**
 * Background's reply to a capture. If the page was a dead/error response and we
 * hold a preserved copy, the reply carries it so the content script can offer
 * Resurrection inline.
 */
export interface CaptureResponse {
  recorded: boolean;
  resurrect?: {
    html: string;
    title?: string;
    capturedAt: number;
  };
}

/** Request the full version timeline for a URL (metadata only, no blobs). */
export interface VersionsMessage {
  type: "lazarus:versions";
  url: string;
}

export interface VersionsResponse {
  versions: Observation[];
}

/** Fetch the preserved HTML for a single version by its content id. */
export interface SnapshotMessage {
  type: "lazarus:snapshot";
  cid: string;
}

export interface SnapshotResponse {
  html: string | null;
}

/** Request the Stealth-Edit Feed (recent detected edits, newest-first). */
export interface FeedMessage {
  type: "lazarus:feed";
  limit?: number;
}

export interface FeedResponse {
  edits: EditEvent[];
}

/** Run the "Digital Mortality" scan over the user's history (local only). */
export interface MortalityMessage {
  type: "lazarus:mortality";
  /** How many recent history links to sample. */
  sample?: number;
}

export interface MortalityResponse extends MortalitySummary {
  /** A few example dead links, for display. */
  examples: string[];
}

export type LazarusMessage =
  | CaptureMessage
  | VersionsMessage
  | SnapshotMessage
  | FeedMessage
  | MortalityMessage;
