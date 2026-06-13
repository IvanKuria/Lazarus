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

export type LazarusMessage = CaptureMessage;
