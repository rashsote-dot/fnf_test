import type { ModFormat, ModManifest, SongEntry } from '../core/types';

// Detección del formato de un mod importado (sin dependencias del DOM, para poder probarlo).
const DIFF_ORDER = ['easy', 'normal', 'hard', 'erect', 'nightmare'];

/** Detecta el formato de un mod a partir de su lista de archivos (rutas relativas, en minúsculas). */
export function detectMod(paths: string[], id: string): ModManifest {
  const songs: SongEntry[] = [];
  let format: ModFormat;
  const vsMeta = paths.filter((p) => /^data\/songs\/[^/]+\/[^/]+-metadata\.json$/.test(p));
  if (vsMeta.length) {
    format = 'vslice';
    for (const p of vsMeta) {
      const sid = p.split('/')[2];
      songs.push({ id: sid, name: sid.replace(/-/g, ' '), difficulties: ['easy', 'normal', 'hard'] });
    }
  } else {
    format = 'psych';
    const bySong = new Map<string, Set<string>>();
    for (const p of paths) {
      const m = /^data\/(?:songs\/)?([^/]+)\/([^/]+)\.json$/.exec(p);
      if (!m) continue;
      const [, sid, file] = m;
      if (file === 'events' || file.endsWith('-metadata') || file.endsWith('-chart')) continue;
      if (file === sid) (bySong.get(sid) ?? bySong.set(sid, new Set()).get(sid)!).add('normal');
      else if (file.startsWith(sid + '-')) (bySong.get(sid) ?? bySong.set(sid, new Set()).get(sid)!).add(file.slice(sid.length + 1));
    }
    for (const [sid, diffs] of bySong) {
      const d = [...diffs].sort((a, b) => (DIFF_ORDER.indexOf(a) + 99) % 100 - (DIFF_ORDER.indexOf(b) + 99) % 100);
      songs.push({ id: sid, name: sid.replace(/-/g, ' '), difficulties: d });
    }
  }
  if (!songs.length) throw new Error('No se encontraron canciones reconocibles (se esperaba data/<cancion>/<cancion>.json de Psych o data/songs/<cancion>/<cancion>-metadata.json de V-Slice).');
  const notes: string[] = [];
  if (paths.some((p) => p.endsWith('.lua'))) notes.push('Contiene scripts Lua: no se ejecutan en esta versión.');
  if (paths.some((p) => p.endsWith('.hx') || p.endsWith('.hxs') || p.endsWith('.hscript'))) notes.push('Contiene HScript: no se ejecuta en esta versión.');
  return {
    id, name: id, version: '1.0.0', format, description: 'Mod importado desde tu equipo.', category: 'Importados',
    songs, compatibility: notes.length ? 'partial' : 'full', compatNotes: notes,
  };
}

