// Formato nativo de Funkade: compacto y pensado para cargar rápido.
import type { InternalCharacter, InternalChart, InternalStage } from '../core/types';
import { finalizeChart, num, str } from './common';

type Json = any;

export function fnfwebChartPath(song: string, diff: string): string {
  return `charts/${song}/${diff}.json`;
}

/** notas: [t, carril, duración, jugador(1)/oponente(0), tipo?] */
export function parseFnfwebChart(j: Json): InternalChart {
  if (!Array.isArray(j?.notes)) throw new Error('Chart Funkade inválido (falta "notes").');
  return finalizeChart({
    songName: str(j.songName, 'Canción'),
    bpm: num(j.bpm, 120),
    timeChanges: Array.isArray(j.timeChanges) ? j.timeChanges.map((c: Json) => ({ t: num(c.t), bpm: num(c.bpm) })) : [],
    scrollSpeed: num(j.scrollSpeed, 1),
    notes: j.notes.map((n: Json) => ({ t: num(n[0]), lane: num(n[1]) & 3, len: num(n[2]), player: num(n[3]) === 1, kind: str(n[4]) })),
    events: (j.events ?? []).map((e: Json) => ({ t: num(e.t), name: str(e.name), v: e.v ?? {} })),
    player: j.player,
    opponent: j.opponent,
    gf: j.gf,
    stage: j.stage,
    warnings: [],
  });
}

export function parseFnfwebCharacter(j: Json, id: string): InternalCharacter {
  return {
    id,
    image: str(j.image),
    scale: num(j.scale, 1),
    flipX: !!j.flipX,
    position: [num(j.position?.[0]), num(j.position?.[1])],
    cameraOffset: [num(j.cameraOffset?.[0]), num(j.cameraOffset?.[1])],
    singDuration: num(j.singDuration, 4),
    danceEvery: num(j.danceEvery, 2),
    anims: (j.anims ?? []).map((a: Json) => ({ name: str(a.name), prefix: str(a.prefix), fps: num(a.fps, 24), loop: !!a.loop, indices: a.indices, offset: [num(a.offset?.[0]), num(a.offset?.[1])] })),
    healthColor: str(j.healthColor, '#a1a1a1'),
    icon: str(j.icon, id),
    anchor: j.anchor === 'topleft' ? 'topleft' : 'feet',
  };
}

export function parseFnfwebStage(j: Json, id: string): InternalStage {
  const c = (k: string, x: number, y: number, z: number) => ({ x: num(j.chars?.[k]?.x, x), y: num(j.chars?.[k]?.y, y), z: num(j.chars?.[k]?.z, z), cam: [num(j.chars?.[k]?.cam?.[0]), num(j.chars?.[k]?.cam?.[1])] as [number, number] });
  return {
    id,
    zoom: num(j.zoom, 1),
    props: (j.props ?? []).map((p: Json, i: number) => ({
      name: str(p.name, 'p' + i), image: str(p.image), x: num(p.x), y: num(p.y),
      scale: [num(p.scale?.[0] ?? p.scale, 1), num(p.scale?.[1] ?? p.scale, 1)], scroll: [num(p.scroll?.[0] ?? p.scroll, 1), num(p.scroll?.[1] ?? p.scroll, 1)],
      z: num(p.z, i), alpha: num(p.alpha, 1), color: p.color, width: p.width, height: p.height, anim: p.anim, lowQuality: !!p.lowQuality,
    })),
    chars: { bf: c('bf', 1000, 900, 300), dad: c('dad', 350, 900, 200), gf: c('gf', 700, 800, 100) },
    hideGf: !!j.hideGf,
    bgColor: str(j.bgColor, '#000000'),
  };
}
