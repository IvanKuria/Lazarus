import { useEffect, useState } from "react";
import { browser } from "wxt/browser";
import type { EditEvent } from "@lazarus/core";
import type { FeedMessage, FeedResponse } from "../../lib/protocol.js";

function hostOf(urlKey: string): string {
  try {
    return new URL(urlKey).host;
  } catch {
    return urlKey;
  }
}

function timeAgo(ts: number): string {
  const s = Math.max(1, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

export function App() {
  const [edits, setEdits] = useState<EditEvent[] | null>(null);

  useEffect(() => {
    const msg: FeedMessage = { type: "lazarus:feed", limit: 50 };
    browser.runtime
      .sendMessage(msg)
      .then((r) => setEdits((r as FeedResponse | undefined)?.edits ?? []))
      .catch(() => setEdits([]));
  }, []);

  return (
    <main style={{ width: 360, font: "13px/1.4 system-ui, sans-serif", color: "#1f2937" }}>
      <header style={{ padding: "14px 16px", background: "#7c3aed", color: "#fff" }}>
        <div style={{ fontSize: 16, fontWeight: 700 }}>Lazarus</div>
        <div style={{ fontSize: 12, opacity: 0.85 }}>Stealth-Edit Feed</div>
      </header>

      <div style={{ maxHeight: 420, overflowY: "auto" }}>
        {edits === null && (
          <p style={{ padding: 16, color: "#6b7280" }}>Loading…</p>
        )}
        {edits !== null && edits.length === 0 && (
          <p style={{ padding: 16, color: "#6b7280" }}>
            No edits detected yet. Keep browsing — when a page you&rsquo;ve seen
            quietly changes, it shows up here.
          </p>
        )}
        {edits?.map((e, i) => (
          <div
            key={i}
            style={{
              padding: "10px 16px",
              borderBottom: "1px solid #f0f0f0",
              display: "flex",
              gap: 10,
              alignItems: "baseline",
            }}
          >
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                textTransform: "uppercase",
                color: e.kind === "edited" ? "#b45309" : "#6d28d9",
                background: e.kind === "edited" ? "#fef3c7" : "#ede9fe",
                padding: "2px 6px",
                borderRadius: 4,
                whiteSpace: "nowrap",
              }}
            >
              {e.kind}
            </span>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div
                style={{
                  fontWeight: 600,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
                title={e.title ?? e.urlKey}
              >
                {e.title || hostOf(e.urlKey)}
              </div>
              <div style={{ color: "#6b7280", fontSize: 12 }}>
                {hostOf(e.urlKey)} · {timeAgo(e.nextCapturedAt)} ·{" "}
                {e.distance} bits changed
              </div>
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
