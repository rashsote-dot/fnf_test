# Rendimiento: técnicas y resultados medidos

## Técnicas aplicadas

**Ritmo (prioridad absoluta)**
- El reloj maestro es el `AudioContext`. La posición de la canción se calcula con `getOutputTimestamp()`, que ya descuenta la latencia de salida, suavizando su jitter. Nunca se acumulan deltas de frame, así que no hay deriva.
- Instrumental y voces arrancan con `start(when)` en el **mismo instante del reloj de audio**. La cuenta atrás también se programa en ese reloj, de modo que suena a tiempo aunque haya un tirón.
- **Cada pulsación se juzga dentro del propio evento `keydown`**, con `event.timeStamp` convertido a tiempo de canción. La precisión es la misma a 30 que a 240 FPS. Se ignoran las repeticiones automáticas del teclado y se usa `event.code`, que no depende de la distribución.
- Desfase de audio configurable y diagnóstico de la latencia real (`baseLatency` y `outputLatency`).

**Render**
- Batcher WebGL2: un único buffer de vértices reutilizado (x, y, u, v + color empaquetado en 32 bits), índices estáticos y un cambio de draw call solo al cambiar de textura. Una escena completa usa ≤ 14 draw calls.
- Alfa premultiplicado de extremo a extremo (sin bordes oscuros y con mezcla más barata).
- Descarte de sprites fuera de pantalla antes de enviarlos a la GPU.
- Cero asignaciones de memoria por frame en el bucle caliente (notas en arrays planos, sprites reutilizados, ring buffer para métricas).
- El bucle `requestAnimationFrame` solo corre durante la partida: en el catálogo y en pausa no se dibuja nada.
- Límite de FPS opcional. Sin límite, se sigue la frecuencia de la pantalla (120/144/240 Hz si el monitor la tiene).
- **Calidad adaptativa**: si los frames superan el presupuesto durante 2,5 s, la resolución interna baja (100 → 75 → 50 %) y vuelve a subir cuando sobra margen. En calidad baja también se ocultan los props marcados como decorativos.

**Carga y memoria**
- Al abrir la web solo se descarga `catalog.json`. Cada mod se descarga al elegirlo.
- Chart en un Web Worker. Imágenes con `createImageBitmap` y audio con `decodeAudioData`, ambos fuera del hilo principal. Todo en paralelo.
- Todo se decodifica y se sube a la GPU durante la pantalla de carga: **durante la partida no se carga nada**.
- Tras subir una textura a la GPU se libera la copia en CPU (`ImageBitmap.close()`).
- **Alcance de recursos por canción**: al salir se borran explícitamente las texturas de GPU, los nodos de audio, el sandbox y los listeners.
- Service Worker con caché de recursos: la segunda visita carga imágenes y audio desde disco. Botón para guardar un mod completo y jugarlo sin conexión.

## Resultados medidos

Entorno de pruebas: Chrome 153 headless, **sin GPU** (WebGL2 emulado por software con SwiftShader), 2 vCPU Intel Xeon a 2,1 GHz, ventana de 1600×900 (canvas de 1030×579). Se mide con `bun run bench` (`tools/e2e.mjs --bench`), que juega la canción de estrés `noche-espectral/tormenta` en *hard* con el bot y el script de partículas activo, y muestrea 30 s.

| Métrica | Calidad alta (100 %) | Calidad baja (50 %) |
|---|---|---|
| FPS medio | 29,5 | **60,0** (límite de vsync) |
| Tiempo de frame medio | 34,0 ms | 16,7 ms |
| Tiempo de frame p99 | 50,1 ms | 16,8 ms |
| **CPU del motor por frame** | **0,25 ms** | **0,13 ms** |
| Draw calls (máx.) | 14 | 14 |
| Sprites dibujados (máx.) | 75 | 70 |
| Texturas en GPU | 57 MB | 57 MB |
| Carga de la canción (chart + 3 personajes + escenario + audio + script) | 878 ms | 818 ms |
| Notas falladas por el bot | 0 (100 %) | 0 (100 %) |

**Cómo leer estos números**: el motor usa 0,13–0,25 ms de CPU por frame, menos del 2 % del presupuesto de un frame a 60 FPS. En este entorno el límite es la **rasterización por software** de SwiftShader, que escala con los píxeles: al bajar la resolución se alcanzan 60 FPS estables. Con una GPU real (incluso integrada), rasterizar 14 draw calls a 1080p es trivial, así que lo esperable es ir a la frecuencia de la pantalla. Estos resultados son un **límite inferior**.

**Memoria tras cambiar de canción 6 veces** (Demo Base ↔ Circuito Neón):

| Cambio | 1 | 2 | 3 | 4 | 5 | 6 |
|---|---|---|---|---|---|---|
| Heap JS (MB) | 5,0 | 4,8 | 4,0 | 4,8 | 4,0 | 4,8 |
| Texturas en GPU (MB) | 18,8 | 18,8 | 18,8 | 18,8 | 18,8 | 18,8 |

Las texturas vuelven siempre a 18,8 MB, que son los recursos comunes (skin de notas, UI y personaje de reemplazo, cargados una sola vez). El heap no crece: **no hay fugas** al cambiar de canción ni de mod.

**Precisión del input**: con el teclado simulado (eventos `KeyboardEvent` reales del DOM, enviados en el instante de cada nota), *Primer Paso* en *hard* terminó con 63/63 «¡Genial!» (100 %). Un detalle de metodología: a resolución completa y sin GPU, el renderizado por software bloquea el hilo principal unos ~36 ms, y los `setTimeout` que simulan las pulsaciones llegan tarde. El motor las juzga correctamente como tardías (≈ 88 % de precisión). Por eso esa prueba se ejecuta en calidad baja. Con teclas reales el navegador marca el evento con la hora del hardware, y este efecto no se da de la misma forma.

## Pruebas automáticas incluidas

`bun run e2e` (17 comprobaciones, todas superadas en la última ejecución):

- el catálogo muestra los mods y el buscador filtra;
- cada formato (nativo con teclado, Psych con bot y V-Slice con bot) se juega de principio a fin sin fallos;
- un ZIP de Psych **sin manifiesto** se importa, se detecta el formato y se juega desde IndexedDB;
- pausar congela el reloj de la canción (3029 → 3029 ms), reanudar continúa desde el mismo punto y `R` reinicia.

`bun run test`: 19 tests unitarios de adaptadores, cambios de BPM, parser Sparrow, detección de mods y juicio de notas.

Capturas de las pruebas en `bench-results/`.
