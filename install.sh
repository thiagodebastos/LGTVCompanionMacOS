#!/bin/bash
# Render the LaunchAgent templates with this machine's node path + repo location
# and load them. Re-run any time to update. Pass --with-healthcheck to also
# install the watchdog agent.
set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
NODE="$(command -v node || true)"
[ -n "$NODE" ] || { echo "node not found on PATH — install Node first (brew install node)"; exit 1; }
LA="$HOME/Library/LaunchAgents"
mkdir -p "$LA"

render_load() {
  local name="$1"
  sed -e "s#__NODE__#$NODE#g" -e "s#__DIR__#$DIR#g" \
    "$DIR/$name.plist.template" > "$LA/$name.plist"
  launchctl unload "$LA/$name.plist" 2>/dev/null || true
  launchctl load "$LA/$name.plist"
  echo "loaded $name  (node: $NODE)"
}

[ -f "$DIR/config.json" ] || { echo "no config.json — run: cp config.example.json config.json  then set tvIp"; exit 1; }
[ -d "$DIR/dist" ]        || { echo "not built — run: npm install && npm run build"; exit 1; }

render_load com.lgtv-volume
if [ "${1:-}" = "--with-healthcheck" ]; then
  render_load com.lgtv-volume.healthcheck
fi
echo "done. check: tail -f \"$DIR/daemon.log\""
