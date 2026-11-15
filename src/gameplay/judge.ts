// Lógica de juicio pura (sin DOM) para poder probarla con tests unitarios.
export type Rating = 'sick' | 'good' | 'bad' | 'shit';

/** Ventanas de tiempo (ms) inspiradas en Psych Engine */
export const WINDOWS: Record<Rating, number> = { sick: 45, good: 90, bad: 135, shit: 166 };
export const HIT_WINDOW = WINDOWS.shit;

export const SCORE: Record<Rating, number> = { sick: 350, good: 200, bad: 100, shit: 50 };
export const ACC: Record<Rating, number> = { sick: 1, good: 0.67, bad: 0.34, shit: 0 };

export function judge(deltaMs: number): Rating {
  const d = Math.abs(deltaMs);
  if (d <= WINDOWS.sick) return 'sick';
  if (d <= WINDOWS.good) return 'good';
  if (d <= WINDOWS.bad) return 'bad';
  return 'shit';
}

export interface Tally { sick: number; good: number; bad: number; shit: number; miss: number; score: number; combo: number; maxCombo: number; accSum: number; judged: number }

export function newTally(): Tally {
  return { sick: 0, good: 0, bad: 0, shit: 0, miss: 0, score: 0, combo: 0, maxCombo: 0, accSum: 0, judged: 0 };
}

export function applyHit(t: Tally, r: Rating) {
  t[r]++; t.score += SCORE[r]; t.combo++; if (t.combo > t.maxCombo) t.maxCombo = t.combo;
  t.accSum += ACC[r]; t.judged++;
}

export function applyMiss(t: Tally) { t.miss++; t.score -= 10; t.combo = 0; t.judged++; }

export function accuracy(t: Tally): number { return t.judged ? (t.accSum / t.judged) * 100 : 100; }

export function grade(t: Tally): string {
  if (!t.judged) return '?';
  const a = accuracy(t);
  const fc = t.miss === 0 ? (t.bad + t.shit === 0 ? (t.good === 0 ? ' (SFC)' : ' (GFC)') : ' (FC)') : '';
  const g = a >= 99 ? 'S+' : a >= 95 ? 'S' : a >= 90 ? 'A' : a >= 80 ? 'B' : a >= 70 ? 'C' : a >= 60 ? 'D' : 'F';
  return g + fc;
}

/**
 * Busca la nota a golpear: la más temprana del carril dentro de la ventana.
 * notes debe estar ordenado por tiempo; start = primer índice que aún puede estar pendiente.
 */
export function findHittable(notes: { t: number; lane: number; player: boolean; state: number }[], start: number, lane: number, songT: number): number {
  for (let i = start; i < notes.length; i++) {
    const n = notes[i];
    if (n.t > songT + HIT_WINDOW) break;
    if (!n.player || n.lane !== lane || n.state !== 0) continue;
    if (n.t >= songT - HIT_WINDOW) return i;
  }
  return -1;
}
