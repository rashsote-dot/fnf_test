import type { ChartEvent, ChartNote, InternalChart, TimeChange } from '../core/types';

export function num(v: unknown, def = 0): number {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
  return Number.isFinite(n) ? n : def;
}

export function str(v: unknown, def = ''): string {
  return v === undefined || v === null ? def : String(v);
}

/** Orden estable y limpieza: elimina duplicados exactos (mismo tiempo/carril/lado), muy comunes en charts antiguos. */
export function finalizeChart(chart: InternalChart): InternalChart {
  chart.notes.sort((a, b) => a.t - b.t || a.lane - b.lane);
  const out: ChartNote[] = [];
  let dupes = 0;
  for (const n of chart.notes) {
    const prev = out.length ? out[out.length - 1] : null;
    // busca hacia atrás notas en el mismo instante
    let dup = false;
    for (let i = out.length - 1; i >= 0 && out[i].t > n.t - 2; i--) {
      const p = out[i];
      if (p.lane === n.lane && p.player === n.player && Math.abs(p.t - n.t) < 2) { dup = true; break; }
    }
    if (dup) { dupes++; continue; }
    void prev;
    out.push(n);
  }
  if (dupes > 0) chart.warnings.push(`Se eliminaron ${dupes} notas duplicadas (stacked notes).`);
  chart.notes = out;
  chart.events.sort((a, b) => a.t - b.t);
  if (!chart.timeChanges.length) chart.timeChanges = [{ t: 0, bpm: chart.bpm }];
  chart.timeChanges.sort((a, b) => a.t - b.t);
  return chart;
}

/** Convierte un tiempo en ms a beat (fraccional) respetando cambios de BPM */
export function timeToBeat(t: number, changes: TimeChange[]): number {
  let beat = 0;
  let lastT = 0;
  let bpm = changes[0]?.bpm ?? 120;
  for (let i = 0; i < changes.length; i++) {
    const c = changes[i];
    if (c.t > t) break;
    beat += ((c.t - lastT) * bpm) / 60000;
    lastT = c.t;
    bpm = c.bpm;
  }
  return beat + ((t - lastT) * bpm) / 60000;
}

export function beatToTime(beat: number, changes: TimeChange[]): number {
  let accBeat = 0;
  let lastT = 0;
  let bpm = changes[0]?.bpm ?? 120;
  for (let i = 1; i < changes.length; i++) {
    const c = changes[i];
    const beatsUntil = ((c.t - lastT) * bpm) / 60000;
    if (accBeat + beatsUntil > beat) break;
    accBeat += beatsUntil;
    lastT = c.t;
    bpm = c.bpm;
  }
  return lastT + ((beat - accBeat) * 60000) / bpm;
}

export function slotFromName(v: unknown): 'bf' | 'dad' | 'gf' {
  const s = str(v).toLowerCase().trim();
  if (s === '0' || s === 'bf' || s === 'boyfriend' || s === 'player' || s === 'player1') return 'bf';
  if (s === '2' || s === 'gf' || s === 'girlfriend' || s === 'player3') return 'gf';
  return 'dad';
}

export function normalizeKind(k: unknown): string {
  const s = str(k).toLowerCase().trim();
  if (!s || s === 'normal' || s === 'default' || s === '0') return '';
  if (s.includes('hurt') || s === 'mine' || s.includes('poison')) return 'hurt';
  if (s.includes('alt')) return 'alt';
  if (s.includes('no anim')) return 'noanim';
  if (s.includes('gf sing')) return 'gf';
  return s;
}

/** Eventos estándar de Psych Engine → eventos internos. Devuelve null si no está soportado. */
export function mapPsychEvent(t: number, name: string, v1: string, v2: string): ChartEvent | null {
  const n = name.trim();
  switch (n) {
    case 'Hey!':
      return { t, name: 'hey', v: { target: v1.trim() === '' ? 'both' : slotFromName(v1), dur: num(v2, 0.6) * 1000 } };
    case 'Add Camera Zoom':
      return { t, name: 'camZoom', v: { add: num(v1, 0.015), hud: num(v2, 0.03) } };
    case 'Play Animation':
      return { t, name: 'playAnim', v: { anim: v1.trim(), target: slotFromName(v2 || 'dad') } };
    case 'Camera Follow Pos':
      if (v1.trim() === '' && v2.trim() === '') return { t, name: 'camPos', v: { reset: true } };
      return { t, name: 'camPos', v: { x: num(v1), y: num(v2) } };
    case 'Change Character':
      return { t, name: 'changeChar', v: { target: slotFromName(v1), char: v2.trim() } };
    case 'Screen Shake': {
      const [d, i] = v1.split(',').map((s) => num(s));
      return { t, name: 'shake', v: { dur: (d || 0.2) * 1000, intensity: i || 0.01 } };
    }
    case 'Change Scroll Speed':
      return { t, name: 'scrollSpeed', v: { mult: num(v1, 1), dur: num(v2, 1) * 1000 } };
    case 'Set GF Speed':
      return { t, name: 'gfSpeed', v: { speed: num(v1, 1) } };
    case 'Set Cam Zoom':
      return { t, name: 'camZoomSet', v: { zoom: num(v1, 1), dur: num(v2, 0) * 1000, ease: v2.includes(',') ? v2.split(',')[1].trim() : 'sineinout' } };
    default:
      return null;
  }
}
