// Compila la plataforma a /dist (sitio estático listo para publicar).
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

const t0 = performance.now();
rmSync('dist', { recursive: true, force: true });
mkdirSync('dist', { recursive: true });
cpSync('public', 'dist', { recursive: true });

const res = await Bun.build({
  entrypoints: ['src/main.ts', 'src/workers/chart-worker.ts'],
  outdir: 'dist/js',
  naming: '[name].[ext]',
  target: 'browser',
  format: 'esm',
  minify: true,
  sourcemap: 'linked',
  splitting: false,
});
if (!res.success) {
  for (const l of res.logs) console.error(l);
  process.exit(1);
}
const version = Date.now().toString(36);
const sw = readFileSync('dist/sw.js', 'utf8').replace('__BUILD_VERSION__', version);
writeFileSync('dist/sw.js', sw);
writeFileSync('dist/.nojekyll', '');
if (!existsSync('dist/mods/catalog.json')) console.warn('Aviso: falta public/mods/catalog.json (ejecuta "bun run catalog")');
for (const o of res.outputs) if (o.path.endsWith('.js')) console.log(`  ${o.path.replace(process.cwd() + '/', '')}  ${(o.size / 1024).toFixed(1)} KB`);
console.log(`Build OK en ${(performance.now() - t0).toFixed(0)} ms → dist/`);
