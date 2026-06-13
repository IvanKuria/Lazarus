/**
 * Time-Travel Scrubber overlay.
 *
 * A floating pill on any page with 2+ preserved versions. Expanding it reveals a
 * slider over the version timeline; scrubbing fetches that version's snapshot
 * lazily (by cid) and renders it in a fully sandboxed iframe (no script
 * execution) — the same safe-render trust boundary as Resurrection.
 */
const SCRUBBER_ID = "__lazarus_scrubber__";

export interface ScrubberVersion {
  cid: string;
  capturedAt: number;
  title?: string;
}

function formatWhen(ts: number): string {
  try {
    return new Date(ts).toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return String(ts);
  }
}

export function showScrubber(opts: {
  versions: ScrubberVersion[];
  fetchSnapshot: (cid: string) => Promise<string | null>;
}): void {
  const { versions, fetchSnapshot } = opts;
  if (versions.length < 2) return;
  if (document.getElementById(SCRUBBER_ID)) return;

  const host = document.createElement("div");
  host.id = SCRUBBER_ID;
  const shadow = host.attachShadow({ mode: "open" });

  const style = document.createElement("style");
  style.textContent = `
    .pill {
      position: fixed; right: 16px; bottom: 16px; z-index: 2147483647;
      font: 13px/1 system-ui, sans-serif; cursor: pointer; border: 0;
      padding: 10px 14px; border-radius: 999px; color: #fff; background: #7c3aed;
      box-shadow: 0 4px 16px rgba(0,0,0,.3);
    }
    .panel {
      position: fixed; right: 16px; bottom: 16px; z-index: 2147483647;
      width: min(720px, 92vw); height: min(560px, 80vh);
      display: none; flex-direction: column; overflow: hidden;
      background: #fff; border-radius: 12px; box-shadow: 0 8px 40px rgba(0,0,0,.35);
      font: 13px/1.4 system-ui, sans-serif; color: #1f2937;
    }
    .panel.open { display: flex; }
    header { display: flex; align-items: center; gap: 10px; padding: 12px 14px; background: #7c3aed; color: #fff; }
    header b { font-weight: 600; }
    header .spacer { flex: 1; }
    header button { font: inherit; cursor: pointer; border: 0; background: transparent; color: #fff; font-size: 18px; line-height: 1; }
    .controls { display: flex; align-items: center; gap: 10px; padding: 10px 14px; border-bottom: 1px solid #eee; }
    .controls input[type=range] { flex: 1; accent-color: #7c3aed; }
    .when { font-variant-numeric: tabular-nums; white-space: nowrap; color: #4b5563; }
    iframe { flex: 1; border: 0; width: 100%; background: #fff; }
  `;

  const pill = document.createElement("button");
  pill.className = "pill";
  pill.textContent = `⏳ ${versions.length} versions`;

  const panel = document.createElement("div");
  panel.className = "panel";

  const header = document.createElement("header");
  const hTitle = document.createElement("b");
  hTitle.textContent = "Time Travel";
  const hSpacer = document.createElement("span");
  hSpacer.className = "spacer";
  const closeBtn = document.createElement("button");
  closeBtn.textContent = "✕";
  closeBtn.setAttribute("aria-label", "Close");
  header.append(hTitle, hSpacer, closeBtn);

  const controls = document.createElement("div");
  const slider = document.createElement("input");
  slider.type = "range";
  slider.min = "0";
  slider.max = String(versions.length - 1);
  slider.value = String(versions.length - 1);
  slider.step = "1";
  const when = document.createElement("span");
  when.className = "when";
  controls.append(slider, when);

  const frame = document.createElement("iframe");
  frame.setAttribute("sandbox", "");

  panel.append(header, controls, frame);
  shadow.append(style, pill, panel);
  document.documentElement.appendChild(host);

  let token = 0;
  async function render(index: number): Promise<void> {
    const version = versions[index];
    if (!version) return;
    when.textContent = `${formatWhen(version.capturedAt)}  ·  v${index + 1}/${versions.length}`;
    const mine = ++token;
    const html = await fetchSnapshot(version.cid);
    if (mine !== token) return; // a newer scrub superseded this fetch
    frame.srcdoc = html ?? "<p style='font:14px system-ui;padding:24px'>This version isn't available locally yet.</p>";
  }

  pill.addEventListener("click", () => {
    panel.classList.add("open");
    pill.style.display = "none";
    void render(versions.length - 1);
  });
  closeBtn.addEventListener("click", () => {
    panel.classList.remove("open");
    pill.style.display = "";
  });
  slider.addEventListener("input", () => void render(Number(slider.value)));
}
