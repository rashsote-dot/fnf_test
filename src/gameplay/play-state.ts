// Estado de juego: carga una canción de un mod y la ejecuta con la lógica de Psych Engine
// (HUD, cámaras, notas especiales y scripts Lua/JS del mod).
import { AudioEngine, Conductor, SongPlayer } from '../audio/audio';
import { mapPsychEvent, timeToBeat } from '../adapters/common';
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
import { fullFrame, type Frame } from '../renderer/texture';
import { ScriptSandbox, type ScriptCmd } from '../scripting/sandbox';
import { FUNCTION_STOP, hexColor, PsychScripts, splitPath, type PsychHost } from '../lua/psych';
import { Character } from './character';
import { accuracy, applyHit, applyMiss, findHittable, grade, HIT_WINDOW, judge, newTally, type Rating, type Tally } from './judge';
import { NoteSkin } from './noteskin';
import { PSYCH_UI, type SharedAssets } from './shared';
import { Input } from '../input/input';

const SWAG = 160 * 0.7; // 112 px entre carriles (Note.swagWidth de FNF)

interface GNote {
  t: number; lane: number; len: number; player: boolean; kind: string; type: string;
  state: number; // 0 pendiente, 1 golpeada, 2 fallada
  hold: number; // 0 nada, 1 sosteniendo, 2 completado, 3 soltado antes de tiempo
  texture: string; hitCausesMiss: boolean; ignoreNote: boolean; noAnimation: boolean; noMissAnimation: boolean;
  hitHealth: number; missHealth: number; alpha: number; visible: boolean; offsetX: number; offsetY: number;
  angle: number; multAlpha: number; spawned: boolean; extra: Record<string, unknown>;
}

interface LText { tag: string; s: Sprite; text: string; width: number; x: number; y: number; size: number; color: string; font: string; align: string; border: number; borderColor: string; dirty: boolean; measured: number; added: boolean }

export interface PlayResult { tally: Tally; accuracy: number; grade: string; songName: string; diff: string; bot: boolean }

export interface PlayHooks {
  onHud(text: string): void;
  onHudVisible?(visible: boolean, alpha: number): void;
  onEnd(r: PlayResult): void;
  onGameOver(): void;
  onPauseRequest(): void;
}

const DEFAULT_STAGE: InternalStage = {
  id: 'default', zoom: 0.9, props: [], bgColor: '#1b1530',
  chars: { bf: { x: 1000, y: 880, z: 3200, cam: [0, 0] }, dad: { x: 340, y: 880, z: 3100, cam: [0, 0] }, gf: { x: 680, y: 790, z: 3000, cam: [0, 0] } },
};

/** Sprite creado por un script (Lua): conserva la escala "lógica" que ve el script. */
class LSprite extends Sprite {
  tag = '';
  lsx = 1; lsy = 1;
  baseSX = 1; baseSY = 1;
  added = false;
  atlas: Atlas | null = null;
  pendingAnims: [string, string, number, boolean, number[] | undefined][] = [];
  applyScale() { this.scaleX = this.lsx * this.baseSX; this.scaleY = this.lsy * this.baseSY; }
}

type IconSprite = Sprite & { base: number };

export class PlayState implements Scene, PsychHost {
  scope: ResourceScope;
  chart!: InternalChart;
  notes: GNote[] = [];
  stage!: InternalStage;
  chars = {} as Record<CharSlot, Character | null>;
  altChars = new Map<string, Character>();
  world: Sprite[] = [];
  hudList: Sprite[] = [];
  otherList: Sprite[] = [];
  props = new Map<string, Sprite>();
  scriptSprites = new Map<string, Sprite>();
  scriptAtlases = new Map<string, Atlas>();
  texts = new Map<string, { s: Sprite; text: string; opts: TextOpts; x: number; y: number }>();
  luaSprites = new Map<string, LSprite>();
  luaTexts = new Map<string, LText>();
  song!: SongPlayer;
  conductor: Conductor;
  camGame = new Camera();
  camHud = new Camera();
  camOther = new Camera();
  tweens = new Tweens();
  input: Input;
  sandbox: ScriptSandbox | null = null;
  lua: PsychScripts | null = null;
  tally = newTally();
  health = 1;
  started = false;
  paused = false;
  ended = false;
  /** Una búsqueda invalida logros, XP y récords durante toda esta partida. */
  rankedEligible = true;
  loaded = false;
  songT = -99999;
  skin!: NoteSkin;
  private skins = new Map<string, NoteSkin | null>();
  private hurtSkin: NoteSkin | null = null;
  private sounds = new Map<string, AudioBuffer | null>();
  private modImages = new Map<string, Atlas | null>();
  private evIdx = 0;
  private pIdx = 0;
  private oIdx = 0;
  private curStepI = -9999;
  private curBeatI = -9999;
  private strums: Sprite[] = [];
  private strumBase: { x: number; y: number; w: number; h: number }[] = [];
  private scrollLayoutDown: boolean | null = null;
  private strumTimers = new Float32Array(8);
  private icons: IconSprite[] = [];
  private iconFrames: Frame[][] = [];
  private noteSpr = new Sprite();
  private tmpSpr = new Sprite();
  private popups: { s: Sprite; vy: number; life: number }[] = [];
  private countdown = new Sprite();
  private camPos = { x: 0, y: 0 };
  private camTarget = { x: 0, y: 0 };
  private forcedCam: { x: number; y: number } | null = null;
  private camFollowOverride: { x: number; y: number } | null = null;
  private focus: CharSlot | 'none' = 'dad';
  defaultZoom = 0.9;
  hudDefaultZoom = 1;
  private cameraSpeed = 1;
  private camZooming = false;
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
  private skipCountdown = false;
  private songStartedCalled = false;
  private lastTick = -99;
  private spawned: GNote[] = [];
  private luaVars: Record<string, unknown> = {};
  private luaOrder = 0;
  private luaBpm = 0;
  private hud: Record<string, { visible: boolean; alpha: number }> = {
    healthBar: { visible: true, alpha: 1 }, healthBarBG: { visible: true, alpha: 1 }, scoreTxt: { visible: true, alpha: 1 },
    timeBar: { visible: true, alpha: 1 }, timeBarBG: { visible: true, alpha: 1 }, timeTxt: { visible: true, alpha: 1 }, botplayTxt: { visible: true, alpha: 1 },
    countdownReady: { visible: true, alpha: 1 }, countdownSet: { visible: true, alpha: 1 }, countdownGo: { visible: true, alpha: 1 },
  };
  private flags: Record<string, boolean> = { showRating: true, showComboNum: true, showCombo: true };
  private timeText: LText | null = null;
  private videoEl: HTMLVideoElement | null = null;
  private videoUrl: string | null = null;
  private timeShown = '';

  constructor(private audio: AudioEngine, private renderer: Renderer, public mod: ModRuntime, public songId: string, public diff: string, private shared: SharedAssets, private hooks: PlayHooks) {
    this.scope = new ResourceScope(renderer, mod.source, `${mod.manifest.id}/${songId}`);
    for (const [k, v] of Object.entries(mod.manifest.textureScale ?? {})) this.scope.texScales[k.toLowerCase()] = v;
    this.conductor = new Conductor(audio.ctx);
    this.input = new Input();
  }

  // ================================================================ PsychHost (datos que leen los scripts)
  get songName() { return this.chart?.songName ?? this.songId; }
  get curBeat() { return this.curBeatI; }
  get curStep() { return this.curStepI; }
  get bpm() { return this.bpmAt(Math.max(0, this.songT)); }
  get songLength() { return this.song?.duration ?? 0; }
  get downscroll() { return settings.downscroll; }
  get middlescroll() { return false; }
  get botplay() { return settings.botplay; }

  // ================================================================ carga
  private fileList: string[] | null = null;
  private fileSet: Map<string, string> | null = null;
  private files(): string[] {
    if (!this.fileList) {
      this.fileList = (this.mod.manifest.files ?? []).map((f) => f.replace(/\\/g, '/'));
      this.fileSet = new Map(this.fileList.map((f) => [f.toLowerCase(), f]));
    }
    return this.fileList;
  }
  private hasFile(path: string) { this.files(); return this.fileSet!.has(path.toLowerCase()); }
  private realPath(path: string) { this.files(); return this.fileSet!.get(path.toLowerCase()) ?? path; }

  async load(progress: (p: number, label: string) => void): Promise<string[]> {
    const { adapter, source, manifest } = this.mod;
    const t0 = performance.now();
    let done = 0, total = 7;
    const step = (label: string) => progress(++done / total, label);

    progress(0, 'Leyendo chart…');
    const files: Record<string, Blob | null> = {};
    await Promise.all(adapter.chartFiles(this.songId, this.diff).map(async (f) => {
      try { files[f.key] = await source.blob(f.path); }
      catch (e) { if (f.optional && e instanceof LoadError) files[f.key] = null; else throw e; }
    }));
    this.chart = await convertChart(manifest.format, this.songId, this.diff, files);
    this.warnings.push(...this.chart.warnings);
    step('Chart convertido');

    // scripts Lua del mod (como Psych: globales, escenario, eventos, tipos de nota, personajes y canción)
    const luaFiles = this.luaScriptList();
    const luaCode = new Map<string, string>();
    await Promise.all(luaFiles.map(async (f) => { try { luaCode.set(f, await (await source.blob(f)).text()); } catch { /* opcional */ } }));
    const literals = new Set<string>();
    for (const code of luaCode.values()) for (const m of code.matchAll(/(['"])((?:(?!\1)[^\\\n]|\\.){1,120})\1/g)) literals.add(m[2]);

    const ids: Record<CharSlot, string> = { bf: this.chart.player || 'bf', dad: this.chart.opponent || 'dad', gf: this.chart.gf || 'gf' };
    const extra = new Set<string>();
    for (const e of this.chart.events) if (e.name === 'changeChar') extra.add(`${e.v.target}:${e.v.char}`);
    for (const lit of literals) {
      if (Object.values(ids).includes(lit) || !this.hasFile(adapter.characterFile(lit))) continue;
      if (luaCode.size && [...luaCode.values()].some((c) => c.includes('addCharacterToList') || c.includes('Change Character'))) for (const slot of ['bf', 'dad', 'gf']) extra.add(`${slot}:${lit}`);
    }
    total += Math.min(extra.size, 6);

    const audioP = (async () => {
      const a = adapter.audio(this.songId, this.chart);
      const inst = (await this.audio.load(source, a.inst))!;
      let voices: { buf: AudioBuffer; who: 'player' | 'opponent' | 'both' }[] = [];
      for (const group of [0, 1, 2, 3]) {
        const res = await Promise.all(a.voices.filter((v) => v.group === group).map(async (v) => ({ buf: await this.audio.load(source, v.url, true), who: v.who })));
        voices = res.filter((v) => v.buf) as typeof voices;
        if (voices.length) break;
      }
      this.song = new SongPlayer(this.audio, inst, voices);
      step('Audio decodificado');
    })();

    const charP = Promise.all((['gf', 'dad', 'bf'] as CharSlot[]).map(async (slot) => {
      this.chars[slot] = await this.loadCharacter(ids[slot], slot === 'bf', slot === 'gf');
      step('Personaje ' + ids[slot]);
    }));
    let extraDone = 0;
    const extraP = Promise.all([...extra].map(async (k) => {
      const [slot, id] = k.split(':');
      const c = await this.loadCharacter(id, slot === 'bf', false, true);
      if (c) this.altChars.set(k, c);
      if (++extraDone <= 6) step('Personaje ' + id);
    }));

    const stageP = (async () => {
      const sid = this.chart.stage || adapter.defaultStage;
      try {
        this.stage = adapter.parseStage(await getJson(source, adapter.stageFile(sid)), sid);
      } catch (e) {
        if (!(e instanceof LoadError)) throw e;
        if (this.chart.stage) this.warnings.push(`Escenario "${sid}" no encontrado: se usa uno por defecto.`);
        this.stage = structuredClone(DEFAULT_STAGE);
      }
      await Promise.all(this.stage.props.map(async (p) => {
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
              s.anim.addFromAtlas(atlas, 'idle', p.anim.prefix, p.anim.fps, p.anim.loop, p.anim.indices);
              s.anim.play('idle');
              s.update(0);
            }
            s.scaleX = p.scale[0] * atlas.texMul; s.scaleY = p.scale[1] * atlas.texMul;
            if (p.color) s.setColor(p.color);
          } catch {
            this.warnings.push(`Imagen de escenario no encontrada: ${p.image}`);
            return;
          }
        }
        s.name = p.name; s.x = p.x; s.y = p.y; s.scrollX = p.scroll[0]; s.scrollY = p.scroll[1]; s.z = p.z; s.alpha = p.alpha;
        s.visible = !(p.lowQuality && settings.quality === 'low');
        this.props.set(p.name, s);
      }));
      step('Escenario');
    })();

    // skin de notas del mod (o la de FNF por defecto) y recursos opcionales del HUD
    const skinP = (async () => {
      const arrowSkin = this.chart.arrowSkin;
      const candidates = [arrowSkin, 'NOTE_assets', 'noteSkins/NOTE_assets'].filter(Boolean) as string[];
      let skin: NoteSkin | null = null;
      for (const c of candidates) { skin = await this.loadSkin(c); if (skin?.ok) break; skin = null; }
      if (!skin && this.shared.fnfNotes) { const s = new NoteSkin(this.shared.fnfNotes, this.shared.fnfNotes.texMul); if (s.ok) skin = s; }
      this.skin = skin ?? new NoteSkin(this.shared.notes);
      this.hurtSkin = await this.loadSkin('HURTNOTE_assets');
      // puntuaciones/cuenta atrás: las del mod; si no trae, las de Psych por defecto
      await Promise.all(PSYCH_UI.map(async (n) => { if (!(await this.modImage(n)) && this.shared.psychUi[n]) this.modImages.set(n, this.shared.psychUi[n]); }));
      step('Notas e interfaz');
    })();

    // imágenes y sonidos mencionados en los scripts: se precargan para que makeLuaSprite sea instantáneo
    const preloadP = Promise.all([...literals].map(async (lit) => {
      if (lit.length > 100) return;
      const img = 'images/' + lit + '.png';
      if (this.hasFile(img)) { try { await this.scope.atlas(this.realPath(img).slice(0, -4)); } catch { /* opcional */ } }
      else if (this.hasFile(`sounds/${lit}.ogg`) || this.hasFile(`sounds/${lit}.m4a`)) await this.loadSound(lit);
    }));

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

    const fontsP = Promise.all((manifest.fonts ?? []).map(async (f) => {
      try {
        const buf = await (await source.blob(f)).arrayBuffer();
        const face = new FontFace(f.split('/').pop()!.replace(/\.\w+$/, ''), buf);
        await face.load();
        document.fonts.add(face);
      } catch { this.warnings.push(`Fuente no cargada: ${f}`); }
    }));

    await Promise.all([audioP, charP, extraP, stageP, scriptsP, fontsP, skinP, preloadP]);
    this.setup();

    if (luaCode.size) {
      this.lua = new PsychScripts(this);
      for (const [name, code] of luaCode) {
        const entry = this.lua.load(name, code);
        // como en Psych, onCreate se llama justo después de cargar cada script
        const fn = entry.I.G.get('onCreate');
        if (!entry.closed && fn !== undefined) {
          try { entry.I.protectedCall(fn, []); } catch (e) { this.scriptError(name + ':onCreate', (e as Error).message); }
        }
      }
      this.lua.call('onCreatePost');
      this.rebuildWorld();
    }
    step('Listo');
    Diag.recordLoad(`TOTAL ${manifest.id}/${this.songId}`, performance.now() - t0);
    this.loaded = true;
    if (this.sandbox || this.lua) this.warnings = this.warnings.filter((w) => !w.startsWith('Eventos personalizados'));
    for (const w of this.warnings) Diag.warn(w);
    return this.warnings;
  }

  /** Lista de scripts Lua que cargaría Psych para esta canción, según los archivos del mod. */
  private luaScriptList(): string[] {
    const files = this.files().filter((f) => f.toLowerCase().endsWith('.lua'));
    if (!files.length) return [];
    const out: string[] = [];
    const add = (pred: (f: string) => boolean) => { for (const f of files) if (pred(f.toLowerCase()) && !out.includes(f)) out.push(f); };
    add((f) => /^scripts\/[^/]+\.lua$/.test(f));
    const stage = (this.chart.stage || '').toLowerCase();
    if (stage) add((f) => f === `stages/${stage}.lua`);
    const evNames = new Set(this.chart.events.map((e) => (e.raw?.[0] ?? '').toLowerCase()).filter(Boolean));
    add((f) => f.startsWith('custom_events/') && evNames.has(f.slice(14, -4)));
    const types = new Set(this.chart.notes.map((n) => (n.type ?? '').toLowerCase()).filter(Boolean));
    add((f) => f.startsWith('custom_notetypes/') && types.has(f.slice(17, -4)));
    const chars = new Set([this.chart.player, this.chart.opponent, this.chart.gf, ...this.chart.events.filter((e) => e.name === 'changeChar').map((e) => String(e.v.char ?? ''))].filter(Boolean).map((c) => c!.toLowerCase()));
    add((f) => f.startsWith('characters/') && chars.has(f.slice(11, -4)));
    add((f) => f.startsWith(`data/${this.songId.toLowerCase()}/`));
    return out;
  }

  private async loadSkin(path: string): Promise<NoteSkin | null> {
    const key = path.toLowerCase();
    if (this.skins.has(key)) return this.skins.get(key)!;
    this.skins.set(key, null);
    let skin: NoteSkin | null = null;
    const p = 'images/' + path;
    if (this.hasFile(p + '.png') && this.hasFile(p + '.xml')) {
      try {
        const atlas = await this.scope.atlas(this.realPath(p + '.png').slice(0, -4));
        const s = new NoteSkin(atlas, atlas.texMul);
        skin = s.ok || s.note.every(Boolean) ? s : null; // las texturas de tipos de nota solo necesitan las cabezas
      } catch { skin = null; }
    }
    this.skins.set(key, skin);
    return skin;
  }

  private async modImage(name: string): Promise<Atlas | null> {
    if (this.modImages.has(name)) return this.modImages.get(name)!;
    let a: Atlas | null = null;
    const p = `images/${name}.png`;
    if (this.hasFile(p)) { try { a = await this.scope.atlas(this.realPath(p).slice(0, -4)); } catch { a = null; } }
    this.modImages.set(name, a);
    return a;
  }

  private async loadSound(name: string): Promise<AudioBuffer | null> {
    if (this.sounds.has(name)) return this.sounds.get(name)!;
    this.sounds.set(name, null);
    try { const b = await this.audio.load(this.mod.source, 'sounds/' + name, true); this.sounds.set(name, b); return b; } catch { return null; }
  }

  private async loadCharacter(id: string, isPlayer: boolean, isGf = false, quiet = false): Promise<Character | null> {
    const { adapter, source } = this.mod;
    let def: InternalCharacter;
    let atlas: Atlas;
    try {
      def = adapter.parseCharacter(await getJson(source, adapter.characterFile(id)), id, isPlayer);
      atlas = await this.scope.atlas(def.image);
    } catch (e) {
      if (!(e instanceof LoadError) && !(e instanceof Error && /render/.test(e.message))) throw e;
      if (quiet) return null;
      if (isGf) { this.warnings.push(`El mod no incluye a "${id}": se oculta.`); return null; }
      this.warnings.push(`Personaje "${id}" no disponible en el mod: se usa un personaje de reemplazo.`);
      def = { ...this.shared.placeholder.def, id, flipX: !isPlayer ? false : true };
      atlas = this.shared.placeholder.atlas;
    }
    const c = new Character(def, atlas, isPlayer);
    c.name = id;
    // icono del mod tal cual (images/icons/icon-<id>.png o images/icons/<id>.png)
    let iconAtlas: Atlas = this.shared.iconFallback;
    const hasList = this.files().length > 0;
    for (const p of [`images/icons/icon-${def.icon}`, `images/icons/${def.icon}`]) {
      if (hasList && !this.hasFile(p + '.png')) continue;
      try { iconAtlas = await this.scope.atlas(hasList ? this.realPath(p + '.png').slice(0, -4) : p); break; } catch { /* siguiente */ }
    }
    c.iconFrames = splitIcon(iconAtlas);
    c.iconMul = iconAtlas.texMul;
    return c;
  }

  // ================================================================ preparación
  private setup() {
    const st = this.stage;
    this.defaultZoom = st.zoom;
    this.camGame.zoom = st.zoom;
    this.camGame.bgColor = st.bgColor;
    for (const slot of ['gf', 'dad', 'bf'] as CharSlot[]) {
      const c = this.chars[slot];
      if (!c) continue;
      c.setStageScale(st.pixelZoom ?? 1);
      c.place(st.chars[slot].x, st.chars[slot].y);
      c.z = st.chars[slot].z;
      if (slot === 'gf' && st.hideGf) c.visible = false;
    }
    for (const [k, c] of this.altChars) {
      const slot = k.split(':')[0] as CharSlot;
      c.setStageScale(st.pixelZoom ?? 1);
      c.place(st.chars[slot].x, st.chars[slot].y);
      c.z = st.chars[slot].z;
    }
    this.rebuildWorld();

    this.notes = this.chart.notes.map((n) => {
      const hurt = n.kind === 'hurt';
      return {
        t: n.t, lane: n.lane, len: n.len, player: n.player, kind: n.kind, type: n.type ?? '', state: 0, hold: 0,
        texture: hurt ? 'HURTNOTE_assets' : '', hitCausesMiss: hurt, ignoreNote: hurt, noAnimation: n.kind === 'noanim', noMissAnimation: false,
        hitHealth: 0.023, missHealth: hurt ? 0.3 : 0.0475, alpha: 1, visible: true, offsetX: 0, offsetY: 0, angle: 0, multAlpha: 1, spawned: false, extra: {},
      };
    });
    this.speed = settings.scrollSpeed > 0 ? settings.scrollSpeed : this.chart.scrollSpeed;
    this.speedObj.v = 1;

    // receptores (strums): 0..3 oponente, 4..7 jugador — posiciones de Psych (x = 42 + 50 + 112·i [+640], y = 50 / 570)
    const y = settings.downscroll ? VIEW_H - 150 : 50;
    this.strums = []; this.strumBase = [];
    for (let i = 0; i < 8; i++) {
      const lane = i % 4;
      const s = new Sprite();
      s.anim = new Animator();
      s.anim.add({ name: 'static', frames: this.skin.static[lane], fps: 24, loop: false, offset: [0, 0] });
      s.anim.add({ name: 'pressed', frames: this.skin.press[lane], fps: 24, loop: false, offset: [0, 0] });
      s.anim.add({ name: 'confirm', frames: this.skin.confirm[lane], fps: 24, loop: false, offset: [0, 0] });
      s.anim.play('static');
      s.scaleX = s.scaleY = this.skin.scale;
      s.update(0);
      const f0 = this.skin.static[lane][0];
      const w = (f0?.fw ?? 157) * this.skin.scale, h = (f0?.fh ?? 157) * this.skin.scale;
      s.x = 42 + 50 + (i >= 4 ? VIEW_W / 2 : 0) + lane * SWAG;
      s.y = y;
      s.cam = 'hud';
      this.strums.push(s);
      this.strumBase.push({ x: s.x, y: s.y, w, h });
    }
    this.setupIcons();
    this.syncScrollLayout();
    this.countdown.visible = false;

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

  /** Mantiene los receptores alineados cuando downscroll cambia sin recargar la página. */
  private syncScrollLayout() {
    const down = !!settings.downscroll;
    if (this.scrollLayoutDown === down) return;
    this.scrollLayoutDown = down;
    const y = down ? VIEW_H - 150 : 50;
    for (let i = 0; i < this.strums.length; i++) {
      this.strums[i].y = y;
      if (this.strumBase[i]) this.strumBase[i].y = y;
    }
    const iconY = (down ? 0.11 : 0.89) * VIEW_H - 75;
    for (const icon of this.icons) icon.y = iconY;
  }

  private setupIcons() {
    const prev = this.icons;
    this.icons = []; this.iconFrames = [];
    for (const slot of ['bf', 'dad'] as CharSlot[]) {
      const c = this.chars[slot];
      const frames = c?.iconFrames ?? splitIcon(this.shared.iconFallback);
      const s = new Sprite(frames[0]) as IconSprite;
      const mul = c?.iconMul ?? 1;
      s.scaleX = s.scaleY = mul;
      s.base = mul;
      s.flipX = slot === 'bf';
      s.cam = 'hud';
      this.icons.push(s);
      this.iconFrames.push(frames);
    }
    // Psych: iconos en y = healthBar.y − 75 (solo al crearlos; los scripts pueden moverlos)
    const by = settings.downscroll ? 0.11 * VIEW_H : 0.89 * VIEW_H;
    this.icons.forEach((ic, i) => {
      const o = prev[i];
      ic.y = o ? o.y : by - 75;
      if (o) { ic.visible = o.visible; ic.alpha = o.alpha; ic.angle = o.angle; }
    });
    for (const [i, ic] of this.icons.entries()) if (prev[i]) proxies.delete(prev[i]);
    parseColor(this.chars.dad?.def.healthColor ?? '#ff0000', this.healthColors[0]);
    parseColor(this.chars.bf?.def.healthColor ?? '#66ff33', this.healthColors[1]);
  }

  private rebuildWorld() {
    const game: Sprite[] = [...this.props.values()];
    const hud: Sprite[] = [], other: Sprite[] = [];
    const place = (s: Sprite) => (s.cam === 'other' ? other : s.cam === 'hud' || s.hud ? hud : game).push(s);
    // Los grupos de personajes pueden cambiar de cámara mediante setObjectCamera en Psych.
    for (const slot of ['gf', 'dad', 'bf'] as CharSlot[]) { const c = this.chars[slot]; if (c) place(c); }
    for (const s of this.scriptSprites.values()) place(s);
    for (const s of this.luaSprites.values()) if (s.added) place(s);
    for (const t of this.luaTexts.values()) if (t.added) place(t.s);
    const byZ = (a: Sprite, b: Sprite) => a.z - b.z;
    this.world = game.sort(byZ); this.hudList = hud.sort(byZ); this.otherList = other.sort(byZ);
  }

  // ================================================================ control
  start() {
    const crochet = 60000 / this.bpmAt(0);
    const lead = this.skipCountdown ? 0.15 : 0.25 + (4 * crochet) / 1000;
    const startCtx = this.audio.ctx.currentTime + lead;
    this.song.start(startCtx);
    this.conductor.userOffsetMs = settings.offsetMs;
    this.conductor.sync(true);
    this.started = true; this.paused = false; this.ended = false;
    this.songStartedCalled = false; this.lastTick = -99;
    this.sandbox?.call('onCreate');
    this.lua?.setVar('startedCountdown', true);
    this.lua?.call('onCountdownStarted');
  }

  /** Busca una posición y resincroniza audio, reloj, notas y eventos. */
  async seekTo(targetMs: number) {
    if (!this.started || this.ended || !this.song) return;
    const target = Math.max(0, Math.min(this.song.duration - 100, Number.isFinite(targetMs) ? targetMs : 0));
    this.rankedEligible = false;
    await this.audio.ctx.resume();
    this.song.stop();
    for (const n of this.notes) {
      n.spawned = false;
      n.hold = n.t < target ? 2 : 0;
      n.state = n.t < target ? (n.player ? 2 : 1) : 0;
    }
    const nextPlayer = this.notes.findIndex((n) => n.player && n.t >= target);
    const nextOpponent = this.notes.findIndex((n) => !n.player && n.t >= target);
    this.pIdx = nextPlayer < 0 ? this.notes.length : nextPlayer;
    this.oIdx = nextOpponent < 0 ? this.notes.length : nextOpponent;
    this.evIdx = 0;
    const step = Math.floor(timeToBeat(target, this.chart.timeChanges) * 4);
    this.curStepI = step - 1;
    this.curBeatI = Math.floor((step - 1) / 4);
    this.songStartedCalled = target > 0;
    this.lastTick = -99;
    this.spawned.length = 0;
    this.popups.length = 0;
    this.strumTimers.fill(0);
    this.botHeld.fill(-1);
    this.holdingLane.fill(false);
    for (const s of this.strums) s.anim?.play('static', true);
    this.tweens.clear();
    // El audio arranca ahora desde target y el reloj del juego toma ese mismo offset.
    const startCtx = this.audio.ctx.currentTime - target / 1000;
    this.song.start(startCtx, target);
    this.conductor.userOffsetMs = settings.offsetMs;
    this.conductor.sync(true);
    this.songT = target;
    this.paused = false;
    this.ended = false;
    this.lua?.call('onResume');
  }

  restart() {
    this.song.stop();
    this.tally = newTally();
    this.health = 1;
    this.evIdx = this.pIdx = this.oIdx = 0;
    this.curStepI = this.curBeatI = -9999;
    for (const n of this.notes) { n.state = 0; n.hold = 0; n.spawned = false; }
    this.speed = settings.scrollSpeed > 0 ? settings.scrollSpeed : this.chart.scrollSpeed;
    this.speedObj.v = 1;
    this.forcedCam = null; this.camFollowOverride = null;
    this.camGame.zoom = this.defaultZoom = this.stage.zoom;
    this.camHud.zoom = 1;
    this.tweens.clear();
    this.popups.length = 0;
    this.botHeld.fill(-1);
    this.hudDirty = true;
    for (const s of this.strums) s.anim!.play('static', true);
    if (this.paused) { this.paused = false; void this.audio.ctx.resume(); }
    this.start();
  }

  async pause() {
    if (!this.started || this.paused || this.ended) return;
    this.paused = true;
    this.input.releaseAll();
    this.lua?.call('onPause');
    await this.audio.ctx.suspend();
  }

  async resume() {
    if (!this.paused) return;
    await this.audio.ctx.resume();
    this.conductor.sync(true);
    this.paused = false;
    this.lua?.call('onResume');
  }

  dispose() {
    this.lua?.call('onDestroy');
    this.videoEl?.pause(); this.videoEl?.remove(); this.videoEl = null;
    if (this.videoUrl) URL.revokeObjectURL(this.videoUrl);
    this.videoUrl = null;
    this.song?.stop();
    this.input.destroy();
    this.sandbox?.destroy();
    this.scope.dispose();
    this.tweens.clear();
    this.world = []; this.hudList = []; this.otherList = [];
    this.props.clear(); this.scriptSprites.clear(); this.texts.clear(); this.luaSprites.clear(); this.luaTexts.clear();
    if (this.audio.ctx.state === 'suspended') void this.audio.ctx.resume();
  }

  // ================================================================ entrada
  private onLane(lane: number, down: boolean, ts: number) {
    if (!this.started || this.paused || this.ended || settings.botplay) return;
    const t = this.conductor.songTimeAt(ts, this.song.startCtx);
    const strum = this.strums[4 + lane];
    this.holdingLane[lane] = down;
    if (down) {
      const i = this.findHit(lane, t);
      if (i >= 0) this.hitNote(this.notes[i], t);
      else {
        strum.anim!.play('pressed', true);
        this.lua?.call('onGhostTap', [lane]);
        if (!settings.ghostTapping) { this.miss(lane, false, null); this.lua?.call('noteMissPress', [lane]); }
      }
    } else {
      strum.anim!.play('static', true);
      for (let i = this.pIdx; i < this.notes.length; i++) {
        const n = this.notes[i];
        if (n.t > t) break;
        if (n.player && n.lane === lane && n.hold === 1) {
          if (t < n.t + n.len - 100) { n.hold = 3; this.miss(lane, true, n); }
          else n.hold = 2;
        }
      }
    }
  }

  /** nota a golpear: la más temprana del carril; las dañinas solo si no hay otra en la ventana */
  private findHit(lane: number, t: number): number {
    const i = findHittable(this.notes, this.pIdx, lane, t);
    if (i < 0) return -1;
    const n = this.notes[i];
    if (n.ignoreNote || n.hitCausesMiss) {
      for (let j = i + 1; j < this.notes.length; j++) {
        const m = this.notes[j];
        if (m.t > t + HIT_WINDOW) break;
        if (m.player && m.lane === lane && m.state === 0 && !m.hitCausesMiss) return j;
      }
    }
    return i;
  }

  private hitNote(n: GNote, t: number) {
    n.state = 1;
    const strum = this.strums[4 + n.lane];
    if (n.hitCausesMiss) {
      this.health -= n.missHealth;
      applyMiss(this.tally);
      if (!n.noMissAnimation) this.chars.bf?.sing(n.lane, true);
      if (settings.missSounds) this.audio.playSfx('miss', 0.5);
      strum.anim!.play('pressed', true);
      this.hudDirty = true;
      this.syncScoreVars(true);
      this.lua?.call('noteMiss', [this.noteId(n), n.lane, n.type, false]);
      return;
    }
    const delta = n.t - t;
    Diag.lastInputDelta = -delta;
    const r = judge(delta);
    applyHit(this.tally, r);
    this.health += r === 'shit' ? -0.01 : r === 'bad' ? n.hitHealth * 0.25 : n.hitHealth;
    if (n.len > 0) n.hold = 1;
    strum.anim!.play('confirm', true);
    const singer = n.kind === 'gf' ? this.chars.gf : this.chars.bf;
    if (singer && !n.noAnimation) singer.sing(n.lane, false, n.kind === 'alt' ? '-alt' : '');
    this.song.setVoice('player', true);
    this.popup(r);
    this.hudDirty = true;
    this.camZooming = true;
    this.sandbox?.call('onNoteHit', n.lane, n.kind, r);
    this.syncScoreVars();
    this.lua?.call('goodNoteHit', [this.noteId(n), n.lane, n.type, false]);
  }

  private miss(lane: number, countAsNote: boolean, n: GNote | null) {
    applyMiss(this.tally);
    if (!countAsNote) this.tally.judged--;
    this.health -= n ? n.missHealth : 0.0475;
    if (!n?.noMissAnimation) this.chars.bf?.sing(lane, true);
    this.song.setVoice('player', false);
    if (settings.missSounds) this.audio.playSfx('miss', 0.4 + Math.random() * 0.2);
    this.hudDirty = true;
    this.sandbox?.call('onNoteMiss', lane);
    this.syncScoreVars(true);
    if (n) this.lua?.call('noteMiss', [this.noteId(n), lane, n.type, false]);
  }

  private syncScoreVars(miss = false) {
    const l = this.lua;
    if (!l) return;
    const t = this.tally;
    l.setVar('score', t.score); l.setVar('misses', t.miss); l.setVar('hits', t.sick + t.good + t.bad + t.shit); l.setVar('combo', t.combo);
    l.setVar('rating', accuracy(t) / 100); l.setVar('ratingName', grade(t));
    l.call('onUpdateScore', [miss]); // Psych lo llama cada vez que cambia la puntuación
  }

  private noteId(n: GNote) { const i = this.spawned.indexOf(n); return i >= 0 ? i : 0; }

  private popup(r: Rating) {
    if (!this.flags.showRating) return;
    const own = this.modImages.get(r);
    const f = own ? own.frames[0] : this.shared.ui.byPrefix(r)[0];
    if (!f) return;
    const sc = own ? 0.7 * own.texMul : 0.7;
    let p = this.popups.find((x) => x.life <= 0);
    if (!p) { if (this.popups.length > 12) return; p = { s: new Sprite(), vy: 0, life: 0 }; this.popups.push(p); }
    p.s.frame = f; p.s.cam = 'hud';
    p.s.scaleX = p.s.scaleY = sc;
    // Psych: coolText.x = width·0.35, rating.x = coolText.x − 40, y = centro − 60
    p.s.x = VIEW_W * 0.35 - 40; p.s.y = VIEW_H / 2 - 60 - (f.fh * sc) / 2;
    p.s.alpha = 1; p.vy = -0.3; p.life = 700;
    // números del combo (Psych: 3 cifras mínimo, escala 0.5, debajo de la puntuación)
    if (!this.flags.showComboNum) return;
    const digits = String(this.tally.combo).padStart(3, '0');
    for (let i = 0; i < digits.length; i++) {
      const na = this.modImages.get('num' + digits[i]);
      if (!na) break;
      let q = this.popups.find((x) => x.life <= 0);
      if (!q) { if (this.popups.length > 40) return; q = { s: new Sprite(), vy: 0, life: 0 }; this.popups.push(q); }
      const nf = na.frames[0];
      q.s.frame = nf; q.s.cam = 'hud'; q.s.scaleX = q.s.scaleY = 0.5 * na.texMul;
      q.s.x = VIEW_W * 0.35 + 43 * i - 90; q.s.y = VIEW_H / 2 + 80 - (nf.fh * 0.5 * na.texMul) / 2;
      q.s.alpha = 1; q.vy = -0.25 - Math.random() * 0.1; q.life = 800;
    }
  }

  // ================================================================ bucle
  update(now: number, dt: number) {
    this.syncScrollLayout();
    if (!this.started || this.paused || this.ended) return;
    this.conductor.sync();
    const t = this.conductor.songTimeAt(now, this.song.startCtx);
    this.songT = t;
    this.stepMs = 15000 / this.bpmAt(t);
    const lua = this.lua;

    if (lua) {
      lua.setVar('songPosition', t);
      const b = this.bpmAt(t);
      if (b !== this.luaBpm) { this.luaBpm = b; lua.setVar('bpm', b); lua.setVar('crochet', 60000 / b); lua.setVar('stepCrochet', 15000 / b); }
      lua.call('onUpdate', [dt / 1000]);
    }

    const beatF = timeToBeat(Math.max(t, -60000), this.chart.timeChanges);
    const step = Math.floor(beatF * 4);
    if (step !== this.curStepI) {
      for (let s = Math.max(this.curStepI + 1, step - 4); s <= step; s++) {
        this.curStepI = s;
        if (lua) { lua.setVar('curStep', s); lua.setVar('curDecStep', beatF * 4); }
        if (s % 4 === 0) this.beatHit(Math.floor(s / 4));
        this.sandbox?.call('onStepHit', s);
        lua?.call('onStepHit');
        if (s >= 0 && s % 16 === 0) { lua?.setVar('curSection', s / 16); lua?.call('onSectionHit'); }
      }
      this.curStepI = step;
    }
    this.countdownUpdate(beatF);
    if (t >= 0 && !this.songStartedCalled) { this.songStartedCalled = true; lua?.call('onSongStart'); }

    while (this.evIdx < this.chart.events.length && this.chart.events[this.evIdx].t <= t) this.applyEvent(this.chart.events[this.evIdx++]);

    // notas visibles (grupo 'notes' de Psych) y onSpawnNote
    const horizon = (VIEW_H + 300) / (0.45 * this.speed);
    this.spawned.length = 0;
    const notes = this.notes;
    for (let i = Math.min(this.pIdx, this.oIdx); i < notes.length; i++) {
      const n = notes[i];
      if (n.t - t > horizon) break;
      if (n.state !== 0 && n.hold !== 1) continue;
      this.spawned.push(n);
      if (!n.spawned) { n.spawned = true; lua?.call('onSpawnNote', [this.spawned.length - 1, n.lane, n.type, false, n.t]); }
    }

    // notas del oponente
    for (let i = this.oIdx; i < notes.length; i++) {
      const n = notes[i];
      if (n.t > t) break;
      if (!n.player && n.state === 0) {
        n.state = 1;
        if (n.hitCausesMiss || n.ignoreNote) continue;
        this.strums[n.lane].anim!.play('confirm', true);
        this.strumTimers[n.lane] = 150 + n.len;
        const who = n.kind === 'gf' ? this.chars.gf : this.chars.dad;
        if (who && !n.noAnimation) who.sing(n.lane, false, n.kind === 'alt' ? '-alt' : '');
        this.song.setVoice('opponent', true);
        this.camZooming = true;
        this.sandbox?.call('onOpponentNoteHit', n.lane, n.kind);
        lua?.call('opponentNoteHit', [this.noteId(n), n.lane, n.type, false]);
      }
      if (i === this.oIdx && (n.player || n.state !== 0) && n.t + n.len < t - 50) this.oIdx++;
    }
    for (let i = Math.max(0, this.oIdx - 8); i < notes.length; i++) {
      const n = notes[i];
      if (n.t > t) break;
      if (!n.player && n.len > 0 && t < n.t + n.len && !n.noAnimation) { const c = n.kind === 'gf' ? this.chars.gf : this.chars.dad; if (c) c.holdTimer = 0; }
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
        if (bot && !n.hitCausesMiss && !n.ignoreNote && n.t <= t) {
          this.hitNote(n, n.t);
          this.botHeld[n.lane] = n.len > 0 ? n.t + n.len : n.t + 100;
        } else if (t > n.t + HIT_WINDOW) {
          n.state = 2;
          if (!n.ignoreNote && !n.hitCausesMiss) this.miss(n.lane, true, n);
        }
      }
      if (n.hold === 1) {
        if (t >= n.t + n.len) n.hold = 2;
        else {
          this.health += dt * 0.00012;
          this.tally.score += Math.round(dt * 0.25);
          this.hudDirty = true;
          const c = n.kind === 'gf' ? this.chars.gf : this.chars.bf;
          if (c) c.holdTimer = 0;
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
    if (this.health <= 0 && !bot) {
      if (lua && lua.call('onGameOver') === FUNCTION_STOP) this.health = 0.001;
      else { this.gameOver(); return; }
    }

    lua?.update(dt);
    for (const s of this.world) s.update(dt);
    for (const s of this.hudList) s.update(dt);
    for (const s of this.otherList) s.update(dt);
    const holdAny = this.holdingLane.some(Boolean) || (bot && this.botHeld.some((v) => v >= 0));
    for (const slot of ['gf', 'dad', 'bf'] as CharSlot[]) this.chars[slot]?.updateHold(dt, this.stepMs, slot === 'bf' && holdAny);
    for (const s of this.strums) s.update(dt);
    this.tweens.update(dt);
    this.speed = (settings.scrollSpeed > 0 ? settings.scrollSpeed : this.chart.scrollSpeed) * this.speedObj.v;

    // cámara (seguimiento suave de Psych: lerp = elapsed · 2.4 · cameraSpeed)
    this.computeCamTarget();
    const k = Math.min(1, (dt / 1000) * 2.4 * this.cameraSpeed);
    this.camPos.x += (this.camTarget.x - this.camPos.x) * k;
    this.camPos.y += (this.camTarget.y - this.camPos.y) * k;
    const zk = Math.exp((-dt / 1000) * 3.125);
    if (this.camZooming) {
      this.camGame.zoom = this.defaultZoom + (this.camGame.zoom - this.defaultZoom) * zk;
      this.camHud.zoom = this.hudDefaultZoom + (this.camHud.zoom - this.hudDefaultZoom) * zk;
    }
    this.applyCam();
    this.camGame.update(dt); this.camHud.update(dt); this.camOther.update(dt);

    // iconos: rebote como en Psych 0.7
    const ik = Math.exp((-dt / 1000) * 9);
    for (const ic of this.icons) ic.scaleX = ic.scaleY = ic.base + (ic.scaleX - ic.base) * ik;

    for (const p of this.popups) if (p.life > 0) { p.life -= dt; p.s.y += p.vy * dt; p.vy += 0.0009 * dt; p.s.alpha = Math.min(1, p.life / 250); }

    if (this.hudDirty) {
      this.hudDirty = false;
      const tl = this.tally;
      this.hooks.onHud(`Puntos: ${tl.score.toLocaleString('es')} | Fallos: ${tl.miss} | Precisión: ${accuracy(tl).toFixed(2)}% - ${grade(tl)}${settings.botplay ? ' | BOT' : ''}`);
    }

    if (this.sandbox) {
      if (this.sandbox.has('onUpdate')) this.sandbox.call('onUpdate', t);
      this.sandbox.flush({ song: this.songId, diff: this.diff, songTime: t, beat: this.curBeatI, step: this.curStepI, health: this.health, score: this.tally.score, misses: this.tally.miss, combo: this.tally.combo });
    }
    lua?.call('onUpdatePost', [dt / 1000]);

    if (t > this.song.duration + 400 && this.pIdx >= notes.length) this.finish();
    else if (t > this.song.duration + 3000) this.finish();
  }

  private bpmAt(t: number) {
    let b = this.chart.timeChanges[0]?.bpm ?? this.chart.bpm;
    for (const c of this.chart.timeChanges) { if (c.t > t) break; b = c.bpm; }
    return b;
  }

  private beatHit(beat: number) {
    this.curBeatI = beat;
    for (const slot of ['gf', 'dad', 'bf'] as CharSlot[]) this.chars[slot]?.dance(beat);
    for (const p of this.props.values()) if (p.anim && !p.anim.cur?.loop) p.anim.play('idle', true);
    for (const ic of this.icons) ic.scaleX = ic.scaleY = ic.base * 1.2;
    if (beat >= 0 && this.camZooming && this.bopRate > 0 && beat % this.bopRate === 0 && this.camGame.zoom < 1.35) {
      this.camGame.zoom += 0.015 * this.bopIntensity;
      this.camHud.zoom += 0.03 * this.bopIntensity;
    }
    this.sandbox?.call('onBeatHit', beat);
    if (this.lua) { this.lua.setVar('curBeat', beat); this.lua.call('onBeatHit'); }
  }

  private countdownUpdate(beatF: number) {
    // Psych: tick 0 (beat −4) "3", 1 ready, 2 set, 3 go, 4 empieza la canción
    if (this.skipCountdown) { this.countdown.visible = false; return; }
    const tick = Math.floor(beatF) + 4;
    if (tick !== this.lastTick && tick >= 0 && tick <= 4) {
      this.lastTick = tick;
      if (tick < 4) this.audio.playSfx(tick === 3 ? 'go' : 'beep', 0.6);
      this.lua?.call('onCountdownTick', [tick]);
    }
    const names = ['ready', 'set', 'go'] as const;
    const keys = ['countdownReady', 'countdownSet', 'countdownGo'];
    if (beatF < -3 || beatF >= 0) { this.countdown.visible = false; return; }
    const idx = Math.floor(beatF) + 3;
    if (!this.hud[keys[idx]].visible) { this.countdown.visible = false; return; }
    const own = this.modImages.get(names[idx]);
    const f = own ? own.frames[0] : this.shared.ui.byPrefix(names[idx])[0];
    if (!f) return;
    const sc = own ? own.texMul : 0.9;
    const c = this.countdown;
    c.frame = f; c.visible = true; c.cam = 'hud';
    c.scaleX = c.scaleY = sc;
    c.x = VIEW_W / 2 - (f.fw * sc) / 2; c.y = VIEW_H / 2 - (f.fh * sc) / 2;
    c.alpha = 1 - (beatF - Math.floor(beatF));
  }

  private computeCamTarget() {
    if (this.forcedCam) { this.camTarget.x = this.forcedCam.x; this.camTarget.y = this.forcedCam.y; return; }
    if (this.camFollowOverride) { this.camTarget.x = this.camFollowOverride.x; this.camTarget.y = this.camFollowOverride.y; return; }
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
        // Psych: con la cámara fijada por «Camera Follow Pos» (isCameraOnForcedPos) las secciones no la mueven
        if (v.target === 'none' && (v.x || v.y)) { this.forcedCam = { x: +v.x, y: +v.y }; this.focus = 'none'; }
        else if (!this.forcedCam) { this.camFollowOverride = null; this.focus = v.target === 'none' ? 'none' : (v.target as CharSlot); }
        else this.focus = v.target === 'none' ? 'none' : (v.target as CharSlot);
        this.lua?.setVar('mustHitSection', v.target === 'bf');
        this.lua?.setVar('gfSection', v.target === 'gf');
        break;
      case 'camPos':
        this.forcedCam = v.reset ? null : { x: +v.x, y: +v.y };
        break;
      case 'camZoom':
        if (this.camGame.zoom < 1.35) { this.camGame.zoom += +v.add || 0.015; this.camHud.zoom += +v.hud || 0.03; }
        this.camZooming = true;
        break;
      case 'camZoomSet': {
        const z = v.relative ? this.stage.zoom * +v.zoom : +v.zoom;
        if (+v.dur > 0) { this.tweens.to(this, 'defaultZoom', z, +v.dur, String(v.ease ?? 'linear')); this.tweens.to(this.camGame, 'zoom', z, +v.dur, String(v.ease ?? 'linear')); }
        else this.defaultZoom = z;
        break;
      }
      case 'camBop':
        this.bopRate = +v.rate || 0; this.bopIntensity = +v.intensity || 1; this.camZooming = true;
        break;
      case 'playAnim':
        this.chars[v.target as CharSlot]?.playSpecial(String(v.anim));
        break;
      case 'hey': {
        const targets: CharSlot[] = v.target === 'both' ? ['bf', 'gf'] : [v.target as CharSlot];
        for (const s of targets) { const c = this.chars[s]; if (c) c.playSpecial(c.anim!.has('hey') ? 'hey' : 'cheer'); }
        break;
      }
      case 'changeChar': this.changeCharacter(v.target as CharSlot, String(v.char)); break;
      case 'flash': (v.cam === 'hud' ? this.camHud : this.camGame).flash(String(v.color ?? '#ffffff'), +v.dur || 500); break;
      case 'shake': (v.cam === 'hud' ? this.camHud : this.camGame).shake(+v.intensity || 0.01, +v.dur || 200); break;
      case 'scrollSpeed': this.tweens.to(this.speedObj, 'v', v.absolute ? +v.mult / this.chart.scrollSpeed : +v.mult, +v.dur || 0, 'linear'); break;
      case 'gfSpeed': if (this.chars.gf) this.chars.gf.danceSpeed = +v.speed || 1; break;
    }
    if (e.name === 'custom') this.sandbox?.call('onEvent', String(v.name), v.v1 ?? v.value ?? '', v.v2 ?? '');
    else this.sandbox?.call('onEvent', e.name, v);
    if (e.raw) this.lua?.call('onEvent', [e.raw[0], e.raw[1], e.raw[2], e.t]);
  }

  private changeCharacter(slot: CharSlot, id: string) {
    const nc = this.altChars.get(`${slot}:${id}`);
    const old = this.chars[slot];
    if (!nc || nc === old) return;
    if (old) this.altChars.set(`${slot}:${old.name}`, old);
    this.chars[slot] = nc;
    if (old) { nc.visible = old.visible; nc.alpha = old.alpha; nc.z = old.z; }
    this.rebuildWorld();
    this.setupIcons();
  }

  // ================================================================ PsychHost: objetos y propiedades
  getObject(n: string): any {
    if (n === 'myCutscene_video' || n === 'video') return this.videoEl;
    switch (n) {
      case '__vars': return this.luaVars;
      case '__state': return this.stateProxy;
      case 'dad': case 'boyfriend': case 'bf': case 'gf': case 'girlfriend': {
        const c = this.getCharByName(n);
        return c ? spriteProxy(c) : undefined;
      }
      case 'dadGroup': case 'boyfriendGroup': case 'gfGroup': return groupProxy(this, n === 'dadGroup' ? 'dad' : n === 'gfGroup' ? 'gf' : 'bf');
      case 'camGame': case 'game': return camProxy(this, this.camGame, 'game');
      case 'camHUD': case 'hud': return camProxy(this, this.camHud, 'hud');
      case 'camOther': case 'other': return camProxy(this, this.camOther, 'other');
      case 'iconP1': return this.icons[0] ? spriteProxy(this.icons[0]) : undefined;
      case 'iconP2': return this.icons[1] ? spriteProxy(this.icons[1]) : undefined;
      case 'strumLineNotes': return strumGroup(this, 0, 8);
      case 'opponentStrums': return strumGroup(this, 0, 4);
      case 'playerStrums': return strumGroup(this, 4, 4);
      case 'notes': return noteGroup(this, true);
      case 'unspawnNotes': return noteGroup(this, false);
      case 'camFollow': return {
        psychGet: (p: string) => (p === 'x' ? this.camTarget.x : p === 'y' ? this.camTarget.y : undefined),
        psychSet: (p: string, v: unknown) => { const o = this.camFollowOverride ?? { x: this.camTarget.x, y: this.camTarget.y }; if (p === 'x') o.x = +(v as number); if (p === 'y') o.y = +(v as number); this.camFollowOverride = o; },
      };
      case 'camFollowPos': return {
        psychGet: (p: string) => (p === 'x' ? this.camPos.x : p === 'y' ? this.camPos.y : undefined),
        psychSet: (p: string, v: unknown) => { if (p === 'x') this.camPos.x = +(v as number); if (p === 'y') this.camPos.y = +(v as number); },
      };
    }
    if (this.hud[n]) return hudProxy(this, n);
    const ls = this.luaSprites.get(n);
    if (ls) return spriteProxy(ls);
    const lt = this.luaTexts.get(n);
    if (lt) return textProxy(this, lt);
    const pr = this.props.get(n);
    if (pr) return spriteProxy(pr);
    return this.stateProxy.psychGet(n);
  }

  private stateProxy = {
    psychGet: (p: string): unknown => {
      switch (p) {
        case 'health': return this.health;
        case 'defaultCamZoom': return this.defaultZoom;
        case 'cameraSpeed': return this.cameraSpeed;
        case 'camZooming': return this.camZooming;
        case 'songSpeed': return this.speed;
        case 'skipCountdown': return this.skipCountdown;
        case 'songScore': return this.tally.score;
        case 'songMisses': return this.tally.miss;
        case 'combo': return this.tally.combo;
        case 'ratingPercent': return accuracy(this.tally) / 100;
        case 'ratingName': return grade(this.tally);
        case 'isCameraOnForcedPos': return !!this.forcedCam;
        case 'inCutscene': return false;
        case 'startedCountdown': return this.started;
        case 'endingSong': return this.ended;
        case 'curBeat': return this.curBeatI;
        case 'curStep': return this.curStepI;
        case 'songLength': return this.songLength;
        case 'playbackRate': return 1;
        case 'showRating': case 'showComboNum': case 'showCombo': return this.flags[p];
        case 'dadName': return this.chars.dad?.name; case 'boyfriendName': return this.chars.bf?.name; case 'gfName': return this.chars.gf?.name;
        case 'curStage': return this.stage?.id;
      }
      return this.luaVars['state.' + p];
    },
    psychSet: (p: string, v: unknown) => {
      switch (p) {
        case 'health': this.health = +(v as number); return;
        case 'defaultCamZoom': this.defaultZoom = +(v as number); return;
        case 'cameraSpeed': this.cameraSpeed = +(v as number); return;
        case 'camZooming': this.camZooming = !!v; return;
        case 'songSpeed': this.speedObj.v = (+(v as number) || 1) / (this.chart.scrollSpeed || 1); return;
        case 'skipCountdown': this.skipCountdown = !!v; return;
        case 'isCameraOnForcedPos': this.forcedCam = v ? { x: this.camTarget.x, y: this.camTarget.y } : null; return;
        case 'showRating': case 'showComboNum': case 'showCombo': this.flags[p] = !!v; return;
      }
      this.luaVars['state.' + p] = v;
    },
  };

  luaSprite(tag: string) { return this.luaSprites.get(tag); }

  makeLuaSprite(tag: string, image: string, x: number, y: number, animated: boolean) {
    const old = this.luaSprites.get(tag);
    // Un sprite creado por el script reemplaza el objeto estático homónimo del JSON del escenario.
    // Así se conservan posiciones/capas de respaldo sin dibujar dos copias cuando corre onCreate.
    this.props.delete(tag);
    const s = new LSprite();
    s.tag = tag; s.name = tag; s.x = x; s.y = y;
    if (old) { s.added = old.added; s.z = old.z; s.cam = old.cam; }
    this.luaSprites.set(tag, s);
    if (image && this.files().length && !this.hasFile(`images/${image}.png`)) image = ''; // Psych: imagen inexistente → sprite vacío
    if (image) {
      const path = this.realPath(`images/${image}.png`).slice(0, -4);
      const attach = (a: Atlas) => {
        s.atlas = a;
        s.baseSX = s.baseSY = a.texMul;
        s.applyScale();
        if (animated) {
          s.anim = new Animator();
          for (const pa of s.pendingAnims) s.anim.addFromAtlas(a, pa[0], pa[1], pa[2], pa[3], pa[4]);
          if (s.pendingAnims.length) { s.anim.play(s.pendingAnims[0][0], true); s.update(0); }
          s.pendingAnims = [];
          if (!s.frame) s.frame = a.frames[0];
        } else s.frame = a.frames[0] ?? null;
      };
      const cached = this.scope.cached(path);
      if (cached) attach(cached);
      else this.scope.atlas(path).then(attach, () => Diag.warn(`Lua: imagen no encontrada images/${image}.png`));
    }
    if (old) this.rebuildWorld();
  }

  makeGraphic(tag: string, w: number, h: number, color: string) {
    const s = this.luaSprites.get(tag);
    if (!s) return;
    s.frame = whiteFrame(this.renderer);
    s.anim = null;
    s.baseSX = w / 2; s.baseSY = h / 2;
    s.applyScale();
    s.setColor(hexColor(color));
  }

  addAnim(tag: string, name: string, prefix: string, fps: number, loop: boolean, indices?: number[]) {
    const s = this.luaSprites.get(tag);
    if (s && !s.atlas) { s.pendingAnims.push([name, prefix, fps, loop, indices]); return; }
    const target: Sprite | null = s ?? this.getCharByName(tag);
    if (!target) return;
    const atlas = s?.atlas;
    if (!atlas) return;
    if (!target.anim) target.anim = new Animator();
    if (!prefix && indices) target.anim.add({ name, frames: indices.map((i) => atlas.frames[i]).filter(Boolean), fps, loop, offset: [0, 0] });
    else target.anim.addFromAtlas(atlas, name, prefix, fps, loop, indices);
    if (!target.anim.cur) { target.anim.play(name, true); target.update(0); }
  }

  private getCharByName(n: string): Character | null {
    const map: Record<string, CharSlot> = { dad: 'dad', opponent: 'dad', boyfriend: 'bf', bf: 'bf', gf: 'gf', girlfriend: 'gf' };
    return map[n] ? this.chars[map[n]] : null;
  }

  playAnim(obj: string, anim: string, force: boolean) {
    const c = this.getCharByName(obj);
    if (c) { c.playSpecial(anim, force); return; }
    const s = this.luaSprites.get(obj) ?? this.props.get(obj);
    if (s?.anim) { s.anim.play(anim, force); s.update(0); }
  }

  addLuaSprite(tag: string, front: boolean) {
    const s = this.luaSprites.get(tag);
    if (!s) return;
    if (!s.added) {
      // Psych: detrás de los personajes (antes de gfGroup) o delante de todo
      const gfZ = this.chars.gf?.z ?? this.stage?.chars.gf.z ?? 3000;
      const minChar = Math.min(gfZ, this.chars.dad?.z ?? gfZ, this.chars.bf?.z ?? gfZ);
      s.z = front ? 100000 + this.luaOrder++ : minChar - 50 + (this.luaOrder++) * 0.001;
    }
    s.added = true;
    this.rebuildWorld();
  }

  removeLuaSprite(tag: string, destroy: boolean) {
    const s = this.luaSprites.get(tag);
    if (!s) return;
    s.added = false;
    if (destroy) this.luaSprites.delete(tag);
    this.rebuildWorld();
  }

  setCamera(tag: string, cam: string) {
    const c = cam.toLowerCase().replace(/^cam/, '');
    const groups: Record<string, CharSlot> = { dadGroup: 'dad', boyfriendGroup: 'bf', gfGroup: 'gf' };
    const target: Sprite | undefined = this.luaSprites.get(tag) ?? this.luaTexts.get(tag)?.s ?? this.props.get(tag) ?? (groups[tag] ? this.chars[groups[tag]] ?? undefined : undefined);
    if (!target) return;
    target.cam = c === 'hud' ? 'hud' : c === 'other' ? 'other' : 'game';
    this.rebuildWorld();
  }

  private orderTarget(name: string): Sprite | null | undefined {
    const g: Record<string, CharSlot> = { dadGroup: 'dad', boyfriendGroup: 'bf', gfGroup: 'gf', dad: 'dad', boyfriend: 'bf', gf: 'gf' };
    return g[name] ? this.chars[g[name]] : this.luaSprites.get(name) ?? this.luaTexts.get(name)?.s ?? this.props.get(name);
  }
  getOrder(name: string): number { const s = this.orderTarget(name); return s ? s.z : -1; }
  setOrder(name: string, order: number) {
    const s = this.orderTarget(name);
    if (!s) return;
    s.z = order - 0.5;
    this.rebuildWorld();
  }

  // ---------------- textos de Lua
  makeText(tag: string, text: string, width: number, x: number, y: number) {
    const s = new Sprite();
    s.cam = 'hud';
    const t: LText = { tag, s, text, width, x, y, size: 16, color: '#ffffff', font: 'vcr', align: 'left', border: 1, borderColor: '#000000', dirty: true, measured: 0, added: false };
    s.x = x; s.y = y; s.z = 200000 + this.luaOrder++;
    const old = this.luaTexts.get(tag);
    if (old) { t.added = old.added; s.cam = old.s.cam; s.z = old.s.z; if (old.s.frame) this.renderer.deleteTexture(old.s.frame.tex); }
    this.luaTexts.set(tag, t);
    this.renderText(t);
    if (old) this.rebuildWorld();
  }
  addText(tag: string) { const t = this.luaTexts.get(tag); if (t) { t.added = true; this.rebuildWorld(); } }
  removeText(tag: string) { const t = this.luaTexts.get(tag); if (t) { t.added = false; this.rebuildWorld(); } }
  textProp(tag: string, prop: string, value?: unknown): unknown {
    const t = this.luaTexts.get(tag);
    if (prop === '__exists') return !!t;
    if (!t) return undefined;
    if (value === undefined) {
      if (prop === 'measuredWidth') { this.renderText(t); return t.measured; }
      return (t as unknown as Record<string, unknown>)[prop];
    }
    (t as unknown as Record<string, unknown>)[prop] = value;
    t.dirty = true;
    return undefined;
  }

  /** Rasteriza un texto (FlxText) con Canvas2D: borde, alineación dentro del ancho del campo y fuente del mod. */
  renderText(t: LText) {
    if (!t.dirty) return;
    t.dirty = false;
    const size = Math.max(4, Math.min(300, t.size));
    const font = `${size}px ${t.font ? `"${t.font}", ` : ''}"vcr", monospace`;
    const c = document.createElement('canvas');
    const cx = c.getContext('2d')!;
    cx.font = font;
    const lines = String(t.text).split('\n');
    const widest = Math.max(...lines.map((l) => cx.measureText(l || ' ').width));
    t.measured = widest;
    const pad = Math.ceil(t.border) + 2;
    const boxW = Math.ceil(t.width > 0 ? Math.max(t.width, widest) : widest) + pad * 2;
    const lineH = Math.ceil(size * 1.2);
    c.width = Math.max(2, boxW); c.height = Math.max(2, lineH * lines.length + pad * 2);
    cx.font = font; cx.textBaseline = 'top'; cx.lineJoin = 'round';
    lines.forEach((line, i) => {
      const w = cx.measureText(line).width;
      const inner = boxW - pad * 2;
      const x = pad + (t.align === 'center' ? (inner - w) / 2 : t.align === 'right' ? inner - w : 0);
      const y = pad + i * lineH;
      if (t.border > 0) { cx.lineWidth = t.border * 2; cx.strokeStyle = t.borderColor; cx.strokeText(line, x, y); }
      cx.fillStyle = t.color;
      cx.fillText(line, x, y);
    });
    if (t.s.frame) this.renderer.deleteTexture(t.s.frame.tex);
    const tex = this.renderer.createTexture(c, 'luatext:' + t.tag);
    this.scope.track(tex);
    t.s.frame = fullFrame(tex);
    t.s.x = t.x - pad; t.s.y = t.y - pad;
  }

  // ---------------- tweens, eventos y demás
  tween(tag: string, target: string, prop: string, value: number, durSec: number, ease: string) {
    const done = () => { this.lua?.call('onTweenCompleted', [tag, target]); };
    if (prop === 'zoom' && (target === 'camGame' || target === 'game')) {
      this.tweens.to(this, 'defaultZoom', value, durSec * 1000, ease, { tag: tag + '#d' });
      this.tweens.to(this.camGame, 'zoom', value, durSec * 1000, ease, { tag, done });
      return;
    }
    const obj = this.resolveTarget(target);
    if (!obj) return;
    const from = Number(obj.psychGet(prop)) || 0;
    this.tweens.to({ v: from }, 'v', value, durSec * 1000, ease, { tag, from, set: (v: number) => obj.psychSet(prop, v), done });
  }

  tweenColor(tag: string, target: string, color: string, durSec: number, ease: string) {
    const sp: Sprite | undefined = this.resolveTarget(target)?.sprite;
    if (!sp) return;
    const from = [sp.color[0], sp.color[1], sp.color[2]];
    const to = parseColor(hexColor(color), new Float32Array(3));
    this.tweens.to({ v: 0 }, 'v', 1, durSec * 1000, ease, {
      tag, from: 0,
      set: (k: number) => { for (let i = 0; i < 3; i++) sp.color[i] = from[i] + (to[i] - from[i]) * k; },
      done: () => this.lua?.call('onTweenCompleted', [tag, target]),
    });
  }

  noteTween(tag: string, note: number, prop: string, value: number, durSec: number, ease: string) {
    const i = ((note % 8) + 8) % 8;
    const px = strumProxy(this, i);
    const from = Number(px.psychGet(prop)) || 0;
    this.tweens.to({ v: from }, 'v', value, durSec * 1000, ease, { tag, from, set: (v: number) => px.psychSet(prop, v), done: () => this.lua?.call('onTweenCompleted', [tag]) });
  }

  cancelTween(tag: string) { this.tweens.cancel(tag); this.tweens.cancel(tag + '#d'); }

  private resolveTarget(path: string): { psychGet: (p: string) => unknown; psychSet: (p: string, v: unknown) => void; sprite?: Sprite } | null {
    const parts = splitPath(path);
    let obj = this.getObject(String(parts[0]));
    for (const p of parts.slice(1)) {
      if (!obj) return null;
      obj = typeof p === 'number' && obj.member ? obj.member(p) : obj.psychGet ? obj.psychGet(String(p), [p]) : obj[p];
    }
    return obj && typeof obj.psychGet === 'function' ? obj : null;
  }

  triggerEvent(name: string, v1: string, v2: string) {
    const ev = mapPsychEvent(this.songT, name, v1, v2);
    const raw: [string, string, string] = [name, v1, v2];
    this.applyEvent(ev ? { ...ev, raw } : { t: this.songT, name: 'custom', v: { name, v1, v2 }, raw });
  }

  characterDance(who: string) { this.getCharByName(who)?.forceDance(); }

  cameraSetTarget(who: string) {
    const w = who.toLowerCase();
    this.forcedCam = null; this.camFollowOverride = null;
    this.focus = w === 'dad' || w === 'opponent' ? 'dad' : w === 'gf' || w === 'girlfriend' ? 'gf' : 'bf';
  }

  private camByName(cam: string) { const c = cam.toLowerCase().replace(/^cam/, ''); return c === 'hud' ? this.camHud : c === 'other' ? this.camOther : this.camGame; }
  cameraFlash(cam: string, color: string, durSec: number) { this.camByName(cam).flash(hexColor(color), durSec * 1000); }
  cameraShake(cam: string, intensity: number, durSec: number) { this.camByName(cam).shake(intensity, durSec * 1000); }

  /** Reproduce vídeos del mod como startVideo() de Psych Engine. */
  startVideo(name: string) {
    this.videoEl?.pause(); this.videoEl?.remove();
    if (this.videoUrl) URL.revokeObjectURL(this.videoUrl);
    this.videoEl = document.createElement('video');
    const video = this.videoEl;
    video.className = 'fnf-mod-video';
    video.playsInline = true; video.preload = 'auto'; video.controls = false;
    Object.defineProperty(video, 'alpha', { configurable: true, get: () => Number(video.style.opacity || 1), set: (v: number) => { video.style.opacity = String(Math.max(0, Math.min(1, Number(v) || 0))); } });
    const host = document.getElementById('game-frame') ?? document.getElementById('game')?.parentElement;
    if (host) {
      video.style.cssText += ';position:absolute;inset:0;width:100%;height:100%;object-fit:contain;pointer-events:none;z-index:3;background:#000;';
      host.appendChild(video);
    }
    const clean = () => {
      if (this.videoEl !== video) return;
      video.pause(); video.remove(); this.videoEl = null;
      if (this.videoUrl) URL.revokeObjectURL(this.videoUrl);
      this.videoUrl = null;
      this.lua?.call('onVideoFinished');
    };
    video.addEventListener('ended', clean, { once: true });
    video.addEventListener('error', clean, { once: true });
    const file = name.toLowerCase().endsWith('.mp4') ? name : name + '.mp4';
    const path = this.realPath('videos/' + file);
    if (!this.hasFile(path)) { clean(); return; }
    void this.mod.source.blob(path).then((blob) => {
      if (this.videoEl !== video) return;
      this.videoUrl = URL.createObjectURL(blob);
      video.src = this.videoUrl;
      return video.play();
    }).catch(() => clean());
  }

  playSound(name: string, volume: number) {
    const play = (buf: AudioBuffer) => {
      const src = this.audio.ctx.createBufferSource(); src.buffer = buf;
      const g = this.audio.ctx.createGain(); g.gain.value = volume;
      src.connect(g); g.connect(this.audio.sfx); src.start();
    };
    const b = this.sounds.get(name);
    if (b) play(b); else void this.loadSound(name).then((x) => x && play(x));
  }

  groupProp(group: string, index: number, prop: string, value?: unknown): unknown {
    const m = this.getObject(group)?.member?.(index);
    if (!m) return undefined;
    if (value === undefined) return m.psychGet(prop);
    m.psychSet(prop, value);
    return undefined;
  }
  groupLength(group: string) { return this.getObject(group)?.length ?? 0; }

  endSong() { this.finish(); }
  restartSong() { this.restart(); }

  scriptError(script: string, msg: string) {
    Diag.warn(`Script ${script}: ${msg}`);
    if (this.warnings.length < 40) this.warnings.push(`Error en ${script}: ${msg}`);
  }

  // accesos para los proxies
  get strumList() { return this.strums; }
  get strumBases() { return this.strumBase; }
  get noteList() { return this.notes; }
  get spawnedList() { return this.spawned; }
  get hudFlags() { return this.hud; }
  charOf(slot: CharSlot) { return this.chars[slot]; }
  markHud() { this.hooks.onHudVisible?.(this.hud.scoreTxt.visible && this.camHud.visible, this.hud.scoreTxt.alpha * this.camHud.alpha); }

  // ================================================================ scripts JS (sandbox)
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
        case 'camZoom': this.camGame.zoom += a[1]; this.camHud.zoom += a[2]; this.camZooming = true; break;
        case 'camZoomSet': this.tweens.to(this, 'defaultZoom', a[1], a[2], 'sineinout'); break;
        case 'shake': (a[3] === 'hud' ? this.camHud : this.camGame).shake(a[1], a[2]); break;
        case 'flash': (a[3] === 'hud' ? this.camHud : this.camGame).flash(a[1], a[2]); break;
        case 'playAnim': this.chars[a[1] as CharSlot]?.playSpecial(a[2], a[3]); break;
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
          s.scaleX = +(o.scaleX ?? o.scale ?? 1) * atlas.texMul; s.scaleY = +(o.scaleY ?? o.scale ?? 1) * atlas.texMul;
          s.scrollX = +(o.scrollX ?? o.scroll ?? 1); s.scrollY = +(o.scrollY ?? o.scroll ?? 1);
          s.alpha = +(o.alpha ?? 1); s.z = +(o.z ?? 500); s.hud = !!o.hud; s.cam = o.hud ? 'hud' : 'game';
          if (o.color) s.setColor(String(o.color));
          if (o.anim) { s.anim = new Animator(); s.anim.addFromAtlas(atlas, 'a', String(o.anim), +(o.fps ?? 24), o.loop !== false); s.anim.play('a'); s.update(0); }
          this.scriptSprites.set(s.name, s);
          this.rebuildWorld();
          break;
        }
        case 'removeSprite': if (this.scriptSprites.delete(a[1])) this.rebuildWorld(); break;
        case 'addHealth': this.health = Math.max(0, Math.min(2, this.health + a[1])); break;
        case 'scrollSpeed': this.tweens.to(this.speedObj, 'v', a[1], a[2], 'linear'); break;
        case 'focus': {
          const tg = String(a[1]).toLowerCase();
          if (tg === 'middle' || tg === 'm') {
            const save = this.focus; const pts: number[] = [];
            for (const f of ['bf', 'dad'] as CharSlot[]) { this.forcedCam = null; this.focus = f; this.computeCamTarget(); pts.push(this.camTarget.x, this.camTarget.y); }
            this.focus = save;
            this.forcedCam = { x: (pts[0] + pts[2]) / 2, y: (pts[1] + pts[3]) / 2 };
          } else if (tg === '') { this.forcedCam = null; }
          else { this.forcedCam = null; this.focus = tg === 'b' || tg === 'bf' || tg === 'boyfriend' ? 'bf' : tg === 'g' || tg === 'gf' ? 'gf' : 'dad'; }
          break;
        }
        case 'camPos': this.forcedCam = a[1] === null ? null : { x: +a[1], y: +a[2] }; break;
        case 'addText': this.setTextSprite(a[1], a[2], a[3], a[4], a[5] ?? {}); break;
        case 'setText': {
          const t = this.texts.get(a[1]);
          if (t) { if (a[3]) t.opts.color = String(a[3]); this.setTextSprite(a[1], a[2], t.x, t.y, t.opts); }
          break;
        }
        case 'removeText': {
          const t = this.texts.get(a[1]);
          if (t) { if (t.s.frame) this.renderer.deleteTexture(t.s.frame.tex); this.texts.delete(a[1]); this.scriptSprites.delete('text:' + a[1]); this.rebuildWorld(); }
          break;
        }
      }
    }
  }

  private setTextSprite(name: string, text: string, x: number, y: number, opts: TextOpts) {
    const prev = this.texts.get(name);
    if (prev && prev.text === text && prev.x === x && prev.y === y) return;
    const size = Math.max(6, Math.min(200, +(opts.size ?? 32)));
    const font = `${opts.bold === false ? '' : 'bold '}${size}px ${opts.font ? `"${opts.font}", ` : ''}system-ui, sans-serif`;
    const c = document.createElement('canvas');
    const cx = c.getContext('2d')!;
    cx.font = font;
    const border = Math.max(0, +(opts.border ?? Math.round(size / 12)));
    const w = Math.max(2, Math.ceil(cx.measureText(text || ' ').width + border * 2 + 4));
    const hgt = Math.ceil(size * 1.35 + border * 2);
    c.width = w; c.height = hgt;
    cx.font = font; cx.textBaseline = 'middle'; cx.lineJoin = 'round';
    if (border) { cx.lineWidth = border * 2; cx.strokeStyle = String(opts.borderColor ?? '#000'); cx.strokeText(text, border + 2, hgt / 2); }
    cx.fillStyle = String(opts.color ?? '#ffffff').replace(/^([0-9a-f]{6})$/i, '#$1');
    cx.fillText(text, border + 2, hgt / 2);
    if (prev?.s.frame) this.renderer.deleteTexture(prev.s.frame.tex);
    const tex = this.renderer.createTexture(c, 'text:' + name);
    this.scope.track(tex);
    const s = prev?.s ?? new Sprite();
    s.frame = fullFrame(tex);
    const align = opts.align ?? 'left';
    s.x = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
    s.y = y; s.hud = opts.hud !== false; s.cam = s.hud ? 'hud' : 'game'; s.z = +(opts.z ?? 3000); s.scrollX = s.scrollY = s.hud ? 1 : +(opts.scroll ?? 1);
    s.alpha = +(opts.alpha ?? 1); s.visible = !!text;
    this.texts.set(name, { s, text, opts, x, y });
    if (!prev) { this.scriptSprites.set('text:' + name, s); this.rebuildWorld(); }
  }

  // ================================================================ fin
  private finish() {
    if (this.ended) return;
    if (this.lua && this.songT < this.song.duration + 2500 && this.lua.call('onEndSong') === FUNCTION_STOP) return;
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

  // ================================================================ dibujo
  render(r: Renderer, px: number) {
    r.begin(this.camGame.bgColor || this.stage?.bgColor || '#000');
    if (!this.loaded) { r.end(); return; }
    for (const t of this.luaTexts.values()) if (t.dirty) this.renderText(t);
    const cg = this.camGame, ch = this.camHud, co = this.camOther;
    for (const s of this.world) drawSprite(r, s, cg, px);
    if (cg.flashAlpha > 0) drawRect(r, 0, 0, VIEW_W, VIEW_H, cg.flashColor, cg.flashAlpha, px);

    if (ch.visible && ch.alpha > 0.001) {
      this.renderHealthBar(r, px);
      this.renderTimeBar(r, px);
      this.renderStrums(r, px);
      this.renderNotes(r, px);
      for (const p of this.popups) if (p.life > 0) drawSprite(r, p.s, ch, px);
      for (const s of this.hudList) drawSprite(r, s, ch, px);
      if (this.countdown.visible) drawSprite(r, this.countdown, ch, px);
    }
    if (ch.flashAlpha > 0) drawRect(r, 0, 0, VIEW_W, VIEW_H, ch.flashColor, ch.flashAlpha, px);
    for (const s of this.otherList) drawSprite(r, s, co, px);
    if (co.flashAlpha > 0) drawRect(r, 0, 0, VIEW_W, VIEW_H, co.flashColor, co.flashAlpha, px);
    r.end();
  }

  private renderHealthBar(r: Renderer, px: number) {
    // Psych 0.7: healthBarBG de 601x19 en y = 0.89·alto (0.11 con downscroll)
    const hb = this.hud.healthBar, bg = this.hud.healthBarBG;
    const by = settings.downscroll ? 0.11 * VIEW_H : 0.89 * VIEW_H;
    const bx = (VIEW_W - 601) / 2;
    const a = this.camHud.alpha;
    // La posición vertical de los iconos sigue el modo de scroll incluso si cambia en caliente.
    for (const icon of this.icons) icon.y = by - 75;
    // Psych 0.7: healthBar es un objeto Bar que incluye el fondo; en 0.6 el fondo es healthBarBG
    if (bg.visible && hb.visible) drawRect(r, bx, by, 601, 19, BLACK, bg.alpha * hb.alpha * a, px);
    const barX = bx + 4, barW = 593;
    const split = barW * (1 - this.health / 2);
    if (hb.visible) {
      drawRect(r, barX, by + 4, split, 11, this.healthColors[0], hb.alpha * a, px);
      drawRect(r, barX + split, by + 4, barW - split, 11, this.healthColors[1], hb.alpha * a, px);
    }
    const center = barX + split;
    const [p1, p2] = this.icons;
    if (!p1 || !p2) return;
    p1.frame = this.iconFrames[0][this.health < 0.4 ? 1 : 0] ?? p1.frame;
    p2.frame = this.iconFrames[1][this.health > 1.6 ? 1 : 0] ?? p2.frame;
    // Psych: iconP1.x = centro + (150·escala − 150)/2 − 26 ; iconP2.x = centro − 150·escala/2 − 52 ; y = barra − 75
    const w1 = (p1.frame?.fw ?? 150) * p1.scaleX, w10 = (p1.frame?.fw ?? 150) * p1.base;
    const w2 = (p2.frame?.fw ?? 150) * p2.scaleX;
    p1.x = center + (w1 - w10) / 2 - 26;
    p2.x = center - w2 / 2 - 52;
    drawSprite(r, p2, this.camHud, px);
    drawSprite(r, p1, this.camHud, px);
  }

  private renderTimeBar(r: Renderer, px: number) {
    if (!this.started || this.songT < 0) return;
    const tb = this.hud.timeBar, tt = this.hud.timeTxt, tbg = this.hud.timeBarBG;
    const y = settings.downscroll ? VIEW_H - 44 : 19;
    const x = 42 + VIEW_W / 2 - 248;
    const fade = Math.min(1, this.songT / 500);
    const a = this.camHud.alpha * fade;
    const p = Math.max(0, Math.min(1, this.songT / Math.max(1, this.song.duration)));
    if (tbg.visible && tb.visible) drawRect(r, x, y + 8, 400, 20, BLACK, tbg.alpha * tb.alpha * a, px);
    if (tb.visible) drawRect(r, x + 4, y + 12, 392 * p, 12, WHITE, tb.alpha * a, px);
    if (!tt.visible) return;
    const left = Math.max(0, Math.floor((this.song.duration - this.songT) / 1000));
    const txt = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
    if (!this.timeText) {
      const s = new Sprite(); s.cam = 'hud';
      this.timeText = { tag: '__time', s, text: txt, width: 400, x, y: y + 2, size: 32, color: '#ffffff', font: 'vcr', align: 'center', border: 2, borderColor: '#000000', dirty: true, measured: 0, added: false };
    }
    if (txt !== this.timeShown) { this.timeShown = txt; this.timeText.text = txt; this.timeText.dirty = true; }
    this.renderText(this.timeText);
    this.timeText.s.alpha = tt.alpha * fade;
    drawSprite(r, this.timeText.s, this.camHud, px);
  }

  /** los receptores centran cada frame sobre la caja del frame estático (centerOffsets de Psych) */
  private renderStrums(r: Renderer, px: number) {
    const ts = this.tmpSpr;
    for (let i = 0; i < 8; i++) {
      const s = this.strums[i];
      const f = s.frame;
      if (!f || !s.visible || s.alpha <= 0) continue;
      const b = this.strumBase[i];
      const fw = f.fw * s.scaleX, fh = f.fh * s.scaleY;
      const bw = b.w * (s.scaleX / this.skin.scale), bh = b.h * (s.scaleY / this.skin.scale);
      ts.frame = f; ts.scaleX = s.scaleX; ts.scaleY = s.scaleY; ts.alpha = s.alpha; ts.angle = s.angle; ts.flipX = false; ts.color.fill(1);
      ts.x = s.x + (bw - fw) / 2; ts.y = s.y + (bh - fh) / 2;
      drawSprite(r, ts, this.camHud, px);
    }
  }

  private skinFor(n: GNote): NoteSkin | null {
    if (!n.texture) return this.skin;
    if (n.texture === 'HURTNOTE_assets') return this.hurtSkin;
    const key = n.texture.toLowerCase();
    if (this.skins.has(key)) return this.skins.get(key) ?? this.skin;
    void this.loadSkin(n.texture);
    return this.skin;
  }

  private renderNotes(r: Renderer, px: number) {
    const t = this.songT;
    const pxPerMs = 0.45 * this.speed;
    const dir = settings.downscroll ? -1 : 1;
    const horizon = (VIEW_H + 200) / pxPerMs;
    const ns = this.noteSpr;
    const cam = this.camHud;
    const start = Math.min(this.pIdx, this.oIdx);
    for (let i = start; i < this.notes.length; i++) {
      const n = this.notes[i];
      if (n.t - t > horizon) break;
      if (!n.visible || (n.state === 2 && n.len === 0)) continue;
      const si = (n.player ? 4 : 0) + n.lane;
      const strum = this.strums[si];
      if (!strum.visible) continue;
      const b = this.strumBase[si];
      const skin = this.skinFor(n);
      const sc = skin ? skin.scale : 0.7;
      const centerX = strum.x + b.w / 2 + n.offsetX, strumCY = strum.y + b.h / 2;
      const headCY = strumCY + dir * (n.t - t) * pxPerMs + n.offsetY;
      const hit = n.state === 1;
      const alpha = n.alpha * n.multAlpha * strum.alpha;
      if (alpha <= 0.001) continue;
      // sostenido
      if (n.len > 0 && n.hold !== 2 && !(hit && n.hold === 0 && n.player) && skin) {
        const endCY = strumCY + dir * (n.t + n.len - t) * pxPerMs;
        const startCY = hit ? strumCY : headCY;
        const len = (endCY - startCY) * dir;
        const piece = skin.hold[n.lane], end = skin.holdEnd[n.lane];
        if (len > 0 && piece && end) {
          const w = piece.fw * sc;
          const endH = Math.min(len, end.fh * sc);
          const bodyLen = len - endH;
          ns.alpha = (n.hold === 3 || n.state === 2 ? 0.3 : 0.6) * alpha; ns.flipX = false; ns.angle = 0; ns.color.fill(1);
          ns.x = centerX - w / 2; ns.scaleX = sc;
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
      if (hit || n.state === 2) continue;
      let f: Frame | undefined = skin?.note[n.lane];
      let fsc = sc;
      if (!f && n.kind === 'hurt') { f = NoteSkin.hurtFrame(this.shared.notes, n.lane); fsc = 0.7; }
      if (!f) { f = this.skin.note[n.lane]; fsc = this.skin.scale; }
      if (!f) continue;
      ns.frame = f; ns.scaleX = ns.scaleY = fsc; ns.alpha = alpha; ns.flipX = false; ns.angle = n.angle; ns.color.fill(1);
      ns.x = centerX - (f.fw * fsc) / 2; ns.y = headCY - (f.fh * fsc) / 2;
      drawSprite(r, ns, cam, px);
    }
  }

  /** datos de depuración para pruebas automáticas */
  debugInfo() {
    return {
      songT: this.songT, nowSongT: this.started ? this.conductor.songTimeAt(performance.now(), this.song.startCtx) : -1, started: this.started, ended: this.ended, paused: this.paused,
      tally: this.tally, health: this.health, duration: this.song?.duration,
      upcoming: this.notes.slice(this.pIdx, this.pIdx + 24).filter((n) => n.player && n.state === 0 && !n.hitCausesMiss && !n.ignoreNote).map((n) => ({ t: n.t, lane: n.lane, len: n.len, kind: n.kind })),
      outputTs: this.conductor.usingOutputTimestamp,
      luaScripts: this.lua?.scripts.map((s) => ({ name: s.name, closed: s.closed })) ?? [],
      luaSprites: [...this.luaSprites.values()].filter((s) => s.added).map((s) => ({ tag: s.tag, visible: s.visible, alpha: +s.alpha.toFixed(2), cam: s.cam, z: s.z })),
      chars: Object.fromEntries((['bf', 'dad', 'gf'] as CharSlot[]).map((k) => [k, this.chars[k] ? { name: this.chars[k]!.name, alpha: this.chars[k]!.alpha, visible: this.chars[k]!.visible, anim: this.chars[k]!.anim?.name, z: this.chars[k]!.z } : null])),
      camHud: { visible: this.camHud.visible, alpha: this.camHud.alpha },
      warnings: this.warnings,
      skin: this.skin?.atlas.tex.label,
    };
  }
}

interface TextOpts { size?: number; color?: string; align?: 'left' | 'center' | 'right'; hud?: boolean; z?: number; font?: string; bold?: boolean; border?: number; borderColor?: string; alpha?: number; scroll?: number }

const BLACK = new Float32Array([0, 0, 0]);
const WHITE = new Float32Array([1, 1, 1]);

function splitIcon(a: Atlas): Frame[] {
  if (a.frames.length >= 2 && a.frames[0].name !== 'full') return a.frames.slice(0, 2);
  const tex = a.tex;
  // Psych: iconos de 150x150 (300 = normal + perdiendo; 450 = + ganando)
  const n = tex.width >= tex.height * 1.5 ? Math.max(1, Math.round(tex.width / tex.height)) : 1;
  const w = tex.width / n;
  const out: Frame[] = [];
  for (let i = 0; i < Math.min(n, 2); i++) out.push({ tex, name: 'icon' + i, x: i * w, y: 0, w, h: tex.height, ox: 0, oy: 0, fw: w, fh: tex.height, rotated: false });
  if (out.length === 1) out.push(out[0]);
  return out;
}

// ================================================================ proxies de propiedades (lo que ven los scripts)
const proxies = new WeakMap<object, any>();

function spriteProxy(sp: Sprite): any {
  const cached = proxies.get(sp);
  if (cached) return cached;
  const ls = sp instanceof LSprite ? sp : null;
  const mul = () => (sp instanceof Character ? sp.texMul : (sp as IconSprite).base ?? 1);
  const px = {
    sprite: sp,
    psychGet(path: string): unknown {
      switch (path) {
        case 'x': return sp.x; case 'y': return sp.y;
        case 'alpha': return sp.alpha; case 'visible': return sp.visible; case 'angle': return sp.angle;
        case 'flipX': return sp.flipX;
        case 'scale.x': return ls ? ls.lsx : sp.scaleX / mul();
        case 'scale.y': return ls ? ls.lsy : sp.scaleY / mul();
        case 'scrollFactor.x': return sp.scrollX; case 'scrollFactor.y': return sp.scrollY;
        case 'offset.x': return sp.offsetX; case 'offset.y': return sp.offsetY;
        case 'width': return (sp.frame?.fw ?? 0) * sp.scaleX; case 'height': return (sp.frame?.fh ?? 0) * sp.scaleY;
        case 'frameWidth': return (sp.frame?.fw ?? 0) * (ls ? ls.baseSX : 1); case 'frameHeight': return (sp.frame?.fh ?? 0) * (ls ? ls.baseSY : 1);
        case 'animation.curAnim.name': case 'animation.name': return sp.anim?.name ?? '';
        case 'animation.curAnim.finished': case 'animation.finished': return sp.anim?.finished ?? true;
        case 'animation.curAnim.curFrame': return sp.anim?.frame ?? 0;
        case 'color': return ((255 << 24) | (Math.round(sp.color[0] * 255) << 16) | (Math.round(sp.color[1] * 255) << 8) | Math.round(sp.color[2] * 255)) | 0;
        case 'antialiasing': return true;
        case 'specialAnim': return sp instanceof Character ? sp.specialAnim : false;
        case 'stunned': return sp instanceof Character ? sp.stunned : false;
        case 'curCharacter': return sp.name;
        case 'idleSuffix': return sp instanceof Character ? sp.idleSuffix : '';
        case 'healthIcon': return sp instanceof Character ? sp.def.icon : undefined;
        case 'singDuration': return sp instanceof Character ? sp.def.singDuration : undefined;
        case 'blend': return sp.blend;
      }
      return (sp as unknown as { extra?: Record<string, unknown> }).extra?.[path];
    },
    psychSet(path: string, v: unknown) {
      const num = +(v as number);
      switch (path) {
        case 'x': sp.x = num; return; case 'y': sp.y = num; return;
        case 'alpha': sp.alpha = num; return; case 'visible': sp.visible = !!v; return; case 'angle': sp.angle = num; return;
        case 'flipX': sp.flipX = !!v; return;
        case 'scale.x': if (ls) { ls.lsx = num; ls.applyScale(); } else { sp.scaleX = num * mul(); if (sp instanceof Character) sp.refreshBaseSize(); } return;
        case 'scale.y': if (ls) { ls.lsy = num; ls.applyScale(); } else { sp.scaleY = num * mul(); if (sp instanceof Character) sp.refreshBaseSize(); } return;
        case 'scrollFactor.x': sp.scrollX = num; return; case 'scrollFactor.y': sp.scrollY = num; return;
        case 'offset.x': sp.offsetX = num; return; case 'offset.y': sp.offsetY = num; return;
        case 'color': sp.setColor(hexColor(v as number)); return;
        case 'specialAnim': if (sp instanceof Character) sp.specialAnim = !!v; return;
        case 'stunned': if (sp instanceof Character) sp.stunned = !!v; return;
        case 'idleSuffix': if (sp instanceof Character) sp.idleSuffix = String(v ?? ''); return;
        case 'blend': sp.blend = String(v ?? '').toLowerCase(); return;
        case 'antialiasing': case 'cameras': return;
      }
      const o = sp as unknown as { extra?: Record<string, unknown> };
      (o.extra ??= {})[path] = v;
    },
  };
  proxies.set(sp, px);
  return px;
}

function groupProxy(ps: PlayState, slot: CharSlot): any {
  const scaleProxy = {
    psychGet(path: string) {
      const c = ps.charOf(slot);
      if (!c) return undefined;
      const base = c.texMul * (c.def.scale || 1);
      if (path === 'x') return base ? c.scaleX / base : 1;
      if (path === 'y') return base ? c.scaleY / base : 1;
      return undefined;
    },
    psychSet(path: string, v: unknown) {
      const c = ps.charOf(slot);
      if (!c) return;
      const n = +(v as number);
      const base = c.texMul * (c.def.scale || 1);
      if (path === 'x') { c.scaleX = n * base; c.refreshBaseSize(); }
      if (path === 'y') { c.scaleY = n * base; c.refreshBaseSize(); }
    },
  };
  return {
    psychGet(path: string) {
      const c = ps.charOf(slot);
      if (!c) return undefined;
      if (path === 'x') return c.groupX; if (path === 'y') return c.groupY;
      if (path === 'scale') return scaleProxy;
      return spriteProxy(c).psychGet(path);
    },
    psychSet(path: string, v: unknown) {
      const c = ps.charOf(slot);
      if (!c) return;
      if (path === 'x') { c.x += +(v as number) - c.groupX; c.groupX = +(v as number); return; }
      if (path === 'y') { c.y += +(v as number) - c.groupY; c.groupY = +(v as number); return; }
      if (path === 'scale.x' || path === 'scale.y') { scaleProxy.psychSet(path.slice(6), v); return; }
      spriteProxy(c).psychSet(path, v);
    },
  };
}

function camProxy(ps: PlayState, cam: Camera, name: 'game' | 'hud' | 'other'): any {
  return {
    psychGet(path: string) {
      switch (path) {
        case 'zoom': return cam.zoom; case 'alpha': return cam.alpha; case 'visible': return cam.visible;
        case 'angle': return cam.angle; case 'x': return cam.x; case 'y': return cam.y;
        case 'scroll.x': return cam.scrollX; case 'scroll.y': return cam.scrollY;
      }
      return undefined;
    },
    psychSet(path: string, v: unknown) {
      const n = +(v as number);
      switch (path) {
        case 'zoom': cam.zoom = n; return;
        case 'alpha': cam.alpha = n; if (name === 'hud') ps.markHud(); return;
        case 'visible': cam.visible = !!v; if (name === 'hud') ps.markHud(); return;
        case 'angle': cam.angle = n; return;
        case 'x': cam.x = n; return; case 'y': cam.y = n; return;
        case 'bgColor': cam.bgColor = typeof v === 'number' ? hexColor(v) : String(v); return;
      }
    },
  };
}

function hudProxy(ps: PlayState, key: string): any {
  return {
    psychGet(path: string) { const h = ps.hudFlags[key]; return path === 'visible' ? h.visible : path === 'alpha' ? h.alpha : undefined; },
    psychSet(path: string, v: unknown) {
      const h = ps.hudFlags[key];
      if (path === 'visible') h.visible = !!v; else if (path === 'alpha') h.alpha = +(v as number);
      if (key === 'scoreTxt') ps.markHud();
    },
  };
}

function textProxy(ps: PlayState, t: LText): any {
  return {
    sprite: t.s,
    psychGet(path: string) {
      switch (path) {
        case 'x': return t.x; case 'y': return t.y; case 'alpha': return t.s.alpha; case 'visible': return t.s.visible;
        case 'angle': return t.s.angle; case 'text': return t.text; case 'size': return t.size;
        case 'width': ps.renderText(t); return t.width > 0 ? t.width : t.measured;
        case 'height': return t.size * 1.2;
      }
      return undefined;
    },
    psychSet(path: string, v: unknown) {
      switch (path) {
        case 'x': t.x = +(v as number); t.dirty = true; return;
        case 'y': t.y = +(v as number); t.dirty = true; return;
        case 'alpha': t.s.alpha = +(v as number); return; case 'visible': t.s.visible = !!v; return; case 'angle': t.s.angle = +(v as number); return;
        case 'text': t.text = String(v ?? ''); t.dirty = true; return;
        case 'size': t.size = +(v as number); t.dirty = true; return;
        case 'color': t.color = hexColor(v as number); t.dirty = true; return;
        case 'scale.x': case 'scale.y': t.s.scaleX = t.s.scaleY = +(v as number); return;
      }
    },
  };
}

function strumProxy(ps: PlayState, i: number): any {
  const s = ps.strumList[i];
  const b = ps.strumBases[i];
  return {
    sprite: s,
    psychGet(path: string) {
      switch (path) {
        case 'x': return s.x; case 'y': return s.y; case 'alpha': return s.alpha; case 'angle': return s.angle; case 'visible': return s.visible;
        case 'scale.x': return s.scaleX / (ps.skin.scale / 0.7); case 'scale.y': return s.scaleY / (ps.skin.scale / 0.7);
        case 'width': return b.w; case 'height': return b.h;
        case 'direction': return 90; case 'downScroll': return settings.downscroll;
      }
      return undefined;
    },
    psychSet(path: string, v: unknown) {
      const n = +(v as number);
      switch (path) {
        case 'x': s.x = n; return; case 'y': s.y = n; return; case 'alpha': s.alpha = n; return; case 'angle': s.angle = n; return; case 'visible': s.visible = !!v; return;
        case 'scale.x': s.scaleX = n * (ps.skin.scale / 0.7); return; case 'scale.y': s.scaleY = n * (ps.skin.scale / 0.7); return;
      }
    },
  };
}

function strumGroup(ps: PlayState, start: number, count: number): any {
  return {
    length: count,
    member: (i: number) => (i >= 0 && i < count ? strumProxy(ps, start + i) : undefined),
    psychGet(path: string, parts: (string | number)[]) {
      if (path === 'length') return count;
      if (typeof parts[0] === 'number') { const m = strumProxy(ps, start + parts[0]); return parts.length > 1 ? m.psychGet(parts.slice(1).join('.')) : m; }
      return undefined;
    },
    psychSet(_path: string, v: unknown, parts: (string | number)[]) {
      if (typeof parts[0] === 'number' && parts.length > 1) strumProxy(ps, start + parts[0]).psychSet(parts.slice(1).join('.'), v);
    },
  };
}

function noteProxy(ps: PlayState, n: GNote | undefined): any {
  if (!n) return undefined;
  const strum = () => ps.strumList[(n.player ? 4 : 0) + n.lane];
  return {
    psychGet(path: string) {
      switch (path) {
        case 'strumTime': return n.t; case 'noteData': return n.lane; case 'mustPress': return n.player; case 'noteType': return n.type;
        case 'isSustainNote': return false; case 'sustainLength': return n.len; case 'texture': return n.texture;
        case 'hitCausesMiss': return n.hitCausesMiss; case 'ignoreNote': return n.ignoreNote; case 'noAnimation': return n.noAnimation;
        case 'noMissAnimation': return n.noMissAnimation; case 'hitHealth': return n.hitHealth; case 'missHealth': return n.missHealth;
        case 'alpha': return n.alpha; case 'visible': return n.visible; case 'offsetX': return n.offsetX; case 'offsetY': return n.offsetY;
        case 'angle': return n.angle; case 'multAlpha': return n.multAlpha; case 'wasGoodHit': return n.state === 1; case 'tooLate': return n.state === 2;
        case 'canBeHit': return n.state === 0; case 'gfNote': return n.kind === 'gf'; case 'animSuffix': return n.kind === 'alt' ? '-alt' : '';
        case 'copyAlpha': case 'copyX': case 'copyY': case 'copyAngle': return true;
        case 'lowPriority': return n.ignoreNote;
        // Psych copia x/y del receptor en cada frame (copyX/copyY): lo que fije el script se pisa igual que allí
        case 'x': return strum().x + n.offsetX;
        case 'y': return strum().y + n.offsetY;
        case 'scale.x': case 'scale.y': return 0.7;
        case 'distance': return 0.45 * (n.t - ps.songT);
      }
      return n.extra[path];
    },
    psychSet(path: string, v: unknown) {
      const num = +(v as number);
      switch (path) {
        case 'texture': n.texture = String(v ?? ''); return;
        case 'hitCausesMiss': n.hitCausesMiss = !!v; return; case 'ignoreNote': n.ignoreNote = !!v; return;
        case 'noAnimation': n.noAnimation = !!v; return; case 'noMissAnimation': n.noMissAnimation = !!v; return;
        case 'hitHealth': n.hitHealth = num; return; case 'missHealth': n.missHealth = num; return;
        case 'alpha': n.alpha = num; return; case 'visible': n.visible = !!v; return;
        case 'offsetX': n.offsetX = num; return; case 'offsetY': n.offsetY = num; return;
        case 'angle': n.angle = num; return; case 'multAlpha': n.multAlpha = num; return;
        case 'noteType': n.type = String(v ?? ''); return;
        case 'gfNote': if (v) n.kind = 'gf'; return;
        case 'animSuffix': if (v === '-alt') n.kind = 'alt'; return;
        case 'x': case 'y': case 'scale.x': case 'scale.y': return;
      }
      n.extra[path] = v;
    },
  };
}

function noteGroup(ps: PlayState, spawnedOnly: boolean): any {
  const list = () => (spawnedOnly ? ps.spawnedList : ps.noteList);
  return {
    get length() { return list().length; },
    member: (i: number) => noteProxy(ps, list()[i]),
    psychGet(path: string, parts: (string | number)[]) {
      if (path === 'length') return list().length;
      if (typeof parts[0] === 'number') { const m = noteProxy(ps, list()[parts[0]]); return m && parts.length > 1 ? m.psychGet(parts.slice(1).join('.')) : m; }
      return undefined;
    },
    psychSet(_path: string, v: unknown, parts: (string | number)[]) {
      if (typeof parts[0] === 'number' && parts.length > 1) noteProxy(ps, list()[parts[0]])?.psychSet(parts.slice(1).join('.'), v);
    },
  };
}
