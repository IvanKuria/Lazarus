import { ui } from "./theme.js";

/**
 * Renders a preserved snapshot in a fully sandboxed iframe — `sandbox=""` with
 * no allowances, so the archived HTML can't run scripts, navigate, or call out.
 * Same safety posture as the Resurrection / Scrubber overlays.
 */
export function SnapshotFrame({ html }: { html: string | null }) {
  if (html === null) {
    return (
      <div style={{ padding: 24, color: ui.muted, textAlign: "center", font: ui.font }}>
        <div style={{ fontSize: 22, marginBottom: 6 }}>⏳</div>
        Fetching this version from the network…
      </div>
    );
  }
  return (
    <iframe
      title="Preserved snapshot"
      sandbox=""
      srcDoc={html}
      style={{
        width: "100%",
        height: 360,
        border: "none",
        borderTop: `1px solid ${ui.line}`,
        background: "#fff",
      }}
    />
  );
}
