/**
 * Popup — the node's status surface.
 *
 * Phase 1 placeholder. Will show: pages preserved, disk used, what's being shared,
 * and a one-click purge. The full archive search lives in the Memory view (later).
 */
export function App() {
  return (
    <main style={{ width: 280, padding: 16, fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ fontSize: 16, margin: "0 0 4px" }}>Lazarus</h1>
      <p style={{ fontSize: 12, color: "#666", margin: 0 }}>
        The web&rsquo;s distributed memory. Node ready.
      </p>
    </main>
  );
}
