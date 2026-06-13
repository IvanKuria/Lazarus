/** Small shared formatting helpers for the popup. */

export function hostOf(urlKey: string): string {
  try {
    return new URL(urlKey).host;
  } catch {
    return urlKey;
  }
}

export function pathOf(urlKey: string): string {
  try {
    const u = new URL(urlKey);
    return u.pathname === "/" ? "" : u.pathname;
  } catch {
    return "";
  }
}

export function timeAgo(ts: number): string {
  const s = Math.max(1, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

export function fullDate(ts: number): string {
  return new Date(ts).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
