// Minimal ambient types for hobbyquaker/lgtv2 (ships no types).
// Function + merged namespace so `import lgtv2 = require('lgtv2')` exposes both
// the callable value and the lgtv2.* types.
declare module 'lgtv2' {
  function lgtv2(options: lgtv2.Lgtv2Options): lgtv2.Lgtv2Client;

  namespace lgtv2 {
    interface Lgtv2Options {
      url: string;
      timeout?: number;
      reconnect?: number | false;
      keyFile?: string;
      clientKey?: string;
      saveKey?: (key: string, cb: (err?: Error) => void) => void;
      wsconfig?: Record<string, unknown>;
    }

    type RequestCb = (err: Error | null, res: any) => void;

    interface Lgtv2Client {
      on(event: 'connect' | 'connecting' | 'close' | 'prompt', cb: (...args: any[]) => void): void;
      on(event: 'error', cb: (err: Error) => void): void;
      on(event: 'message', cb: (msg: any) => void): void;
      request(uri: string, cb?: RequestCb): void;
      request(uri: string, payload: Record<string, unknown>, cb?: RequestCb): void;
      subscribe(uri: string, cb: RequestCb): void;
      disconnect(): void;
    }
  }

  export = lgtv2;
}
