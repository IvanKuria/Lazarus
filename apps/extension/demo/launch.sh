#!/bin/sh
# Open Chrome with the Lazarus extension loaded and demo.lazarus.test mapped to
# the local demo server. Uses a throwaway profile so your real Chrome/profile is
# untouched. Requires the demo server (server.mjs) and the backend to be running.
set -e

EXT="$(cd "$(dirname "$0")/../.output/chrome-mv3" && pwd)"
PROFILE="$(mktemp -d /tmp/lazarus-demo-profile.XXXXXX)"

for CANDIDATE in \
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  "/Applications/Chromium.app/Contents/MacOS/Chromium" \
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"; do
  if [ -x "$CANDIDATE" ]; then CHROME="$CANDIDATE"; break; fi
done

if [ -z "$CHROME" ]; then
  echo "No Chrome/Chromium/Edge found in /Applications." >&2
  exit 1
fi

echo "Launching: $CHROME"
echo "Extension: $EXT"
echo "Profile (throwaway): $PROFILE"

exec "$CHROME" \
  --user-data-dir="$PROFILE" \
  --load-extension="$EXT" \
  --disable-extensions-except="$EXT" \
  --host-resolver-rules="MAP demo.lazarus.test 127.0.0.1:8799" \
  --disable-features=WebRtcHideLocalIpsWithMdns \
  --no-first-run \
  --no-default-browser-check \
  "http://demo.lazarus.test/"
