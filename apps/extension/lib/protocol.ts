import type { Observation, EditEvent } from "@lazarus/core";

/** Message contract between extension contexts (content script ⇄ background). */

export interface CapturePayload {
  url: string;
  html: string;
  text: string;
  title: string;
  capturedAt: number;
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

export type LazarusMessage =
  | CaptureMessage
  | VersionsMessage
  | SnapshotMessage
  | FeedMessage;
