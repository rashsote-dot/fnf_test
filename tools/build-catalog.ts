// Recorre public/mods/*/manifest.json, calcula tamaños y lista de archivos, y genera public/mods/catalog.json.
// Para registrar un mod nuevo basta con copiar su carpeta y ejecutar: bun run catalog
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const MODS = 'public/mods';
function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

const mods = [];
for (const d of readdirSync(MODS)) {
  const dir = join(MODS, d);
  if (!statSync(dir).isDirectory()) continue;
  let manifest: any;
  try { manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8')); }
  catch { console.warn(`Saltando ${d}: sin manifest.json válido`); continue; }
  const files = walk(dir).map((f) => relative(dir, f).split('\\').join('/')).filter((f) => f !== 'manifest.json').sort();
  const size = walk(dir).reduce((s, f) => s + statSync(f).size, 0);
  manifest.files = files;
  manifest.sizeBytes = size;
  writeFileSync(join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  mods.push({
    id: manifest.id, name: manifest.name, author: manifest.author ?? '', description: manifest.description ?? '', category: manifest.category ?? 'Mods',
    cover: manifest.cover ?? '', popularity: manifest.popularity ?? 0, sizeBytes: size, songCount: manifest.songs.length,
    format: manifest.format, compatibility: manifest.compatibility ?? 'partial', path: `mods/${d}/`,
  });
  console.log(`  ${manifest.id.padEnd(20)} ${manifest.format.padEnd(7)} ${(size / 1048576).toFixed(2)} MB  ${files.length} archivos`);
}
writeFileSync(join(MODS, 'catalog.json'), JSON.stringify({ version: 1, generated: new Date().toISOString(), mods }, null, 2));
console.log(`catalog.json: ${mods.length} mods`);

// lista de archivos comunes (evita pedir al servidor archivos opcionales que no existen)
const SHARED = 'public/shared';
writeFileSync(join(SHARED, 'files.json'), JSON.stringify(walk(SHARED).map((f) => relative(SHARED, f).split('\\').join('/')).filter((f) => f !== 'files.json').sort()));
