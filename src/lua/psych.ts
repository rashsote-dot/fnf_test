// API de scripts Lua compatible con Psych Engine 0.6/0.7 (el subconjunto que usan la gran mayoría de mods).
// Cada script tiene su propio intérprete (como en Psych, un estado de Lua por archivo).
import { Diag } from '../core/diagnostics';
import { Interp, LuaError, LuaTable, first, tonum, tostr, truthy } from './lua';
import { installStdlib } from './stdlib';

export const FUNCTION_STOP = 1, FUNCTION_CONTINUE = 0, FUNCTION_STOP_LUA = 2;

/** Lo que el juego expone a los scripts (lo implementa PlayState). */
export interface PsychHost {
  songId: string; songName: string; diff: string;
  songT: number; curBeat: number; curStep: number; bpm: number; songLength: number;
  downscroll: boolean; middlescroll: boolean; botplay: boolean;
  health: number;
  getObject(name: string): any;
  luaSprite(tag: string): any;
  makeLuaSprite(tag: string, image: string, x: number, y: number, animated: boolean): void;
  makeGraphic(tag: string, w: number, h: number, color: string): void;
  addAnim(tag: string, name: string, prefix: string, fps: number, loop: boolean, indices?: number[]): void;
  playAnim(obj: string, anim: string, force: boolean): void;
  addLuaSprite(tag: string, front: boolean): void;
  removeLuaSprite(tag: string, destroy: boolean): void;
  setCamera(tag: string, cam: string): void;
  getOrder(name: string): number;
  setOrder(name: string, order: number): void;
  makeText(tag: string, text: string, width: number, x: number, y: number): void;
  textProp(tag: string, prop: string, value?: unknown): unknown;
  addText(tag: string): void;
  removeText(tag: string): void;
  tween(tag: string, target: string, prop: string, value: number, durSec: number, ease: string): void;
  tweenColor(tag: string, target: string, color: string, durSec: number, ease: string): void;
  noteTween(tag: string, note: number, prop: string, value: number, durSec: number, ease: string): void;
  cancelTween(tag: string): void;
  triggerEvent(name: string, v1: string, v2: string): void;
  characterDance(who: string): void;
  cameraSetTarget(who: string): void;
  cameraFlash(cam: string, color: string, durSec: number): void;
  cameraShake(cam: string, intensity: number, durSec: number): void;
  playSound(name: string, volume: number): void;
  startVideo(name: string): void;
  groupProp(group: string, index: number, prop: string, value?: unknown): unknown;
  groupLength(group: string): number;
  endSong(): void;
  restartSong(): void;
  scriptError(script: string, msg: string): void;
}

interface Timer { tag: string; interval: number; loops: number; left: number; t: number }

export class PsychScripts {
  scripts: { name: string; I: Interp; closed: boolean; hooks: Set<string> }[] = [];
  timers = new Map<string, Timer>();
  private errorsShown = new Set<string>();

  constructor(private host: PsychHost) {}

  get count() { return this.scripts.length; }

  load(name: string, code: string) {
    const I = new Interp();
    I.maxSteps = 3_000_000;
    installStdlib(I, (s) => console.info(`[lua:${name}]`, s));
    const entry = { name, I, closed: false, hooks: new Set<string>() };
    this.install(I, entry);
    try {
      I.run(code, name);
    } catch (e) {
      this.error(name, e);
      entry.closed = true;
    }
    this.scripts.push(entry);
    return entry;
  }

  private error(name: string, e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    const key = name + msg;
    if (this.errorsShown.has(key)) return;
    this.errorsShown.add(key);
    this.host.scriptError(name, msg);
  }

  /** llama a una función en todos los scripts; devuelve FUNCTION_STOP si alguno la devuelve */
  call(fnName: string, args: unknown[] = []): number {
    let ret = FUNCTION_CONTINUE;
    for (const s of this.scripts) {
      if (s.closed) continue;
      const f = s.I.G.get(fnName);
      if (f === undefined) continue;
      try {
        const r = first(s.I.protectedCall(f, args));
        if (r === FUNCTION_STOP || r === FUNCTION_STOP_LUA) ret = FUNCTION_STOP;
      } catch (e) {
        this.error(`${s.name}:${fnName}`, e);
      }
    }
    return ret;
  }

  has(fnName: string) { return this.scripts.some((s) => !s.closed && s.I.G.get(fnName) !== undefined); }

  setVar(name: string, value: unknown) { for (const s of this.scripts) s.I.G.set(name, value); }

  update(dtMs: number) {
    for (const tm of [...this.timers.values()]) {
      tm.t += dtMs;
      while (tm.t >= tm.interval && this.timers.get(tm.tag) === tm) {
        tm.t -= tm.interval;
        tm.left--;
        if (tm.left <= 0 && tm.loops > 0) this.timers.delete(tm.tag);
        this.call('onTimerCompleted', [tm.tag, tm.loops, Math.max(0, tm.left)]);
        if (tm.loops === 0) tm.left = 1; // infinito
        if (tm.interval <= 0) break;
      }
    }
  }

  // ------------------------------------------------------------------ API
  private install(I: Interp, entry: { name: string; closed: boolean }) {
    const h = this.host;
    const G = I.G;
    const def = (name: string, f: (...a: any[]) => unknown) => G.set(name, (args: unknown[]) => f(...args));
    const n = (v: unknown, d = 0) => tonum(v) ?? d;
    const s = (v: unknown, d = '') => (v === undefined || v === null ? d : tostr(v));

    // constantes y variables de Psych
    const vars: Record<string, unknown> = {
      Function_Stop: FUNCTION_STOP, Function_Continue: FUNCTION_CONTINUE, Function_StopLua: FUNCTION_STOP_LUA, Function_StopHScript: 3, Function_StopAll: 4,
      luaDebugMode: false, luaDeprecatedWarnings: false, inChartEditor: false, isStoryMode: false, seenCutscene: true,
      version: '0.7.3', buildTarget: 'browser', screenWidth: 1280, screenHeight: 720, playbackRate: 1,
      songName: h.songName, songPath: h.songId, difficulty: 1, difficultyName: h.diff, difficultyPath: h.diff,
      downscroll: h.downscroll, middlescroll: h.middlescroll, botPlay: h.botplay, practice: false, ghostTapping: true,
      framerate: 60, hideHud: false, timeBarType: 'Time Left', scoreZoom: true, cameraZoomOnBeat: true, flashingLights: true,
      noResetButton: false, lowQuality: false, shadersEnabled: false, healthBarAlpha: 1, noteOffset: 0, splashAlpha: 0.6,
      scriptName: entry.name, currentModDirectory: '', modFolder: '', startedCountdown: false, inGameOver: false,
      mustHitSection: false, altAnim: false, gfSection: false, curSection: 0, curDecBeat: 0, curDecStep: 0,
      curBeat: 0, curStep: 0, bpm: h.bpm, crochet: 60000 / h.bpm, stepCrochet: 15000 / h.bpm, songLength: h.songLength,
      scrollSpeed: h.getObject('__state')?.psychGet?.('songSpeed') ?? 1, songPosition: h.songT,
      boyfriendName: h.getObject('__state')?.psychGet?.('boyfriendName') ?? 'bf', dadName: h.getObject('__state')?.psychGet?.('dadName') ?? 'dad',
      gfName: h.getObject('__state')?.psychGet?.('gfName') ?? 'gf', curStage: h.getObject('__state')?.psychGet?.('curStage') ?? '',
      score: 0, misses: 0, hits: 0, combo: 0, rating: 0, ratingName: '?', ratingFC: '', healthGainMult: 1, healthLossMult: 1,
      instakillOnMiss: false, botplay: h.botplay,
    };
    for (const k of ['boyfriend', 'dad', 'gf'] as const) {
      const o = h.getObject(k);
      const key = k === 'boyfriend' ? 'Boyfriend' : k === 'dad' ? 'Opponent' : 'Girlfriend';
      vars[`default${key}X`] = o?.psychGet?.('x') ?? 0; vars[`default${key}Y`] = o?.psychGet?.('y') ?? 0;
    }
    for (let i = 0; i < 4; i++) {
      for (const [g, pre] of [['playerStrums', 'defaultPlayerStrum'], ['opponentStrums', 'defaultOpponentStrum']] as const) {
        vars[`${pre}X${i}`] = h.groupProp(g, i, 'x') ?? 0; vars[`${pre}Y${i}`] = h.groupProp(g, i, 'y') ?? 0;
      }
    }
    for (const [k, v] of Object.entries(vars)) G.set(k, v);

    // ---------------- propiedades
    def('getProperty', (path, allowMaps) => { void allowMaps; return toLua(getPath(h, s(path))); });
    def('setProperty', (path, value) => { setPath(h, s(path), fromLua(value)); return true; });
    def('getPropertyFromGroup', (group, index, prop) => toLua(h.groupProp(s(group), n(index), s(prop))));
    def('setPropertyFromGroup', (group, index, prop, value) => { h.groupProp(s(group), n(index), s(prop), fromLua(value)); });
    def('getPropertyFromClass', (cls, prop) => classProp(h, s(cls), s(prop)));
    def('setPropertyFromClass', () => undefined);
    def('addHaxeLibrary', () => undefined);
    def('runHaxeCode', () => undefined);
    def('runHaxeFunction', () => undefined);
    def('getModSetting', () => undefined);
    def('setVar', (name, value) => { h.getObject('__vars')[s(name)] = value; });
    def('getVar', (name) => h.getObject('__vars')[s(name)]);
    def('callOnLuas', (fn, args) => { this.call(s(fn), args instanceof LuaTable ? args.arr : []); });
    def('callOnScripts', (fn, args) => { this.call(s(fn), args instanceof LuaTable ? args.arr : []); });
    def('setOnLuas', (name, value) => this.setVar(s(name), value));
    def('setOnScripts', (name, value) => this.setVar(s(name), value));
    def('close', () => { entry.closed = true; });
    def('debugPrint', (...a) => console.info(`[lua:${entry.name}]`, a.map((x) => tostr(x)).join(' ')));
    def('luaSpriteExists', (tag) => !!h.luaSprite(s(tag)));
    def('luaTextExists', (tag) => h.textProp(s(tag), '__exists') === true);
    def('isRunning', () => true);
    def('getColorFromHex', (c) => colorInt(s(c)));
    def('FlxColor', (c) => colorInt(s(c)));
    def('getRandomInt', (a, b) => Math.floor(Math.random() * (n(b, 1) - n(a) + 1)) + n(a));
    def('getRandomFloat', (a, b) => Math.random() * (n(b, 1) - n(a)) + n(a));
    def('getRandomBool', (c) => Math.random() * 100 < n(c, 50));
    def('getSongPosition', () => h.songT);
    def('getHealth', () => h.health);
    def('setHealth', (v) => { h.health = n(v, h.health); });
    def('addHealth', (v) => { h.health += n(v); });
    def('getScore', () => n(getPath(h, 'songScore'))); def('getMisses', () => n(getPath(h, 'songMisses')));
    def('setScore', () => undefined); def('setMisses', () => undefined); def('setRatingPercent', () => undefined);
    def('precacheImage', () => undefined); def('precacheSound', () => undefined); def('precacheMusic', () => undefined);
    def('addCharacterToList', () => undefined);
    def('setShaderFloat', () => undefined); def('setSpriteShader', () => undefined); def('initLuaShader', () => false);
    def('setBlendMode', (tag, mode) => { const o = h.luaSprite(s(tag)); if (o) o.blend = s(mode).toLowerCase(); });
    def('makeVideoSprite', () => undefined); def('startVideo', (name) => h.startVideo(s(name)));
    def('openCustomSubstate', () => undefined); def('closeCustomSubstate', () => undefined);

    // ---------------- sprites
    def('makeLuaSprite', (tag, image, x, y) => h.makeLuaSprite(s(tag), s(image), n(x), n(y), false));
    def('makeAnimatedLuaSprite', (tag, image, x, y) => h.makeLuaSprite(s(tag), s(image), n(x), n(y), true));
    def('makeGraphic', (tag, w, hh, color) => h.makeGraphic(s(tag), n(w, 1), n(hh, 1), s(color, 'FFFFFF')));
    def('loadGraphic', (tag, image) => { const o = h.luaSprite(s(tag)); if (o) h.makeLuaSprite(s(tag), s(image), o.x, o.y, false); });
    def('addAnimationByPrefix', (tag, name, prefix, fps, loop) => h.addAnim(s(tag), s(name), s(prefix), n(fps, 24), loop === undefined ? true : truthy(loop)));
    def('addAnimationByIndices', (tag, name, prefix, indices, fps, loop) => {
      const idx = (indices instanceof LuaTable ? indices.arr : s(indices).split(',')).map((x) => tonum(String(x).trim())).filter((x): x is number => x !== undefined);
      h.addAnim(s(tag), s(name), s(prefix), n(fps, 24), truthy(loop), idx);
    });
    def('addAnimationByIndicesLoop', (tag, name, prefix, indices, fps) => {
      const idx = s(indices).split(',').map((x) => tonum(x.trim())).filter((x): x is number => x !== undefined);
      h.addAnim(s(tag), s(name), s(prefix), n(fps, 24), true, idx);
    });
    def('addAnimation', (tag, name, frames, fps, loop) => {
      const o = h.luaSprite(s(tag)); if (!o) return;
      const idx = frames instanceof LuaTable ? frames.arr.map((x) => n(x)) : [];
      h.addAnim(s(tag), s(name), '', n(fps, 24), loop === undefined ? true : truthy(loop), idx);
    });
    def('addOffset', (tag, anim, x, y) => { const o = h.luaSprite(s(tag)) ?? h.getObject(s(tag)); const a = o?.anim?.anims.get(s(anim)); if (a) a.offset = [n(x), n(y)]; });
    def('objectPlayAnimation', (tag, anim, force) => h.playAnim(s(tag), s(anim), truthy(force)));
    def('playAnim', (tag, anim, force) => h.playAnim(s(tag), s(anim), truthy(force)));
    def('characterPlayAnim', (who, anim, force) => h.playAnim(s(who), s(anim), truthy(force)));
    def('addLuaSprite', (tag, front) => h.addLuaSprite(s(tag), truthy(front)));
    def('removeLuaSprite', (tag, destroy) => h.removeLuaSprite(s(tag), destroy === undefined ? true : truthy(destroy)));
    def('setObjectCamera', (tag, cam) => h.setCamera(s(tag), s(cam, 'game')));
    def('setScrollFactor', (tag, x, y) => { setPath(h, `${s(tag)}.scrollFactor.x`, n(x, 1)); setPath(h, `${s(tag)}.scrollFactor.y`, n(y, n(x, 1))); });
    def('scaleObject', (tag, x, y) => { setPath(h, `${s(tag)}.scale.x`, n(x, 1)); setPath(h, `${s(tag)}.scale.y`, n(y, n(x, 1))); });
    def('setGraphicSize', (tag, w, hh) => {
      const o = h.luaSprite(s(tag)) ?? h.getObject(s(tag)); if (!o || !o.frame) return;
      const fw = o.frame.fw * (o.texMul ?? 1), fh = o.frame.fh * (o.texMul ?? 1);
      const W = n(w), H = n(hh);
      const sx = W > 0 ? W / fw : H > 0 ? H / fh : 1, sy = H > 0 ? H / fh : sx;
      setPath(h, `${s(tag)}.scale.x`, sx); setPath(h, `${s(tag)}.scale.y`, sy);
    });
    def('updateHitbox', () => undefined);
    def('updateHitboxFromGroup', () => undefined);
    def('screenCenter', (tag, axis) => {
      const o = h.luaSprite(s(tag)) ?? h.getObject(s(tag)); if (!o) return;
      const ax = s(axis, 'xy').toLowerCase();
      const w = getPath(h, `${s(tag)}.width`) as number, hh = getPath(h, `${s(tag)}.height`) as number;
      if (ax.includes('x')) setPath(h, `${s(tag)}.x`, (1280 - w) / 2);
      if (ax.includes('y')) setPath(h, `${s(tag)}.y`, (720 - hh) / 2);
    });
    def('setObjectOrder', (tag, order) => h.setOrder(s(tag), n(order)));
    def('getObjectOrder', (tag) => h.getOrder(s(tag)));
    def('getMidpointX', (tag) => n(getPath(h, `${s(tag)}.x`)) + n(getPath(h, `${s(tag)}.width`)) / 2);
    def('getMidpointY', (tag) => n(getPath(h, `${s(tag)}.y`)) + n(getPath(h, `${s(tag)}.height`)) / 2);
    def('getGraphicMidpointX', (tag) => n(getPath(h, `${s(tag)}.x`)) + n(getPath(h, `${s(tag)}.width`)) / 2);
    def('getGraphicMidpointY', (tag) => n(getPath(h, `${s(tag)}.y`)) + n(getPath(h, `${s(tag)}.height`)) / 2);
    def('getScreenPositionX', (tag) => n(getPath(h, `${s(tag)}.x`)));
    def('getScreenPositionY', (tag) => n(getPath(h, `${s(tag)}.y`)));
    def('objectsOverlap', () => false);
    def('setObjectColor', (tag, c) => setPath(h, `${s(tag)}.color`, colorInt(s(c))));

    // ---------------- texto
    def('makeLuaText', (tag, text, width, x, y) => h.makeText(s(tag), s(text), n(width), n(x), n(y)));
    def('addLuaText', (tag) => h.addText(s(tag)));
    def('removeLuaText', (tag) => h.removeText(s(tag)));
    def('setTextString', (tag, text) => h.textProp(s(tag), 'text', s(text)));
    def('getTextString', (tag) => h.textProp(s(tag), 'text'));
    def('setTextSize', (tag, size) => h.textProp(s(tag), 'size', n(size, 16)));
    def('getTextSize', (tag) => h.textProp(s(tag), 'size'));
    def('setTextWidth', (tag, w) => h.textProp(s(tag), 'width', n(w)));
    def('setTextColor', (tag, c) => h.textProp(s(tag), 'color', hexColor(s(c))));
    def('setTextFont', (tag, f) => h.textProp(s(tag), 'font', s(f).replace(/\.\w+$/, '')));
    def('getTextFont', (tag) => h.textProp(s(tag), 'font'));
    def('setTextAlignment', (tag, a) => h.textProp(s(tag), 'align', s(a, 'left').toLowerCase()));
    def('setTextBorder', (tag, size, color) => { h.textProp(s(tag), 'border', n(size)); if (color !== undefined) h.textProp(s(tag), 'borderColor', hexColor(s(color))); });
    def('setTextItalic', () => undefined);
    def('setTextHeight', () => undefined);
    def('setTextAutoSize', () => undefined);
    def('getTextWidth', (tag) => h.textProp(s(tag), 'measuredWidth'));

    // ---------------- tweens y temporizadores
    const tw = (prop: string) => (tag: unknown, vars: unknown, value: unknown, dur: unknown, ease: unknown) => h.tween(s(tag), s(vars), prop, n(value), n(dur), s(ease, 'linear'));
    def('doTweenX', tw('x')); def('doTweenY', tw('y')); def('doTweenAlpha', tw('alpha')); def('doTweenAngle', tw('angle')); def('doTweenZoom', tw('zoom'));
    def('doTweenColor', (tag, vars, color, dur, ease) => h.tweenColor(s(tag), s(vars), s(color), n(dur), s(ease, 'linear')));
    const nt = (prop: string) => (tag: unknown, note: unknown, value: unknown, dur: unknown, ease: unknown) => h.noteTween(s(tag), n(note), prop, n(value), n(dur), s(ease, 'linear'));
    def('noteTweenX', nt('x')); def('noteTweenY', nt('y')); def('noteTweenAlpha', nt('alpha')); def('noteTweenAngle', nt('angle')); def('noteTweenDirection', () => undefined);
    def('cancelTween', (tag) => h.cancelTween(s(tag)));
    def('runTimer', (tag, time, loops) => {
      const t = s(tag); const l = loops === undefined ? 1 : n(loops, 1);
      this.timers.set(t, { tag: t, interval: Math.max(0, n(time, 1)) * 1000, loops: l, left: l <= 0 ? 1 : l, t: 0 });
    });
    def('cancelTimer', (tag) => { this.timers.delete(s(tag)); });

    // ---------------- juego
    def('triggerEvent', (name, v1, v2) => { h.triggerEvent(s(name), s(v1), s(v2)); return true; });
    def('characterDance', (who) => h.characterDance(s(who)));
    def('cameraSetTarget', (who) => h.cameraSetTarget(s(who)));
    def('cameraFlash', (cam, color, dur) => h.cameraFlash(s(cam, 'game'), s(color, 'FFFFFF'), n(dur, 1)));
    def('cameraShake', (cam, intensity, dur) => h.cameraShake(s(cam, 'game'), n(intensity, 0.05), n(dur, 0.5)));
    def('cameraFade', (cam, color, dur) => h.tweenColor('__fade', s(cam, 'game'), s(color, '000000'), n(dur, 1), 'linear'));
    def('playSound', (name, vol) => h.playSound(s(name), n(vol, 1)));
    def('playMusic', () => undefined);
    def('soundFadeIn', () => undefined); def('soundFadeOut', () => undefined); def('stopSound', () => undefined);
    def('pauseSound', () => undefined); def('resumeSound', () => undefined); def('setSoundVolume', () => undefined);
    def('endSong', () => h.endSong());
    def('restartSong', () => h.restartSong());
    def('exitSong', () => h.endSong());
    def('startCountdown', () => undefined);
    def('setHealthBarColors', (l, r) => { const o = h.getObject('__healthColors'); if (o) { o.left = hexColor(s(l)); o.right = hexColor(s(r)); } });
    def('setTimeBarColors', () => undefined);
    def('keyJustPressed', () => false); def('keyPressed', () => false); def('keyReleased', () => false);
    def('mouseClicked', () => false); def('mousePressed', () => false); def('getMouseX', () => 0); def('getMouseY', () => 0);
    def('keyboardJustPressed', () => false); def('keyboardPressed', () => false);
    def('getDataFromSave', (_a, _b, d) => d); def('setDataFromSave', () => undefined); def('initSaveData', () => undefined); def('flushSaveData', () => undefined);
    def('stringStartsWith', (a, b) => s(a).startsWith(s(b)));
    def('stringEndsWith', (a, b) => s(a).endsWith(s(b)));
    def('stringSplit', (a, b) => { const t = new LuaTable(); s(a).split(s(b, ',')).forEach((p, i) => t.set(i + 1, p)); return t; });
    def('stringTrim', (a) => s(a).trim());
    def('checkFileExists', () => false);
    def('getTextFromFile', () => '');
  }
}

// ------------------------------------------------------------------ rutas de propiedades
function toLua(v: unknown): unknown {
  if (v === null) return undefined;
  if (Array.isArray(v)) { const t = new LuaTable(); v.forEach((x, i) => t.set(i + 1, x)); return t; }
  return v;
}
function fromLua(v: unknown): unknown { return v; }

/** Divide 'strumLineNotes.members[2].x' en ['strumLineNotes', 2, 'x'] */
export function splitPath(path: string): (string | number)[] {
  const out: (string | number)[] = [];
  for (const part of path.split('.')) {
    const m = /^([^\[]*)((?:\[\d+\])*)$/.exec(part);
    if (!m) { out.push(part); continue; }
    if (m[1]) out.push(m[1]);
    for (const idx of m[2].matchAll(/\[(\d+)\]/g)) out.push(+idx[1]);
  }
  return out.filter((x) => x !== 'members');
}

export function getPath(h: PsychHost, path: string): unknown {
  const parts = splitPath(path);
  if (!parts.length) return undefined;
  const base = h.getObject(String(parts[0]));
  if (base === undefined) return undefined;
  return readProp(base, parts.slice(1));
}

export function setPath(h: PsychHost, path: string, value: unknown) {
  const parts = splitPath(path);
  if (!parts.length) return;
  if (parts.length === 1) { const holder = h.getObject('__state'); writeProp(holder, [parts[0]], value); return; }
  const base = h.getObject(String(parts[0]));
  if (base === undefined || base === null) return;
  writeProp(base, parts.slice(1), value);
}

/** Los objetos del juego exponen get(path)/set(path, v) (proxies) o son objetos planos. */
function readProp(obj: any, parts: (string | number)[]): unknown {
  if (!parts.length) return obj;
  if (obj && typeof obj.psychGet === 'function') return obj.psychGet(parts.join('.'), parts);
  let cur = obj;
  for (const p of parts) { if (cur === undefined || cur === null) return undefined; cur = typeof p === 'number' && cur.member ? cur.member(p) : cur[p]; }
  return cur;
}
function writeProp(obj: any, parts: (string | number)[], value: unknown) {
  if (obj && typeof obj.psychSet === 'function') { obj.psychSet(parts.join('.'), value, parts); return; }
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i];
    const nx = typeof p === 'number' && cur.member ? cur.member(p) : cur[p];
    if (nx === undefined || nx === null) return;
    if (typeof nx.psychSet === 'function') { nx.psychSet(parts.slice(i + 1).join('.'), value, parts.slice(i + 1)); return; }
    cur = nx;
  }
  cur[parts[parts.length - 1]] = value;
}

function classProp(h: PsychHost, cls: string, prop: string): unknown {
  const p = prop.replace(/^data\./, '');
  if (/ClientPrefs/i.test(cls)) {
    const map: Record<string, unknown> = { downScroll: h.downscroll, middleScroll: h.middlescroll, ghostTapping: true, lowQuality: false, flashing: true, framerate: 60, noteOffset: 0, globalAntialiasing: true, antialiasing: true, camZooms: true, hideHud: false, shaders: false, timeBarType: 'Time Left', scoreZoom: true, healthBarAlpha: 1, splashAlpha: 0.6 };
    return map[p];
  }
  if (/Conductor/i.test(cls)) {
    if (p === 'songPosition') return h.songT;
    if (p === 'bpm') return h.bpm;
    if (p === 'crochet') return 60000 / h.bpm;
    if (p === 'stepCrochet') return 15000 / h.bpm;
  }
  if (/FlxG/.test(cls)) {
    if (p === 'width') return 1280;
    if (p === 'height') return 720;
    if (p === 'elapsed') return 1 / 60;
  }
  if (/PlayState/.test(cls)) return getPath(h, p);
  return undefined;
}

export function colorInt(c: string): number {
  let hx = c.replace(/^#|^0x/i, '');
  if (hx.length === 6) hx = 'FF' + hx;
  const v = parseInt(hx, 16);
  return Number.isNaN(v) ? 0xffffffff : v > 0x7fffffff ? v - 0x100000000 : v;
}
/** a '#rrggbb' desde 'FF0000', '0xFFFF0000', 'red' o un entero */
export function hexColor(c: string | number): string {
  if (typeof c === 'number') return '#' + ((c >>> 0) & 0xffffff).toString(16).padStart(6, '0');
  const named: Record<string, string> = { white: 'ffffff', black: '000000', red: 'ff0000', green: '008000', lime: '00ff00', blue: '0000ff', yellow: 'ffff00', cyan: '00ffff', magenta: 'ff00ff', purple: '800080', orange: 'ffa500', pink: 'ffc0cb', gray: '808080', grey: '808080', transparent: '000000' };
  const k = c.trim().toLowerCase();
  if (named[k]) return '#' + named[k];
  if (/^-?\d+$/.test(k)) return hexColor(+k);
  const hx = k.replace(/^#|^0x/, '');
  return '#' + (hx.length >= 6 ? hx.slice(-6) : hx.padStart(6, '0'));
}

export { LuaError };
void Diag;
