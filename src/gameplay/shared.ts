// Recursos comunes a todos los mods (skin de notas, UI, personaje de reemplazo). Se cargan una vez.
import { parseFnfwebCharacter } from '../adapters/fnfweb';
import type { InternalCharacter } from '../core/types';
import { BASE_URL } from '../mod-loader/mod-manager';
import { ResourceScope } from '../mod-loader/resources';
import { getJson, RemoteSource } from '../mod-loader/source';
import type { Atlas } from '../renderer/atlas';
import type { Renderer } from '../renderer/renderer';

export interface SharedAssets {
  scope: ResourceScope;
  notes: Atlas;
  ui: Atlas;
  iconFallback: Atlas;
  placeholder: { def: InternalCharacter; atlas: Atlas };
}

let cached: Promise<SharedAssets> | null = null;

export function loadShared(r: Renderer): Promise<SharedAssets> {
  if (cached) return cached;
  cached = (async () => {
    const src = new RemoteSource('shared', new URL('shared/', BASE_URL).href);
    const scope = new ResourceScope(r, src, 'shared');
    const [notes, ui, iconFallback, phJson] = await Promise.all([
      scope.atlas('images/notes'),
      scope.atlas('images/ui'),
      scope.atlas('images/icons/icon-face'),
      getJson(src, 'characters/placeholder.json'),
    ]);
    const def = parseFnfwebCharacter(phJson, 'placeholder');
    const atlas = await scope.atlas(def.image);
    return { scope, notes, ui, iconFallback, placeholder: { def, atlas } };
  })();
  cached.catch(() => (cached = null));
  return cached;
}
