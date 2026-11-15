import type { InternalChart, ModFormat } from '../core/types';
import { Diag } from '../core/diagnostics';
import { getAdapter } from '../adapters/index';

let worker: Worker | null = null;
let seq = 0;
const pending = new Map<number, { res: (c: InternalChart) => void; rej: (e: Error) => void }>();

function getWorker(): Worker | null {
  if (worker) return worker;
  try {
    worker = new Worker(new URL('./chart-worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = (ev) => {
      const p = pending.get(ev.data.id);
      if (!p) return;
      pending.delete(ev.data.id);
      if (ev.data.ok) { Diag.recordLoad('chart (worker)', ev.data.ms); p.res(ev.data.chart); }
      else p.rej(new Error(ev.data.error));
    };
    worker.onerror = () => { worker = null; };
  } catch {
    worker = null;
  }
  return worker;
}

/** Convierte un chart en el worker; si los workers no están disponibles, lo hace en el hilo principal. */
export async function convertChart(format: ModFormat, song: string, diff: string, files: Record<string, Blob | null>): Promise<InternalChart> {
  const w = getWorker();
  if (w) {
    const id = ++seq;
    return new Promise((res, rej) => {
      pending.set(id, { res, rej });
      w.postMessage({ id, format, song, diff, files });
    });
  }
  const parsed: Record<string, any> = {};
  for (const [k, b] of Object.entries(files)) parsed[k] = b ? JSON.parse(await b.text()) : null;
  return getAdapter(format).parseChart(parsed, song, diff);
}
