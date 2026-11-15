# Funkade

Plataforma web para jugar **Friday Night Funkin'** y mods compatibles directamente en el navegador, sin instalar nada.

Funkade es un motor de juego de ritmo escrito desde cero en **TypeScript + WebGL2 + Web Audio**. No emula los ejecutables originales: **interpreta los formatos de datos** de los motores de mods más usados (Psych Engine, Kade/legacy y V-Slice) mediante un sistema de adaptadores. Así, añadir un mod nuevo consiste en copiar su carpeta y escribir un manifiesto, sin tocar el motor.

- 3 mods de demostración jugables, con contenido 100 % original (personajes, escenarios, música y charts generados por código).
- **VS Garcello (Smoke 'Em Out Struggle)** adaptado desde su versión de PC: 4 canciones, 4 versiones de Garcello y 3 variantes del callejón.
- **Aura Funkin' at South America**: mod de Psych Engine 1.0 con sus eventos Lua (letras, cámara, fundidos, contador de AURA) reescritos en JavaScript.
- **Perfiles de jugador** estilo Steam: foto, nombre, descripción, color, nivel y XP, actividad reciente, mejores puntuaciones, progreso por mod, 18 logros (incluido completar cada mod y «Leyenda» por completarlo todo) y **podio** con medallas.
- Catálogo con buscador, filtros, portadas, tamaño e información de compatibilidad.
- **Conversor automático de mods** en GitHub Actions (Psych 0.6–1.0, compilaciones con .exe, V-Slice; .zip/.rar/.7z) y **panel de desarrollador**.
- Scripts de mods aislados en un sandbox sin acceso a la red ni a tus datos.
- Panel de diagnóstico (F3): FPS, tiempos de frame, draw calls, memoria de texturas, latencia de audio y tiempos de carga.

> Friday Night Funkin' es obra de The Funkin' Crew. Este proyecto no está afiliado a ellos y no incluye ninguno de sus recursos.

---

## 1. Ejecutarlo en tu computadora

Necesitas **[Bun](https://bun.sh)**, que hace de compilador y servidor (un solo programa, sin más dependencias).

```bash
# Windows (PowerShell)
powershell -c "irm bun.sh/install.ps1 | iex"
# macOS / Linux
curl -fsSL https://bun.sh/install | bash
```

Después, en la carpeta del proyecto:

```bash
bun install      # instala TypeScript (solo para comprobar tipos)
bun run dev      # compila a dist/ y abre un servidor en http://localhost:8080
```

Abre **http://localhost:8080** en Chrome, Edge, Firefox o Safari.

> El juego **no funciona abriendo `index.html` con doble clic** (`file://`): el navegador bloquea la carga de archivos locales por seguridad. Usa siempre un servidor, aunque sea `bun run serve` o `python -m http.server -d dist`.

Otros comandos:

| Comando | Qué hace |
|---|---|
| `bun run build` | Compila a `dist/` (sitio estático listo para publicar) |
| `bun run serve` | Sirve `dist/` sin recompilar |
| `bun run typecheck` | Comprueba los tipos de TypeScript |
| `bun run test` | Tests unitarios (adaptadores, juicio de notas, detección de mods) |
| `bun run catalog` | Regenera `public/mods/catalog.json` tras añadir o modificar mods |
| `bun run e2e` | Pruebas en Chrome real con Playwright (opcional) |
| `bun run bench` | Benchmark de rendimiento y memoria (opcional) |
| `bun run gen:shared` | Regenera los recursos comunes generados de `public/shared` (requiere `sharp`) |
| `python3 tools/repack_atlas.py` | Reempaqueta atlas enormes (8192 px) para la web: quita frames sin usar y duplicados y cabe en 4096 px |

## 2. Publicarlo gratis en Internet (GitHub Pages)

El repositorio incluye `.github/workflows/deploy.yml`, que compila y publica la web automáticamente en cada push.

1. Crea un repositorio en GitHub (por ejemplo `funkade`). Puede ser público.
2. Sube el proyecto:
   ```bash
   git init
   git add .
   git commit -m "Funkade"
   git branch -M main
   git remote add origin https://github.com/TU_USUARIO/funkade.git
   git push -u origin main
   ```
   Si no usas git, también puedes arrastrar los archivos en GitHub con **Add file → Upload files**. Asegúrate de subir también la carpeta oculta `.github`.
3. En GitHub ve a **Settings → Pages** y en **Source** elige **GitHub Actions**.
4. Abre la pestaña **Actions**. Cuando termine el workflow, la web estará en `https://TU_USUARIO.github.io/funkade/`.

Alternativas igual de gratuitas: **Cloudflare Pages** o **Netlify**. Usa el comando de build `bun run build` y la carpeta de salida `dist`. No hace falta backend ni cabeceras especiales: el proyecto evita `SharedArrayBuffer` a propósito para funcionar en cualquier hosting estático.

## 3. Añadir un mod nuevo

> **La forma rápida (sin instalar nada):** crea una **Release** en GitHub, ponle de título el nombre del mod y adjunta el `.zip`, `.rar` o `.7z`. GitHub lo convierte y publica solo en 2–4 minutos. También puedes pegar un enlace de descarga en **Actions → Agregar mod**. Guía paso a paso: [docs/desarrollador.md](docs/desarrollador.md). Panel con todos los mods y el espacio usado: `/dev.html`.
>
> Los visitantes **no** pueden subir mods: solo la cuenta dueña del repositorio.

### Manualmente

Resumen (detalles en [docs/agregar-mod.md](docs/agregar-mod.md)):

1. Copia la carpeta del mod en `public/mods/<id-del-mod>/`.
2. Crea `manifest.json`:
   ```json
   {
     "id": "mi-mod",
     "name": "Mi Mod",
     "version": "1.0.0",
     "format": "psych",
     "description": "Descripción breve",
     "category": "Comunidad",
     "cover": "cover.webp",
     "license": "La licencia del mod",
     "songs": [{ "id": "mi-cancion", "name": "Mi Canción", "difficulties": ["easy", "normal", "hard"] }]
   }
   ```
   `format` puede ser `psych` (también sirve para Kade y legacy), `vslice` o `fnfweb`.
3. Ejecuta `bun run catalog`, que añade el mod al catálogo y calcula su tamaño y su lista de archivos.

Sin tocar el código del motor.

Los usuarios también pueden importar un `.zip` desde el botón **Importar mod**. Si el ZIP no trae `manifest.json`, Funkade detecta el formato por la estructura de carpetas.

## 4. Arquitectura

```
src/
  core/         reloj, bucle principal, ajustes, diagnóstico, tweens, tipos internos
  renderer/     batcher WebGL2 + respaldo Canvas2D, atlas Sparrow, sprites, cámaras
  audio/        Web Audio: decodificación, reproducción sincronizada, conductor
  input/        teclado con marcas de tiempo reales
  gameplay/     PlayState, personajes, juicio de notas, recursos comunes
  mod-loader/   catálogo, manifiestos, orígenes de archivos, alcance de recursos
  adapters/     psych.ts, vslice.ts, fnfweb.ts → formato interno
  scripting/    sandbox de scripts (iframe con origen opaco + Worker)
  storage/      IndexedDB, lector ZIP, Cache Storage / Service Worker
  workers/      conversión de charts fuera del hilo principal
public/
  shared/       skin de notas, UI y personaje de reemplazo (comunes a todos los mods)
  mods/         un directorio por mod + catalog.json
  sandbox.html  entorno aislado para scripts
```

Flujo de una canción: `catalog.json` → `manifest.json` → el **adaptador** del formato indica qué archivos leer → el chart se convierte en un **Worker** → personajes, escenario, audio y scripts se cargan **en paralelo** → todo se registra en un **alcance de recursos** que se libera entero al salir.

Más detalle técnico: [docs/formatos-y-adaptadores.md](docs/formatos-y-adaptadores.md), [docs/scripts.md](docs/scripts.md) y [docs/rendimiento.md](docs/rendimiento.md).

### Decisiones tecnológicas

| Elección | Motivo |
|---|---|
| **TypeScript sin framework** | Tipado útil para los adaptadores y nada de sobrecarga en el bucle de juego. Todo el JavaScript pesa ~95 KB minificado. |
| **WebGL2 con batcher propio** | En FNF el coste está en las draw calls, no en los shaders. Agrupando por textura, una escena completa se dibuja en ~12 draw calls. |
| **Canvas2D de respaldo** | Para navegadores o equipos sin WebGL2. |
| **WebGPU: no por ahora** | No aporta una mejora real para este tipo de escena y su soporte todavía es desigual. La interfaz `Renderer` permite añadirlo después. |
| **Web Audio como reloj maestro** | La posición de la canción se deriva de `AudioContext` mediante `getOutputTimestamp()`, nunca acumulando tiempos de frame, así que no hay deriva entre música y notas. |
| **Input juzgado en el propio evento** | Cada pulsación se evalúa con su `event.timeStamp`, convertido a tiempo de audio. La precisión no depende de los FPS. |
| **Web Workers** | Parseo y conversión de charts. La decodificación de imágenes (`createImageBitmap`) y de audio ya la hace el navegador fuera del hilo principal. |
| **WASM: no** | El trabajo de CPU por frame es de ~0,25 ms; WASM no aportaría nada medible. |
| **Bun** | Compila en menos de 0,5 s y sirve en desarrollo con un único binario. |

## 5. Limitaciones conocidas


Funkade **no promete compatibilidad universal**:

- **Mods con código fuente modificado** (forks de Psych/Kade compilados como `.exe`): no se pueden ejecutar. Solo se aprovechan sus datos (charts, sprites, personajes, escenarios). Las mecánicas programadas a medida hay que portarlas a mano.
- **Scripts Lua (Psych) y HScript (Psych/Codename/V-Slice)**: no se ejecutan en esta versión. El mod se marca como «Parcial». Los scripts compatibles se escriben en JavaScript con la API del sandbox ([docs/scripts.md](docs/scripts.md)). El siguiente paso previsto es un intérprete Lua (p. ej. Fengari) dentro del mismo sandbox.
- **Codename Engine**: sin adaptador todavía (sus charts por `strumLines` y personajes XML están documentados como trabajo futuro).
- **Texture Atlas de Adobe Animate** (`Animation.json` + `spritemap`), que usan algunos personajes de V-Slice: no soportado. Se usa un personaje de reemplazo y se avisa.
- **Skins de notas personalizadas, shaders, vídeos (`.mp4` de cinemáticas), menús de historia y diálogos**: no soportados. Todos los mods usan la skin común de Funkade.
- **Recursos del juego base**: los mods que dependen de personajes o escenarios del FNF original (bf, gf, dad, stage) no los traen consigo y Funkade no puede incluirlos. Se sustituyen por un personaje gris de reemplazo y un escenario por defecto.
- **Callbacks síncronos de scripts** (p. ej. `return Function_Stop` para cancelar una nota): la frontera del sandbox es asíncrona y los comandos se aplican con un frame de retraso.
- **Audio OGG en Safari antiguo**: los mods de demo incluyen también `.m4a`. Los mods importados que solo traigan `.ogg` pueden no sonar en algunas versiones de Safari.
- Las demos son sencillas visualmente: el objetivo es probar el motor, no igualar el arte del juego original.

## 6. Perfiles, logros y podio

- Todo se guarda en el navegador (IndexedDB). No hay servidor ni cuentas.
- Puedes tener **varios perfiles en el mismo equipo** (Perfil → selector → «+ Nuevo perfil…»). El **podio** compara los perfiles de ese navegador.
- La puntuación del podio suma tu **mejor marca en cada canción y dificultad**, así que repetir una canción no infla el ranking.
- Las partidas con **bot no cuentan**. Un *game over* cuenta como partida, pero no como canción completada.
- **Exportar / Importar perfil** guarda tu progreso en un `.json` para llevarlo a otro dispositivo.
- Un ranking **mundial** (entre jugadores de distintos dispositivos) necesitaría un servidor. Se puede añadir gratis con Supabase o Firebase, pero no está incluido.

## 7. Pruebas de rendimiento

Resultados reales en [docs/rendimiento.md](docs/rendimiento.md). En resumen: CPU por frame ≈ **0,13–0,25 ms**, **≤ 14 draw calls**, memoria JS estable (~5 MB) y texturas que vuelven a la línea base tras cada cambio de canción (sin fugas). Los FPS del entorno de pruebas están limitados por WebGL emulado por software. En un equipo con GPU el motor va holgado a la frecuencia de la pantalla.

## Licencia

Código: MIT. Contenido de los mods de demostración (arte, música y charts generados): CC0. Los mods que añadas mantienen su propia licencia.
