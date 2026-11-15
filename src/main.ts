// Controlador de la aplicación: catálogo, pantalla de mod, ajustes y ciclo de vida del juego.
import { AudioEngine } from './audio/audio';
import { Diag } from './core/diagnostics';
import { Engine } from './core/engine';
import { DEFAULT_SETTINGS, keyLabel, saveSettings, settings, type Settings } from './core/settings';
import type { CatalogEntry } from './core/types';
import { PlayState, type PlayResult } from './gameplay/play-state';
import { loadShared } from './gameplay/shared';
import { BASE_URL, coverUrl, deleteLocalMod, importZip, loadCatalog, openMod, type ModRuntime } from './mod-loader/mod-manager';
import { idbGet, idbSet } from './storage/idb';
import { cacheModOffline, clearModCache, registerSW, storageInfo } from './storage/offline';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const h = (tag: string, attrs: Record<string, string> = {}, ...kids: (Node | string)[]) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  el.append(...kids);
  return el;
};

let catalog: CatalogEntry[] = [];
let engine: Engine | null = null;
let audio: AudioEngine | null = null;
let play: PlayState | null = null;
let mod: ModRuntime | null = null;
let selSong = '';
let busy = false;
let diagTimer = 0;

// ------------------------------------------------------------------ utilidades
function fmtSize(b: number) {
  if (!b) return '—';
  return b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB';
}
const COMPAT_LABEL = { full: 'Compatible', partial: 'Parcial', 'songs-only': 'Solo canciones' } as const;
const FORMAT_LABEL = { fnfweb: 'Funkade', psych: 'Psych Engine', vslice: 'V-Slice' } as const;

function toast(msg: string, ms = 4000) {
  const t = $('toast');
  t.textContent = msg;
  clearTimeout((t as any)._t);
  (t as any)._t = setTimeout(() => (t.textContent = ''), ms);
}

function overlay(html: Node | null) {
  const o = $('overlay');
  if (!html) { o.hidden = true; return; }
  const card = $('overlay-card');
  card.replaceChildren(html);
  o.hidden = false;
}

function frag(...kids: (Node | string)[]) { const f = document.createDocumentFragment(); f.append(...kids); return f; }

function btn(label: string, onClick: () => void, cls = '') {
  const b = h('button', { type: 'button', class: cls }, label) as HTMLButtonElement;
  b.addEventListener('click', onClick);
  return b;
}

// ------------------------------------------------------------------ catálogo
async function initCatalog() {
  catalog = await loadCatalog();
  const cats = [...new Set(catalog.map((c) => c.category))].sort();
  const sel = $<HTMLSelectElement>('filter-cat');
  sel.replaceChildren(h('option', { value: '' }, 'Todas las categorías'), ...cats.map((c) => h('option', { value: c }, c)));
  renderCatalog();
}

function renderCatalog() {
  const q = $<HTMLInputElement>('search').value.trim().toLowerCase();
  const cat = $<HTMLSelectElement>('filter-cat').value;
  const sort = $<HTMLSelectElement>('sort').value;
  let list = catalog.filter((c) => (!cat || c.category === cat) && (!q || (c.name + ' ' + c.description + ' ' + c.category).toLowerCase().includes(q)));
  list = list.sort((a, b) => sort === 'name' ? a.name.localeCompare(b.name, 'es') : sort === 'size' ? a.sizeBytes - b.sizeBytes : b.popularity - a.popularity);
  $('catalog-status').textContent = catalog.length ? (list.length ? '' : 'Ningún mod coincide con la búsqueda.') : 'No hay mods en el catálogo.';
  const grid = $('grid');
  grid.replaceChildren(...list.map(card));
}

function card(c: CatalogEntry) {
  const cover = h('div', { class: 'cover' });
  const url = coverUrl(c);
  if (url) cover.append(h('img', { src: url, alt: '', loading: 'lazy', decoding: 'async' }));
  else cover.append(h('div', { class: 'ph' }, c.name.slice(0, 2).toUpperCase()));
  const actions = h('div', { class: 'actions' }, btn('▶ Jugar', () => (location.hash = '#/mod/' + encodeURIComponent(c.id)), 'primary'));
  if (c.local) actions.append(btn('🗑', async () => {
    if (!confirm(`¿Eliminar "${c.name}" de este navegador?`)) return;
    await deleteLocalMod(c.id); await initCatalog();
  }));
  else actions.append(btn('⤓', async (ev?: unknown) => {
    void ev;
    try {
      toast(`Guardando ${c.name} para jugar sin conexión…`, 60000);
      const m = await openMod(c);
      const n = await cacheModOffline(new URL(c.path.replace(/\/?$/, '/'), BASE_URL).href, m.manifest.files ?? [], (p) => toast(`Guardando ${c.name}: ${Math.round(p * 100)}%`, 60000));
      toast(`${c.name} disponible sin conexión (${n} archivos).`);
    } catch (e) { toast('No se pudo guardar: ' + (e as Error).message); }
  }));
  (actions.lastChild as HTMLElement).title = c.local ? 'Eliminar' : 'Guardar para jugar sin conexión';
  return h('article', { class: 'card' }, cover, h('div', { class: 'body' },
    h('h3', {}, c.name),
    h('p', {}, c.description),
    h('div', { class: 'badges' },
      h('span', { class: 'badge ' + c.compatibility, title: 'Compatibilidad' }, COMPAT_LABEL[c.compatibility]),
      h('span', { class: 'badge' }, FORMAT_LABEL[c.format]),
      h('span', { class: 'badge' }, `${c.songCount} canc.`),
      h('span', { class: 'badge' }, fmtSize(c.sizeBytes)),
      h('span', { class: 'badge' }, c.category)),
    actions));
}

// ------------------------------------------------------------------ pantalla de mod
async function showMod(id: string) {
  const entry = catalog.find((c) => c.id === id);
  if (!entry) { $('mod-title').textContent = 'Mod no encontrado'; return; }
  await stopGame();
  overlay(frag(h('h2', {}, 'Cargando mod…'), h('div', { class: 'progress' }, h('div', { style: 'width:30%' }))));
  mod = null;
  try { mod = await openMod(entry); }
  catch (e) { overlay(frag(h('h2', {}, 'Error'), h('p', {}, (e as Error).message))); return; }
  const m = mod.manifest;
  $('mod-title').textContent = m.name;
  $('mod-desc').textContent = m.description ?? '';
  const compat = $('mod-compat');
  compat.replaceChildren(h('span', { class: 'badge ' + (m.compatibility ?? 'partial') }, COMPAT_LABEL[m.compatibility ?? 'partial']), ' ', h('span', { class: 'badge' }, FORMAT_LABEL[m.format]));
  if (m.compatNotes?.length) compat.append(h('ul', {}, ...m.compatNotes.map((n) => h('li', {}, n))));
  if (m.author || m.license) compat.append(h('p', { class: 'muted small' }, [m.author && `Autor: ${m.author}`, m.license && `Licencia: ${m.license}`].filter(Boolean).join(' · ')));
  selSong = '';
  await renderSongs();
  if (m.songs.length) selectSong(m.songs[0].id);
  overlay(frag(h('h2', {}, m.name), h('p', { class: 'muted' }, 'Elige canción y dificultad, y pulsa «Jugar».'), btn('▶ Jugar', startGame, 'primary big')));
}

async function renderSongs() {
  if (!mod) return;
  const ul = $('song-list');
  const items = await Promise.all(mod.manifest.songs.map(async (s) => {
    const best = await bestScore(s.id);
    const b = btn('', () => selectSong(s.id));
    b.dataset.song = s.id;
    b.append(h('span', {}, s.name), h('span', { class: 'best' }, best ? `★ ${best.toLocaleString('es')}` : ''));
    if (s.id === selSong) b.classList.add('sel');
    return h('li', {}, b);
  }));
  ul.replaceChildren(...items);
}

function selectSong(id: string) {
  if (!mod) return;
  selSong = id;
  document.querySelectorAll<HTMLButtonElement>('#song-list button').forEach((b) => b.classList.toggle('sel', b.dataset.song === id));
  const s = mod.manifest.songs.find((x) => x.id === id)!;
  const diff = $<HTMLSelectElement>('diff');
  const prev = diff.value;
  diff.replaceChildren(...s.difficulties.map((d) => h('option', { value: d }, d[0].toUpperCase() + d.slice(1))));
  diff.value = s.difficulties.includes(prev) ? prev : s.difficulties.includes('normal') ? 'normal' : s.difficulties[0];
  diff.disabled = s.difficulties.length < 2;
  $<HTMLButtonElement>('btn-play').disabled = false;
}

async function bestScore(song: string): Promise<number> {
  if (!mod) return 0;
  try { return (await idbGet<number>('kv', `best:${mod.manifest.id}:${song}`)) ?? 0; } catch { return 0; }
}

// ------------------------------------------------------------------ juego
function ensureEngine() {
  if (!engine) {
    engine = new Engine($<HTMLCanvasElement>('game'));
    engine.onAutoQuality = (s) => toast(`Calidad ajustada automáticamente (resolución ${Math.round(s * 100)}%)`);
  }
  if (!audio) audio = new AudioEngine();
  audio.setVolumes(settings.masterVol, settings.musicVol, settings.sfxVol);
}

async function startGame() {
  if (!mod || !selSong || busy) return;
  busy = true;
  try {
    ensureEngine();
    await audio!.unlock(); // requiere el clic del usuario (política de autoplay)
    await stopGame();
    const diff = $<HTMLSelectElement>('diff').value;
    const bar = h('div');
    const label = h('p', { class: 'muted small' }, 'Preparando…');
    overlay(frag(h('h2', {}, 'Cargando canción…'), h('div', { class: 'progress' }, bar), label));
    const shared = await loadShared(engine!.renderer);
    const p = new PlayState(audio!, engine!.renderer, mod, selSong, diff, shared, {
      onHud: (t) => ($('hud-score').textContent = t),
      onEnd: (r) => showResults(r),
      onGameOver: () => showGameOver(),
      onPauseRequest: () => togglePause(),
    });
    play = p;
    const warnings = await p.load((v, l) => { bar.style.width = Math.round(v * 100) + '%'; label.textContent = l; });
    if (play !== p) return;
    const hud = $('hud-score');
    hud.hidden = false;
    hud.classList.toggle('down', settings.downscroll);
    overlay(null);
    if (warnings.length) toast(`⚠ ${warnings.length} aviso(s) de compatibilidad: ${warnings[0]}`, 8000);
    p.start();
    engine!.start(p);
    setControls(true);
    startDiag();
    ($('game-frame') as HTMLElement).focus?.();
  } catch (e) {
    console.error(e);
    overlay(frag(h('h2', {}, 'No se pudo cargar la canción'), h('p', {}, (e as Error).message), btn('Volver', () => overlay(null))));
    await stopGame();
  } finally {
    busy = false;
  }
}

async function stopGame() {
  stopDiag();
  if (play) { play.dispose(); play = null; }
  engine?.stop();
  if (engine) { engine.scene = null; engine.renderer.begin('#000'); engine.renderer.end(); }
  $('hud-score').hidden = true;
  setControls(false);
}

function setControls(on: boolean) {
  $<HTMLButtonElement>('btn-pause').disabled = !on;
  $<HTMLButtonElement>('btn-restart').disabled = !on;
}

async function togglePause() {
  if (!play || play.ended) return;
  if (play.paused) { overlay(null); await play.resume(); engine?.start(play); return; }
  await play.pause();
  engine?.stop();
  overlay(frag(h('h2', {}, 'Pausa'), h('div', { class: 'btns' },
    btn('▶ Continuar', togglePause, 'primary'),
    btn('↻ Reiniciar', () => { overlay(null); play?.restart(); engine?.start(play!); }),
    btn('⚙ Ajustes', () => openSettings()),
    btn('← Elegir otra canción', () => { void stopGame().then(() => overlay(frag(h('h2', {}, mod?.manifest.name ?? ''), btn('▶ Jugar', startGame, 'primary big')))); }),
    btn('⌂ Volver al catálogo', () => (location.hash = '#/')))));
}

async function showResults(r: PlayResult) {
  engine?.stop();
  setControls(false);
  let record = false;
  if (mod && !r.bot) {
    const key = `best:${mod.manifest.id}:${selSong}`;
    const prev = (await idbGet<number>('kv', key).catch(() => 0)) ?? 0;
    if (r.tally.score > prev) { record = true; await idbSet('kv', key, r.tally.score).catch(() => {}); }
    void renderSongs();
  }
  const t = r.tally;
  overlay(frag(
    h('h2', {}, `${r.songName} · ${r.diff}`),
    h('div', { class: 'grade' }, r.grade),
    h('p', {}, `Puntos: ${t.score.toLocaleString('es')}${record ? ' · ¡Nuevo récord!' : ''}${r.bot ? ' (bot)' : ''}`),
    h('div', { class: 'results' },
      ...([['¡Sick!', t.sick], ['Bien', t.good], ['Mal', t.bad], ['Pésimo', t.shit], ['Fallos', t.miss], ['Combo máx.', t.maxCombo]] as [string, number][]).map(([k, v]) => h('div', {}, h('b', {}, String(v)), k))),
    h('p', { class: 'muted' }, `Precisión: ${r.accuracy.toFixed(2)}%`),
    h('div', { class: 'btns' }, btn('↻ Jugar otra vez', startGame, 'primary'), btn('Elegir otra canción', () => { void stopGame(); overlay(frag(h('h2', {}, 'Elige una canción'), btn('▶ Jugar', startGame, 'primary big'))); }))));
  (window as any).__funkadeLastResult = r;
}

function showGameOver() {
  engine?.stop();
  setControls(false);
  overlay(frag(h('h2', {}, 'Game Over'), h('p', { class: 'muted' }, 'Te quedaste sin vida.'), h('div', { class: 'btns' },
    btn('↻ Reintentar', () => { overlay(null); play?.restart(); engine?.start(play!); setControls(true); }, 'primary'),
    btn('Elegir otra canción', () => { void stopGame(); overlay(frag(h('h2', {}, 'Elige una canción'), btn('▶ Jugar', startGame, 'primary big'))); }))));
}

// ------------------------------------------------------------------ FPS y diagnóstico
function startDiag() {
  stopDiag();
  const fps = $('fps'), diag = $('diag');
  const graph = h('canvas', { width: '300', height: '60' }) as HTMLCanvasElement;
  const text = h('div');
  diag.replaceChildren(text, graph);
  diagTimer = window.setInterval(() => {
    const s = Diag.stats();
    fps.hidden = !settings.showFps;
    diag.hidden = !settings.showDiag;
    if (settings.showFps) fps.textContent = `${Math.round(s.fps)} FPS · ${s.avg.toFixed(1)} ms`;
    if (!settings.showDiag) return;
    const mem = (performance as any).memory;
    const p = play?.debugInfo();
    const loads = Diag.loads.slice(-8).map((l) => `  ${l.ms.toFixed(0).padStart(5)} ms  ${l.label.slice(-38)}`).join('\n');
    text.textContent =
`DIAGNÓSTICO (F3)
Render:      ${Diag.renderer} · ${engine?.renderer.width}x${engine?.renderer.height} (${Math.round(Diag.resolutionScale * 100)}%)
FPS:         ${s.fps.toFixed(1)}  (media ${s.avg.toFixed(2)} ms, p99 ${s.p99.toFixed(2)} ms, máx ${s.max.toFixed(1)} ms)
CPU/frame:   ${s.cpuAvg.toFixed(2)} ms
Draw calls:  ${Diag.drawCalls} · sprites ${Diag.sprites}
Texturas:    ${(Diag.textureBytes / 1048576).toFixed(1)} MB en GPU
Memoria JS:  ${mem ? (mem.usedJSHeapSize / 1048576).toFixed(1) + ' MB' : 'n/d (solo Chrome)'}
Audio:       base ${Diag.audioBaseLatency.toFixed(1)} ms · salida ${Diag.audioOutputLatency.toFixed(1)} ms
Reloj:       ${p?.outputTs ? 'getOutputTimestamp' : 'currentTime−latencia'} · jitter ${Diag.syncDrift.toFixed(2)} ms
Último golpe:${Diag.lastInputDelta >= 0 ? ' +' : ' '}${Diag.lastInputDelta.toFixed(1)} ms (+ = tarde)
Canción:     ${p ? (p.songT / 1000).toFixed(2) : '-'} s
Cargas recientes:
${loads}
${Diag.warnings.length ? 'Avisos:\n  ' + Diag.warnings.slice(-5).join('\n  ') : ''}`;
    const g = graph.getContext('2d')!;
    g.clearRect(0, 0, 300, 60);
    g.strokeStyle = 'rgba(255,255,255,.25)'; g.beginPath(); g.moveTo(0, 60 - 16.7 * 1.5); g.lineTo(300, 60 - 16.7 * 1.5); g.stroke();
    g.strokeStyle = '#3ee08f'; g.beginPath();
    const n = Diag.filled;
    for (let i = 0; i < n; i++) {
      const v = Diag.frameTimes[(Diag.idx - n + i + 240) % 240];
      const x = (i / 240) * 300, y = 60 - Math.min(60, v * 1.5);
      if (i) g.lineTo(x, y); else g.moveTo(x, y);
    }
    g.stroke();
  }, 250);
}
function stopDiag() { clearInterval(diagTimer); $('fps').hidden = true; $('diag').hidden = true; }

// ------------------------------------------------------------------ ajustes
function openSettings() {
  const f = $<HTMLFormElement>('settings-form');
  for (const el of Array.from(f.elements) as HTMLInputElement[]) {
    const k = el.name as keyof Settings;
    if (!k || !(k in settings)) continue;
    if (el.type === 'checkbox') el.checked = !!settings[k];
    else el.value = String(settings[k]);
  }
  renderKeybinds();
  void storageInfo().then((s) => ($('storage-info').textContent = s));
  $<HTMLDialogElement>('dlg-settings').showModal();
}

function bindSettings() {
  const f = $<HTMLFormElement>('settings-form');
  f.addEventListener('input', (e) => {
    const el = e.target as HTMLInputElement;
    const k = el.name as keyof Settings;
    if (!k || !(k in settings)) return;
    const def = DEFAULT_SETTINGS[k];
    const v = el.type === 'checkbox' ? el.checked : typeof def === 'number' ? Number(el.value) : el.value;
    saveSettings({ [k]: v } as Partial<Settings>);
    if (k === 'quality') engine?.applyQuality();
    if (k === 'renderer') toast('El cambio de renderizador se aplica al recargar la página.');
    if (k.endsWith('Vol')) audio?.setVolumes(settings.masterVol, settings.musicVol, settings.sfxVol);
    if (k === 'downscroll' && play) toast('Downscroll se aplicará en la próxima partida.');
  });
  $('btn-reset-settings').addEventListener('click', () => { saveSettings(structuredClone(DEFAULT_SETTINGS)); openSettings(); audio?.setVolumes(settings.masterVol, settings.musicVol, settings.sfxVol); updateKeysHint(); });
  $('btn-clear-cache').addEventListener('click', async () => { await clearModCache(); $('storage-info').textContent = await storageInfo(); });
}

function renderKeybinds() {
  const box = $('keybinds');
  const names = ['← Izquierda', '↓ Abajo', '↑ Arriba', '→ Derecha'];
  box.replaceChildren();
  settings.keys.forEach((codes, lane) => {
    box.append(h('span', {}, names[lane]));
    for (let slot = 0; slot < 2; slot++) {
      const b = btn(codes[slot] ? keyLabel(codes[slot]) : '—', () => {
        b.classList.add('wait'); b.textContent = '…';
        const onKey = (e: KeyboardEvent) => {
          e.preventDefault(); e.stopPropagation();
          window.removeEventListener('keydown', onKey, true);
          const keys = settings.keys.map((k) => [...k]);
          if (e.code !== 'Escape') {
            // evita que una tecla quede asignada a dos carriles
            for (const k of keys) for (let i = 0; i < k.length; i++) if (k[i] === e.code) k[i] = '';
            keys[lane][slot] = e.code;
          }
          saveSettings({ keys });
          play?.input.rebuild();
          renderKeybinds(); updateKeysHint();
        };
        window.addEventListener('keydown', onKey, true);
      });
      box.append(b);
    }
  });
}

function updateKeysHint() {
  $('keys-hint').textContent = settings.keys.map((k) => k.filter(Boolean).map(keyLabel).join('/')).join(' ');
}

// ------------------------------------------------------------------ rutas
async function route() {
  const hash = location.hash || '#/';
  const views = { catalog: $('view-catalog'), mod: $('view-mod'), about: $('view-about') };
  let which: keyof typeof views = 'catalog';
  if (hash.startsWith('#/mod/')) which = 'mod';
  else if (hash.startsWith('#/about')) which = 'about';
  if (which !== 'mod') await stopGame();
  for (const [k, v] of Object.entries(views)) v.hidden = k !== which;
  document.querySelectorAll('[data-nav]').forEach((a) => a.classList.toggle('active', (a as HTMLElement).dataset.nav === which));
  if (which === 'mod') await showMod(decodeURIComponent(hash.slice(6)));
  window.scrollTo(0, 0);
}

// ------------------------------------------------------------------ arranque
async function main() {
  bindSettings();
  updateKeysHint();
  $('search').addEventListener('input', renderCatalog);
  $('filter-cat').addEventListener('change', renderCatalog);
  $('sort').addEventListener('change', renderCatalog);
  $('btn-settings').addEventListener('click', openSettings);
  $('btn-back').addEventListener('click', () => (location.hash = '#/'));
  $('btn-play').addEventListener('click', startGame);
  $('btn-pause').addEventListener('click', togglePause);
  $('btn-restart').addEventListener('click', () => { if (!play) return; overlay(null); play.restart(); engine?.start(play); });
  $('btn-full').addEventListener('click', () => {
    const el = $('game-frame');
    if (document.fullscreenElement) void document.exitFullscreen();
    else void el.requestFullscreen?.({ navigationUI: 'hide' }).catch(() => toast('Pantalla completa no disponible.'));
  });
  $('btn-import').addEventListener('click', () => $<HTMLInputElement>('file-import').click());
  $<HTMLInputElement>('file-import').addEventListener('change', async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    (e.target as HTMLInputElement).value = '';
    const st = $('catalog-status');
    try {
      location.hash = '#/';
      st.textContent = 'Importando mod…';
      const m = await importZip(file, (p) => (st.textContent = `Importando mod… ${Math.round(p * 100)}%`));
      await initCatalog();
      st.textContent = `Mod «${m.name}» importado (${m.songs.length} canciones, formato ${FORMAT_LABEL[m.format]}).`;
    } catch (err) {
      st.textContent = 'No se pudo importar: ' + (err as Error).message;
    }
  });
  window.addEventListener('keydown', (e) => {
    if (e.code === 'F3') { e.preventDefault(); saveSettings({ showDiag: !settings.showDiag }); }
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden && play && !play.paused && play.started && !play.ended) void togglePause(); });
  window.addEventListener('hashchange', () => void route());
  window.addEventListener('pagehide', () => void stopGame());

  registerSW();
  await initCatalog();
  await route();

  // API de pruebas automatizadas (E2E/benchmark)
  (window as any).__funkade = {
    get play() { return play?.debugInfo() ?? null; },
    get modId() { return mod?.manifest.id ?? null; },
    diag: () => ({ ...Diag.stats(), drawCalls: Diag.drawCalls, sprites: Diag.sprites, textureMB: Diag.textureBytes / 1048576, renderer: Diag.renderer, loads: Diag.loads, warnings: Diag.warnings }),
    settings,
    saveSettings: (p: Partial<Settings>) => { saveSettings(p); if ('quality' in p) engine?.applyQuality(); },
    startGame,
    select: (song: string, diff?: string) => { selectSong(song); if (diff) $<HTMLSelectElement>('diff').value = diff; },
    stop: stopGame,
    resetFrames: () => Diag.resetFrames(),
  };
}

void main();
