// Small in-memory, fixed-window rate limiter.
//
// Used to cap how many witness tokens a single IP can mint per window.
// Limits are intentionally generous: this throttles cheap Sybil minting
// without blocking shared NATs (e.g. campus wifi) where many users share one IP.
//
// NOTE: state is per-instance and in-memory. This is fine for the single
// Railway instance we run today. Horizontal scale would need a shared store
// (e.g. Redis) so the window is counted across all instances.

export interface RateLimiterOptions {
  /** Max allowed hits per key within a window. */
  limit: number;
  /** Window length in milliseconds. */
  windowMs: number;
}

export interface RateLimiter {
  /**
   * Record a hit for `key` in the current window. Returns true if the key is
   * at/under `limit` for this window, false if it has exceeded it.
   */
  check(key: string, now?: number): boolean;
  /** Clear all state (useful for tests). */
  reset(): void;
}

interface Bucket {
  count: number;
  windowStart: number;
}

export function createRateLimiter(opts: RateLimiterOptions): RateLimiter {
  const { limit, windowMs } = opts;
  const buckets = new Map<string, Bucket>();

  return {
    check(key: string, now: number = Date.now()): boolean {
      let bucket = buckets.get(key);
      if (bucket === undefined || now - bucket.windowStart >= windowMs) {
        bucket = { count: 0, windowStart: now };
        buckets.set(key, bucket);
      }
      bucket.count += 1;
      return bucket.count <= limit;
    },
    reset(): void {
      buckets.clear();
    },
  };
}
