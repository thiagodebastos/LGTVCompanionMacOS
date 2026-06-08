import lgtv2 = require('lgtv2');
import { keyFilePath } from './config';

export interface VolumeState {
  volume: number | null;
  muted: boolean | null;
}

/**
 * Normalize an audio/getVolume response across webOS variants.
 * Newer TVs (e.g. CX) nest under `volumeStatus` with `muteStatus`; older ones
 * return flat `volume`/`muted`. Returns nulls for fields the TV didn't send.
 */
function parseVolume(res: any): VolumeState {
  const vs = res && res.volumeStatus ? res.volumeStatus : res || {};
  const volume = typeof vs.volume === 'number' ? vs.volume : null;
  const muted =
    typeof vs.muteStatus === 'boolean'
      ? vs.muteStatus
      : typeof vs.muted === 'boolean'
        ? vs.muted
        : typeof res?.muted === 'boolean'
          ? res.muted
          : null;
  return { volume, muted };
}

/**
 * Holds ONE persistent WebSocket to the TV and keeps it warm.
 * - lgtv2 reconnects on its own (reconnect interval below); we just re-subscribe
 *   on every (re)connect and keep a live cache of volume/mute so reads are instant.
 * - Commands reject fast with 'tv-disconnected' when the socket is down (TV off),
 *   instead of hanging — the trigger client treats that as a no-op.
 */
export class TvController {
  private client: lgtv2.Lgtv2Client;
  private connected = false;
  private state: VolumeState = { volume: null, muted: null };
  private readonly step: number;

  constructor(tvIp: string, volumeStep: number) {
    this.step = volumeStep;
    this.client = lgtv2({
      url: `ws://${tvIp}:3000`,
      reconnect: 5000, // retry every 5s after the TV drops/powers off
      keyFile: keyFilePath(),
    });

    this.client.on('connecting', () => log(`connecting to ws://${tvIp}:3000 ...`));

    this.client.on('prompt', () => {
      log('TV is showing a pairing prompt — accept it on the TV with the remote.');
      log('(Only needed once; the client-key is then saved and replayed.)');
    });

    this.client.on('connect', () => {
      this.connected = true;
      log('connected to TV.');
      // Live subscription keeps volume/mute cache fresh, including changes made
      // from the TV remote, so get-volume and mute-toggle are always accurate.
      this.client.subscribe('ssap://audio/getVolume', (err, res) => {
        if (err) {
          log(`volume subscription error: ${err.message}`);
          return;
        }
        const parsed = parseVolume(res);
        if (parsed.volume !== null) this.state.volume = parsed.volume;
        if (parsed.muted !== null) this.state.muted = parsed.muted;
      });
    });

    this.client.on('close', () => {
      this.connected = false;
      this.state = { volume: null, muted: null };
      log('connection closed (TV off or network drop) — will auto-reconnect.');
    });

    this.client.on('error', (err) => {
      // Errors are normal while the TV is off; lgtv2 keeps retrying. Just log.
      this.connected = false;
      log(`socket error: ${err.message}`);
    });
  }

  isConnected(): boolean {
    return this.connected;
  }

  private require(): void {
    if (!this.connected) throw new Error('tv-disconnected');
  }

  private send(uri: string, payload?: Record<string, unknown>): Promise<any> {
    this.require();
    return new Promise((resolve, reject) => {
      const cb = (err: Error | null, res: any) => (err ? reject(err) : resolve(res));
      if (payload) this.client.request(uri, payload, cb);
      else this.client.request(uri, cb);
    });
  }

  async volumeUp(): Promise<VolumeState> {
    await this.send('ssap://audio/volumeUp');
    if (this.state.volume !== null) this.state.volume += this.step; // optimistic; subscription corrects it
    return { ...this.state };
  }

  async volumeDown(): Promise<VolumeState> {
    await this.send('ssap://audio/volumeDown');
    if (this.state.volume !== null) this.state.volume -= this.step;
    return { ...this.state };
  }

  async muteToggle(): Promise<VolumeState> {
    this.require();
    // Use cached mute state; refresh from the TV only if we don't have it yet.
    if (this.state.muted === null) {
      const parsed = parseVolume(await this.send('ssap://audio/getVolume'));
      this.state.muted = parsed.muted ?? false;
      if (parsed.volume !== null) this.state.volume = parsed.volume;
    }
    const next = !this.state.muted;
    await this.send('ssap://audio/setMute', { mute: next });
    this.state.muted = next;
    return { ...this.state };
  }

  async getVolume(): Promise<VolumeState> {
    this.require();
    // Return the live cache instantly. If empty (just connected), fetch once.
    if (this.state.volume === null) {
      const parsed = parseVolume(await this.send('ssap://audio/getVolume'));
      this.state.volume = parsed.volume;
      this.state.muted = parsed.muted;
    }
    return { ...this.state };
  }
}

export function log(msg: string): void {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}
