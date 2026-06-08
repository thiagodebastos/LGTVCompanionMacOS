# LGTVCompanionMacOS

Drive an LG webOS TV's volume from the Mac keyboard volume keys over the LAN.
When the Mac outputs audio over HDMI, macOS disables software volume control, so
the keys do nothing. This bypasses the audio path and talks to the TV directly
over its WebSocket SSAP API. Tested on an LG CX (webOS 5), Apple Silicon.

## How it works

- **Daemon** (`src/daemon.ts`) holds ONE persistent WebSocket to the TV (warm
  socket, no per-keypress handshake) and listens on a Unix domain socket.
- **Client** (`src/client.ts`) is a tiny program Hammerspoon runs on each
  keypress; it sends one command to the daemon and exits.
- **Hammerspoon** (`hammerspoon.lua`) captures the real volume HID keys, forwards
  them to the client, and shows a menubar volume readout.
- **launchd** keeps the daemon running at login and restarts it if it dies.
- **Watchdog** (`healthcheck.sh`) pings the daemon every 60s and respawns it if
  it's wedged.

```
vol.js                                       one-shot POC (pairing + volume check)
config.example.json                          template -> copy to config.json
src/config.ts                                paths + config loader
src/tv.ts                                    persistent connection, reconnect, state cache
src/daemon.ts                                Unix-socket control endpoint
src/client.ts                                thin trigger client
hammerspoon.lua                              volume-key binding + menubar readout
install.sh / uninstall.sh                    render + (un)load the LaunchAgents
com.lgtv-volume.plist.template               daemon LaunchAgent (paths filled by install.sh)
com.lgtv-volume.healthcheck.plist.template   watchdog LaunchAgent
healthcheck.sh                               watchdog script
```

Control protocol (newline-delimited, one request per connection):
`volume-up` | `volume-down` | `mute-toggle` | `get-volume` | `ping` →
`{"ok":true,"volume":13,"muted":false}`.

---

## Prerequisites

- macOS (Apple Silicon), Node (`brew install node`).
- The TV reachable on the LAN — a static DHCP lease is recommended — with network
  control enabled (LG menu: General → "Mobile TV On" / Connect Apps; port 3000).

Node path, repo location, and your username are detected automatically by
`install.sh`, `healthcheck.sh`, and `hammerspoon.lua` — nothing is hardcoded.

## 1. Install & build

```
git clone <this-repo> lgtv-volume && cd lgtv-volume
npm install
npm run build      # compiles src/*.ts -> dist/*.js
```

## 2. Configure

```
cp config.example.json config.json
```

Edit `config.json` and set the TV's LAN IP (`config.json` is gitignored, so your
IP stays local):

```json
{ "tvIp": "192.168.1.50", "volumeStep": 1 }
```

## 3. Pair with the TV (one time)

With the TV on, run the proof-of-concept. It triggers an on-screen pairing prompt
and saves the client-key to `~/Library/Preferences/lgtv2/client-key` (the daemon
reuses the same file, so you only pair once):

```
node vol.js get
```

Accept the prompt **on the TV** with the remote, then re-run `node vol.js get` —
it should print volume with no prompt. Sanity-check the rest:

```
node vol.js up        # volume up one step
node vol.js down      # volume down one step
node vol.js mute      # toggle mute
node vol.js set 20    # absolute volume 0-100
```

(`vol.js` opens a fresh connection each run, so it's slow on purpose — it's only
for setup. The daemon is what keeps the socket warm.)

## 4. Install the daemon (launchd)

```
./install.sh                      # daemon only
./install.sh --with-healthcheck   # daemon + watchdog
tail -f daemon.log                # expect "daemon up." then "connected to TV."
```

`install.sh` renders the `.plist.template`s with your node path and repo location
into `~/Library/LaunchAgents/` and loads them. Re-run it any time to update.

Test the control endpoint directly:

```
node dist/client.js get-volume     # -> {"ok":true,"volume":13,"muted":false}
node dist/client.js volume-up
```

After editing any `src/*.ts`, rebuild and restart the daemon:

```
npm run build
launchctl kickstart -k gui/$(id -u)/com.lgtv-volume
```

Watchdog status read at any time (`OK` = healthy, including when the TV is off):

```
bash healthcheck.sh        # -> "... healthcheck OK — {"ok":true,"pong":true,...}"
```

## 5. Bind the volume keys (Hammerspoon)

```
brew install --cask hammerspoon
```

Launch Hammerspoon once, then load this project's binding from your config —
add to `~/.hammerspoon/init.lua` (use the absolute path to your clone):

```lua
dofile("/absolute/path/to/lgtv-volume/hammerspoon.lua")
```

Then click the Hammerspoon menubar icon → **Reload Config**.

**Grant Accessibility permission** (required for `hs.eventtap` to see the volume
keys): System Settings → Privacy & Security → **Accessibility** → enable
**Hammerspoon**. Reload config again after granting.

If the real volume keys still don't work, uncomment the **F11/F12 fallback** block
at the bottom of `hammerspoon.lua` and comment out `volumeTap:start()`.

A **menubar readout** appears showing `TV 13` (volume), `TV 🔇` (muted), or
`TV ✕` (daemon down / TV off).

## 6. Verify end-to-end

- Press volume up/down → TV volume moves, no lag on repeats.
- Mute key toggles (tracks state, doesn't blind-set).
- Turn the TV off → keys are a no-op, daemon stays up (check `daemon.log`); turn
  it back on → reconnects within ~5s.
- Reboot the Mac → daemon and watchdog come back automatically.

---

## Manage / uninstall

```
# restart daemon after a code change
launchctl kickstart -k gui/$(id -u)/com.lgtv-volume

# remove both LaunchAgents
./uninstall.sh

# re-pairing later? delete the saved key
rm ~/Library/Preferences/lgtv2/client-key
```

## Troubleshooting

- **`cannot reach daemon: ENOENT`** from the client → daemon isn't running. Check
  `daemon.log` and `launchctl print gui/$(id -u)/com.lgtv-volume`.
- **Pairing prompt never appears** → wrong `tvIp`, TV network control disabled,
  or the TV in standby (it answers ping but closes port 3000 until fully on).
  Confirm with `nc -z <tvIp> 3000`.
- **Volume keys do nothing** → Hammerspoon lacks Accessibility permission, or
  config not reloaded. Try the F11/F12 fallback.
- **Menubar shows `TV ✕`** → daemon down or TV off; run `bash healthcheck.sh`.

## License

MIT — see `LICENSE` (add one before publishing if you want it explicit).
