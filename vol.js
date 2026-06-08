#!/usr/bin/env node
/*
 * vol.js — minimal proof-of-concept for LG webOS volume control.
 *
 * Purpose: confirm pairing + volume control work BEFORE building the daemon.
 * This spawns a fresh connection every run (slow, ~hundreds of ms) — that is
 * exactly the latency the daemon exists to avoid. Use this only for setup.
 *
 * Usage:
 *   node vol.js up        # volume up one step
 *   node vol.js down      # volume down one step
 *   node vol.js mute      # toggle mute (reads current state first)
 *   node vol.js get       # print current volume + mute state
 *   node vol.js set 20    # set absolute volume 0-100
 *
 * First run pops a pairing prompt ON THE TV — accept it with the TV remote.
 * The returned client-key is written to the keyFile below and reused forever,
 * and the daemon points at the SAME keyFile so you only ever pair once.
 *
 * Reads the TV IP from config.json (same value the daemon uses), or override
 * with the LGTV_IP env var.
 */

const os = require('os');
const path = require('path');
const fs = require('fs');

function ipFromConfig() {
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));
    return cfg.tvIp;
  } catch {
    return undefined;
  }
}

const TV_IP = process.env.LGTV_IP || ipFromConfig() || '[TV_IP_HERE]';

// Shared keyfile location — the daemon reads the same path so pairing carries over.
const keyDir = path.join(os.homedir(), 'Library', 'Preferences', 'lgtv2');
fs.mkdirSync(keyDir, { recursive: true });
const keyFile = path.join(keyDir, 'client-key');

if (TV_IP === '[TV_IP_HERE]') {
  console.error('Set the TV IP first: set "tvIp" in config.json, or run with LGTV_IP=192.168.x.y node vol.js get');
  process.exit(2);
}

const [, , cmd, arg] = process.argv;
if (!cmd) {
  console.error('Usage: node vol.js <up|down|mute|get|set> [value]');
  process.exit(2);
}

const lgtv = require('lgtv2')({
  url: `ws://${TV_IP}:3000`,
  reconnect: false, // one-shot tool; the daemon is the one that keeps reconnecting
  keyFile,
});

lgtv.on('prompt', () => {
  console.log('>>> Pairing prompt shown on the TV. Accept it with the remote. <<<');
});

lgtv.on('error', (err) => {
  console.error('Connection error:', err && err.message ? err.message : err);
  process.exit(1);
});

function done(err, res) {
  if (err) {
    console.error('Request failed:', err);
    lgtv.disconnect();
    process.exit(1);
  }
  if (res) console.log(JSON.stringify(res));
  lgtv.disconnect();
  process.exit(0);
}

lgtv.on('connect', () => {
  switch (cmd) {
    case 'up':
      lgtv.request('ssap://audio/volumeUp', done);
      break;
    case 'down':
      lgtv.request('ssap://audio/volumeDown', done);
      break;
    case 'get':
      lgtv.request('ssap://audio/getVolume', done);
      break;
    case 'set': {
      const volume = parseInt(arg, 10);
      if (Number.isNaN(volume)) return done(new Error('set needs a number 0-100'));
      lgtv.request('ssap://audio/setVolume', { volume }, done);
      break;
    }
    case 'mute':
      // Toggle: read current mute state, then flip it.
      lgtv.request('ssap://audio/getVolume', (err, res) => {
        if (err) return done(err);
        const next = !res.muted;
        lgtv.request('ssap://audio/setMute', { mute: next }, (e) => {
          if (e) return done(e);
          console.log(JSON.stringify({ muted: next }));
          lgtv.disconnect();
          process.exit(0);
        });
      });
      break;
    default:
      console.error(`Unknown command: ${cmd}`);
      lgtv.disconnect();
      process.exit(2);
  }
});
