// Sintetizador de música ORIGINAL + generador de charts sincronizados.
// La música y los charts salen de la misma partitura, así que encajan al milisegundo.
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export const SR = 44100;

export function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}

const PENTA = [0, 3, 5, 7, 10, 12, 15, 17, 19, 22, 24];
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

// patrones rítmicos de un compás en semicorcheas (valor = duración de la nota, 0 = continuación/silencio)
const PATTERNS = [
  [2, 0, 2, 0, 1, 1, 2, 0, 2, 0, 2, 0, 4, 0, 0, 0],
  [2, 0, 1, 1, 2, 0, 2, 0, 4, 0, 0, 0, 2, 0, 2, 0],
  [4, 0, 0, 0, 2, 0, 2, 0, 1, 1, 2, 0, 2, 0, 2, 0],
  [2, 0, 2, 0, 2, 0, 2, 0, 8, 0, 0, 0, 0, 0, 0, 0],
  [1, 1, 2, 0, 1, 1, 2, 0, 2, 0, 2, 0, 2, 0, 0, 0],
  [3, 0, 0, 1, 2, 0, 2, 0, 3, 0, 0, 1, 4, 0, 0, 0],
  [2, 0, 0, 0, 2, 0, 2, 0, 2, 0, 1, 1, 2, 0, 2, 0],
];
const STRESS = [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1];

/**
 * spec: { bpm, seed, root, intro, phrases, phraseBars, outro, style: 'pop'|'synth'|'dark'|'stress', duet? }
 * Devuelve la partitura: notas de voz con beat, duración, grado y quién canta.
 */
export function compose(spec) {
  const r = rng(spec.seed);
  const pb = spec.phraseBars ?? 4;
  const notes = [];
  const sections = [];
  let bar = spec.intro ?? 2;
  const phrase = () => {
    const out = [];
    let deg = 3 + Math.floor(r() * 3);
    for (let b = 0; b < pb; b++) {
      const pat = spec.style === 'stress' ? STRESS : PATTERNS[Math.floor(r() * PATTERNS.length)];
      for (let s = 0; s < 16; s++) {
        const len = pat[s];
        if (!len) continue;
        if (spec.style !== 'stress' || r() < 0.85) {
          deg = Math.max(0, Math.min(PENTA.length - 2, deg + Math.floor(r() * 5) - 2));
          const chord = spec.style === 'stress' && r() < 0.12;
          out.push({ beat: b * 4 + s / 4, dur: len / 4, deg, chord });
        }
      }
    }
    return out;
  };
  for (let p = 0; p < spec.phrases; p++) {
    const ph = phrase();
    const order = p % 2 === 0 || !spec.playerFirstOdd ? ['opp', 'player'] : ['player', 'opp'];
    for (const who of order) {
      sections.push({ beat: bar * 4, beats: pb * 4, who });
      // el jugador responde con una variación de la frase del oponente
      for (const n of ph) {
        const deg = who === 'player' && n.dur < 1 && r() < 0.35 ? Math.min(PENTA.length - 2, n.deg + 1) : n.deg;
        notes.push({ beat: bar * 4 + n.beat, dur: n.dur, deg, who, chord: n.chord });
      }
      bar += pb;
    }
  }
  const totalBars = bar + (spec.outro ?? 2);
  return { spec, notes, sections, totalBars };
}

/** mapa de tempo: cambios [{bar, bpm}] */
export function tempo(spec) {
  const changes = [{ beat: 0, bpm: spec.bpm }, ...(spec.bpmChanges ?? []).map((c) => ({ beat: c.bar * 4, bpm: c.bpm }))];
  const toMs = (beat) => {
    let t = 0;
    for (let i = 0; i < changes.length; i++) {
      const c = changes[i];
      const next = changes[i + 1];
      const end = next && next.beat < beat ? next.beat : beat;
      if (end > c.beat) t += ((end - c.beat) * 60000) / c.bpm;
      if (!next || next.beat >= beat) break;
    }
    return t;
  };
  return { changes, toMs };
}

// ---------------------------------------------------------------- síntesis
export function render(score) {
  const { spec, notes, totalBars } = score;
  const tm = tempo(spec);
  const totalMs = tm.toMs(totalBars * 4) + 1500;
  const N = Math.ceil((totalMs / 1000) * SR);
  const L = new Float32Array(N), R = new Float32Array(N);
  const vP = new Float32Array(N), vO = new Float32Array(N);
  const r = rng(spec.seed * 7 + 1);
  const root = spec.root ?? 57;
  const idx = (ms) => Math.floor((ms / 1000) * SR);
  const add = (buf, i, v) => { if (i >= 0 && i < N) buf[i] += v; };
  const prog = spec.style === 'dark' ? [0, 1, 8, 7] : spec.style === 'synth' ? [0, 8, 5, 10] : [0, 8, 3, 10];

  for (let bar = 0; bar < totalBars; bar++) {
    const chordRoot = root - 12 + prog[bar % 4];
    const intro = bar < (spec.intro ?? 2);
    const outro = bar >= totalBars - (spec.outro ?? 2);
    for (let s = 0; s < 16; s++) {
      const beat = bar * 4 + s / 4;
      const t0 = tm.toMs(beat);
      const i0 = idx(t0);
      const stepLen = tm.toMs(beat + 0.25) - t0;
      // bombo
      if (!outro && (s === 0 || s === 8 || (s === 10 && bar % 2 === 1) || (spec.style === 'stress' && s % 4 === 0))) {
        for (let k = 0; k < SR * 0.22; k++) {
          const t = k / SR, f = 50 + 110 * Math.exp(-t * 28);
          const v = Math.sin(2 * Math.PI * f * t - 0) * Math.exp(-t * 12) * 0.55;
          add(L, i0 + k, v); add(R, i0 + k, v);
        }
      }
      // caja
      if (!intro && !outro && (s === 4 || s === 12)) {
        for (let k = 0; k < SR * 0.18; k++) {
          const t = k / SR, e = Math.exp(-t * 22);
          const v = ((r() * 2 - 1) * 0.32 + Math.sin(2 * Math.PI * 190 * t) * 0.18) * e;
          add(L, i0 + k, v * 0.9); add(R, i0 + k, v);
        }
      }
      // charles
      if (!outro && (s % 2 === 0 || spec.style === 'stress' || spec.style === 'synth')) {
        let prev = 0;
        for (let k = 0; k < SR * 0.04; k++) {
          const t = k / SR, n = r() * 2 - 1, hp = n - prev; prev = n;
          const v = hp * Math.exp(-t * 90) * (s % 4 === 2 ? 0.12 : 0.07);
          add(L, i0 + k, v * 0.6); add(R, i0 + k, v);
        }
      }
      // bajo (corcheas)
      if (!outro && s % 2 === 0) {
        const m = chordRoot + (s % 8 === 6 ? 12 : 0);
        const f = mtof(m);
        let lp = 0;
        const len = Math.floor((stepLen * 2 * 0.9 * SR) / 1000);
        for (let k = 0; k < len; k++) {
          const t = k / SR;
          const saw = 2 * ((f * t) % 1) - 1;
          lp += (saw - lp) * 0.08;
          const v = lp * 0.26 * Math.min(1, k / 80) * Math.min(1, (len - k) / 200);
          add(L, i0 + k, v); add(R, i0 + k, v);
        }
      }
    }
    // acorde de fondo (un compás)
    const b0 = tm.toMs(bar * 4), b1 = tm.toMs(bar * 4 + 4);
    const i0 = idx(b0), len = idx(b1) - i0;
    const minor = spec.style === 'dark' || prog[bar % 4] === 0;
    const triad = [0, minor ? 3 : 4, 7].map((x) => mtof(chordRoot + 12 + x));
    for (let k = 0; k < len; k++) {
      const t = k / SR;
      let v = 0;
      for (const f of triad) { const ph = (f * t) % 1; v += (ph < 0.5 ? 4 * ph - 1 : 3 - 4 * ph); }
      const env = Math.min(1, k / (SR * 0.15)) * Math.min(1, (len - k) / (SR * 0.1));
      v *= 0.045 * env * (outro ? 1.6 : 1);
      add(L, i0 + k, v * 1.1); add(R, i0 + k, v * 0.9);
    }
  }

  // voces
  for (const n of notes) {
    const buf = n.who === 'player' ? vP : vO;
    const t0 = tm.toMs(n.beat), t1 = tm.toMs(n.beat + n.dur);
    const len = Math.floor(((t1 - t0) * 0.92 * SR) / 1000);
    const i0 = idx(t0);
    const m = root + 12 + PENTA[n.deg] + (n.who === 'opp' && spec.style === 'dark' ? -12 : 0);
    const freqs = n.chord ? [mtof(m), mtof(m + 7)] : [mtof(m)];
    let lp = 0, phase = 0;
    for (let k = 0; k < len; k++) {
      const t = k / SR;
      const vib = t > 0.12 ? 1 + 0.006 * Math.sin(2 * Math.PI * 5.5 * t) : 1;
      let v = 0;
      for (const f of freqs) {
        phase = (f * vib * t) % 1;
        v += n.who === 'player' ? (phase < 0.32 ? 1 : -1) : 2 * phase - 1;
      }
      lp += (v - lp) * (n.who === 'player' ? 0.18 : 0.12);
      const env = Math.min(1, k / (SR * 0.008)) * (k < SR * 0.06 ? 1 : 0.75 + 0.25 * Math.exp(-(t - 0.06) * 6)) * Math.min(1, (len - k) / (SR * 0.025));
      add(buf, i0 + k, lp * 0.17 * env);
    }
  }
  return { L, R, vP, vO, durationMs: totalMs };
}

function wav(path, chans) {
  const n = chans[0].length, c = chans.length;
  const b = Buffer.alloc(44 + n * c * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * c * 2, 4); b.write('WAVEfmt ', 8);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(c, 22); b.writeUInt32LE(SR, 24);
  b.writeUInt32LE(SR * c * 2, 28); b.writeUInt16LE(c * 2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * c * 2, 40);
  let o = 44;
  for (let i = 0; i < n; i++) for (let ch = 0; ch < c; ch++) { const v = Math.max(-1, Math.min(1, chans[ch][i])); b.writeInt16LE(Math.round(v * 32000), o); o += 2; }
  writeFileSync(path, b);
}

/** escribe .ogg (Vorbis) y .m4a (AAC, para Safari) */
export function encode(outNoExt, chans) {
  mkdirSync(dirname(outNoExt), { recursive: true });
  const tmp = outNoExt + '.tmp.wav';
  wav(tmp, chans);
  const mono = chans.length === 1;
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', tmp, '-c:a', 'libvorbis', '-q:a', mono ? '1' : '3', outNoExt + '.ogg']);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', tmp, '-c:a', 'aac', '-b:a', mono ? '64k' : '112k', outNoExt + '.m4a']);
  rmSync(tmp);
}

// ---------------------------------------------------------------- charts
/** convierte la partitura en notas de chart (ms) por dificultad */
export function chartNotes(score, diff, { hurt = false } = {}) {
  const tm = tempo(score.spec);
  const r = rng(score.spec.seed * 13 + diff.length);
  const out = [];
  const lastLane = { player: -1, opp: -1 };
  for (const n of score.notes) {
    const sixteenth = Math.round(n.beat * 4);
    if (diff === 'easy' && sixteenth % 4 !== 0) continue;
    if (diff === 'normal' && sixteenth % 2 !== 0) continue;
    const t = tm.toMs(n.beat);
    let lane = n.deg % 4;
    const len = n.dur >= 1 ? tm.toMs(n.beat + n.dur) - t - 40 : 0;
    out.push({ t: Math.round(t * 100) / 100, lane, len: Math.max(0, Math.round(len)), player: n.who === 'player', kind: '' });
    if (n.chord && diff === 'hard') out.push({ t: Math.round(t * 100) / 100, lane: (lane + 2) % 4, len: 0, player: n.who === 'player', kind: '' });
    lastLane[n.who] = lane;
  }
  if (hurt && diff !== 'easy') {
    // notas dañinas en huecos de las frases del jugador
    for (const sec of score.sections) {
      if (sec.who !== 'player') continue;
      for (let b = sec.beat + 1; b < sec.beat + sec.beats; b += diff === 'hard' ? 2 : 4) {
        const t = tm.toMs(b + 0.5);
        const busy = out.filter((n) => n.player && Math.abs(n.t - t) < 140).map((n) => n.lane);
        const free = [0, 1, 2, 3].filter((l) => !busy.includes(l));
        if (free.length && r() < 0.7) out.push({ t: Math.round(t), lane: free[Math.floor(r() * free.length)], len: 0, player: true, kind: 'hurt' });
      }
    }
  }
  out.sort((a, b) => a.t - b.t || a.lane - b.lane);
  return out;
}
