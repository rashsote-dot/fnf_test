// Adaptador V-Slice (Friday Night Funkin' 0.3+ / "Weekend 1"): metadata + chart separados,
// personajes y escenarios declarativos en JSON.
import type { AnimDef, ChartEvent, ChartNote, InternalCharacter, InternalChart, InternalStage, StageProp } from '../core/types';
import { finalizeChart, normalizeKind, num, slotFromName, str } from './common';

type Json = any;

export function vsliceChartPaths(song: string, variation = ''): { meta: string; chart: string } {
  const s = song.toLowerCase();
  const v = variation ? `-${variation}` : '';
  return { meta: `data/songs/${s}/${s}-metadata${v}.json`, chart: `data/songs/${s}/${s}-chart${v}.json` };
}

export function mapVsliceEvent(t: number, kind: string, v: Json, timeChanges: { t: number; bpm: number }[]): ChartEvent | null {
  const stepMs = 15000 / (timeChanges.filter((c) => c.t <= t).pop()?.bpm ?? timeChanges[0]?.bpm ?? 120);
  switch (kind) {
    case 'FocusCamera': {
      const c = typeof v === 'object' && v !== null ? v.char : v;
      const target = num(c, 0) === 1 ? 'dad' : num(c, 0) === 2 ? 'gf' : num(c, 0) < 0 ? 'none' : 'bf';
      return { t, name: 'camFocus', v: { target, x: num(v?.x), y: num(v?.y), dur: num(v?.duration, 4) * stepMs, ease: str(v?.ease, 'CLASSIC') } };
    }
    case 'ZoomCamera':
      return { t, name: 'camZoomSet', v: { zoom: num(v?.zoom, 1), dur: num(v?.duration, 4) * stepMs, ease: str(v?.ease, 'linear'), relative: str(v?.mode, 'direct') === 'stage' } };
    case 'SetCameraBop':
      return { t, name: 'camBop', v: { rate: num(v?.rate, 4), intensity: num(v?.intensity, 1) } };
    case 'PlayAnimation':
      return { t, name: 'playAnim', v: { anim: str(v?.anim), target: slotFromName(v?.target), force: !!v?.force } };
    case 'ScrollSpeed':
      return { t, name: 'scrollSpeed', v: { mult: num(v?.scroll, 1), dur: num(v?.duration, 0) * stepMs, absolute: !!v?.absolute } };
    default:
      return null;
  }
}

export function parseVsliceChart(meta: Json, chart: Json, diff: string): InternalChart {
  const warnings: string[] = [];
  const d = diff.toLowerCase();
  const tc = (meta?.timeChanges ?? []).map((c: Json) => ({ t: num(c.t), bpm: num(c.bpm, 120) }));
  if (!tc.length) tc.push({ t: 0, bpm: 120 });
  const rawNotes: Json[] = chart?.notes?.[d];
  if (!Array.isArray(rawNotes)) throw new Error(`El chart V-Slice no tiene la dificultad "${diff}".`);
  const notes: ChartNote[] = rawNotes.map((n) => {
    const dd = num(n.d);
    return { t: num(n.t), lane: dd % 4, len: Math.max(0, num(n.l)), player: dd < 4, kind: normalizeKind(n.k) };
  });
  const events: ChartEvent[] = [];
  const unsupported = new Set<string>();
  for (const e of (chart?.events ?? []) as Json[]) {
    const ev = mapVsliceEvent(num(e.t), str(e.e), e.v, tc);
    if (ev) events.push(ev);
    else { events.push({ t: num(e.t), name: 'custom', v: { name: str(e.e), value: e.v } }); unsupported.add(str(e.e)); }
  }
  if (unsupported.size) warnings.push(`Eventos personalizados (solo funcionan si el mod incluye un script compatible): ${[...unsupported].join(', ')}`);
  const pd = meta?.playData ?? {};
  const ss = chart?.scrollSpeed;
  return finalizeChart({
    songName: str(meta?.songName, 'Canción'),
    bpm: tc[0].bpm,
    timeChanges: tc,
    scrollSpeed: typeof ss === 'number' ? ss : num(ss?.[d] ?? ss?.default, 1),
    notes,
    events,
    player: str(pd.characters?.player, 'bf'),
    opponent: str(pd.characters?.opponent, 'dad'),
    gf: str(pd.characters?.girlfriend, 'gf'),
    stage: str(pd.stage, ''),
    warnings,
  });
}

export function parseVsliceCharacter(j: Json, id: string): InternalCharacter {
  if (j.renderType && j.renderType !== 'sparrow' && j.renderType !== 'multisparrow') {
    throw new Error(`Tipo de render "${j.renderType}" no soportado todavía (solo Sparrow).`);
  }
  const anims: AnimDef[] = (j.animations ?? []).map((a: Json) => ({
    name: str(a.name),
    prefix: str(a.prefix),
    fps: num(a.frameRate, 24),
    loop: !!a.looped,
    indices: Array.isArray(a.frameIndices) && a.frameIndices.length ? a.frameIndices.map((x: unknown) => num(x)) : undefined,
    offset: [num(a.offsets?.[0]), num(a.offsets?.[1])] as [number, number],
  }));
  const hasDanceLR = anims.some((a) => a.name === 'danceLeft');
  return {
    id,
    image: 'images/' + str(j.assetPath, 'characters/' + id),
    scale: num(j.scale, 1),
    flipX: !!j.flipX,
    position: [num(j.offsets?.[0]), num(j.offsets?.[1])],
    cameraOffset: [num(j.cameraOffsets?.[0]), num(j.cameraOffsets?.[1])],
    singDuration: num(j.singTime, 8),
    danceEvery: num(j.danceEvery, hasDanceLR ? 1 : 2),
    anims,
    healthColor: str(j.healthBarColor ?? j.healthColor, '#a1a1a1'),
    icon: str(j.healthIcon?.id, id),
    anchor: 'feet',
  };
}

export function parseVsliceStage(j: Json, id: string): InternalStage {
  const props: StageProp[] = (j.props ?? []).map((p: Json, i: number) => {
    const isColor = str(p.assetPath).startsWith('#');
    const sc = typeof p.scale === 'number' ? [p.scale, p.scale] : [num(p.scale?.[0], 1), num(p.scale?.[1], 1)];
    const prop: StageProp = {
      name: str(p.name, 'prop' + i),
      image: isColor ? '' : 'images/' + str(p.assetPath),
      x: num(p.position?.[0]),
      y: num(p.position?.[1]),
      scale: sc as [number, number],
      scroll: [num(p.scroll?.[0], 1), num(p.scroll?.[1], 1)],
      z: num(p.zIndex, i),
      alpha: num(p.alpha, 1),
      color: isColor ? str(p.assetPath) : undefined,
    };
    if (isColor) { prop.width = 1; prop.height = 1; }
    if (Array.isArray(p.animations) && p.animations.length) {
      const first = p.animations.find((a: Json) => a.name === p.startingAnimation) ?? p.animations[0];
      prop.anim = { prefix: str(first.prefix), fps: num(first.frameRate, 24), loop: first.looped !== false };
    }
    return prop;
  });
  const ch = (k: string, dx: number, dy: number, dz: number) => {
    const c = j.characters?.[k] ?? {};
    return { x: num(c.position?.[0], dx), y: num(c.position?.[1], dy), z: num(c.zIndex, dz), cam: [num(c.cameraOffsets?.[0]), num(c.cameraOffsets?.[1])] as [number, number] };
  };
  return {
    id,
    zoom: num(j.cameraZoom, 1),
    props,
    chars: { bf: ch('bf', 989, 885, 300), dad: ch('dad', 335, 885, 200), gf: ch('gf', 751, 787, 100) },
    bgColor: '#000000',
  };
}
