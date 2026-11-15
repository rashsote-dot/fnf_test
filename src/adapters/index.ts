// Registro de adaptadores. Añadir soporte para un motor nuevo = crear un archivo y registrarlo aquí.
import type { InternalCharacter, InternalChart, InternalStage, ModFormat } from '../core/types';
import { fnfwebChartPath, parseFnfwebCharacter, parseFnfwebChart, parseFnfwebStage } from './fnfweb';
import { parsePsychCharacter, parsePsychChart, parsePsychStage, psychChartPaths } from './psych';
import { parseVsliceCharacter, parseVsliceChart, parseVsliceStage, vsliceChartPaths } from './vslice';

type Json = any;

export interface FileReq { key: string; path: string; optional?: boolean }
export interface VoiceReq { url: string; who: 'player' | 'opponent' | 'both'; group: number }

export interface FormatAdapter {
  format: ModFormat;
  label: string;
  chartFiles(song: string, diff: string): FileReq[];
  parseChart(files: Record<string, Json | null>, song: string, diff: string): InternalChart;
  audio(song: string, chart: InternalChart): { inst: string; voices: VoiceReq[] };
  characterFile(id: string): string;
  parseCharacter(json: Json, id: string, isPlayer: boolean): InternalCharacter;
  stageFile(id: string): string;
  parseStage(json: Json, id: string): InternalStage;
  defaultStage: string;
}

const fnfweb: FormatAdapter = {
  format: 'fnfweb',
  label: 'Funkade (nativo)',
  chartFiles: (s, d) => [{ key: 'chart', path: fnfwebChartPath(s, d) }],
  parseChart: (f) => parseFnfwebChart(f.chart),
  audio: (s) => ({
    inst: `songs/${s}/Inst`,
    voices: [
      { url: `songs/${s}/Voices-player`, who: 'player', group: 0 },
      { url: `songs/${s}/Voices-opponent`, who: 'opponent', group: 0 },
    ],
  }),
  characterFile: (id) => `characters/${id}.json`,
  parseCharacter: (j, id) => parseFnfwebCharacter(j, id),
  stageFile: (id) => `stages/${id}.json`,
  parseStage: parseFnfwebStage,
  defaultStage: 'stage',
};

const psych: FormatAdapter = {
  format: 'psych',
  label: 'Psych Engine 0.6–1.0 / Kade / base legacy',
  chartFiles: (s, d) => {
    const p = psychChartPaths(s, d);
    return [{ key: 'chart', path: p.chart }, { key: 'events', path: p.events, optional: true }];
  },
  parseChart: (f) => parsePsychChart(f.chart, f.events),
  audio: (s, c) => ({
    inst: `songs/${s}/Inst`,
    voices: [
      { url: `songs/${s}/Voices-Player`, who: 'player', group: 0 },
      { url: `songs/${s}/Voices-Opponent`, who: 'opponent', group: 0 },
      { url: `songs/${s}/Voices-player`, who: 'player', group: 1 },
      { url: `songs/${s}/Voices-opponent`, who: 'opponent', group: 1 },
      { url: `songs/${s}/Voices-${c.player ?? 'bf'}`, who: 'player', group: 2 },
      { url: `songs/${s}/Voices-${c.opponent ?? 'dad'}`, who: 'opponent', group: 2 },
      { url: `songs/${s}/Voices`, who: 'both', group: 3 },
    ],
  }),
  characterFile: (id) => `characters/${id}.json`,
  parseCharacter: parsePsychCharacter,
  stageFile: (id) => `stages/${id}.json`,
  parseStage: parsePsychStage,
  defaultStage: 'stage',
};

const vslice: FormatAdapter = {
  format: 'vslice',
  label: 'V-Slice (FNF 0.3+)',
  chartFiles: (s) => {
    const p = vsliceChartPaths(s);
    return [{ key: 'meta', path: p.meta }, { key: 'chart', path: p.chart }];
  },
  parseChart: (f, _s, d) => parseVsliceChart(f.meta, f.chart, d),
  audio: (s, c) => ({
    inst: `songs/${s}/Inst`,
    voices: [
      { url: `songs/${s}/Voices-${c.player ?? 'bf'}`, who: 'player', group: 0 },
      { url: `songs/${s}/Voices-${c.opponent ?? 'dad'}`, who: 'opponent', group: 0 },
      { url: `songs/${s}/Voices`, who: 'both', group: 1 },
    ],
  }),
  characterFile: (id) => `data/characters/${id}.json`,
  parseCharacter: (j, id) => parseVsliceCharacter(j, id),
  stageFile: (id) => `data/stages/${id}.json`,
  parseStage: parseVsliceStage,
  defaultStage: 'mainStage',
};

export const ADAPTERS: Record<ModFormat, FormatAdapter> = { fnfweb, psych, vslice };

export function getAdapter(format: ModFormat): FormatAdapter {
  const a = ADAPTERS[format];
  if (!a) throw new Error(`Formato de mod desconocido: ${format}`);
  return a;
}
