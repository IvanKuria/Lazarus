import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Build a hermetic extension bundle for the e2e suite, pointing at the local
 * in-process backend. This overrides `.env.production` (which targets the
 * deployed Railway backend) so the tests stay isolated and don't hit prod.
 */
export default function globalSetup(): void {
  const extensionDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  // No shell, fixed args — no injection surface.
  execFileSync("pnpm", ["exec", "wxt", "build"], {
    cwd: extensionDir,
    stdio: "inherit",
    env: {
      ...process.env,
      WXT_PUBLIC_API_BASE: "http://localhost:8787",
      WXT_PUBLIC_SIGNAL_URL: "ws://localhost:8787/signal",
    },
  });
}
