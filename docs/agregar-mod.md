# Cómo añadir un mod

## Opción A: incluirlo en la plataforma (para todos los visitantes)

1. **Comprueba la licencia.** Solo publiques mods cuyo autor permita la redistribución. Muchos mods usan recursos del juego base, que no son redistribuibles.
2. Copia la carpeta del mod en `public/mods/<id>/`, con el `id` en minúsculas y guiones (`mi-mod`).
3. Escribe `public/mods/<id>/manifest.json`:

```json
{
  "id": "mi-mod",
  "name": "Mi Mod",
  "version": "1.0.0",
  "format": "psych",
  "author": "Autor original",
  "license": "Licencia del mod",
  "description": "Una o dos frases.",
  "category": "Comunidad",
  "cover": "cover.webp",
  "popularity": 50,
  "compatibility": "partial",
  "compatNotes": ["Los scripts Lua de la canción 2 no se ejecutan."],
  "songs": [
    { "id": "cancion-1", "name": "Canción 1", "difficulties": ["easy", "normal", "hard"] }
  ]
}
```

| Campo | Obligatorio | Notas |
|---|---|---|
| `id`, `name`, `version`, `format`, `songs` | sí | `format`: `psych`, `vslice` o `fnfweb` |
| `songs[].id` | sí | nombre de la carpeta de la canción en `data/` o `data/songs/` |
| `songs[].difficulties` | sí | en Psych, `normal` corresponde a `<cancion>.json` |
| `cover` | no | imagen 16:9 (recomendado: 640×360 en WebP) |
| `compatibility` | no | `full`, `partial` o `songs-only` (se muestra en el catálogo) |
| `scripts`, `permissions`, `scriptImages` | no | ver [scripts.md](scripts.md) |

4. Ejecuta:

```bash
bun run catalog
```

Esto recorre `public/mods/*`, completa en cada manifiesto `files` (la lista de archivos, usada por «Guardar sin conexión») y `sizeBytes`, y regenera `public/mods/catalog.json`.

5. `bun run dev` para probarlo, o haz push para que GitHub Pages lo publique.

Solo `catalog.json` (unos cientos de bytes por mod) se descarga al abrir la página. El resto de cada mod se descarga bajo demanda, al elegirlo.

## Opción B: importarlo en el navegador (solo para ti)

Pulsa **Importar mod** y elige un `.zip`. Funkade:

1. Lee el ZIP con un lector propio (`DecompressionStream` nativo, sin librerías).
2. Quita la carpeta raíz común (`MiMod/…` o `mods/MiMod/…`).
3. Si no hay `manifest.json`, detecta el formato: `data/songs/*/*-metadata.json` indica V-Slice; `data/<cancion>/<cancion>.json` indica Psych. Las dificultades salen de los nombres de archivo.
4. Guarda los archivos en **IndexedDB**. Nunca salen de tu navegador.

El mod aparece en el catálogo con la categoría «Importados» y un botón para borrarlo.

## Consejos para que un mod funcione mejor

- Si el mod usa personajes del juego base (`bf`, `gf`, `dad`), incluye los tuyos propios con el mismo `id` o cambia los nombres en el chart. Si no, verás el personaje de reemplazo.
- Exporta los audios en `.ogg` **y** `.m4a` para máxima compatibilidad con Safari.
- Mantén las texturas en 4096 px o menos por lado para GPUs modestas (Funkade avisa a partir de 8192).
- Las mecánicas que en Psych están en Lua pueden reescribirse como script JavaScript con la API de [scripts.md](scripts.md).
