# Guía del desarrollador: cómo agregar mods

Solo la cuenta dueña del repositorio puede publicar mods. Los visitantes del sitio **no** pueden subir los suyos.
Todo se hace desde GitHub, sin instalar nada: GitHub convierte el mod al formato web, optimiza las texturas,
genera la portada y publica el sitio en unos 2–4 minutos.

> **Panel de desarrollador:** `https://<tu-usuario>.github.io/<repo>/dev.html`. Lista los mods publicados, el espacio usado y
> tiene botones directos a cada acción. No aparece en el menú del sitio.

## Opción 1 — Release (recomendada, hasta 2 GB)

1. En tu repositorio: **Releases → Draft a new release** (o el botón «⬆ Subir mod» del panel).
2. **Choose a tag** → escribe algo nuevo, p. ej. `mod-garcello` → «Create new tag».
3. **Release title** → el nombre que verá la gente, p. ej. `VS Garcello`.
4. (Opcional) En la descripción puedes poner, una por línea:
   ```
   categoria: Mods de la comunidad
   descripcion: Enfréntate a Garcello en un callejón lleno de humo.
   popularidad: 150
   autor: atsuover y Rageminer
   ```
   `popularidad` 150 o más lo pone como **mod destacado** en la portada.
5. Arrastra el archivo **.zip, .rar o .7z** del mod a la zona «Attach binaries».
6. Pulsa **Publish release**.
7. Ve a **Actions**: verás «Agregar mod» en marcha. Al terminar (✅), abre el job y lee el **informe**
   (qué canciones se importaron y qué no es compatible). El sitio ya está actualizado.

## Opción 2 — Enlace de descarga

**Actions → Agregar mod → Run workflow**, pega un enlace de **descarga directa** (que descargue el archivo al abrirlo,
p. ej. de GameBanana o Dropbox con `?dl=1`; los enlaces de Google Drive/MEGA no sirven) y rellena los campos opcionales.

## Opción 3 — Carpeta `incoming/` (archivos pequeños)

Sube el archivo a la carpeta `incoming/` con **Add file → Upload files**. La web de GitHub solo acepta hasta **25 MB**,
así que para la mayoría de mods usa la opción 1.

## Cambiar nombre, descripción, categoría o popularidad

En el panel pulsa **Editar** junto al mod (abre su `manifest.json` en GitHub), cambia los textos y pulsa **Commit changes**.
El sitio se vuelve a publicar solo.

## Quitar un mod

**Actions → Quitar mod → Run workflow** y escribe su **id** (el nombre de su carpeta; aparece en el panel, p. ej. `vs-garcello`).

## ¿Qué formatos acepta?

| Lo que subes | Resultado |
|---|---|
| Carpeta de mod de **Psych Engine** 0.6 / 0.7 / 1.0 (`mods/MiMod/…`) | ✅ Automático |
| Juego completo con **PsychEngine.exe** (`assets/`, `assets/shared/`, `mods/`) | ✅ Automático |
| Mod de **V-Slice** (FNF 0.3+) | ✅ Automático (datos copiados tal cual) |
| Juego antiguo **FNF 0.2.x / Kade** con `.exe` (personajes programados en el ejecutable) | ⚠️ Importa canciones y audio; los personajes hay que adaptarlos a mano (ver `docs/agregar-mod.md`, ejemplo VS Garcello) |
| Codename Engine | ❌ Aún no |

Lo que **siempre** hace el conversor: copia solo lo que usan las canciones, reduce texturas gigantes (≤ 4096 px,
anotando la escala en `manifest.textureScale` para que el motor la compense sin tocar los JSON del mod),
convierte audio a `.ogg` + `.m4a` (incluidas las voces por personaje, `vocals_file`), copia los **scripts Lua**
con las imágenes, sonidos, fuentes y personajes que usan, copia la **skin de notas**, los iconos, las puntuaciones
y la cuenta atrás del propio mod, y genera la portada. Los mods que no traen skin usan la de Psych por defecto.

Los scripts Lua se ejecutan en la web con un intérprete aislado (ver `docs/scripts.md`). Lo que **no** se
reproduce: HScript (`.hx`), vídeos y shaders. El informe los enumera. Si un mod depende mucho de ellos, se puede
añadir un script JavaScript a mano (ejemplo real: `public/mods/aura-funkin/scripts/aura.js`).

## Usarlo en tu PC (opcional)

```bash
pip install pillow          # y tener ffmpeg + 7-Zip instalados
python tools/mod-importer/import_mod.py MiMod.zip --name "Mi Mod" --popularity 100
bun run catalog && bun run dev
```

## Límites

- GitHub Pages admite ~**1 GB** por sitio. Un mod típico ocupa 25–60 MB tras la conversión (el panel muestra el total).
- Archivos individuales de hasta 100 MB (el conversor ya reduce los más grandes).
- Publica solo mods cuyos autores permitan redistribuirlos, y deja sus créditos (`autor:` en la Release).
