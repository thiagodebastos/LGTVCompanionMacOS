#!/bin/bash
# ===========================================================================
# Health-check / watchdog for the lgtv-volume daemon.
#
# launchd's KeepAlive restarts the daemon if the PROCESS dies, but it can't
# detect a process that's alive yet wedged (event loop stuck, socket not
# answering). This pings the control socket; if the daemon doesn't answer,
# it kicks the LaunchAgent so launchd respawns a fresh one.
#
# A "ping" reply with tvConnected:false is HEALTHY — that just means the TV is
# off. We only restart when there's no reply at all.
#
# Run manually for a status read, or on a timer via the periodic LaunchAgent
# (com.lgtv-volume.healthcheck.plist). Exit 0 = healthy, 1 = restarted.
# ===========================================================================

DIR="$(cd "$(dirname "$0")" && pwd)"
NODE="$(command -v node || echo /opt/homebrew/bin/node)"
CLIENT="$DIR/dist/client.js"
LABEL="com.lgtv-volume"
UID_NUM="$(id -u)"

ts() { date "+%Y-%m-%dT%H:%M:%S%z"; }

reply="$("$NODE" "$CLIENT" ping 2>/dev/null)"
if echo "$reply" | grep -q '"pong":true'; then
  echo "$(ts) healthcheck OK — $reply"
  exit 0
fi

echo "$(ts) healthcheck FAIL — daemon not answering (got: '${reply:-<nothing>}'). Kicking $LABEL."
# Kill + restart the running agent. Falls back to load if it isn't loaded.
launchctl kickstart -k "gui/$UID_NUM/$LABEL" 2>/dev/null \
  || launchctl load "$HOME/Library/LaunchAgents/$LABEL.plist" 2>/dev/null
exit 1
