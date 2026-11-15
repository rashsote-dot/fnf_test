# Scripts de mods (sandbox)

## Modelo de seguridad

Los scripts **nunca se ejecutan en el contexto de la página**:

1. `public/sandbox.html` se carga en un `<iframe sandbox="allow-scripts">`, lo que le da un **origen opaco**: no puede leer cookies, `localStorage` ni el IndexedDB de la plataforma, ni tocar el DOM del juego.
2. Su CSP es `default-src 'none'`: **sin red** (`fetch`, `XMLHttpRequest` y `WebSocket` bloqueados). Además, esas APIs se eliminan dentro del worker.
3. El código del mod corre en un **Worker** dentro del iframe. Si entra en un bucle infinito, el juego no se congela: la plataforma detecta que no responde en 2 s y destruye el sandbox.
4. El script solo puede **pedir acciones** mediante comandos. La plataforma valida cada comando contra los permisos del manifiesto, limita las cantidades (máx. 500 comandos por lote y 300 sprites) y solo acepta propiedades de una lista blanca.
5. Los mensajes solo se aceptan si vienen del iframe propio (`event.source`).

## Declaración en el manifiesto

```json
"scripts": ["scripts/efectos.js"],
"permissions": ["camera", "sprites", "characters"],
"scriptImages": ["images/fx/bat", "images/fx/spark"]
```

| Permiso | Comandos que habilita |
|---|---|
| `camera` | `cameraZoom`, `setCameraZoom`, `shake`, `flash` |
| `sprites` | `addSprite`, `removeSprite`, `setProp`, `tween` |
| `characters` | `playAnim` |
| `gameplay` | `addHealth`, `setScrollSpeed` |

`scriptImages` lista los atlas (ruta sin extensión) que los scripts pueden usar. Se precargan con la canción para que no haya tirones durante la partida.

## Funciones que puede definir el script

```js
function onCreate() {}
function onBeatHit(beat) {}
function onStepHit(step) {}
function onNoteHit(lane, kind, rating) {}   // rating: 'sick' | 'good' | 'bad' | 'shit'
function onOpponentNoteHit(lane, kind) {}
function onNoteMiss(lane) {}
function onEvent(name, values) {}            // eventos del chart ya normalizados
function onUpdate(songTimeMs) {}             // cada frame: úsalo con moderación
function onSongEnd() {}
```

## Eventos personalizados (Lua) → scripts

Los eventos del chart que Funkade no conoce (por ejemplo los `custom_events/*.lua` de Psych) no se descartan: llegan a `onEvent(nombre, valor1, valor2)`, igual que en Psych. Así, portar un evento Lua consiste en reescribir su `onEvent` en JavaScript. Ejemplo real: `public/mods/aura-funkin/scripts/aura.js`, que reimplementa `lyrics`, `bop`, `backgroundfade`, `Image Fade In/Out`, `Camera Set Target` y `CamPosV2`.

Fuentes propias: decláralas en el manifiesto (`"fonts": ["fonts/vcr.ttf"]`) y úsalas con `font: 'vcr'`.

## API `game`

Lectura: `game.song`, `game.diff`, `game.songTime`, `game.beat`, `game.step`, `game.health` (0–2), `game.score`, `game.misses`, `game.combo`.

| Método | Descripción |
|---|---|
| `log(...args)` | escribe en la consola del navegador |
| `cameraZoom(add, hudAdd)` | impulso de zoom |
| `setCameraZoom(zoom, ms)` | cambia el zoom base |
| `shake(intensidad, ms, 'game'\|'hud')` | temblor |
| `flash(color, ms, 'game'\|'hud')` | destello |
| `addSprite(nombre, imagen, x, y, opciones)` | opciones: `scale`, `scaleX`, `scaleY`, `scroll`, `alpha`, `z`, `hud`, `color`, `anim` (prefijo), `fps`, `loop` |
| `removeSprite(nombre)` | elimina un sprite del script |
| `setProp(objeto, prop, valor)` | objetos: `bf`, `dad`, `gf`, `camGame`, `camHUD`, sprites del script y props del escenario por nombre. Props: `x`, `y`, `alpha`, `angle`, `scaleX`, `scaleY`, `visible`, `flipX`, `zoom`, `scrollX`, `scrollY`, `z`, `color` |
| `tween(objeto, prop, destino, ms, curva)` | curvas: `linear`, `quadIn/Out/InOut`, `cubeIn/Out/InOut`, `sineIn/Out/InOut`, `expoOut`, `elasticOut`, `backOut` |
| `playAnim(personaje, anim, forzar)` | animación especial |
| `addHealth(v)` | requiere `gameplay` |
| `setScrollSpeed(mult, ms)` | requiere `gameplay` |
| `focus('bf'\|'dad'\|'gf'\|'middle'\|'')` | la cámara sigue a un personaje, al punto medio, o vuelve al modo automático (`''`) |
| `cameraPos(x, y)` / `cameraPos(null)` | cámara fija en un punto del mundo / liberarla |
| `addText(nombre, texto, x, y, opciones)` | texto en pantalla. Opciones: `size`, `color`, `align` (`left`/`center`/`right`), `font` (de `manifest.fonts`), `bold`, `border`, `borderColor`, `hud`, `z`, `alpha` |
| `setText(nombre, texto, color?)` / `removeText(nombre)` | cambia o elimina un texto |

Los comandos se aplican al final del frame siguiente (la comunicación es asíncrona). Para efectos visuales no se nota, pero no permite cancelar una nota desde el script, como haría `Function_Stop` en Psych.

Ejemplo completo: `public/mods/aura-funkin/scripts/aura.js`.

## Scripts Lua de Psych Engine

Los mods de Psych traen sus efectos, HUD y mecánicas en scripts `.lua`. Funkade los ejecuta **tal cual**, sin
traducirlos, con un intérprete de Lua 5.1 propio (`src/lua/`), así el mod se ve y se comporta como el original.

**Aislamiento.** El intérprete es un programa que *lee* el código Lua; el código del mod nunca se convierte en
JavaScript ni se evalúa con `eval`/`Function`. Un script solo puede llamar a las funciones que le damos
(la API de Psych de `src/lua/psych.ts`): no hay `os.execute`, `io`, `require`, `load` de archivos, red, DOM,
cookies ni almacenamiento. Cada llamada tiene un presupuesto de instrucciones (3 millones): un bucle infinito
se corta con un error en ese script y la partida sigue. Los errores se muestran en el diagnóstico (F3) y se
cierran solo para el script que falla, igual que en Psych.

**Qué se carga** (mismo orden que Psych): `scripts/*.lua`, `stages/<escenario>.lua`,
`custom_events/<evento>.lua` de los eventos que usa el chart, `custom_notetypes/<tipo>.lua`,
`characters/<personaje>.lua` y `data/<canción>/*.lua`. El importador copia esos archivos y las imágenes,
sonidos, fuentes y personajes que nombran (también rutas construidas como `'pop-ups/'..nombre`).

**API soportada** (resumen): sprites y textos (`makeLuaSprite`, `makeAnimatedLuaSprite`, `makeGraphic`,
`addAnimationByPrefix/Indices`, `playAnim`, `scaleObject`, `setScrollFactor`, `setObjectCamera`,
`setObjectOrder`, `makeLuaText`…), propiedades (`getProperty`/`setProperty` con rutas como
`dadGroup.x`, `camHUD.alpha`, `iconP1.y`, `strumLineNotes.members[2].x`), grupos (`getPropertyFromGroup`
sobre `notes`, `unspawnNotes`, `playerStrums`…), tweens y temporizadores (`doTweenX/Y/Alpha/Angle/Zoom/Color`,
`noteTweenX…`, `runTimer`, `cancelTween`), cámara (`cameraFlash`, `cameraShake`, `cameraSetTarget`,
`triggerEvent`), sonido (`playSound`), y las llamadas de juego (`onCreate`, `onCreatePost`, `onUpdate`,
`onStepHit`, `onBeatHit`, `onSectionHit`, `onEvent`, `goodNoteHit`, `opponentNoteHit`, `noteMiss`,
`onSpawnNote`, `onCountdownTick`, `onSongStart`, `onEndSong`, `onGameOver`, `onPause`, `onTweenCompleted`,
`onTimerCompleted`…). Las funciones sin equivalente en la web (shaders, vídeos, HScript) no hacen nada.
