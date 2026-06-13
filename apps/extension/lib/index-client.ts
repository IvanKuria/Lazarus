import type { Observation } from "@lazarus/core";
import { bytesToBase64, base64ToBytes } from "./base64.js";

/**
 * Client for the central index plane. Submits observations (best-effort),
 * locates a CID for P2P fetch, and resurrects centrally as a fallback.
 */
const DEFAULT_BASE = "http://localhost:8787";

export interface RemoteResurrection {
  html: string;
  observation: Observation;
}

export class IndexClient {
  constructor(private readonly base: string = DEFAULT_BASE) {}

  async submit(params: {
    url: string;
    snapshotBytes: Uint8Array;
    text: string;
    capturedAt: number;
    title?: string;
    witnessId: string;
  }): Promise<void> {
    // Send only raw fields; the server derives the content address from the bytes.
    await fetch(`${this.base}/v1/observations`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        url: params.url,
        snapshotBase64: bytesToBase64(params.snapshotBytes),
        text: params.text,
        capturedAt: params.capturedAt,
        ...(params.title !== undefined && { title: params.title }),
        witnessId: params.witnessId,
      }),
    });
  }

  /** Resolve the latest promoted observation (CID + metadata) without the blob. */
  async locate(url: string): Promise<Observation | null> {
    const res = await fetch(
      `${this.base}/v1/locate?url=${encodeURIComponent(url)}`,
    );
    if (!res.ok) return null;
    return ((await res.json()) as { observation: Observation }).observation;
  }

  async resurrectLatest(url: string): Promise<RemoteResurrection | null> {
    const res = await fetch(
      `${this.base}/v1/resurrect?url=${encodeURIComponent(url)}`,
    );
    if (!res.ok) return null;
    const data = (await res.json()) as {
      observation: Observation;
      snapshotBase64: string;
    };
    return {
      observation: data.observation,
      html: new TextDecoder().decode(base64ToBytes(data.snapshotBase64)),
    };
  }
}
