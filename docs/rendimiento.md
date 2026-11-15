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

Entorno de pruebas: Chrome headless, **sin GPU** (WebGL2 emulado por software con SwiftShader), 2 vCPU, ventana de 1600×900. Se mide con `bun run bench` (`tools/e2e.mjs --bench`), que juega *Nocturnal Protocol* en *hard* con el bot y sus 11 scripts Lua activos (escenario, eventos, tipo de nota personalizado, barras de cine), y muestrea 30 s en calidad automática.

| Métrica | Resultado |
|---|---|
| FPS medio | **59,8** |
| Tiempo de frame medio | 16,7 ms |
| Tiempo de frame p99 | 33,4 ms |
| **CPU del motor por frame** (incluye el intérprete Lua) | **0,31 ms** |
| Draw calls (máx.) | 19 |
| Sprites dibujados (máx.) | 34 |
| Texturas en GPU (máx.) | 331 MB (14 personajes precargados para los cambios de personaje del mod) |
| Carga de la canción | 2,9 s |
| Notas falladas por el bot | 0 (100 %) |

En el recorrido completo (`bun run e2e`) los cinco mods van a 43–60 FPS sin GPU; con una GPU real lo esperable es la frecuencia de la pantalla. Estos resultados son un **límite inferior**.

**Memoria tras cambiar de canción 6 veces** (VS Garcello ↔ FNF Rivals):

| Cambio | 1 | 2 | 3 | 4 | 5 | 6 |
|---|---|---|---|---|---|---|
| Heap JS (MB) | 5,7 | 6,8 | 5,6 | 6,8 | 5,9 | 7,1 |
| Texturas en GPU (MB) | 27,4 | 27,4 | 27,4 | 27,4 | 27,4 | 27,4 |

Las texturas vuelven siempre a 27,4 MB, que son los recursos comunes (skin de flechas de Psych, puntuaciones, UI y personaje de reemplazo, cargados una sola vez). El heap no crece: **no hay fugas** al cambiar de canción ni de mod.

**Precisión del input**: con el teclado simulado (eventos `KeyboardEvent` reales del DOM, enviados en el instante de cada nota), *Headache* de VS Garcello terminó con 180/180 «Sick» (100 %). Esa prueba se ejecuta en calidad baja porque, sin GPU, el renderizado por software retrasa los `setTimeout` que simulan las pulsaciones; con teclas reales el navegador marca el evento con la hora del hardware.

## Pruebas automáticas incluidas

`bun run e2e` (30 comprobaciones, todas superadas en las dos últimas ejecuciones completas):

- el catálogo muestra los 5 mods (sin los de demostración) y el buscador filtra;
- cada mod se juega de principio a fin sin fallos (VS Garcello con teclado simulado, el resto con bot), con capturas al 25, 50, 75 y 92 % de cada canción;
- los scripts Lua de cada mod no llaman a ninguna función de Psych que falte en la web;
- la partida se guarda en el perfil, se desbloquean logros y el podio muestra los perfiles;
- pausar congela el reloj de la canción, reanudar continúa desde el mismo punto y `R` reinicia.

`node tools/e2e-social.mjs` (11 comprobaciones): «me gusta» (marca, suma entre jugadores, se conserva al recargar), buscador de jugadores y que la tarjeta de logros quepa en el marco y se pueda desplazar.

`bun run test`: 33 tests unitarios (adaptadores, juicio de notas, logros e intérprete Lua).

Capturas de las pruebas en `bench-results/`.
