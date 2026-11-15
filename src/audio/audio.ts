// Motor de audio basado en Web Audio API. El AudioContext es el RELOJ MAESTRO del juego:
// la posición de la canción se deriva siempre de él, nunca de acumular deltas de frame.
import { Diag } from '../core/diagnostics';
import { LoadError, type ModSource } from '../mod-loader/source';

export class AudioEngine {
  ctx: AudioContext;
  master: GainNode;
  music: GainNode;
  sfx: GainNode;
  private sfxCache = new Map<string, AudioBuffer>();

  constructor() {
    this.ctx = new AudioContext({ latencyHint: 'interactive' });
    this.master = this.ctx.createGain();
    this.music = this.ctx.createGain();
    this.sfx = this.ctx.createGain();
    this.music.connect(this.master); this.sfx.connect(this.master); this.master.connect(this.ctx.destination);
  }

  async unlock() { if (this.ctx.state !== 'running') await this.ctx.resume(); }

  setVolumes(master: number, music: number, sfx: number) {
    this.master.gain.value = master; this.music.gain.value = music; this.sfx.gain.value = sfx;
  }

  /** extensiones de audio por orden de preferencia según lo que soporte el navegador */
  static extensions(): string[] {
    const a = document.createElement('audio');
    const ogg = a.canPlayType('audio/ogg; codecs="vorbis"') !== '';
    const list = ogg ? ['ogg', 'm4a', 'mp3'] : ['m4a', 'mp3', 'ogg'];
    return list;
  }

  async load(src: ModSource, pathNoExt: string, optional = false): Promise<AudioBuffer | null> {
    let lastErr: unknown = null;
    for (const ext of AudioEngine.extensions()) {
      let blob: Blob;
      try { blob = await src.blob(`${pathNoExt}.${ext}`); } catch (e) { lastErr = e; continue; }
      const t0 = performance.now();
      try {
        const buf = await this.ctx.decodeAudioData(await blob.arrayBuffer());
        Diag.recordLoad(`decode ${pathNoExt}.${ext}`, performance.now() - t0, blob.size);
        return buf;
      } catch (e) {
        lastErr = e;
        Diag.warn(`No se pudo decodificar ${pathNoExt}.${ext} (formato no soportado por este navegador)`);
      }
    }
    if (optional && (lastErr === null || lastErr instanceof LoadError)) return null;
    throw lastErr instanceof Error ? lastErr : new Error(`Audio no encontrado: ${pathNoExt}`);
  }

  /** Efectos sintetizados (no requieren archivos): fallo, cuenta atrás, clic de menú. */
  synth(name: 'miss' | 'beep' | 'go' | 'click'): AudioBuffer {
    const cached = this.sfxCache.get(name);
    if (cached) return cached;
    const sr = this.ctx.sampleRate;
    const dur = name === 'miss' ? 0.18 : name === 'click' ? 0.04 : name === 'go' ? 0.35 : 0.15;
    const buf = this.ctx.createBuffer(1, Math.ceil(sr * dur), sr);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) {
      const t = i / sr, env = Math.max(0, 1 - t / dur);
      if (name === 'miss') d[i] = (Math.random() * 2 - 1) * 0.25 * env * env + Math.sin(2 * Math.PI * (180 - 300 * t) * t) * 0.25 * env;
      else if (name === 'click') d[i] = Math.sin(2 * Math.PI * 1400 * t) * 0.3 * env;
      else if (name === 'go') d[i] = (Math.sin(2 * Math.PI * 880 * t) + 0.5 * Math.sin(2 * Math.PI * 1320 * t)) * 0.25 * env;
      else d[i] = Math.sin(2 * Math.PI * 660 * t) * 0.3 * env;
    }
    this.sfxCache.set(name, buf);
    return buf;
  }

  playSfx(name: 'miss' | 'beep' | 'go' | 'click', vol = 1, when = 0) {
    const s = this.ctx.createBufferSource();
    s.buffer = this.synth(name);
    const g = this.ctx.createGain(); g.gain.value = vol;
    s.connect(g); g.connect(this.sfx);
    s.start(when || 0);
  }
}

/** Reproductor de una canción: instrumental + pistas de voz, todas arrancadas en el mismo instante del reloj de audio. */
export class SongPlayer {
  private sources: AudioBufferSourceNode[] = [];
  voiceGains: { who: 'player' | 'opponent' | 'both'; gain: GainNode }[] = [];
  startCtx = 0;
  duration = 0;
  playing = false;

  constructor(private a: AudioEngine, public inst: AudioBuffer, public voices: { buf: AudioBuffer; who: 'player' | 'opponent' | 'both' }[]) {
    this.duration = inst.duration * 1000;
  }

  /** Programa el inicio: la canción empieza (t=0) en ctxTime. Si offsetMs > 0 empieza más adelante. */
  start(ctxTime: number, offsetMs = 0) {
    this.stop();
    const ctx = this.a.ctx;
    const mk = (buf: AudioBuffer, dest: AudioNode) => {
      const s = ctx.createBufferSource();
      s.buffer = buf; s.connect(dest);
      const off = Math.max(0, offsetMs / 1000);
      const when = Math.max(ctx.currentTime, ctxTime + off);
      s.start(when, off + (when - (ctxTime + off)));
      this.sources.push(s);
    };
    mk(this.inst, this.a.music);
    this.voiceGains = this.voices.map((v) => {
      const g = ctx.createGain(); g.connect(this.a.music); mk(v.buf, g);
      return { who: v.who, gain: g };
    });
    this.startCtx = ctxTime;
    this.playing = true;
  }

  setVoice(who: 'player' | 'opponent', on: boolean) {
    for (const v of this.voiceGains) if (v.who === who || (v.who === 'both' && who === 'player')) v.gain.gain.setTargetAtTime(on ? 1 : 0, this.a.ctx.currentTime, 0.01);
  }

  stop() {
    for (const s of this.sources) { try { s.stop(); } catch { /* ya detenido */ } s.disconnect(); }
    for (const v of this.voiceGains) v.gain.disconnect();
    this.sources = []; this.voiceGains = []; this.playing = false;
  }
}

/**
 * Convierte instantes de performance.now() (los de los eventos de teclado y requestAnimationFrame)
 * a tiempo de canción usando getOutputTimestamp(), que ya descuenta la latencia de salida.
 */
export class Conductor {
  private offsetSec = 0; // ctxTime ≈ perfSec + offsetSec
  private hasTs = false;
  userOffsetMs = 0;

  constructor(private ctx: AudioContext) { this.sync(true); }

  sync(force = false) {
    const ctx = this.ctx;
    let est: number;
    const ts = typeof ctx.getOutputTimestamp === 'function' ? ctx.getOutputTimestamp() : null;
    if (ts && ts.contextTime && ts.performanceTime) {
      est = ts.contextTime - ts.performanceTime / 1000;
      this.hasTs = true;
    } else {
      est = ctx.currentTime - (ctx.outputLatency || ctx.baseLatency || 0) - performance.now() / 1000;
      this.hasTs = false;
    }
    const diff = est - this.offsetSec;
    if (force || Math.abs(diff) > 0.04) this.offsetSec = est;
    else this.offsetSec += diff * 0.05; // suavizado: getOutputTimestamp tiene algo de jitter
    Diag.syncDrift = diff * 1000;
    Diag.audioBaseLatency = (ctx.baseLatency || 0) * 1000;
    Diag.audioOutputLatency = (ctx.outputLatency || 0) * 1000;
  }

  get usingOutputTimestamp() { return this.hasTs; }

  ctxTimeAt(perfMs: number) { return perfMs / 1000 + this.offsetSec; }

  songTimeAt(perfMs: number, startCtx: number) {
    return (this.ctxTimeAt(perfMs) - startCtx) * 1000 - this.userOffsetMs;
  }
}
