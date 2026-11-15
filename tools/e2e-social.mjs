// Pruebas de "me gusta", buscador de jugadores y desplazamiento de la tarjeta de logros.
//   node tools/e2e-social.mjs   (requiere dist/ compilado)
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync } from 'node:fs';
const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); } catch { pw = require('/opt/npm-tools/node_modules/playwright'); }

const PORT = 8138;
const BASE = `http://localhost:${PORT}/`;
const server = spawn('bun', ['tools/serve.ts', String(PORT)], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 800));
const exe = ['/usr/bin/google-chrome', '/usr/bin/chromium'].find((p) => existsSync(p));
const browser = await pw.chromium.launch({ headless: true, executablePath: process.env.CHROME ?? exe, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
mkdirSync('bench-results', { recursive: true });
let failed = 0;
const check = (name, ok, info = '') => { console.log(`${ok ? '✔' : '✘'} ${name}${info ? '  — ' + info : ''}`); if (!ok) failed++; };

try {
  await page.goto(BASE + '#/mod/vs-garcello');
  await page.waitForSelector('#song-list .like');
  const like = page.locator('#song-list li').first().locator('.like');
  const before = +(await like.locator('.like-n').textContent());
  await like.click();
  await page.waitForTimeout(300);
  check('«Me gusta» se marca', (await like.getAttribute('aria-pressed')) === 'true');
  check('El contador sube', +(await like.locator('.like-n').textContent()) === before + 1);
  check('Pulsar «me gusta» no cambia la canción elegida', (await page.locator('#song-list li').first().locator('button').first().getAttribute('class'))?.includes('sel'));
  await page.reload();
  await page.waitForSelector('#song-list .like');
  check('El «me gusta» se conserva al recargar', (await page.locator('#song-list li').first().locator('.like').getAttribute('aria-pressed')) === 'true');

  // segundo jugador en el mismo navegador: los «me gusta» se suman
  await page.evaluate(async () => { await window.__funkade.profile.createProfile('Rival Supremo'); });
  await page.goto(BASE + '#/mod/aura-funkin');
  await page.goto(BASE + '#/mod/vs-garcello');
  await page.waitForSelector('#song-list .like');
  const l2 = page.locator('#song-list li').first().locator('.like');
  check('Otro perfil aún no le dio «me gusta»', (await l2.getAttribute('aria-pressed')) === 'false');
  await l2.click();
  await page.waitForTimeout(300);
  check('Se suman los «me gusta» de los jugadores', +(await l2.locator('.like-n').textContent()) === before + 2, await l2.locator('.like-n').textContent());
  await page.screenshot({ path: 'bench-results/likes.png' });

  // buscador de jugadores
  await page.goto(BASE + '#/players');
  await page.waitForSelector('.player-card');
  check('Jugadores lista todos los perfiles', (await page.$$('.player-card')).length >= 2);
  await page.fill('#player-search', 'supremo');
  await page.waitForTimeout(500);
  const names = await page.$$eval('.player-card .pc-body b', (e) => e.map((x) => x.textContent));
  check('El buscador filtra por nombre', names.length === 1 && names[0] === 'Rival Supremo', names.join(', '));
  await page.screenshot({ path: 'bench-results/jugadores.png' });
  await page.click('.player-card');
  await page.waitForSelector('.pf-head');
  check('Abre el perfil del jugador', (await page.textContent('.pf-head')).includes('Rival Supremo'));

  // tarjeta de resultados con muchos logros: debe caber en el marco y poder desplazarse
  await page.goto(BASE + '#/mod/vs-garcello');
  await page.waitForSelector('#overlay .overlay-card');
  const r = await page.evaluate(() => {
    const card = document.querySelector('#overlay .overlay-card');
    const box = document.createElement('div'); box.className = 'new-achs';
    for (let i = 0; i < 24; i++) { const d = document.createElement('div'); d.className = 'new-ach gold'; d.innerHTML = '<span>🏆</span><div><small>Logro desbloqueado</small><b>Logro de prueba ' + i + '</b></div>'; box.append(d); }
    card.append(box);
    for (let i = 0; i < 6; i++) { const p = document.createElement('p'); p.textContent = 'Línea extra ' + i; card.append(p); }
    const fr = document.getElementById('game-frame').getBoundingClientRect(), cr = card.getBoundingClientRect();
    card.scrollTop = 99999;
    return { fits: cr.bottom <= fr.bottom + 1 && cr.top >= fr.top - 1, scrolls: card.scrollHeight > card.clientHeight, scrolled: card.scrollTop > 0 };
  });
  check('La tarjeta de logros cabe en el marco del juego', r.fits);
  check('La tarjeta de logros se puede desplazar hasta el final', r.scrolls && r.scrolled);
  await page.screenshot({ path: 'bench-results/logros-scroll.png' });
} catch (e) { console.error(e); failed++; }
finally {
  if (errors.length) console.log('Errores de página:\n' + errors.join('\n'));
  await browser.close();
  server.kill();
  console.log(failed ? `\n${failed} comprobación(es) fallida(s)` : '\nTodas las comprobaciones pasaron');
  process.exit(failed ? 1 : 0);
}
