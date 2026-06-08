import * as net from 'net';
import { CONTROL_SOCKET } from './config';

/*
 * Thin trigger client. Hammerspoon runs this on each volume keypress.
 * It connects to the daemon's Unix socket, sends one command, prints the
 * reply, and exits. Kept deliberately tiny so per-keypress cost is just
 * "connect to a local socket" — the warm WebSocket lives in the daemon.
 *
 * Usage: node dist/client.js <volume-up|volume-down|mute-toggle|get-volume>
 * Exit codes: 0 ok, 1 daemon/TV unavailable or error, 2 bad usage.
 */

const cmd = process.argv[2];
const VALID = ['volume-up', 'volume-down', 'mute-toggle', 'get-volume', 'ping'];

if (!cmd || !VALID.includes(cmd)) {
  console.error(`usage: client <${VALID.join('|')}>`);
  process.exit(2);
}

const sock = net.connect(CONTROL_SOCKET);
let buf = '';

// Don't let a wedged daemon hang the keypress.
sock.setTimeout(2000, () => {
  console.error('timeout talking to daemon');
  sock.destroy();
  process.exit(1);
});

sock.on('connect', () => sock.write(cmd + '\n'));
sock.setEncoding('utf8');
sock.on('data', (d: string) => {
  buf += d;
});

sock.on('end', () => {
  const line = buf.trim();
  if (line) process.stdout.write(line + '\n');
  try {
    const res = JSON.parse(line);
    process.exit(res.ok ? 0 : 1);
  } catch {
    process.exit(1);
  }
});

sock.on('error', (err: NodeJS.ErrnoException) => {
  // ENOENT/ECONNREFUSED => daemon not running.
  console.error(`cannot reach daemon: ${err.code || err.message}`);
  process.exit(1);
});
