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

Los comandos se aplican al final del frame siguiente (la comunicación es asíncrona). Para efectos visuales no se nota, pero no permite cancelar una nota desde el script, como haría `Function_Stop` en Psych.

Ejemplo completo: `public/mods/noche-espectral/scripts/efectos.js`.
