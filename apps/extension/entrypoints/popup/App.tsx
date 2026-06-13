import { useState } from "react";
import { ui } from "./theme.js";
import { FeedTab } from "./FeedTab.js";
import { MemoryTab } from "./MemoryTab.js";

type Tab = "feed" | "memory";

const TABS: { id: Tab; label: string; glyph: string }[] = [
  { id: "feed", label: "Stealth-Edit Feed", glyph: "↺" },
  { id: "memory", label: "Memory", glyph: "🪦" },
];

export function App() {
  const [tab, setTab] = useState<Tab>("feed");

  return (
    <main style={{ width: ui.width, font: ui.font, color: ui.ink }}>
      <header
        style={{
          padding: "14px 16px 0",
          background: `linear-gradient(160deg, ${ui.purple}, ${ui.purpleDeep})`,
          color: "#fff",
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <span style={{ fontSize: 16, fontWeight: 800, letterSpacing: -0.2 }}>Lazarus</span>
          <span style={{ fontSize: 11, opacity: 0.8 }}>the web&rsquo;s memory</span>
        </div>
        <nav style={{ display: "flex", gap: 4, marginTop: 12 }}>
          {TABS.map((t) => {
            const active = t.id === tab;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                style={{
                  border: "none",
                  cursor: "pointer",
                  font: ui.font,
                  fontWeight: 600,
                  color: active ? ui.purpleInk : "rgba(255,255,255,0.85)",
                  background: active ? "#fff" : "transparent",
                  padding: "7px 12px",
                  borderRadius: "8px 8px 0 0",
                  transition: "color 120ms ease",
                }}
              >
                <span style={{ marginRight: 5 }}>{t.glyph}</span>
                {t.label}
              </button>
            );
          })}
        </nav>
      </header>

      <div style={{ minHeight: 160 }}>
        {tab === "feed" ? <FeedTab /> : <MemoryTab />}
      </div>
    </main>
  );
}
