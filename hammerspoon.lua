-- ===========================================================================
-- LG TV volume control — Hammerspoon binding
-- ===========================================================================
-- Append this to ~/.hammerspoon/init.lua (or `dofile` it from there), then
-- reload Hammerspoon's config.
--
-- It captures the real keyboard volume HID events (Sound Up / Sound Down /
-- Mute) via hs.eventtap and forwards them to the daemon's trigger client.
-- When the Mac is outputting audio over HDMI, macOS ignores these keys for
-- system volume, so we swallow the event (return true) and drive the TV instead.
--
-- NOTE: hs.eventtap requires Accessibility permission. Grant it under
--   System Settings > Privacy & Security > Accessibility  -> enable Hammerspoon.
-- Without it the eventtap silently won't fire; use the F11/F12 fallback below.
-- ===========================================================================

-- node path is auto-detected via your login shell; override here if needed.
local NODE = (hs.execute("command -v node", true) or ""):gsub("%s+$", "")
if NODE == "" then NODE = "/opt/homebrew/bin/node" end

-- CLIENT is resolved relative to THIS file (works when you `dofile` it). If you
-- paste this into init.lua instead of dofile-ing, set CLIENT explicitly below.
local selfDir = (debug.getinfo(1, "S").source:sub(2)):match("(.*/)")
local CLIENT = (selfDir or (os.getenv("HOME") .. "/")) .. "dist/client.js"
-- local CLIENT = os.getenv("HOME") .. "/path/to/lgtv-volume/dist/client.js"

-- ---------------------------------------------------------------------------
-- Menubar volume readout. Shows current TV volume / mute / unavailable.
-- ---------------------------------------------------------------------------
local menu = hs.menubar.new()
if menu then menu:setTitle("TV …") end

local function setMenu(out)
  if not menu then return end
  local ok, data = pcall(hs.json.decode, out or "")
  if ok and data and data.ok and data.volume ~= nil then
    menu:setTitle(data.muted and "TV 🔇" or ("TV " .. tostring(data.volume)))
  else
    menu:setTitle("TV ✕") -- daemon down or TV off
  end
end

-- Ask the daemon for current volume and update the menubar (async).
local function refreshMenu()
  hs.task.new(NODE, function(_, out) setMenu(out) end, { CLIENT, "get-volume" }):start()
end

-- Fire a command at the daemon, non-blocking, then refresh the readout.
local function tv(cmd)
  hs.task.new(NODE, function() refreshMenu() end, { CLIENT, cmd }):start()
end

-- Poll periodically so changes made from the TV remote show up too.
-- (global, not local, so the timer isn't garbage-collected)
lgtvMenuTimer = hs.timer.doEvery(3, refreshMenu)
refreshMenu()

-- ---------------------------------------------------------------------------
-- Primary path: intercept the real volume HID keys (systemDefined events).
-- ---------------------------------------------------------------------------
local volumeTap = hs.eventtap.new({ hs.eventtap.event.types.systemDefined }, function(event)
  local d = event:systemKey()
  if not d or not d.down then
    return false -- only act on key-down (and key-repeat); pass everything else
  end

  if d.key == "SOUND_UP" then
    tv("volume-up")
    return true -- swallow so macOS doesn't show its disabled-volume HUD
  elseif d.key == "SOUND_DOWN" then
    tv("volume-down")
    return true
  elseif d.key == "MUTE" then
    -- Only toggle on the initial press, not on auto-repeat.
    if not d.repeated then tv("mute-toggle") end
    return true
  end

  return false
end)
volumeTap:start()

-- ---------------------------------------------------------------------------
-- Fallback: if eventtap proves unreliable (no Accessibility perm, keyboard
-- quirks), comment out volumeTap:start() above and use these hotkeys instead.
-- ---------------------------------------------------------------------------
-- hs.hotkey.bind({}, "F12", function() tv("volume-up") end,   nil, function() tv("volume-up") end)
-- hs.hotkey.bind({}, "F11", function() tv("volume-down") end, nil, function() tv("volume-down") end)
-- hs.hotkey.bind({}, "F10", function() tv("mute-toggle") end)

hs.alert.show("LG TV volume control loaded")
