import { useEffect, useState } from "react";
import { browser } from "wxt/browser";
import type { Observation, PreservedPage } from "@lazarus/core";
import type {
  VersionsMessage,
  VersionsResponse,
  SnapshotMessage,
  SnapshotResponse,
} from "../../lib/protocol.js";
import { hostOf, pathOf, fullDate } from "./format.js";
import { ui } from "./theme.js";
import { SnapshotFrame } from "./SnapshotFrame.js";

/** A page's preserved version timeline; click a version to view its snapshot. */
export function PageDetail({ page, onBack }: { page: PreservedPage; onBack: () => void }) {
  const [versions, setVersions] = useState<Observation[] | null>(null);
  const [openCid, setOpenCid] = useState<string | null>(null);
  const [html, setHtml] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);

  useEffect(() => {
    const msg: VersionsMessage = { type: "lazarus:versions", url: page.urlKey };
    browser.runtime
      .sendMessage(msg)
      .then((r) => setVersions((r as VersionsResponse | undefined)?.versions ?? []))
      .catch(() => setVersions([]));
  }, [page.urlKey]);

  function view(cid: string) {
    setOpenCid(cid);
    setHtml(null);
    const msg: SnapshotMessage = { type: "lazarus:snapshot", cid };
    browser.runtime
      .sendMessage(msg)
      .then((r) => setHtml((r as SnapshotResponse | undefined)?.html ?? ""))
      .catch(() => setHtml(""));
  }

  // newest first for browsing
  const ordered = versions ? [...versions].sort((a, b) => b.capturedAt - a.capturedAt) : [];

  return (
    <div>
      <div style={{ padding: "10px 14px", borderBottom: `1px solid ${ui.line}`, background: ui.wash }}>
        <button
          onClick={onBack}
          style={{
            border: "none", background: "none", color: ui.purple, cursor: "pointer",
            font: ui.font, fontWeight: 600, padding: 0, marginBottom: 6,
          }}
        >
          ← All preserved pages
        </button>
        <div style={{ fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {page.title || hostOf(page.urlKey)}
        </div>
        <div style={{ color: ui.muted, fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {hostOf(page.urlKey)}{pathOf(page.urlKey)}
        </div>
      </div>

      {openCid && <SnapshotFrame html={html} />}

      <div style={{ maxHeight: openCid ? 120 : 440, overflowY: "auto" }}>
        {versions === null && <p style={{ padding: 16, color: ui.muted }}>Loading versions…</p>}
        {versions !== null && ordered.length === 0 && (
          <p style={{ padding: 16, color: ui.muted }}>No versions available.</p>
        )}
        {ordered.map((v, i) => {
          const isOpen = v.cid === openCid;
          return (
            <div
              key={v.cid}
              onClick={() => view(v.cid)}
              onMouseEnter={() => setHover(v.cid)}
              onMouseLeave={() => setHover((h) => (h === v.cid ? null : h))}
              style={{
                padding: "9px 14px",
                borderBottom: `1px solid ${ui.line}`,
                display: "flex", gap: 10, alignItems: "center", cursor: "pointer",
                background: isOpen ? ui.chipBg : hover === v.cid ? ui.wash : "transparent",
                transition: "background 120ms ease",
              }}
            >
              <span style={{ fontSize: 14 }}>{i === 0 ? "⏳" : "↺"}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600 }}>
                  {fullDate(v.capturedAt)}
                  {i === 0 && (
                    <span style={{ color: ui.chipInk, fontSize: 10, fontWeight: 700, marginLeft: 8, textTransform: "uppercase" }}>
                      latest
                    </span>
                  )}
                </div>
                <div style={{ font: ui.mono, color: ui.faint }}>
                  {v.cid.slice(0, 18)}… · {(v.sizeBytes / 1024).toFixed(1)} KB
                </div>
              </div>
              <span style={{ color: ui.purple, fontWeight: 600, fontSize: 12 }}>
                {isOpen ? "viewing" : "view"}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
