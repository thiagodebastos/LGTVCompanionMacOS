import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';

export interface Config {
  tvIp: string;
  volumeStep: number;
}

// config.json sits at the project root, one level up from dist/.
const configPath = path.join(__dirname, '..', 'config.json');

export function loadConfig(): Config {
  const raw = JSON.parse(fs.readFileSync(configPath, 'utf8')) as Partial<Config>;
  if (!raw.tvIp || raw.tvIp === '[TV_IP_HERE]') {
    throw new Error(`Set tvIp in ${configPath} to the TV's LAN IP address.`);
  }
  return { tvIp: raw.tvIp, volumeStep: raw.volumeStep ?? 1 };
}

// Unix domain socket the daemon listens on and the client connects to.
// Per-user temp dir, so it is private to this account.
export const CONTROL_SOCKET = path.join(os.tmpdir(), 'lgtv-volume.sock');

// Shared client-key file — same path vol.js uses, so pairing is done once.
const keyDir = path.join(os.homedir(), 'Library', 'Preferences', 'lgtv2');
export function keyFilePath(): string {
  fs.mkdirSync(keyDir, { recursive: true });
  return path.join(keyDir, 'client-key');
}
