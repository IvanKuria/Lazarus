/**
 * Renders the Resurrection UI on a dead page.
 *
 * A Shadow DOM host isolates our styles from (what's left of) the page. The
 * preserved snapshot is shown in a fully sandboxed iframe (`sandbox=""`, no
 * allow-scripts) so archived markup renders as a static document and never
 * executes code.
 */
const OVERLAY_ID = "__lazarus_resurrection__";

function formatWhen(capturedAt: number): string {
  try {
    return new Date(capturedAt).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return "an earlier visit";
  }
}

export function showResurrectionOverlay(opts: {
  html: string;
  title?: string;
  capturedAt: number;
}): void {
  if (document.getElementById(OVERLAY_ID)) return;

  const host = document.createElement("div");
  host.id = OVERLAY_ID;
  const shadow = host.attachShadow({ mode: "open" });

  const style = document.createElement("style");
  style.textContent = `
    .bar {
      position: fixed; inset: 0 0 auto 0; z-index: 2147483647;
      display: flex; align-items: center; gap: 12px;
      padding: 12px 16px; font: 14px/1.4 system-ui, sans-serif;
      color: #fff; background: #7c3aed; box-shadow: 0 2px 12px rgba(0,0,0,.25);
    }
    .bar b { font-weight: 600; }
    .spacer { flex: 1; }
    button {
      font: inherit; font-weight: 600; cursor: pointer; border: 0; border-radius: 6px;
      padding: 7px 12px; background: #fff; color: #5b21b6;
    }
    button.ghost { background: transparent; color: #fff; border: 1px solid rgba(255,255,255,.6); }
    .view { position: fixed; inset: 48px 0 0 0; z-index: 2147483646; border: 0; width: 100%; height: calc(100% - 48px); background: #fff; }
    .hidden { display: none; }
  `;

  // Build the banner with explicit DOM nodes + textContent — no innerHTML sink.
  const bar = document.createElement("div");
  bar.className = "bar";

  const message = document.createElement("span");
  message.textContent = `🪦 This page is gone — but Lazarus preserved it (last seen ${formatWhen(
    opts.capturedAt,
  )}).`;

  const spacer = document.createElement("span");
  spacer.className = "spacer";

  const viewBtn = document.createElement("button");
  viewBtn.textContent = "View preserved version";

  const dismissBtn = document.createElement("button");
  dismissBtn.className = "ghost";
  dismissBtn.textContent = "Dismiss";

  bar.append(message, spacer, viewBtn, dismissBtn);

  // Untrusted archived markup renders only inside this fully sandboxed iframe.
  const frame = document.createElement("iframe");
  frame.className = "view hidden";
  frame.setAttribute("sandbox", "");
  frame.srcdoc = opts.html;

  shadow.append(style, bar, frame);
  document.documentElement.appendChild(host);

  viewBtn.addEventListener("click", () => {
    frame.classList.toggle("hidden");
    viewBtn.textContent = frame.classList.contains("hidden")
      ? "View preserved version"
      : "Hide preserved version";
  });
  dismissBtn.addEventListener("click", () => host.remove());
}
