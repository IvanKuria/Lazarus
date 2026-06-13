import { useEffect, useMemo, useState } from "react";
import { browser } from "wxt/browser";
import type { PreservedPage } from "@lazarus/core";
import type { MemoryMessage, MemoryResponse } from "../../lib/protocol.js";
import { hostOf, pathOf, timeAgo } from "./format.js";
import { ui } from "./theme.js";
import { PageDetail } from "./PageDetail.js";

/** Browse every page this user has preserved locally. */
export function MemoryTab() {
  const [pages, setPages] = useState<PreservedPage[] | null>(null);
  const [selected, setSelected] = useState<PreservedPage | null>(null);
  const [q, setQ] = useState("");
  const [hover, setHover] = useState<string | null>(null);

  useEffect(() => {
    const msg: MemoryMessage = { type: "lazarus:memory" };
    browser.runtime
      .sendMessage(msg)
      .then((r) => setPages((r as MemoryResponse | undefined)?.pages ?? []))
      .catch(() => setPages([]));
  }, []);

  const filtered = useMemo(() => {
    if (!pages) return [];
    const needle = q.trim().toLowerCase();
    if (!needle) return pages;
    return pages.filter(
      (p) => (p.title ?? "").toLowerCase().includes(needle) || p.urlKey.toLowerCase().includes(needle),
    );
  }, [pages, q]);

  if (selected) return <PageDetail page={selected} onBack={() => setSelected(null)} />;

  if (pages === null) return <p style={{ padding: 16, color: ui.muted }}>Loading…</p>;

  if (pages.length === 0) {
    return (
      <p style={{ padding: "20px 16px", color: ui.muted }}>
        <span style={{ fontSize: 20 }}>🪦</span>
        <br />
        Nothing preserved yet. As you read public pages, Lazarus quietly keeps a
        copy — they&rsquo;ll appear here, ready to time-travel or resurrect.
      </p>
    );
  }

  return (
    <div>
      <div style={{ padding: "10px 14px", borderBottom: `1px solid ${ui.line}`, background: ui.wash }}>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={`Search ${pages.length} preserved page${pages.length === 1 ? "" : "s"}…`}
          style={{
            width: "100%", boxSizing: "border-box", padding: "7px 10px",
            border: `1px solid ${ui.line}`, borderRadius: 7, font: ui.font,
            outline: "none", background: "#fff",
          }}
        />
      </div>
      <div style={{ maxHeight: 430, overflowY: "auto" }}>
        {filtered.map((p) => (
          <div
            key={p.urlKey}
            onClick={() => setSelected(p)}
            onMouseEnter={() => setHover(p.urlKey)}
            onMouseLeave={() => setHover((h) => (h === p.urlKey ? null : h))}
            style={{
              padding: "11px 14px", borderBottom: `1px solid ${ui.line}`,
              display: "flex", gap: 11, alignItems: "center", cursor: "pointer",
              background: hover === p.urlKey ? ui.wash : "transparent",
              transition: "background 120ms ease",
            }}
          >
            <span
              style={{
                width: 30, height: 30, borderRadius: 8, flexShrink: 0,
                background: ui.chipBg, color: ui.chipInk, fontWeight: 700,
                display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14,
              }}
            >
              {hostOf(p.urlKey).replace(/^www\./, "").charAt(0).toUpperCase() || "•"}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={p.title ?? p.urlKey}>
                {p.title || hostOf(p.urlKey)}
              </div>
              <div style={{ color: ui.muted, fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {hostOf(p.urlKey)}{pathOf(p.urlKey)} · {timeAgo(p.latestCapturedAt)}
              </div>
            </div>
            <span
              style={{
                font: ui.mono, color: ui.chipInk, background: ui.chipBg,
                padding: "2px 7px", borderRadius: 10, whiteSpace: "nowrap",
              }}
              title={`${p.versionCount} preserved version${p.versionCount === 1 ? "" : "s"}`}
            >
              {p.versionCount}×
            </span>
          </div>
        ))}
        {filtered.length === 0 && (
          <p style={{ padding: 16, color: ui.muted }}>No pages match “{q}”.</p>
        )}
      </div>
    </div>
  );
}
