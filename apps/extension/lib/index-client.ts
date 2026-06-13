import type { Observation } from "@lazarus/core";

/**
 * Client for the central index plane. Submits observations (best-effort) and
 * resurrects pages another browser preserved when the local store has no copy.
 */
const DEFAULT_BASE = "http://localhost:8787";

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

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
