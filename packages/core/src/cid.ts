/**
 * Content addressing for Lazarus snapshots.
 *
 * A CID (content identifier) is derived purely from the bytes of a snapshot, so
 * identical content always yields the same CID. This is the bedrock for dedup,
 * integrity verification, and k-witness consensus.
 */

function toHex(bytes: Uint8Array): string {
  let out = "";
  for (const b of bytes) out += b.toString(16).padStart(2, "0");
  return out;
}

/** Compute a deterministic content identifier for the given bytes (SHA-256). */
export async function computeCid(bytes: Uint8Array): Promise<string> {
  // TS 5.7 types Uint8Array over ArrayBufferLike; digest() wants a BufferSource.
  const digest = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return toHex(new Uint8Array(digest));
}
