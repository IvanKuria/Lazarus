import { useEffect, useState } from "react";
import { browser } from "wxt/browser";
import type { MortalityMessage, MortalityResponse } from "../../lib/protocol.js";

type State =
  | { phase: "scanning" }
  | { phase: "done"; result: MortalityResponse }
  | { phase: "error" };

const wrap: React.CSSProperties = {
  minHeight: "100vh",
  margin: 0,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  textAlign: "center",
  background: "radial-gradient(circle at 50% 0%, #2e1065, #0b0612 70%)",
  color: "#f5f3ff",
  font: "16px/1.5 system-ui, sans-serif",
  padding: "48px 24px",
  boxSizing: "border-box",
};

export function App() {
  const [state, setState] = useState<State>({ phase: "scanning" });

  useEffect(() => {
    const msg: MortalityMessage = { type: "lazarus:mortality", sample: 60 };
    browser.runtime
      .sendMessage(msg)
      .then((r) => setState({ phase: "done", result: r as MortalityResponse }))
      .catch(() => setState({ phase: "error" }));
  }, []);

  return (
    <main style={wrap}>
      <div style={{ fontSize: 13, letterSpacing: 2, textTransform: "uppercase", opacity: 0.6 }}>
        🪦 Welcome to Lazarus
      </div>

      {state.phase === "scanning" && (
        <>
          <h1 style={{ fontSize: 28, fontWeight: 600, margin: "20px 0 8px" }}>
            Scanning your past…
          </h1>
          <p style={{ opacity: 0.7, maxWidth: 460 }}>
            Checking how many of the pages you&rsquo;ve visited still exist. This
            runs entirely on your device — nothing is uploaded.
          </p>
        </>
      )}

      {state.phase === "error" && (
        <h1 style={{ fontSize: 24, margin: "20px 0" }}>
          Couldn&rsquo;t read history — grant the permission and reopen.
        </h1>
      )}

      {state.phase === "done" && (
        <>
          <div
            style={{
              fontSize: 120,
              fontWeight: 800,
              lineHeight: 1,
              margin: "16px 0",
              color: "#a78bfa",
            }}
          >
            {state.result.deadPercent}%
          </div>
          <h1 style={{ fontSize: 26, fontWeight: 600, margin: "0 0 10px", maxWidth: 560 }}>
            of the links in your past are already <span style={{ color: "#f87171" }}>dead</span>.
          </h1>
          <p style={{ opacity: 0.7 }}>
            {state.result.dead} of {state.result.checked} pages you&rsquo;ve
            visited no longer load.
          </p>

          {state.result.examples.length > 0 && (
            <ul
              style={{
                listStyle: "none",
                padding: 0,
                margin: "20px 0",
                maxWidth: 560,
                fontSize: 13,
                opacity: 0.6,
                textAlign: "left",
              }}
            >
              {state.result.examples.map((url) => (
                <li
                  key={url}
                  style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                >
                  ✗ {url}
                </li>
              ))}
            </ul>
          )}

          <p style={{ maxWidth: 520, marginTop: 8 }}>
            From now on, Lazarus quietly preserves the public pages you read — so
            the next time one dies, you can bring it back.
          </p>
        </>
      )}
    </main>
  );
}
