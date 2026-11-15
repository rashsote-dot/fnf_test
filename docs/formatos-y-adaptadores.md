# Formatos compatibles y cómo funcionan los adaptadores

## Idea general

El motor solo entiende un **formato interno normalizado** (`src/core/types.ts`):

| Estructura | Contenido |
|---|---|
| `InternalChart` | notas `{t (ms), lane 0-3, len (ms), player, kind}`, eventos `{t, name, v}`, cambios de BPM, velocidad, personajes y escenario pedidos |
| `InternalCharacter` | atlas, escala, flip, posición, animaciones `{name, prefix, fps, loop, indices, offset}`, color de vida, icono, anclaje (`topleft` o `feet`) |
| `InternalStage` | zoom, props (imagen o rectángulo de color, posición, escala, scroll/parallax, z, animación) y puntos de cada personaje con desplazamiento de cámara |

Un **adaptador** (`src/adapters/*.ts`) implementa la interfaz `FormatAdapter`:

```ts
interface FormatAdapter {
  chartFiles(song, diff): FileReq[];          // qué archivos leer para un chart
  parseChart(files, song, diff): InternalChart; // se ejecuta en un Web Worker
  audio(song, chart): { inst, voices[] };     // rutas de audio (sin extensión)
  characterFile(id); parseCharacter(json, id, isPlayer);
  stageFile(id); parseStage(json, id);
  defaultStage: string;
}
```

Para añadir un motor nuevo: crea `src/adapters/<motor>.ts`, regístralo en `src/adapters/index.ts` y usa ese nombre en el campo `format` del manifiesto. El resto del motor no cambia.

## Matriz de compatibilidad

| Recurso | Psych 0.6/0.7/1.0, Kade, base legacy | V-Slice (FNF 0.3+) | Funkade nativo |
|---|---|---|---|
| Charts | ✅ `song.notes[].sectionNotes`, `mustHitSection`, `sectionBeats`/`lengthInSteps`, `changeBPM`, formato `psych_v1` | ✅ `-metadata.json` + `-chart.json`, `timeChanges`, varias dificultades por archivo | ✅ |
| Notas especiales | ✅ `Hurt Note`, `Alt Animation`, `No Animation`, `GF Sing` (las desconocidas se tratan como normales) | ✅ `k: "hurt"` y similares | ✅ |
| Sprites | ✅ Sparrow XML (incluye frames recortados y rotados) | ✅ Sparrow · ❌ Animate Texture Atlas | ✅ |
| Personajes | ✅ JSON de Psych (offsets, flip, `sing_duration`, `danceLeft/Right`, colores, icono) | ✅ JSON V-Slice (`renderType: sparrow`) | ✅ |
| Escenarios | ✅ JSON (posiciones, zoom, cámaras) + `objects` de Psych 1.0 · ⚠️ objetos creados en Lua: no | ✅ `props` declarativos | ✅ |
| Eventos | ✅ ver tabla siguiente | ✅ ver tabla siguiente | ✅ todos los internos |
| Audio | `songs/<s>/Inst`, `Voices` o `Voices-Player`/`Voices-Opponent` | `Inst`, `Voices-<personaje>` | `Inst`, `Voices-player`, `Voices-opponent` |
| Scripts | ❌ Lua · ❌ HScript | ❌ HScript | ✅ JavaScript en sandbox (cualquier formato puede declararlos) |
| Iconos | `images/icons/icon-<id>.png` (2 frames) | igual | igual |

Codename Engine (charts por `strumLines`, personajes y escenarios XML) **todavía no tiene adaptador**. La estructura está pensada para añadirlo como `codename.ts`.

## Eventos

| Interno | Psych | V-Slice | Efecto |
|---|---|---|---|
| `camFocus` | automático por `mustHitSection` / `gfSection` | `FocusCamera` | la cámara sigue a bf, dad o gf |
| `camPos` | `Camera Follow Pos` | — | cámara fija en un punto (vacío = liberar) |
| `camZoom` | `Add Camera Zoom` | — | impulso de zoom (juego y HUD) |
| `camZoomSet` | `Set Cam Zoom` | `ZoomCamera` | cambia el zoom base, con duración y curva |
| `camBop` | — | `SetCameraBop` | frecuencia e intensidad del "latido" de cámara |
| `playAnim` | `Play Animation` | `PlayAnimation` | animación especial de un personaje |
| `hey` | `Hey!` | — | animación `hey`/`cheer` |
| `changeChar` | `Change Character` | — | cambia de personaje (se precarga al cargar la canción) |
| `shake` | `Screen Shake` | — | temblor de cámara |
| `scrollSpeed` | `Change Scroll Speed` | `ScrollSpeed` | velocidad de scroll animada |
| `gfSpeed` | `Set GF Speed` | — | ritmo de baile de gf |
| `flash` | — | — | destello (formato nativo o scripts) |

Los eventos no reconocidos se ignoran y se informa de ellos en los avisos de compatibilidad (panel F3 y aviso al cargar).

## Rutas que espera cada adaptador

**Psych** (las rutas son las de la carpeta `mods/<mod>/` de Psych Engine):

```
data/<cancion>/<cancion>.json          (normal)
data/<cancion>/<cancion>-easy.json     (otras dificultades)
data/<cancion>/events.json             (opcional)
songs/<cancion>/Inst.ogg  Voices.ogg
characters/<id>.json
images/characters/<atlas>.png + .xml
stages/<id>.json
images/<recursos del escenario>
images/icons/icon-<id>.png
```

**V-Slice**:

```
data/songs/<cancion>/<cancion>-metadata.json
data/songs/<cancion>/<cancion>-chart.json
songs/<cancion>/Inst.ogg  Voices-<personaje>.ogg
data/characters/<id>.json
data/stages/<id>.json
images/...
```

**Funkade nativo**: el formato `fnfweb` sigue soportado (ver `src/adapters/fnfweb.ts`); `node tools/gen-mods.mjs demo` genera un mod de ejemplo en este formato.

## Qué ocurre cuando falta algo

| Falta | Comportamiento |
|---|---|
| Personaje | personaje gris de reemplazo + aviso |
| Escenario | escenario por defecto + aviso |
| Imagen de un prop | se omite el prop + aviso |
| Voces | la canción suena solo con el instrumental |
| Instrumental o chart | error claro en pantalla; no se inicia la partida |
| Formato de audio no decodificable | se prueba la siguiente extensión (`.ogg` → `.m4a` → `.mp3`) |

## Avisos de compatibilidad

Al importar un mod, si se detectan `.lua` o `.hx`, el mod se marca como **Parcial** y se indica en la tarjeta y en la pantalla del mod. Así el jugador sabe de antemano que alguna mecánica programada puede faltar.
