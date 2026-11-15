// Worker: parsea y convierte charts fuera del hilo principal (charts grandes pueden pesar varios MB).
import { getAdapter } from '../adapters/index';
import type { ModFormat } from '../core/types';

interface Req { id: number; format: ModFormat; song: string; diff: string; files: Record<string, Blob | null> }

function parseLoose(text: string): any {
  try { return JSON.parse(text); } catch { return JSON.parse(text.slice(0, text.lastIndexOf('}') + 1)); }
}

self.onmessage = async (ev: MessageEvent<Req>) => {
  const { id, format, song, diff, files } = ev.data;
  try {
    const t0 = performance.now();
    const parsed: Record<string, any> = {};
    for (const [k, b] of Object.entries(files)) parsed[k] = b ? parseLoose(await b.text()) : null;
    const chart = getAdapter(format).parseChart(parsed, song, diff);
    (self as unknown as Worker).postMessage({ id, ok: true, chart, ms: performance.now() - t0 });
  } catch (e) {
    (self as unknown as Worker).postMessage({ id, ok: false, error: e instanceof Error ? e.message : String(e) });
  }
};
