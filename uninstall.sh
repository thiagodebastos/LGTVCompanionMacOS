#!/bin/bash
# Unload and remove the LaunchAgents. Leaves the paired client-key intact
# (delete ~/Library/Preferences/lgtv2/client-key separately to re-pair).
set -u
LA="$HOME/Library/LaunchAgents"
for name in com.lgtv-volume com.lgtv-volume.healthcheck; do
  if [ -f "$LA/$name.plist" ]; then
    launchctl unload "$LA/$name.plist" 2>/dev/null || true
    rm -f "$LA/$name.plist"
    echo "removed $name"
  fi
done
echo "done."
