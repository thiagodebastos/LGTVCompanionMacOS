import * as net from 'net';
import * as fs from 'fs';
import { loadConfig, CONTROL_SOCKET } from './config';
import { TvController, log } from './tv';

/*
 * Long-lived daemon:
 *  - opens ONE persistent WebSocket to the TV (TvController) and keeps it warm,
 *  - listens on a Unix domain socket for one-line commands from the trigger client.
 *
 * Protocol (newline-delimited, one request per connection):
 *   client writes:  "volume-up\n" | "volume-down\n" | "mute-toggle\n" | "get-volume\n"
 *   daemon writes:  '{"ok":true,"volume":13,"muted":false}\n'  then closes
 *                or '{"ok":false,"error":"tv-disconnected"}\n'
 */

const VALID = new Set(['volume-up', 'volume-down', 'mute-toggle', 'get-volume', 'ping']);

function main(): void {
  const config = loadConfig();
  const tv = new TvController(config.tvIp, config.volumeStep);

  // Stale socket file from a previous run (e.g. hard kill) blocks listen(); remove it.
  try {
    fs.unlinkSync(CONTROL_SOCKET);
  } catch {
    /* not there — fine */
  }

  const server = net.createServer((conn) => {
    conn.setEncoding('utf8');
    let buf = '';

    conn.on('data', (chunk: string) => {
      buf += chunk;
      const nl = buf.indexOf('\n');
      if (nl === -1) return; // wait for full line
      const cmd = buf.slice(0, nl).trim();
      handle(tv, cmd)
        .then((payload) => respond(conn, payload))
        .catch((err: Error) => respond(conn, { ok: false, error: err.message }));
    });

    conn.on('error', () => {
      /* client vanished mid-write; nothing to do */
    });
  });

  server.on('error', (err) => {
    log(`control-socket server error: ${err.message}`);
    process.exit(1);
  });

  server.listen(CONTROL_SOCKET, () => {
    fs.chmodSync(CONTROL_SOCKET, 0o600); // owner-only
    log(`daemon up. control socket: ${CONTROL_SOCKET}`);
  });

  const shutdown = () => {
    try {
      server.close();
      fs.unlinkSync(CONTROL_SOCKET);
    } catch {
      /* ignore */
    }
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

async function handle(tv: TvController, cmd: string): Promise<Record<string, unknown>> {
  if (!VALID.has(cmd)) throw new Error(`unknown-command:${cmd}`);
  // ping answers even when the TV is off, so the watchdog can tell "daemon
  // wedged" (no reply) apart from "TV powered off" (reply, tvConnected:false).
  if (cmd === 'ping') return { ok: true, pong: true, tvConnected: tv.isConnected() };
  let state;
  switch (cmd) {
    case 'volume-up':
      state = await tv.volumeUp();
      break;
    case 'volume-down':
      state = await tv.volumeDown();
      break;
    case 'mute-toggle':
      state = await tv.muteToggle();
      break;
    case 'get-volume':
    default:
      state = await tv.getVolume();
      break;
  }
  return { ok: true, ...state };
}

function respond(conn: net.Socket, payload: Record<string, unknown>): void {
  try {
    conn.write(JSON.stringify(payload) + '\n');
  } catch {
    /* ignore */
  }
  conn.end();
}

main();
