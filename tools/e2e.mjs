// Pruebas de extremo a extremo y benchmark en Chrome real (Playwright).
//   node tools/e2e.mjs            → juega una canción de cada mod (bot + teclado simulado)
//   node tools/e2e.mjs --bench    → benchmark de rendimiento y memoria
// Requiere: dist/ compilado (bun run build) y Playwright (npm i -D playwright && npx playwright install chromium)
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); } catch { pw = require('/opt/npm-tools/node_modules/playwright'); }

const BENCH = process.argv.includes('--bench');
const QUALITY = (process.argv.find((a) => a.startsWith('--quality=')) ?? '--quality=high').split('=')[1];
const PORT = 8137;
const URL = `http://localhost:${PORT}/`;
const server = spawn('bun', ['tools/serve.ts', String(PORT)], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 800));

const exe = ['/usr/bin/google-chrome', '/usr/bin/chromium'].find((p) => existsSync(p));
const browser = await pw.chromium.launch({
  headless: true,
  executablePath: process.env.CHROME ?? exe,
  args: ['--autoplay-policy=no-user-gesture-required', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
const missing = new Set();
page.on('response', (r) => { if (r.status() === 404) missing.add(new globalThis.URL(r.url()).pathname); });
mkdirSync('bench-results', { recursive: true });

const results = [];
let failed = 0;
function check(name, ok, info = '') {
  results.push({ name, ok, info });
  console.log(`${ok ? '✔' : '✘'} ${name}${info ? '  — ' + info : ''}`);
  if (!ok) failed++;
}

async function openMod(id) {
  await page.goto(URL + '#/mod/' + id);
  await page.waitForFunction((id) => window.__funkade?.modId === id && document.querySelectorAll('#song-list button').length > 0, id, { timeout: 15000 });
}

async function playSong(modId, song, diff, { bot = true, keyboard = false, sample = null, quality = null } = {}) {
  await openMod(modId);
  await page.evaluate(({ song, diff, bot, quality }) => { window.__funkade.saveSettings({ botplay: bot, showFps: true, quality }); window.__funkade.select(song, diff); window.__funkadeLastResult = null; }, { song, diff, bot, quality: quality ?? (keyboard ? 'low' : 'auto') });
  const t0 = Date.now();
  await page.click('#btn-play');
  await page.waitForFunction(() => window.__funkade.play?.started, null, { timeout: 30000 });
  const loadMs = Date.now() - t0;
  if (keyboard) {
    // "jugador" automático que pulsa teclas reales del DOM (KeyboardEvent) en el momento de cada nota
    await page.evaluate(() => {
      const codes = ['KeyD', 'KeyF', 'KeyJ', 'KeyK'];
      const pending = new Set();
      const press = (lane, len) => {
        window.dispatchEvent(new KeyboardEvent('keydown', { code: codes[lane], bubbles: true }));
        setTimeout(() => window.dispatchEvent(new KeyboardEvent('keyup', { code: codes[lane], bubbles: true })), Math.max(60, len + 20));
      };
      const tick = () => {
        const p = window.__funkade.play;
        if (!p || p.ended) return;
        for (const n of p.upcoming) {
          const key = n.t + ':' + n.lane;
          if (n.kind === 'hurt' || pending.has(key)) continue;
          const dt = n.t - p.nowSongT; // reloj de canción en este instante (no el del último frame)
          if (dt < 120) { pending.add(key); setTimeout(() => press(n.lane, n.len), Math.max(0, dt)); }
        }
        setTimeout(tick, 20);
      };
      tick();
    });
  }
  await page.waitForTimeout(6000);
  await page.evaluate(() => window.__funkade.resetFrames());
  if (sample) await sample();
  await page.screenshot({ path: `bench-results/${modId}-${song}.png` });
  // capturas a lo largo de la canción para comparar con el original
  const dur = await page.evaluate(() => window.__funkade.play?.duration ?? 0);
  for (const f of [0.25, 0.5, 0.75, 0.92]) {
    const at = dur * f;
    const ok = await page.waitForFunction((at) => window.__funkadeLastResult || (window.__funkade.play?.songT ?? 0) >= at, at, { timeout: 420000, polling: 250 }).then(() => true, () => false);
    if (!ok || (await page.evaluate(() => !!window.__funkadeLastResult))) break;
    await page.screenshot({ path: `bench-results/${modId}-${song}-${Math.round(f * 100)}.png` });
  }
  await page.waitForFunction(() => window.__funkadeLastResult, null, { timeout: 420000, polling: 500 });
  const res = await page.evaluate(() => ({ r: window.__funkadeLastResult, d: window.__funkade.diag() }));
  return { loadMs, ...res };
}

try {
  // catálogo
  await page.goto(URL);
  await page.waitForSelector('.card');
  const cards = await page.$$eval('.card h3', (e) => e.map((x) => x.textContent));
  check('Catálogo muestra los 5 mods', cards.length === 5, cards.join(', '));
  check('Los mods de demostración se eliminaron', !cards.some((c) => /Demo Base|Circuito|Noche Espectral/i.test(c)));
  await page.fill('#search', 'garcello');
  check('Buscador filtra', (await page.$$('.card')).length === 1);
  await page.fill('#search', '');
  await page.screenshot({ path: 'bench-results/catalogo.png' });

  if (!BENCH) {
    const cases = [
      // con teclado simulado usamos calidad baja: en Chrome sin GPU (SwiftShader) el renderizado por software
      // bloquea el hilo principal y retrasa los setTimeout que simulan las pulsaciones
      ['vs-garcello', 'headache', 'normal', { bot: false, keyboard: true }],
      ['aura-funkin', 'aura-battle', 'aura', { bot: true }],
      ['nocturnal-protocol-fan-recreation', 'nocturnal-protocol', 'hard', { bot: true }],
      ['bite-fernan-mix', 'bite', 'fernan', { bot: true }],
      ['fnf-rivals-demo', 'catfight', 'hard', { bot: true }],
    ];
    const only = process.env.ONLY ? process.env.ONLY.split(',') : null;
    for (const [mod, song, diff, opts] of cases) {
      if (only && !only.includes(mod)) continue;
      const { r, d, loadMs } = await playSong(mod, song, diff, opts);
      const t = r.tally;
      const how = opts.keyboard ? 'teclado simulado' : 'bot';
      check(`${mod}/${song} (${diff}, ${how}) se juega hasta el final`, !!r, `carga ${loadMs} ms · ${d.renderer}`);
      check(`${mod}/${song} sin fallos`, t.miss === 0, `sick ${t.sick} · good ${t.good} · bad ${t.bad} · shit ${t.shit} · miss ${t.miss} · precisión ${r.accuracy.toFixed(2)}%`);
      if (opts.keyboard) check('Precisión del input por teclado ≥ 95%', r.accuracy >= 95, `${r.accuracy.toFixed(2)}%`);
      check(`${mod}/${song} FPS medio`, d.fps > 25, `${d.fps.toFixed(1)} FPS · p99 ${d.p99.toFixed(1)} ms · ${d.drawCalls} draw calls · ${d.sprites} sprites`);
      if (d.warnings.length) console.log('   avisos:', d.warnings.join(' | '));
      const info = await page.evaluate(() => window.__funkadeLastPlayInfo ?? null);
      if (info) {
        console.log(`   skin: ${info.skin} · lua: ${info.luaScripts.map((x) => x.name + (x.closed ? ' (CERRADO)' : '')).join(', ') || '—'}`);
        const luaErr = info.warnings.filter((w) => w.startsWith('Error en'));
        // una función de Psych que falta en la web aparece como «intento de llamar a 'x' (nil)»; otros errores
        // (p. ej. aritmética con un texto vacío) también ocurren en el juego original y se informan sin fallar
        const missingApi = luaErr.filter((w) => /intento de llamar a '/.test(w));
        if (luaErr.length > missingApi.length) console.log('   errores propios del script (también en el original):', luaErr.filter((w) => !missingApi.includes(w)).slice(0, 4).join(' | '));
        check(`${mod} API de Psych completa para sus scripts`, missingApi.length === 0, missingApi.slice(0, 6).join(' | '));
      }
    }
    // perfil: la partida con teclado (sin bot) debe haberse guardado con su logro
    if (!process.env.ONLY || process.env.ONLY.includes('vs-garcello')) {
      const prof = await page.evaluate(async () => { const d = await window.__funkade.profile.current(); return { clears: d.stats.clears, ach: Object.keys(d.stats.achievements), recent: d.recent.length }; });
      check('La partida se guarda en el perfil', prof.clears >= 1 && prof.recent >= 1, `completadas ${prof.clears} · logros: ${prof.ach.join(', ')}`);
      check('Logro «Primer escenario» desbloqueado', prof.ach.includes('first-clear'));
      await page.goto(URL + '#/profile');
      await page.waitForSelector('.pf-head');
      await page.screenshot({ path: 'bench-results/perfil.png', fullPage: true });
      // segundo jugador en el mismo navegador → podio
      const me = await page.evaluate(async () => (await window.__funkade.profile.current()).profile.id);
      await page.evaluate(async () => {
        const f = window.__funkade.profile;
        await f.createProfile('Rival');
        await f.record({ modId: 'vs-garcello', modName: 'VS Garcello', songId: 'nerves', songName: 'Nerves', diff: 'normal', score: 18000, accuracy: 93.5, grade: 'A', sick: 60, good: 8, bad: 1, shit: 0, miss: 1, maxCombo: 50, cleared: true, date: Date.now(), durationMs: 60000 });
      });
      await page.evaluate(async (id) => window.__funkade.profile.switchProfile(id), me);
      await page.goto(URL + '#/podium');
      await page.waitForSelector('.podium .pod');
      const names = await page.$$eval('.table.rank tbody tr', (r) => r.length);
      check('El podio muestra los dos perfiles', names === 2);
      await page.screenshot({ path: 'bench-results/podio.png', fullPage: true });
    }

    // pausa / reanudar
    await openMod('vs-garcello');
    await page.evaluate(() => { window.__funkade.saveSettings({ botplay: true }); window.__funkade.select('nerves', 'normal'); });
    await page.click('#btn-play');
    await page.waitForFunction(() => window.__funkade.play?.songT > 3000, null, { timeout: 30000 });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    const t1 = await page.evaluate(() => window.__funkade.play.songT);
    await page.waitForTimeout(1500);
    const t2 = await page.evaluate(() => window.__funkade.play.songT);
    check('Pausa congela la canción', Math.abs(t2 - t1) < 5, `${t1.toFixed(0)} → ${t2.toFixed(0)} ms`);
    await page.screenshot({ path: 'bench-results/pausa.png' });
    await page.click('text=▶ Continuar');
    await page.waitForTimeout(1500);
    const t3 = await page.evaluate(() => window.__funkade.play.songT);
    check('Reanudar continúa desde el mismo punto', t3 > t2 + 1000 && t3 < t2 + 2200, `${t3.toFixed(0)} ms`);
    await page.keyboard.press('KeyR');
    await page.waitForTimeout(500);
    check('Reiniciar (R) vuelve al inicio', (await page.evaluate(() => window.__funkade.play.songT)) < 1000);
    await page.evaluate(() => window.__funkade.stop());
  } else {
    // ---------------- benchmark
    const samples = [];
    const { r, d, loadMs } = await playSong('nocturnal-protocol-fan-recreation', 'nocturnal-protocol', 'hard', {
      bot: true, quality: QUALITY,
      sample: async () => {
        for (let i = 0; i < 30; i++) {
          await page.waitForTimeout(1000);
          samples.push(await page.evaluate(() => { const d = window.__funkade.diag(); return { fps: d.fps, avg: d.avg, p99: d.p99, cpu: d.cpuAvg, draw: d.drawCalls, sprites: d.sprites, heap: performance.memory?.usedJSHeapSize ?? 0, tex: d.textureMB }; }));
        }
      },
    });
    const avg = (k) => samples.reduce((s, x) => s + x[k], 0) / samples.length;
    const max = (k) => Math.max(...samples.map((x) => x[k]));
    const bench = {
      date: new Date().toISOString(), chrome: await browser.version(), renderer: d.renderer, viewport: '1600x900',
      song: 'nocturnal-protocol (hard, bot)', quality: QUALITY, loadMs, misses: r.tally.miss, accuracy: r.accuracy,
      fpsAvg: avg('fps'), frameAvgMs: avg('avg'), frameP99Ms: max('p99'), cpuPerFrameMs: avg('cpu'), drawCallsMax: max('draw'), spritesMax: max('sprites'), textureMB: max('tex'),
    };
    // memoria al cambiar de canción repetidamente
    const heap = [];
    for (let i = 0; i < 6; i++) {
      await openMod(i % 2 ? 'fnf-rivals-demo' : 'vs-garcello');
      await page.evaluate(() => { window.__funkade.saveSettings({ botplay: true }); window.__funkade.select(document.querySelector('#song-list button').dataset.song); });
      await page.click('#btn-play');
      await page.waitForFunction(() => window.__funkade.play?.songT > 2000, null, { timeout: 30000 });
      const info = await page.evaluate(async () => { await window.__funkade.stop(); return { heap: performance.memory?.usedJSHeapSize ?? 0, tex: window.__funkade.diag().textureMB }; });
      heap.push(info);
    }
    bench.heapAfterSwitchesMB = heap.map((h) => +(h.heap / 1048576).toFixed(1));
    bench.textureMBAfterSwitches = heap.map((h) => +h.tex.toFixed(1));
    bench.samples = samples;
    writeFileSync(`bench-results/benchmark-${QUALITY}.json`, JSON.stringify(bench, null, 2));
    console.log(JSON.stringify({ ...bench, samples: undefined }, null, 2));
    check('Benchmark completado sin fallos del bot', r.tally.miss === 0);
  }
} catch (e) {
  console.error(e);
  failed++;
} finally {
  if (missing.size) console.log('Archivos 404 (opcionales que el motor prueba):\n  ' + [...missing].slice(0, 40).join('\n  '));
  const errors = logs.filter((l) => l.startsWith('[pageerror]') || (l.startsWith('[error]') && !l.includes('404')));
  if (errors.length) { console.log('Errores de consola:\n' + errors.slice(0, 20).join('\n')); }
  writeFileSync('bench-results/console.log', logs.join('\n'));
  await browser.close();
  server.kill();
  console.log(failed ? `\n${failed} comprobación(es) fallida(s)` : '\nTodas las comprobaciones pasaron');
  process.exit(failed ? 1 : 0);
}
