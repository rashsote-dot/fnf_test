// Adaptador Psych Engine (0.6.x, 0.7.x y 1.0). También lee charts del juego base pre-0.3 y Kade Engine,
// que comparten el formato "song.notes[].sectionNotes".
import type { AnimDef, ChartEvent, ChartNote, InternalCharacter, InternalChart, InternalStage, StageProp } from '../core/types';
import { finalizeChart, mapPsychEvent, normalizeKind, num, str } from './common';

type Json = any;

export function psychChartPaths(song: string, diff: string): { chart: string; events: string } {
  const s = song.toLowerCase();
  const d = diff.toLowerCase();
  const file = d === 'normal' || d === '' ? `${s}.json` : `${s}-${d}.json`;
  return { chart: `data/${s}/${file}`, events: `data/${s}/events.json` };
}

export function parsePsychChart(raw: Json, eventsRaw: Json | null): InternalChart {
  const data: Json = raw && typeof raw.song === 'object' && raw.song !== null ? raw.song : raw;
  if (!data || !Array.isArray(data.notes)) throw new Error('El chart no tiene el formato Psych/legacy esperado (falta "notes").');
  const warnings: string[] = [];
  const absolute = str(data.format).startsWith('psych_v1');
  const notes: ChartNote[] = [];
  const events: ChartEvent[] = [];
  const timeChanges = [{ t: 0, bpm: num(data.bpm, 100) }];
  let bpm = num(data.bpm, 100);
  let t = 0;
  const unsupportedEv = new Set<string>();
  let lastFocus = '';

  const pushEvent = (time: number, name: string, v1: unknown, v2: unknown) => {
    const raw: [string, string, string] = [str(name), str(v1), str(v2)];
    const ev = mapPsychEvent(time, raw[0], raw[1], raw[2]);
    if (ev) { ev.raw = raw; events.push(ev); }
    else {
      // evento personalizado (normalmente un .lua del mod): se entrega a los scripts del mod
      events.push({ t: time, name: 'custom', v: { name: raw[0], v1: raw[1], v2: raw[2] }, raw });
      unsupportedEv.add(raw[0]);
    }
  };

  for (const sec of data.notes as Json[]) {
    if (!sec) continue;
    if (sec.changeBPM && num(sec.bpm) > 0 && num(sec.bpm) !== bpm) {
      bpm = num(sec.bpm);
      timeChanges.push({ t, bpm });
    }
    const beats = sec.sectionBeats !== undefined ? num(sec.sectionBeats, 4) : num(sec.lengthInSteps, 16) / 4;
    const focus = sec.gfSection ? 'gf' : sec.mustHitSection ? 'bf' : 'dad';
    if (focus !== lastFocus) {
      events.push({ t, name: 'camFocus', v: { target: focus } });
      lastFocus = focus;
    }
    for (const n of (sec.sectionNotes ?? []) as Json[]) {
      if (!Array.isArray(n)) continue;
      const time = num(n[0]);
      const d = num(n[1], -1);
      if (d < 0) {
        // evento antiguo incrustado en sectionNotes: [t, -1, nombre, v1, v2]
        pushEvent(time, n[2], n[3], n[4]);
        continue;
      }
      const lane = d % 4;
      let player: boolean;
      if (absolute) player = d < 4;
      else player = sec.mustHitSection ? d < 4 : d >= 4;
      const type = typeof n[3] === 'string' ? n[3] : n[3] === true ? 'Alt Animation' : '';
      let kind = normalizeKind(type);
      if (sec.altAnim && !player && kind === '') kind = 'alt';
      if (sec.gfSection && kind === '') kind = 'gf';
      notes.push({ t: time, lane, len: Math.max(0, num(n[2])), player, kind, type });
    }
    t += (beats * 60000) / bpm;
  }

  const evSources: Json[] = [];
  if (Array.isArray(data.events)) evSources.push(...data.events);
  if (eventsRaw) {
    const ed = eventsRaw.song && typeof eventsRaw.song === 'object' ? eventsRaw.song : eventsRaw;
    if (Array.isArray(ed.events)) evSources.push(...ed.events);
    // events.json antiguo con eventos en sectionNotes
    if (Array.isArray(ed.notes)) for (const sec of ed.notes) for (const n of sec.sectionNotes ?? []) if (num(n[1], 0) < 0) pushEvent(num(n[0]), n[2], n[3], n[4]);
  }
  for (const e of evSources) {
    if (!Array.isArray(e)) continue;
    const time = num(e[0]);
    if (Array.isArray(e[1])) for (const sub of e[1]) pushEvent(time, sub[0], sub[1], sub[2]);
    else pushEvent(time, e[1], e[2], e[3]);
  }
  if (unsupportedEv.size) warnings.push(`Eventos personalizados (solo funcionan si el mod incluye un script compatible): ${[...unsupportedEv].join(', ')}`);

  return finalizeChart({
    songName: str(data.song, 'Canción'),
    bpm: num(data.bpm, 100),
    timeChanges,
    scrollSpeed: num(data.speed, 1),
    notes,
    events,
    player: str(data.player1, 'bf'),
    opponent: str(data.player2, 'dad'),
    gf: str(data.gfVersion ?? data.player3, 'gf'),
    stage: str(data.stage, ''),
    arrowSkin: str(data.arrowSkin, '') || undefined,
    warnings,
  });
}

function rgbToHex(c: unknown): string {
  if (!Array.isArray(c)) return '#a1a1a1';
  return '#' + c.slice(0, 3).map((v) => Math.max(0, Math.min(255, num(v))).toString(16).padStart(2, '0')).join('');
}

export function parsePsychCharacter(j: Json, id: string, isPlayer: boolean): InternalCharacter {
  const anims: AnimDef[] = (j.animations ?? []).map((a: Json) => ({
    name: str(a.anim),
    prefix: str(a.name),
    fps: num(a.fps, 24),
    loop: !!a.loop,
    indices: Array.isArray(a.indices) && a.indices.length ? a.indices.map((x: unknown) => num(x)) : undefined,
    offset: [num(a.offsets?.[0]), num(a.offsets?.[1])] as [number, number],
  }));
  const hasDanceLR = anims.some((a) => a.name === 'danceLeft');
  return {
    id,
    image: 'images/' + str(j.image, 'characters/' + id),
    scale: num(j.scale, 1),
    flipX: !!j.flip_x !== isPlayer,
    position: [num(j.position?.[0]), num(j.position?.[1])],
    cameraOffset: [num(j.camera_position?.[0]), num(j.camera_position?.[1])],
    singDuration: num(j.sing_duration, 4),
    danceEvery: hasDanceLR ? 1 : 2,
    anims,
    healthColor: rgbToHex(j.healthbar_colors),
    icon: str(j.healthicon, id),
    anchor: 'topleft',
  };
}

export function parsePsychStage(j: Json, id: string): InternalStage {
  const pos = (v: Json, dx: number, dy: number): [number, number] => [num(v?.[0], dx), num(v?.[1], dy)];
  const bf = pos(j.boyfriend, 770, 100);
  const gf = pos(j.girlfriend, 400, 130);
  const dad = pos(j.opponent, 100, 100);
  const props: StageProp[] = [];
  const objs: Json[] = Array.isArray(j.objects) ? j.objects : [];
  const charZ: Record<string, number> = {};
  objs.forEach((o: Json, idx: number) => {
    const type = str(o.type, 'sprite');
    const z = idx * 100;
    if (type === 'boyfriend' || type === 'gf' || type === 'dad') { charZ[type] = z; return; }
    const p: StageProp = {
      name: str(o.name, 'obj' + idx),
      image: type === 'square' ? '' : 'images/' + str(o.image),
      x: num(o.x),
      y: num(o.y),
      scale: [num(o.scale?.[0], 1), num(o.scale?.[1], 1)],
      scroll: [num(o.scroll?.[0], 1), num(o.scroll?.[1], 1)],
      z,
      alpha: num(o.alpha, 1),
      color: o.color ? '#' + str(o.color).replace('#', '').slice(-6) : undefined,
      lowQuality: Array.isArray(o.filters) ? false : num(o.filters, 7) === 2, // 2 = solo calidad alta
    };
    if (type === 'square') { p.width = 1; p.height = 1; }
    if (type === 'animatedSprite' && Array.isArray(o.animations) && o.animations.length) {
      const first = o.animations.find((a: Json) => a.anim === o.firstAnimation) ?? o.animations[0];
      p.anim = { prefix: str(first.name), fps: num(first.fps, 24), loop: !!first.loop, indices: Array.isArray(first.indices) && first.indices.length ? first.indices.map((x: unknown) => num(x)) : undefined } as StageProp['anim'];
    }
    props.push(p);
  });
  const base = objs.length * 100;
  const zGf = charZ.gf ?? base, zDad = charZ.dad ?? base + 100, zBf = charZ.boyfriend ?? base + 200;
  return {
    id,
    zoom: num(j.defaultZoom, 0.9),
    props,
    chars: {
      bf: { x: bf[0], y: bf[1], z: zBf, cam: [num(j.camera_boyfriend?.[0]) - 100, num(j.camera_boyfriend?.[1]) - 100] },
      dad: { x: dad[0], y: dad[1], z: zDad, cam: [num(j.camera_opponent?.[0]) + 150, num(j.camera_opponent?.[1]) - 100] },
      gf: { x: gf[0], y: gf[1], z: zGf, cam: [num(j.camera_girlfriend?.[0]), num(j.camera_girlfriend?.[1])] },
    },
    hideGf: !!j.hide_girlfriend,
    bgColor: '#000000',
  };
}
