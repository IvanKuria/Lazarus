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

export type LazarusMessage = CaptureMessage;
