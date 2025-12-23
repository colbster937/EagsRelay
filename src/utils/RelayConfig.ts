import { promises as fs } from 'fs';
import * as path from 'path';
import { RelayVersion } from './RelayVersion';
import { IncomingMessage } from 'http';
import { RelayServer, RelayType } from '../pkt/RelayPacket01ICEServers';

const CONFIG_DEFAULT = {
  debug: false,
  server: {
    comment: RelayVersion.DEFAULT_COMMENT,
    show_local_worlds: true,
    ip_forwarding: {
      enabled: false,
      headers: ['CF-Connecting-IP', 'X-Real-IP']
    },
    origin_whitelist: {
      enabled: false,
      hostnames: ['example.com']
    }
  },
  join_code: 'eags',
  relays: [
    {
      type: 'stun',
      address: 'stun.l.google.com:19302'
    },
    {
      type: 'stun',
      address: 'stun1.l.google.com:19302'
    },
    {
      type: 'stun',
      address: 'stun2.l.google.com:19302'
    },
    {
      type: 'stun',
      address: 'stun3.l.google.com:19302'
    },
    {
      type: 'stun',
      address: 'stun4.l.google.com:19302'
    }
  ],
  limits: {
    worlds_per_ip: 32,
    world_ratelimit: {
      enabled: true,
      period: 192,
      limit: 32,
      lockout_limit: 48,
      lockout_time: 600
    },
    ping_ratelimit: {
      enabled: true,
      period: 256,
      limit: 128,
      lockout_limit: 192,
      lockout_time: 300
    }
  }
};

type Json = string | number | boolean | null | Json[] | { [k: string]: Json; };

export class RelayConfig {
  private static CONFIG: any = {};

  private static merge<T extends Json>(a: T, b?: Partial<T>): T {
    if (b === undefined) return a;
    if (Array.isArray(a)) return (b as any ?? a) as T;
    if (a !== null && typeof a === 'object' && !Array.isArray(a)) {
      const o: any = { ...(a as any) };
      if (b && typeof b === 'object' && !Array.isArray(b)) {
        for (const k of Object.keys(b)) {
          const av = (a as any)[k]; const bv = (b as any)[k];
          o[k] = (av && typeof av === 'object' && !Array.isArray(av) && bv && typeof bv === 'object' && !Array.isArray(bv))
            ? RelayConfig.merge(av, bv)
            : (bv === undefined ? av : bv);
        }
      }
      return o;
    }
    return (b as any) as T;
  }

  public static get (p: string): any {
    const find = (obj: any, path: string): any => {
      if (!path) return obj;
      return path.split('.').reduce((x, k) => (x == null ? undefined : x[k]), obj);
    };
    const v = find(this.CONFIG, p);
    return v === undefined ? find(CONFIG_DEFAULT, p) : v;
  }

  public static isDebug (): boolean {
    return Boolean(RelayConfig.get('debug'));
  }

  public static loadConfigJSON (j: any): void {
    this.CONFIG = this.merge(CONFIG_DEFAULT as any, j);
  }

  public static async loadConfigFile (fp: string): Promise<void> {
    let j: any;
    try {
      j = JSON.parse(await fs.readFile(fp, 'utf8'));
    } catch {
      j = undefined;
    }
    this.loadConfigJSON(j);
    try {
      await fs.mkdir(path.dirname(fp), { recursive: true });
    } catch {}
    await fs.writeFile(fp, JSON.stringify(this.CONFIG, null, 2) + '\n', 'utf8');
  }

  public static getRelayServers (): RelayServer[] {
    const arr: RelayServer[] = [];
    for (const server of (this.get('relays') as any[])) arr.push(new RelayServer(server.address, server.type === 'stun' ? RelayType.NO_PASSWD : RelayType.PASSWD, server.type, server.username ?? '', server.password ?? ''));
    return arr;
  }

  public static generateCode (): string {
    return this.get('join_code') as string;
  }

  public static getRealIP (req: IncomingMessage): string {
    if (this.get('server.ip_forwarding.enabled')) {
      for (const header of this.get('server.ip_forwarding.headers') as string[]) {
        const rHeader: any = req.headers[header];
        if (rHeader !== undefined) return rHeader;
      }
    }
    return req.socket.remoteAddress ?? '127.0.0.1';
  }

  public static isOriginAllowed (input: string): boolean {
    if (!this.get('server.origin_whitelist.enabled')) {
      return true;
    } else {
      const iURL: URL = new URL(input);
      for (const hostname of this.get('server.origin_whitelist.hostnames') as string[]) {
        const hURL: URL = new URL(hostname);
        if (hURL.hostname === iURL.hostname) return true;
      }
      return false;
    }
  }
}
