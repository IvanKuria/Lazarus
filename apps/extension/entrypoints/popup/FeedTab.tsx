import { useEffect, useState } from "react";
import { browser } from "wxt/browser";
import type { EditEvent } from "@lazarus/core";
import type { FeedMessage, FeedResponse } from "../../lib/protocol.js";
import { hostOf, timeAgo } from "./format.js";
import { ui } from "./theme.js";

/** The global, crowd-witnessed Stealth-Edit Feed. */
export function FeedTab() {
  const [edits, setEdits] = useState<EditEvent[] | null>(null);

  useEffect(() => {
    const msg: FeedMessage = { type: "lazarus:feed", limit: 50 };
    browser.runtime
      .sendMessage(msg)
      .then((r) => setEdits((r as FeedResponse | undefined)?.edits ?? []))
      .catch(() => setEdits([]));
  }, []);

  if (edits === null) {
    return <p style={{ padding: 16, color: ui.muted }}>Loading…</p>;
  }
  if (edits.length === 0) {
    return (
      <p style={{ padding: "20px 16px", color: ui.muted }}>
        No edits yet. As pages you and the network have preserved quietly change,
        they surface here — the web&rsquo;s stealth edits, caught.
      </p>
    );
  }

  return (
    <div>
      {edits.map((e, i) => (
        <div
          key={i}
          style={{
            padding: "10px 16px",
            borderBottom: `1px solid ${ui.line}`,
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
              letterSpacing: 0.3,
              color: e.kind === "edited" ? "#b45309" : ui.chipInk,
              background: e.kind === "edited" ? "#fef3c7" : ui.chipBg,
              padding: "2px 6px",
              borderRadius: 4,
              whiteSpace: "nowrap",
            }}
          >
            {e.kind}
          </span>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div
              style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
              title={e.title ?? e.urlKey}
            >
              {e.title || hostOf(e.urlKey)}
            </div>
            <div style={{ color: ui.muted, fontSize: 12 }}>
              {hostOf(e.urlKey)} · {timeAgo(e.nextCapturedAt)} · {e.distance} bits changed
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
