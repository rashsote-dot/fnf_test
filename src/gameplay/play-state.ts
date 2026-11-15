// Estado de juego: carga una canción de un mod y la ejecuta.
import { AudioEngine, Conductor, SongPlayer } from '../audio/audio';
import { timeToBeat } from '../adapters/common';
import { Diag } from '../core/diagnostics';
import type { Scene } from '../core/engine';
import { settings } from '../core/settings';
import { Tweens } from '../core/tween';
import type { ChartEvent, CharSlot, InternalCharacter, InternalChart, InternalStage } from '../core/types';
import { convertChart } from '../mod-loader/chart-client';
import type { ModRuntime } from '../mod-loader/mod-manager';
import { BASE_URL } from '../mod-loader/mod-manager';
import { ResourceScope } from '../mod-loader/resources';
import { getJson, LoadError } from '../mod-loader/source';
import type { Atlas } from '../renderer/atlas';
import type { Renderer } from '../renderer/renderer';
import { parseColor } from '../renderer/renderer';
import { Animator, Camera, drawRect, drawSprite, Sprite, VIEW_H, VIEW_W, whiteFrame } from '../renderer/sprite';
import type { Frame } from '../renderer/texture';
import { ScriptSandbox, type ScriptCmd } from '../scripting/sandbox';
import { Character } from './character';
import { accuracy, applyHit, applyMiss, findHittable, grade, HIT_WINDOW, judge, newTally, type Rating, type Tally } from './judge';
import type { SharedAssets } from './shared';
import { Input } from '../input/input';

const DIRS = ['L', 'D', 'U', 'R'];
const NOTE_SCALE = 0.7;
const SWAG = 160 * NOTE_SCALE; // 112 px entre carriles

interface GNote {
  t: number; lane: number; len: number; player: boolean; kind: string;
  state: number; // 0 pendiente, 1 golpeada, 2 fallada
  hold: number; // 0 nada, 1 sosteniendo, 2 completado, 3 soltado antes de tiempo
}

export interface PlayResult { tally: Tally; accuracy: number; grade: string; songName: string; diff: string; bot: boolean }

export interface PlayHooks {
  onHud(text: string): void;
  onEnd(r: PlayResult): void;
  onGameOver(): void;
  onPauseRequest(): void;
}

const DEFAULT_STAGE: InternalStage = {
  id: 'default', zoom: 0.9, props: [], bgColor: '#1b1530',
  chars: { bf: { x: 1000, y: 880, z: 300, cam: [0, 0] }, dad: { x: 340, y: 880, z: 200, cam: [0, 0] }, gf: { x: 680, y: 790, z: 100, cam: [0, 0] } },
};

export class PlayState implements Scene {
  scope: ResourceScope;
  chart!: InternalChart;
  notes: GNote[] = [];
  stage!: InternalStage;
  chars = {} as Record<CharSlot, Character | null>;
  altChars = new Map<string, Character>();
  world: Sprite[] = [];
  props = new Map<string, Sprite>();
  scriptSprites = new Map<string, Sprite>();
  scriptAtlases = new Map<string, Atlas>();
  song!: SongPlayer;
  conductor: Conductor;
  camGame = new Camera();
  camHud = new Camera();
  tweens = new Tweens();
  input: Input;
  sandbox: ScriptSandbox | null = null;
  tally = newTally();
  health = 1;
  started = false;
  paused = false;
  ended = false;
  loaded = false;
  songT = -99999;
  private evIdx = 0;
  private pIdx = 0; // primera nota que aún puede estar pendiente
  private oIdx = 0;
  private curStep = -9999;
  private curBeat = -9999;
  private strums: Sprite[] = [];
  private strumTimers = new Float32Array(8);
  private icons: Sprite[] = [];
  private iconFrames: Frame[][] = [];
  private noteSpr = new Sprite();
  private popups: { s: Sprite; vy: number; life: number }[] = [];
  private countdown = new Sprite();
  private camPos = { x: 0, y: 0 };
  private camTarget = { x: 0, y: 0 };
  private forcedCam: { x: number; y: number } | null = null;
  private focus: CharSlot | 'none' = 'dad';
  defaultZoom = 0.9;
  hudDefaultZoom = 1;
  private bopRate = 4;
  private bopIntensity = 1;
  private speed = 1;
  private speedObj = { v: 1 };
  private healthColors = [new Float32Array(3), new Float32Array(3)];
  private hudDirty = true;
  private botHeld = new Float32Array(4).fill(-1);
  private holdingLane = [false, false, false, false];
  private warnings: string[] = [];
  private stepMs = 125;

  constructor(private audio: AudioEngine, private renderer: Renderer, public mod: ModRuntime, public songId: string, public diff: string, private shared: SharedAssets, private hooks: PlayHooks) {
    this.scope = new ResourceScope(renderer, mod.source, `${mod.manifest.id}/${songId}`);
    this.conductor = new Conductor(audio.ctx);
    this.input = new Input();
  }

  // ---------------------------------------------------------------- carga
  async load(progress: (p: number, label: string) => void): Promise<string[]> {
    const { adapter, source, manifest } = this.mod;
    const t0 = performance.now();
    let done = 0, total = 6;
    const step = (label: string) => progress(++done / total, label);

    // 1. chart (conversión en worker)
    progress(0, 'Leyendo chart…');
    const files: Record<string, Blob | null> = {};
    await Promise.all(adapter.chartFiles(this.songId, this.diff).map(async (f) => {
      try { files[f.key] = await source.blob(f.path); }
      catch (e) { if (f.optional && e instanceof LoadError) files[f.key] = null; else throw e; }
    }));
    this.chart = await convertChart(manifest.format, this.songId, this.diff, files);
    this.warnings.push(...this.chart.warnings);
    step('Chart convertido');

    // 2. en paralelo: audio, personajes, escenario, scripts
    const ids: Record<CharSlot, string> = { bf: this.chart.player || 'bf', dad: this.chart.opponent || 'dad', gf: this.chart.gf || 'gf' };
    const extra = new Set<string>();
    for (const e of this.chart.events) if (e.name === 'changeChar') extra.add(`${e.v.target}:${e.v.char}`);
    total += extra.size;

    const audioP = (async () => {
      const a = adapter.audio(this.songId, this.chart);
      const inst = (await this.audio.load(source, a.inst))!;
      let voices: { buf: AudioBuffer; who: 'player' | 'opponent' | 'both' }[] = [];
      for (const group of [0, 1]) {
        const res = await Promise.all(a.voices.filter((v) => v.group === group).map(async (v) => ({ buf: await this.audio.load(source, v.url, true), who: v.who })));
        voices = res.filter((v) => v.buf) as typeof voices;
        if (voices.length) break;
      }
      this.song = new SongPlayer(this.audio, inst, voices);
      step('Audio decodificado');
    })();

    const charP = Promise.all((['gf', 'dad', 'bf'] as CharSlot[]).map(async (slot) => {
      this.chars[slot] = await this.loadCharacter(ids[slot], slot === 'bf');
      step('Personaje ' + ids[slot]);
    }));
    const extraP = Promise.all([...extra].map(async (k) => {
      const [slot, id] = k.split(':');
      const c = await this.loadCharacter(id, slot === 'bf');
      if (c) this.altChars.set(k, c);
      step('Personaje ' + id);
    }));

    const stageP = (async () => {
      const sid = this.chart.stage || adapter.defaultStage;
      try {
        this.stage = adapter.parseStage(await getJson(source, adapter.stageFile(sid)), sid);
      } catch (e) {
        if (!(e instanceof LoadError)) throw e;
        this.warnings.push(`Escenario "${sid}" no encontrado: se usa uno por defecto.`);
        this.stage = structuredClone(DEFAULT_STAGE);
      }
      await Promise.all(this.stage.props.map(async (p) => {
        const lowHidden = p.lowQuality && settings.quality === 'low';
        let s: Sprite;
        if (!p.image) {
          s = new Sprite(whiteFrame(this.renderer));
          s.scaleX = ((p.width ?? 1) * p.scale[0]) / 2; s.scaleY = ((p.height ?? 1) * p.scale[1]) / 2;
          s.setColor(p.color ?? '#ffffff');
        } else {
          try {
            const atlas = await this.scope.atlas(p.image);
            s = new Sprite(atlas.frames[0]);
            if (p.anim) {
              s.anim = new Animator();
              s.anim.addFromAtlas(atlas, 'idle', p.anim.prefix, p.anim.fps, p.anim.loop);
              s.anim.play('idle');
              s.update(0);
            }
            s.scaleX = p.scale[0]; s.scaleY = p.scale[1];
            if (p.color) s.setColor(p.color);
          } catch (e) {
            this.warnings.push(`Imagen de escenario no encontrada: ${p.image}`);
            return;
          }
        }
        s.name = p.name; s.x = p.x; s.y = p.y; s.scrollX = p.scroll[0]; s.scrollY = p.scroll[1]; s.z = p.z; s.alpha = p.alpha;
        s.visible = !lowHidden;
        this.props.set(p.name, s);
      }));
      step('Escenario');
    })();

    const scriptsP = (async () => {
      const list = manifest.scripts ?? [];
      if (!list.length) return;
      this.sandbox = new ScriptSandbox(new Set(manifest.permissions ?? []), BASE_URL);
      this.sandbox.onCommands = (c) => this.runCommands(c);
      await Promise.all((manifest.scriptImages ?? []).map(async (img) => {
        try { this.scriptAtlases.set(img, await this.scope.atlas(img)); } catch { this.warnings.push(`Imagen de script no encontrada: ${img}`); }
      }));
      for (const path of list) {
        const code = await (await source.blob(path)).text();
        await this.sandbox.load(path, code);
      }
    })();

    await Promise.all([audioP, charP, extraP, stageP, scriptsP]);
    this.setup();
    step('Listo');
    Diag.recordLoad(`TOTAL ${manifest.id}/${this.songId}`, performance.now() - t0);
    this.loaded = true;
    for (const w of this.warnings) Diag.warn(w);
    return this.warnings;
  }

  private async loadCharacter(id: string, isPlayer: boolean): Promise<Character | null> {
    const { adapter, source } = this.mod;
    let def: InternalCharacter;
    let atlas: Atlas;
    try {
      def = adapter.parseCharacter(await getJson(source, adapter.characterFile(id)), id, isPlayer);
      atlas = await this.scope.atlas(def.image);
    } catch (e) {
      if (!(e instanceof LoadError) && !(e instanceof Error && /render/.test(e.message))) throw e;
      this.warnings.push(`Personaje "${id}" no disponible en el mod: se usa un personaje de reemplazo.`);
      def = { ...this.shared.placeholder.def, id, flipX: !isPlayer ? false : true };
      atlas = this.shared.placeholder.atlas;
    }
    const c = new Character(def, atlas, isPlayer);
    c.name = id;
    // icono de vida: images/icons/icon-<id>.png (2 frames lado a lado), con respaldo común
    let iconAtlas: Atlas = this.shared.iconFallback;
    try { iconAtlas = await this.scope.atlas(`images/icons/icon-${def.icon}`); }
    catch { try { iconAtlas = await this.scope.atlas(`images/icons/${def.icon}`); } catch { /* respaldo */ } }
    (c as Character & { iconFrames?: Frame[] }).iconFrames = splitIcon(iconAtlas);
    return c;
  }

  // ---------------------------------------------------------------- preparación
  private setup() {
    const st = this.stage;
    this.defaultZoom = st.zoom;
    this.camGame.zoom = st.zoom;
    for (const slot of ['gf', 'dad', 'bf'] as CharSlot[]) {
      const c = this.chars[slot];
      if (!c) continue;
      c.place(st.chars[slot].x, st.chars[slot].y);
      c.z = st.chars[slot].z;
      if (slot === 'gf' && st.hideGf) c.visible = false;
    }
    for (const [k, c] of this.altChars) {
      const slot = k.split(':')[0] as CharSlot;
      c.place(st.chars[slot].x, st.chars[slot].y);
      c.z = st.chars[slot].z;
    }
    this.rebuildWorld();

    this.notes = this.chart.notes.map((n) => ({ ...n, state: 0, hold: 0 }));
    this.speed = settings.scrollSpeed > 0 ? settings.scrollSpeed : this.chart.scrollSpeed;
    this.speedObj.v = 1;

    // strums: 0..3 oponente, 4..7 jugador
    const y = settings.downscroll ? VIEW_H - 150 : 50;
    for (let i = 0; i < 8; i++) {
      const lane = i % 4;
      const s = new Sprite();
      s.anim = new Animator();
      s.anim.addFromAtlas(this.shared.notes, 'static', `static${DIRS[lane]}`, 24, false);
      s.anim.addFromAtlas(this.shared.notes, 'press', `press${DIRS[lane]}`, 24, false);
      s.anim.addFromAtlas(this.shared.notes, 'confirm', `confirm${DIRS[lane]}`, 24, false);
      s.anim.play('static');
      s.scaleX = s.scaleY = NOTE_SCALE;
      s.x = 92 + (i >= 4 ? VIEW_W / 2 : 0) + lane * SWAG;
      s.y = y;
      s.hud = true;
      s.update(0);
      this.strums.push(s);
    }
    this.noteSpr.scaleX = this.noteSpr.scaleY = NOTE_SCALE;

    this.setupIcons();
    this.countdown.visible = false;

    // posición inicial de cámara
    this.focus = (this.chart.events.find((e) => e.name === 'camFocus')?.v.target as CharSlot) ?? 'dad';
    this.computeCamTarget();
    this.camPos.x = this.camTarget.x; this.camPos.y = this.camTarget.y;
    this.applyCam();

    this.input.onLane = (lane, down, ts) => this.onLane(lane, down, ts);
    this.input.onKey = (e) => {
      if ((e.code === 'Escape' || e.code === 'Enter') && !e.repeat && this.started && !this.ended) { e.preventDefault(); this.hooks.onPauseRequest(); return true; }
      if (e.code === 'KeyR' && !e.repeat && this.started && !this.ended && !this.paused) { this.restart(); return true; }
    };
    this.hudDirty = true;
  }

  private setupIcons() {
    this.icons = [];
    this.iconFrames = [];
    for (const slot of ['dad', 'bf'] as CharSlot[]) {
      const c = this.chars[slot]!;
      const frames = (c as Character & { iconFrames?: Frame[] }).iconFrames ?? splitIcon(this.shared.iconFallback);
      const s = new Sprite(frames[0]);
      s.scaleX = s.scaleY = ICON;
      s.flipX = slot === 'bf';
      s.hud = true;
      this.icons.push(s);
      this.iconFrames.push(frames);
    }
    parseColor(this.chars.dad!.def.healthColor, this.healthColors[0]);
    parseColor(this.chars.bf!.def.healthColor, this.healthColors[1]);
  }

  private rebuildWorld() {
    const list: Sprite[] = [...this.props.values()];
    for (const slot of ['gf', 'dad', 'bf'] as CharSlot[]) { const c = this.chars[slot]; if (c) list.push(c); }
    list.push(...this.scriptSprites.values());
    list.sort((a, b) => a.z - b.z);
    this.world = list;
  }

  // ---------------------------------------------------------------- control
  start() {
    const crochet = 60000 / this.chart.bpm;
    const lead = 0.25 + (4 * crochet) / 1000;
    const startCtx = this.audio.ctx.currentTime + lead;
    this.song.start(startCtx);
    this.conductor.userOffsetMs = settings.offsetMs;
    this.conductor.sync(true);
    // cuenta atrás programada en el reloj de audio: suena exactamente a tiempo aunque haya tirones
    for (let i = 0; i < 4; i++) this.audio.playSfx(i === 3 ? 'go' : 'beep', 0.6, startCtx - ((4 - i) * crochet) / 1000);
    this.started = true;
    this.paused = false;
    this.ended = false;
    this.sandbox?.call('onCreate');
  }

  restart() {
    this.song.stop();
    this.tally = newTally();
    this.health = 1;
    this.evIdx = this.pIdx = this.oIdx = 0;
    this.curStep = this.curBeat = -9999;
    for (const n of this.notes) { n.state = 0; n.hold = 0; }
    this.speed = settings.scrollSpeed > 0 ? settings.scrollSpeed : this.chart.scrollSpeed;
    this.speedObj.v = 1;
    this.forcedCam = null;
    this.camGame.zoom = this.defaultZoom = this.stage.zoom;
    this.camHud.zoom = 1;
    this.tweens.clear();
    this.popups.length = 0;
    this.botHeld.fill(-1);
    this.hudDirty = true;
    // restaurar personajes cambiados por eventos
    for (const s of this.strums) s.anim!.play('static', true);
    if (this.paused) { this.paused = false; void this.audio.ctx.resume(); }
    this.start();
  }

  async pause() {
    if (!this.started || this.paused || this.ended) return;
    this.paused = true;
    this.input.releaseAll();
    await this.audio.ctx.suspend();
  }

  async resume() {
    if (!this.paused) return;
    await this.audio.ctx.resume();
    this.conductor.sync(true);
    this.paused = false;
  }

  dispose() {
    this.song?.stop();
    this.input.destroy();
    this.sandbox?.destroy();
    this.scope.dispose();
    this.tweens.clear();
    this.world = [];
    this.props.clear();
    this.scriptSprites.clear();
    if (this.audio.ctx.state === 'suspended') void this.audio.ctx.resume();
  }

  // ---------------------------------------------------------------- input
  private onLane(lane: number, down: boolean, ts: number) {
    if (!this.started || this.paused || this.ended || settings.botplay) return;
    const t = this.conductor.songTimeAt(ts, this.song.startCtx);
    const strum = this.strums[4 + lane];
    this.holdingLane[lane] = down;
    if (down) {
      const i = findHittable(this.notes, this.pIdx, lane, t);
      if (i >= 0) this.hitNote(this.notes[i], t);
      else {
        strum.anim!.play('press', true);
        if (!settings.ghostTapping) this.miss(lane, false);
      }
    } else {
      strum.anim!.play('static', true);
      // soltar un sostenido antes de tiempo
      for (let i = this.pIdx; i < this.notes.length; i++) {
        const n = this.notes[i];
        if (n.t > t) break;
        if (n.player && n.lane === lane && n.hold === 1) {
          if (t < n.t + n.len - 100) { n.hold = 3; this.miss(lane, true); }
          else n.hold = 2;
        }
      }
    }
  }

  private hitNote(n: GNote, t: number) {
    n.state = 1;
    const strum = this.strums[4 + n.lane];
    if (n.kind === 'hurt') {
      this.health -= 0.3;
      this.tally.combo = 0;
      this.chars.bf?.sing(n.lane, true);
      this.audio.playSfx('miss', settings.missSounds ? 0.5 : 0);
      strum.anim!.play('press', true);
      this.camHud.shake(0.004, 150);
      this.hudDirty = true;
      return;
    }
    const delta = n.t - t;
    Diag.lastInputDelta = -delta;
    const r = judge(delta);
    applyHit(this.tally, r);
    this.health += r === 'shit' ? -0.01 : r === 'bad' ? 0.005 : 0.023;
    if (n.len > 0) n.hold = 1;
    strum.anim!.play('confirm', true);
    const bf = this.chars.bf;
    if (bf && n.kind !== 'noanim') bf.sing(n.lane, false, n.kind === 'alt' ? '-alt' : '');
    this.song.setVoice('player', true);
    this.popup(r);
    this.hudDirty = true;
    this.sandbox?.call('onNoteHit', n.lane, n.kind, r);
  }

  private miss(lane: number, countAsNote: boolean) {
    applyMiss(this.tally);
    if (!countAsNote) this.tally.judged--; // fallo por pulsar sin nota: no cuenta para la precisión
    this.health -= 0.0475;
    this.chars.bf?.sing(lane, true);
    this.song.setVoice('player', false);
    if (settings.missSounds) this.audio.playSfx('miss', 0.4 + Math.random() * 0.2);
    this.hudDirty = true;
    this.sandbox?.call('onNoteMiss', lane);
  }

  private popup(r: Rating) {
    const f = this.shared.ui.byPrefix(r)[0];
    if (!f) return;
    let p = this.popups.find((x) => x.life <= 0);
    if (!p) { if (this.popups.length > 12) return; p = { s: new Sprite(), vy: 0, life: 0 }; this.popups.push(p); }
    p.s.frame = f; p.s.hud = true;
    p.s.scaleX = p.s.scaleY = 0.7;
    p.s.x = VIEW_W * 0.5 - (f.fw * 0.7) / 2 + 80; p.s.y = VIEW_H * 0.42;
    p.s.alpha = 1; p.vy = -0.35; p.life = 700;
  }

  // ---------------------------------------------------------------- bucle
  update(now: number, dt: number) {
    if (!this.started || this.paused || this.ended) return;
    this.conductor.sync();
    const t = this.conductor.songTimeAt(now, this.song.startCtx);
    this.songT = t;
    const bpmNow = this.bpmAt(t);
    this.stepMs = 15000 / bpmNow;

    // pasos y beats
    const beatF = timeToBeat(Math.max(t, -60000), this.chart.timeChanges);
    const step = Math.floor(beatF * 4);
    if (step !== this.curStep) {
      for (let s = Math.max(this.curStep + 1, step - 4); s <= step; s++) {
        if (s % 4 === 0) this.beatHit(Math.floor(s / 4));
        this.sandbox?.call('onStepHit', s);
      }
      this.curStep = step;
    }
    this.countdownUpdate(beatF);

    // eventos
    while (this.evIdx < this.chart.events.length && this.chart.events[this.evIdx].t <= t) this.applyEvent(this.chart.events[this.evIdx++]);

    // notas del oponente
    const notes = this.notes;
    for (let i = this.oIdx; i < notes.length; i++) {
      const n = notes[i];
      if (n.t > t) break;
      if (!n.player && n.state === 0) {
        n.state = 1;
        const st = this.strums[n.lane];
        st.anim!.play('confirm', true);
        this.strumTimers[n.lane] = 150 + n.len;
        const who = n.kind === 'gf' ? this.chars.gf : this.chars.dad;
        if (who && n.kind !== 'noanim') who.sing(n.lane, false, n.kind === 'alt' ? '-alt' : '');
        this.song.setVoice('opponent', true);
        this.sandbox?.call('onOpponentNoteHit', n.lane, n.kind);
      }
      if (i === this.oIdx && (n.player || n.state !== 0) && n.t + n.len < t - 50) this.oIdx++;
    }
    // sostenidos del oponente: mantener pose
    for (let i = Math.max(0, this.oIdx - 8); i < notes.length; i++) {
      const n = notes[i];
      if (n.t > t) break;
      if (!n.player && n.len > 0 && t < n.t + n.len) { const c = n.kind === 'gf' ? this.chars.gf : this.chars.dad; if (c) c.holdTimer = 0; }
    }
    for (let i = 0; i < 4; i++) {
      if (this.strumTimers[i] > 0) { this.strumTimers[i] -= dt; if (this.strumTimers[i] <= 0) this.strums[i].anim!.play('static', true); }
    }

    // jugador: bot, sostenidos y fallos
    const bot = settings.botplay;
    for (let i = this.pIdx; i < notes.length; i++) {
      const n = notes[i];
      if (n.t > t + HIT_WINDOW) break;
      if (!n.player) continue;
      if (n.state === 0) {
        if (bot && n.kind !== 'hurt' && n.t <= t) {
          this.hitNote(n, n.t);
          this.botHeld[n.lane] = n.len > 0 ? n.t + n.len : n.t + 100;
        } else if (t > n.t + HIT_WINDOW) {
          n.state = 2;
          if (n.kind !== 'hurt') this.miss(n.lane, true);
        }
      }
      if (n.hold === 1) {
        if (t >= n.t + n.len) n.hold = 2;
        else {
          this.health += dt * 0.00012;
          this.tally.score += Math.round(dt * 0.25);
          this.hudDirty = true;
          if (this.chars.bf) this.chars.bf.holdTimer = 0;
          this.strums[4 + n.lane].anim!.play('confirm', false);
        }
      }
    }
    while (this.pIdx < notes.length) {
      const n = notes[this.pIdx];
      if (n.player && (n.state === 0 || n.hold === 1)) break;
      if (n.t + n.len > t) break;
      this.pIdx++;
    }
    if (bot) for (let l = 0; l < 4; l++) if (this.botHeld[l] >= 0 && t >= this.botHeld[l]) { this.botHeld[l] = -1; this.strums[4 + l].anim!.play('static', true); }

    this.health = Math.max(0, Math.min(2, this.health));
    if (this.health <= 0 && !bot) { this.gameOver(); return; }

    // animaciones y personajes
    for (const s of this.world) s.update(dt);
    const holdAny = this.holdingLane.some(Boolean) || (bot && this.botHeld.some((v) => v >= 0));
    for (const slot of ['gf', 'dad', 'bf'] as CharSlot[]) this.chars[slot]?.updateHold(dt, this.stepMs, slot === 'bf' && holdAny);
    for (const s of this.strums) s.update(dt);
    this.tweens.update(dt);
    this.speed = (settings.scrollSpeed > 0 ? settings.scrollSpeed : this.chart.scrollSpeed) * this.speedObj.v;

    // cámara
    this.computeCamTarget();
    const k = 1 - Math.pow(1 - 0.04, dt / 16.667);
    this.camPos.x += (this.camTarget.x - this.camPos.x) * k;
    this.camPos.y += (this.camTarget.y - this.camPos.y) * k;
    const zk = Math.exp((-dt / 1000) * 3.125);
    this.camGame.zoom = this.defaultZoom + (this.camGame.zoom - this.defaultZoom) * zk;
    this.camHud.zoom = this.hudDefaultZoom + (this.camHud.zoom - this.hudDefaultZoom) * zk;
    this.applyCam();
    this.camGame.update(dt); this.camHud.update(dt);

    // iconos
    const ik = Math.exp(-dt / 100);
    for (const ic of this.icons) { ic.scaleX = ic.scaleY = ICON + (ic.scaleX - ICON) * ik; }

    for (const p of this.popups) if (p.life > 0) { p.life -= dt; p.s.y += p.vy * dt; p.vy += 0.0009 * dt; p.s.alpha = Math.min(1, p.life / 250); }

    if (this.hudDirty) {
      this.hudDirty = false;
      const tl = this.tally;
      this.hooks.onHud(`Puntos: ${tl.score.toLocaleString('es')}  ·  Fallos: ${tl.miss}  ·  Precisión: ${accuracy(tl).toFixed(2)}%  ·  ${grade(tl)}${settings.botplay ? '  ·  BOT' : ''}`);
    }

    if (this.sandbox) {
      if (this.sandbox.has('onUpdate')) this.sandbox.call('onUpdate', t);
      this.sandbox.flush({ song: this.songId, diff: this.diff, songTime: t, beat: this.curBeat, step: this.curStep, health: this.health, score: this.tally.score, misses: this.tally.miss, combo: this.tally.combo });
    }

    // fin de canción
    if (t > this.song.duration + 400 && this.pIdx >= notes.length) this.finish();
    else if (t > this.song.duration + 3000) this.finish();
  }

  private bpmAt(t: number) {
    let b = this.chart.timeChanges[0]?.bpm ?? this.chart.bpm;
    for (const c of this.chart.timeChanges) { if (c.t > t) break; b = c.bpm; }
    return b;
  }

  private beatHit(beat: number) {
    this.curBeat = beat;
    for (const slot of ['gf', 'dad', 'bf'] as CharSlot[]) this.chars[slot]?.dance(beat);
    for (const p of this.props.values()) if (p.anim && !p.anim.cur?.loop) p.anim.play('idle', true);
    for (const ic of this.icons) ic.scaleX = ic.scaleY = ICON * 1.2;
    if (beat >= 0 && this.bopRate > 0 && beat % this.bopRate === 0) {
      this.camGame.zoom += 0.015 * this.bopIntensity;
      this.camHud.zoom += 0.03 * this.bopIntensity;
    }
    this.sandbox?.call('onBeatHit', beat);
  }

  private countdownUpdate(beatF: number) {
    // -3: "¿Listos?", -2: "Preparados", -1: "¡Ya!"
    const names = ['ready', 'set', 'go'];
    if (beatF < -3 || beatF >= 0) { this.countdown.visible = false; return; }
    const idx = Math.floor(beatF) + 3;
    const f = this.shared.ui.byPrefix(names[idx])[0];
    if (!f) return;
    const c = this.countdown;
    c.frame = f; c.visible = true; c.hud = true;
    c.scaleX = c.scaleY = 0.9;
    c.x = VIEW_W / 2 - (f.fw * 0.9) / 2; c.y = VIEW_H / 2 - (f.fh * 0.9) / 2;
    c.alpha = 1 - (beatF - Math.floor(beatF));
  }

  private computeCamTarget() {
    if (this.forcedCam) { this.camTarget.x = this.forcedCam.x; this.camTarget.y = this.forcedCam.y; return; }
    if (this.focus === 'none') return;
    const c = this.chars[this.focus];
    if (!c) return;
    const st = this.stage.chars[this.focus];
    const co = c.def.cameraOffset;
    this.camTarget.x = c.midX() + st.cam[0] + (this.focus === 'bf' ? -co[0] : co[0]);
    this.camTarget.y = c.midY() + st.cam[1] + co[1];
  }

  private applyCam() {
    this.camGame.scrollX = this.camPos.x - VIEW_W / 2;
    this.camGame.scrollY = this.camPos.y - VIEW_H / 2;
  }

  private applyEvent(e: ChartEvent) {
    const v = e.v as Record<string, any>;
    switch (e.name) {
      case 'camFocus':
        this.forcedCam = null;
        this.focus = v.target === 'none' ? 'none' : (v.target as CharSlot);
        if (this.focus === 'none' && (v.x || v.y)) this.forcedCam = { x: +v.x, y: +v.y };
        break;
      case 'camPos':
        this.forcedCam = v.reset ? null : { x: +v.x, y: +v.y };
        break;
      case 'camZoom':
        this.camGame.zoom += +v.add || 0.015; this.camHud.zoom += +v.hud || 0.03;
        break;
      case 'camZoomSet': {
        const z = v.relative ? this.stage.zoom * +v.zoom : +v.zoom;
        this.tweens.to(this, 'defaultZoom', z, +v.dur || 0, String(v.ease ?? 'linear'));
        if (!(+v.dur > 0)) this.camGame.zoom = z;
        break;
      }
      case 'camBop':
        this.bopRate = +v.rate || 0; this.bopIntensity = +v.intensity || 1;
        break;
      case 'playAnim':
        this.chars[v.target as CharSlot]?.playSpecial(String(v.anim));
        break;
      case 'hey': {
        const targets: CharSlot[] = v.target === 'both' ? ['bf', 'gf'] : [v.target as CharSlot];
        for (const s of targets) { const c = this.chars[s]; if (c) c.playSpecial(c.anim!.has('hey') ? 'hey' : 'cheer'); }
        break;
      }
      case 'changeChar': {
        const slot = v.target as CharSlot;
        const nc = this.altChars.get(`${slot}:${v.char}`);
        const old = this.chars[slot];
        if (nc && old && nc !== old) {
          this.altChars.set(`${slot}:${old.name}`, old);
          this.chars[slot] = nc;
          nc.visible = old.visible;
          this.rebuildWorld();
          this.setupIcons();
        }
        break;
      }
      case 'flash': (v.cam === 'hud' ? this.camHud : this.camGame).flash(String(v.color ?? '#ffffff'), +v.dur || 500); break;
      case 'shake': (v.cam === 'hud' ? this.camHud : this.camGame).shake(+v.intensity || 0.01, +v.dur || 200); break;
      case 'scrollSpeed': this.tweens.to(this.speedObj, 'v', v.absolute ? +v.mult / this.chart.scrollSpeed : +v.mult, +v.dur || 0, 'linear'); break;
      case 'gfSpeed': if (this.chars.gf) this.chars.gf.danceSpeed = +v.speed || 1; break;
    }
    this.sandbox?.call('onEvent', e.name, v);
  }

  // ---------------------------------------------------------------- scripts
  private obj(name: string): Record<string, any> | null {
    if (name === 'bf' || name === 'dad' || name === 'gf') return this.chars[name];
    if (name === 'camGame') return this.camGame;
    if (name === 'camHUD') return this.camHud;
    return this.scriptSprites.get(name) ?? this.props.get(name) ?? null;
  }

  private runCommands(cmds: ScriptCmd[]) {
    const ALLOWED = new Set(['x', 'y', 'alpha', 'angle', 'scaleX', 'scaleY', 'visible', 'flipX', 'zoom', 'scrollX', 'scrollY', 'z', 'color']);
    for (const c of cmds) {
      const a = c as any[];
      switch (a[0]) {
        case 'log': console.info('[script]', a[1]); break;
        case 'error': Diag.warn('Error en script: ' + a[1]); break;
        case 'camZoom': this.camGame.zoom += a[1]; this.camHud.zoom += a[2]; break;
        case 'camZoomSet': this.tweens.to(this, 'defaultZoom', a[1], a[2], 'sineinout'); break;
        case 'shake': (a[3] === 'hud' ? this.camHud : this.camGame).shake(a[1], a[2]); break;
        case 'flash': (a[3] === 'hud' ? this.camHud : this.camGame).flash(a[1], a[2]); break;
        case 'playAnim': {
          const ch = this.chars[a[1] as CharSlot];
          ch?.playSpecial(a[2], a[3]);
          break;
        }
        case 'setProp': {
          const o = this.obj(a[1]);
          if (!o || !ALLOWED.has(a[2])) break;
          if (a[2] === 'color' && o instanceof Sprite) o.setColor(String(a[3]));
          else if (a[2] === 'zoom' && o === this.camGame) this.defaultZoom = +a[3];
          else o[a[2]] = typeof o[a[2]] === 'boolean' ? !!a[3] : +a[3];
          if (a[2] === 'z') this.rebuildWorld();
          break;
        }
        case 'tween': {
          const o = this.obj(a[1]);
          if (!o || !ALLOWED.has(a[2]) || a[2] === 'color' || a[2] === 'visible') break;
          if (a[2] === 'zoom' && o === this.camGame) this.tweens.to(this, 'defaultZoom', a[3], a[4], a[5]);
          else this.tweens.to(o, a[2], a[3], a[4], a[5]);
          break;
        }
        case 'addSprite': {
          const atlas = this.scriptAtlases.get(a[2]);
          if (!atlas) { Diag.warn(`Script: imagen "${a[2]}" no declarada en scriptImages`); break; }
          if (this.scriptSprites.size >= 300) break;
          const s = new Sprite(atlas.frames[0]);
          const o = a[5] ?? {};
          s.name = a[1]; s.x = a[3]; s.y = a[4];
          s.scaleX = +(o.scaleX ?? o.scale ?? 1); s.scaleY = +(o.scaleY ?? o.scale ?? 1);
          s.scrollX = +(o.scrollX ?? o.scroll ?? 1); s.scrollY = +(o.scrollY ?? o.scroll ?? 1);
          s.alpha = +(o.alpha ?? 1); s.z = +(o.z ?? 500); s.hud = !!o.hud;
          if (o.color) s.setColor(String(o.color));
          if (o.anim) { s.anim = new Animator(); s.anim.addFromAtlas(atlas, 'a', String(o.anim), +(o.fps ?? 24), o.loop !== false); s.anim.play('a'); s.update(0); }
          this.scriptSprites.set(s.name, s);
          this.rebuildWorld();
          break;
        }
        case 'removeSprite': if (this.scriptSprites.delete(a[1])) this.rebuildWorld(); break;
        case 'addHealth': this.health = Math.max(0, Math.min(2, this.health + a[1])); break;
        case 'scrollSpeed': this.tweens.to(this.speedObj, 'v', a[1], a[2], 'linear'); break;
      }
    }
  }

  // ---------------------------------------------------------------- fin
  private finish() {
    if (this.ended) return;
    this.ended = true;
    this.song.stop();
    this.sandbox?.call('onSongEnd');
    this.hooks.onEnd({ tally: { ...this.tally }, accuracy: accuracy(this.tally), grade: grade(this.tally), songName: this.chart.songName, diff: this.diff, bot: settings.botplay });
  }

  private gameOver() {
    if (this.ended) return;
    this.ended = true;
    this.song.stop();
    this.chars.bf?.sing(0, true);
    this.hooks.onGameOver();
  }

  // ---------------------------------------------------------------- render
  render(r: Renderer, px: number) {
    r.begin(this.stage?.bgColor ?? '#000');
    if (!this.loaded) { r.end(); return; }
    const cg = this.camGame, ch = this.camHud;
    for (const s of this.world) if (!s.hud) drawSprite(r, s, cg, px);
    if (cg.flashAlpha > 0) drawRect(r, 0, 0, VIEW_W, VIEW_H, cg.flashColor, cg.flashAlpha, px);

    // HUD
    const hy = settings.downscroll ? 0.11 * VIEW_H : 0.89 * VIEW_H;
    const bx = VIEW_W / 2 - 300, bw = 600, bh = 16;
    drawRect(r, bx - 4, hy - 4, bw + 8, bh + 8, BLACK, 1, px);
    const split = bw * (1 - this.health / 2);
    drawRect(r, bx, hy, split, bh, this.healthColors[0], 1, px);
    drawRect(r, bx + split, hy, bw - split, bh, this.healthColors[1], 1, px);
    const cx = bx + split;
    const [di, bi] = this.icons;
    if (di && bi) {
      di.frame = this.iconFrames[0][this.health > 1.6 ? 1 : 0] ?? di.frame;
      bi.frame = this.iconFrames[1][this.health < 0.4 ? 1 : 0] ?? bi.frame;
      // los iconos escalan desde su centro; ICON = escala base
      const place = (s: Sprite, anchorX: number) => {
        const fw = s.frame?.fw ?? 150, fh = s.frame?.fh ?? 150;
        s.x = anchorX - (fw * s.scaleX) / 2; s.y = hy + bh / 2 - (fh * s.scaleY) / 2;
      };
      place(di, cx - 52); place(bi, cx + 52);
      drawSprite(r, di, ch, px); drawSprite(r, bi, ch, px);
    }

    for (const s of this.strums) drawSprite(r, s, ch, px);
    this.renderNotes(r, px);
    for (const s of this.world) if (s.hud) drawSprite(r, s, ch, px);
    for (const p of this.popups) if (p.life > 0) drawSprite(r, p.s, ch, px);
    if (this.countdown.visible) drawSprite(r, this.countdown, ch, px);
    if (ch.flashAlpha > 0) drawRect(r, 0, 0, VIEW_W, VIEW_H, ch.flashColor, ch.flashAlpha, px);
    r.end();
  }

  private renderNotes(r: Renderer, px: number) {
    const t = this.songT;
    const pxPerMs = 0.45 * this.speed;
    const dir = settings.downscroll ? -1 : 1;
    const horizon = (VIEW_H + 200) / pxPerMs;
    const ns = this.noteSpr;
    const atlas = this.shared.notes;
    const cam = this.camHud;
    const start = Math.min(this.pIdx, this.oIdx);
    for (let i = start; i < this.notes.length; i++) {
      const n = this.notes[i];
      if (n.t - t > horizon) break;
      if (n.state === 2 && n.len === 0) continue;
      const strum = this.strums[(n.player ? 4 : 0) + n.lane];
      const sx = strum.x, sy = strum.y; // esquina de la caja de 160*0.7
      const centerX = sx + SWAG / 2, strumCY = sy + SWAG / 2;
      const headCY = strumCY + dir * (n.t - t) * pxPerMs;
      const hit = n.state === 1;
      // sostenido
      if (n.len > 0 && n.hold !== 2 && !(n.state === 1 && n.hold === 0 && n.player)) {
        const endCY = strumCY + dir * (n.t + n.len - t) * pxPerMs;
        const startCY = hit ? strumCY : headCY;
        const len = (endCY - startCY) * dir;
        if (len > 0) {
          const piece = atlas.byPrefix(`hold${DIRS[n.lane]}`)[0];
          const end = atlas.byPrefix(`holdEnd${DIRS[n.lane]}`)[0];
          if (piece && end) {
            const w = piece.fw * NOTE_SCALE;
            const endH = Math.min(len, end.fh * NOTE_SCALE);
            const bodyLen = len - endH;
            const alpha = n.hold === 3 || n.state === 2 ? 0.3 : 0.6;
            ns.alpha = alpha; ns.flipX = false; ns.angle = 0; ns.color.fill(1);
            ns.x = centerX - w / 2; ns.scaleX = NOTE_SCALE;
            if (bodyLen > 0) {
              ns.frame = piece; ns.scaleY = bodyLen / piece.fh;
              ns.y = dir === 1 ? startCY : startCY - bodyLen;
              drawSprite(r, ns, cam, px);
            }
            ns.frame = end;
            if (dir === 1) { ns.scaleY = endH / end.fh; ns.y = startCY + bodyLen; }
            else { ns.scaleY = -endH / end.fh; ns.y = startCY - bodyLen; }
            drawSprite(r, ns, cam, px);
          }
        }
      }
      if (hit || n.state === 2) continue;
      // cabeza
      const f = atlas.byPrefix(n.kind === 'hurt' ? `hurt${DIRS[n.lane]}` : `note${DIRS[n.lane]}`)[0];
      if (!f) continue;
      ns.frame = f; ns.scaleX = ns.scaleY = NOTE_SCALE; ns.alpha = 1; ns.flipX = false; ns.color.fill(1);
      ns.x = sx; ns.y = headCY - SWAG / 2;
      drawSprite(r, ns, cam, px);
    }
  }

  /** datos de depuración para pruebas automáticas */
  debugInfo() {
    return {
      songT: this.songT, nowSongT: this.started ? this.conductor.songTimeAt(performance.now(), this.song.startCtx) : -1, started: this.started, ended: this.ended, paused: this.paused,
      tally: this.tally, health: this.health, duration: this.song?.duration,
      upcoming: this.notes.slice(this.pIdx, this.pIdx + 24).filter((n) => n.player && n.state === 0).map((n) => ({ t: n.t, lane: n.lane, len: n.len, kind: n.kind })),
      outputTs: this.conductor.usingOutputTimestamp,
    };
  }
}

const BLACK = new Float32Array([0, 0, 0]);
const ICON = 0.75;

function splitIcon(a: Atlas): Frame[] {
  if (a.frames.length >= 2 && a.frames[0].name !== 'full') return a.frames.slice(0, 2);
  const tex = a.tex;
  const n = tex.width >= tex.height * 1.5 ? Math.max(1, Math.round(tex.width / tex.height)) : 1;
  const w = tex.width / n;
  const out: Frame[] = [];
  for (let i = 0; i < Math.min(n, 2); i++) out.push({ tex, name: 'icon' + i, x: i * w, y: 0, w, h: tex.height, ox: 0, oy: 0, fw: w, fh: tex.height, rotated: false });
  if (out.length === 1) out.push(out[0]);
  return out;
}
