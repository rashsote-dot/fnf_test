// Recursos comunes a todos los mods (skin de notas, UI, personaje de reemplazo). Se cargan una vez.
import { parseFnfwebCharacter } from '../adapters/fnfweb';
import type { InternalCharacter } from '../core/types';
import { BASE_URL } from '../mod-loader/mod-manager';
import { ResourceScope } from '../mod-loader/resources';
import { getJson, ListedSource, RemoteSource } from '../mod-loader/source';
import type { Atlas } from '../renderer/atlas';
import type { Renderer } from '../renderer/renderer';

export interface SharedAssets {
  scope: ResourceScope;
  notes: Atlas;
  /** skin de notas original de FNF (si está disponible en shared/images/NOTE_assets) */
  fnfNotes?: Atlas;
  /** puntuaciones, cuenta atrás y números por defecto de Psych Engine (sick, ready, num0…) */
  psychUi: Record<string, Atlas>;
  ui: Atlas;
  iconFallback: Atlas;
  placeholder: { def: InternalCharacter; atlas: Atlas };
}

export const PSYCH_UI = ['sick', 'good', 'bad', 'shit', 'ready', 'set', 'go', ...Array.from({ length: 10 }, (_, i) => 'num' + i)];

let cached: Promise<SharedAssets> | null = null;

export function loadShared(r: Renderer): Promise<SharedAssets> {
  if (cached) return cached;
  cached = (async () => {
    const remote = new RemoteSource('shared', new URL('shared/', BASE_URL).href);
    const list = await getJson(remote, 'files.json').catch(() => null);
    const src = Array.isArray(list) ? new ListedSource(remote, list as string[]) : remote;
    const scope = new ResourceScope(r, src, 'shared');
    const [notes, ui, iconFallback, phJson] = await Promise.all([
      scope.atlas('images/notes'),
      scope.atlas('images/ui'),
      scope.atlas('images/icons/icon-face'),
      getJson(src, 'characters/placeholder.json'),
    ]);
    const def = parseFnfwebCharacter(phJson, 'placeholder');
    const atlas = await scope.atlas(def.image);
    // skin de flechas por defecto de Psych Engine (la que usan los mods que no traen la suya)
    const fnfNotes = await scope.atlas('images/NOTE_assets').catch(() => undefined);
    const psychUi: Record<string, Atlas> = {};
    await Promise.all(PSYCH_UI.map(async (n) => { try { psychUi[n] = await scope.atlas('images/psych/' + n); } catch { /* opcional */ } }));
    return { scope, notes, ui, iconFallback, fnfNotes, psychUi, placeholder: { def, atlas } };
  })();
  cached.catch(() => (cached = null));
  return cached;
}
