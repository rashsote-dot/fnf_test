// Genera los recursos comunes y los 3 mods de demostración (todo contenido original).
// Uso: node tools/gen-mods.mjs   (requiere sharp y ffmpeg; solo hace falta para regenerar los mods)
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { charAnims, characterAtlas, charFrame, boomboxFrame, iconPng, notesAtlas, rgb, shade, uiAtlas, writeAtlas, writePng } from './gen/art.mjs';
import { chartNotes, compose, encode, render, tempo } from './gen/music.mjs';

const OUT = 'public';
const json = (p, o) => { mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, JSON.stringify(o, null, 1)); };
const log = (...a) => console.log('·', ...a);

// ================================================================ personajes
const CH = {
  beat: { kind: 'human', facing: 'left', body: '#2bb5ff', hairStyle: 'cap', cap: '#ff3fa4', color: '#2bb5ff' },
  rival: { kind: 'human', facing: 'right', body: '#8a4bff', hair: '#ff3fa4', hairStyle: 'spiky', pants: '#24183f', color: '#8a4bff' },
  bocina: { kind: 'boombox', body: '#ff6fae', accent: '#5b8cff', color: '#ff6fae' },
  nova: { kind: 'human', facing: 'left', body: '#ff8a3d', hair: '#3b1f5c', hairStyle: 'bun', skin: '#c98e62', pants: '#1f2a44', color: '#ff8a3d' },
  robo: { kind: 'robot', facing: 'right', body: '#7c8aa8', hairStyle: 'antenna', eye: '#5cf7ff', color: '#7c8aa8' },
  'robo-furia': { kind: 'robot', facing: 'right', body: '#b8424f', hairStyle: 'antenna', eye: '#ff4d4d', color: '#ff4d4d' },
  altavoz: { kind: 'boombox', body: '#2fbf85', accent: '#ffd34d', color: '#2fbf85' },
  luz: { kind: 'human', facing: 'left', body: '#f4d35e', hairStyle: 'hood', skin: '#ffe2c6', pants: '#3a2f5b', color: '#f4d35e' },
  espectro: { kind: 'ghost', facing: 'right', body: '#d9d2ff', color: '#b9a8ff' },
  farol: { kind: 'boombox', body: '#4a5a8a', accent: '#ffd34d', color: '#6b7fc0' },
};

async function makeChar(modDir, id, player, imgPath) {
  await characterAtlas(`${modDir}/${imgPath}`, CH[id], { player });
  await iconPng(`${modDir}/images/icons/icon-${id}.png`, CH[id]);
  return charAnims(CH[id], player);
}

// ================================================================ escenarios (SVG original)
function starfield(w, h, n, seed) {
  let s = seed, out = '';
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < n; i++) out += `<circle cx="${(r() * w).toFixed(0)}" cy="${(r() * h * 0.7).toFixed(0)}" r="${(r() * 1.6 + 0.4).toFixed(1)}" fill="#fff" opacity="${(r() * 0.7 + 0.3).toFixed(2)}"/>`;
  return out;
}
function skyline(w, h, color, seed, windows = '#ffd34d', lit = 0.35) {
  let s = seed, out = '', x = 0;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  while (x < w) {
    const bw = 50 + r() * 90, bh = h * (0.3 + r() * 0.6);
    out += `<rect x="${x.toFixed(0)}" y="${(h - bh).toFixed(0)}" width="${bw.toFixed(0)}" height="${bh.toFixed(0)}" fill="${color}"/>`;
    for (let wy = h - bh + 12; wy < h - 14; wy += 22) for (let wx = x + 8; wx < x + bw - 12; wx += 18) if (r() < lit) out += `<rect x="${wx.toFixed(0)}" y="${wy.toFixed(0)}" width="8" height="11" fill="${windows}" opacity="${(0.5 + r() * 0.5).toFixed(2)}"/>`;
    x += bw + 6;
  }
  return out;
}

async function stageDemo(dir) {
  await writePng(`${dir}/images/stage/sky.png`, 1600, 900, `<rect width="1600" height="900" fill="#1b1340"/><linearGradient id="sg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#120a2e"/><stop offset="1" stop-color="#4a2a7a"/></linearGradient><rect width="1600" height="900" fill="url(#sg)"/>${starfield(1600, 900, 160, 7)}<circle cx="1180" cy="190" r="70" fill="#ffe9b8" opacity=".9"/>`);
  await writePng(`${dir}/images/stage/city.png`, 1600, 500, skyline(1600, 500, '#24164a', 11, '#ffcf6b', 0.3));
  await writePng(`${dir}/images/stage/floor.png`, 1400, 300, `<linearGradient id="fg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3a2a5e"/><stop offset="1" stop-color="#140d26"/></linearGradient><rect y="40" width="1400" height="260" fill="url(#fg)"/><rect y="30" width="1400" height="18" fill="#ff3fa4"/><rect y="48" width="1400" height="6" fill="#5b8cff"/>${Array.from({ length: 14 }, (_, i) => `<rect x="${i * 100 + 10}" y="70" width="80" height="230" fill="#fff" opacity=".03"/>`).join('')}`);
  await writePng(`${dir}/images/stage/speaker.png`, 260, 360, `<rect x="10" y="10" width="240" height="340" rx="20" fill="#16112b" stroke="#ff3fa4" stroke-width="6"/><circle cx="130" cy="110" r="60" fill="#2c2350"/><circle cx="130" cy="110" r="24" fill="#5b8cff"/><circle cx="130" cy="250" r="80" fill="#2c2350"/><circle cx="130" cy="250" r="32" fill="#5b8cff"/>`);
  await writePng(`${dir}/images/stage/lights.png`, 1600, 400, `<ellipse cx="300" cy="380" rx="360" ry="120" fill="#ff3fa4" opacity=".25" filter="url(#soft)"/><ellipse cx="1300" cy="380" rx="360" ry="120" fill="#5b8cff" opacity=".25" filter="url(#soft)"/>`);
  return {
    zoom: 0.85, bgColor: '#120a2e',
    props: [
      { name: 'sky', image: 'images/stage/sky', x: -650, y: -260, scale: 1.7, scroll: 0.15, z: 0 },
      { name: 'city', image: 'images/stage/city', x: -700, y: 220, scale: 1.6, scroll: 0.45, z: 1 },
      { name: 'floor', image: 'images/stage/floor', x: -700, y: 760, scale: 2, scroll: 1, z: 2 },
      { name: 'speakerL', image: 'images/stage/speaker', x: -150, y: 520, scale: 1, scroll: 1, z: 3 },
      { name: 'speakerR', image: 'images/stage/speaker', x: 1420, y: 520, scale: 1, scroll: 1, z: 3 },
      { name: 'lights', image: 'images/stage/lights', x: -800, y: 760, scale: 2, scroll: 1.25, z: 2000, lowQuality: true, alpha: 0.9 },
    ],
    chars: { bf: { x: 1010, y: 830, z: 300, cam: [-80, -40] }, dad: { x: 360, y: 830, z: 200, cam: [80, -40] }, gf: { x: 690, y: 780, z: 100, cam: [0, -60] } },
  };
}

async function stageNeon(dir) {
  await writePng(`${dir}/images/neon/sky.png`, 1600, 900, `<linearGradient id="ng" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#05131f"/><stop offset=".7" stop-color="#0f3b4f"/><stop offset="1" stop-color="#ff5fa2"/></linearGradient><rect width="1600" height="900" fill="url(#ng)"/>${starfield(1600, 900, 90, 3)}`);
  // edificios con letreros que parpadean: 2 frames (atlas Sparrow)
  const bld = (on) => `${skyline(1600, 560, '#0a2233', 21, '#5cf7ff', 0.25)}
    <rect x="240" y="180" width="220" height="60" rx="10" fill="none" stroke="${on ? '#ff3fa4' : '#4a1636'}" stroke-width="8" ${on ? 'filter="url(#glow)"' : ''}/><text x="350" y="224" font-family="Poppins" font-weight="800" font-size="34" text-anchor="middle" fill="${on ? '#ff8ccf' : '#3b1430'}">RITMO</text>
    <rect x="1080" y="140" width="260" height="60" rx="10" fill="none" stroke="${on ? '#5cf7ff' : '#163a46'}" stroke-width="8" ${on ? 'filter="url(#glow)"' : ''}/><text x="1210" y="184" font-family="Poppins" font-weight="800" font-size="34" text-anchor="middle" fill="${on ? '#b5fbff' : '#12323c'}">24 H</text>`;
  await writeAtlas(`${dir}/images/neon/buildings`, 1600, 560, [{ name: 'blink0000', svg: bld(true) }, { name: 'blink0001', svg: bld(true) }, { name: 'blink0002', svg: bld(false) }, { name: 'blink0003', svg: bld(true) }], { cols: 2 });
  await writePng(`${dir}/images/neon/street.png`, 1400, 300, `<rect y="30" width="1400" height="270" fill="#141a26"/><rect y="30" width="1400" height="10" fill="#5cf7ff"/>${Array.from({ length: 8 }, (_, i) => `<rect x="${i * 180 + 30}" y="150" width="100" height="12" fill="#ffd34d" opacity=".7"/>`).join('')}`);
  await writePng(`${dir}/images/neon/crowd.png`, 1600, 260, Array.from({ length: 22 }, (_, i) => `<circle cx="${i * 75 + 20}" cy="${120 + (i % 3) * 14}" r="34" fill="#050a12"/><rect x="${i * 75 - 18}" y="${150 + (i % 3) * 14}" width="76" height="140" rx="30" fill="#050a12"/>`).join(''));
  return {
    defaultZoom: 0.85, isPixelStage: false,
    boyfriend: [860, 450], girlfriend: [540, 400], opponent: [210, 450], hide_girlfriend: false,
    camera_boyfriend: [0, 50], camera_opponent: [-50, 50], camera_girlfriend: [0, 0], camera_speed: 1,
    objects: [
      { type: 'sprite', name: 'sky', image: 'neon/sky', x: -650, y: -260, scale: [1.7, 1.7], scroll: [0.1, 0.1], alpha: 1 },
      { type: 'animatedSprite', name: 'buildings', image: 'neon/buildings', x: -700, y: 160, scale: [1.6, 1.6], scroll: [0.4, 0.4], alpha: 1, animations: [{ anim: 'blink', name: 'blink', fps: 3, loop: true, indices: [], offsets: [0, 0] }], firstAnimation: 'blink' },
      { type: 'sprite', name: 'street', image: 'neon/street', x: -700, y: 770, scale: [2, 2], scroll: [1, 1], alpha: 1 },
      { type: 'boyfriend' }, { type: 'gf' }, { type: 'dad' },
      { type: 'sprite', name: 'crowd', image: 'neon/crowd', x: -500, y: 900, scale: [1.6, 1.6], scroll: [1.3, 1.3], alpha: 1, filters: 2 },
    ],
  };
}

async function stageHaunted(dir) {
  await writePng(`${dir}/images/haunted/sky.png`, 1600, 900, `<linearGradient id="hg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#05040d"/><stop offset="1" stop-color="#2b2350"/></linearGradient><rect width="1600" height="900" fill="url(#hg)"/>${starfield(1600, 900, 70, 9)}<circle cx="420" cy="220" r="110" fill="#e9f2ff"/><circle cx="460" cy="200" r="100" fill="#d4def5" opacity=".5"/>`);
  const tree = (x, h) => `<path d="M${x} 600 L${x + 10} ${600 - h} L${x + 22} 600 Z" fill="#0b0918"/><path d="M${x + 12} ${600 - h * 0.6} l60 -50 M${x + 10} ${600 - h * 0.4} l-50 -40 M${x + 14} ${600 - h * 0.8} l40 -40" stroke="#0b0918" stroke-width="8" stroke-linecap="round"/>`;
  await writePng(`${dir}/images/haunted/trees.png`, 1600, 600, [tree(80, 420), tree(330, 300), tree(900, 380), tree(1250, 460), tree(1480, 280)].join('') + `<rect y="560" width="1600" height="40" fill="#0b0918"/>`);
  const tomb = (x) => `<path d="M${x} 180 v-80 q40 -50 80 0 v80z" fill="#3b3a5c"/><rect x="${x + 30}" y="${120}" width="20" height="8" fill="#26254a"/>`;
  await writePng(`${dir}/images/haunted/ground.png`, 1400, 300, `<rect y="150" width="1400" height="150" fill="#1d1a33"/><rect y="150" width="1400" height="10" fill="#3d3570"/>${[60, 260, 1080, 1250].map(tomb).join('')}`);
  await writePng(`${dir}/images/haunted/fog.png`, 1600, 300, `<ellipse cx="400" cy="200" rx="500" ry="70" fill="#b9b3ff" opacity=".18" filter="url(#soft)"/><ellipse cx="1200" cy="180" rx="560" ry="80" fill="#b9b3ff" opacity=".16" filter="url(#soft)"/>`);
  return {
    version: '1.0.1', name: 'Cementerio', cameraZoom: 0.85,
    props: [
      { name: 'sky', assetPath: 'haunted/sky', position: [-650, -260], zIndex: 0, scale: [1.7, 1.7], scroll: [0.1, 0.1] },
      { name: 'trees', assetPath: 'haunted/trees', position: [-700, 120], zIndex: 10, scale: [1.6, 1.6], scroll: [0.5, 0.5] },
      { name: 'ground', assetPath: 'haunted/ground', position: [-700, 520], zIndex: 20, scale: [2, 2], scroll: [1, 1] },
      { name: 'fog', assetPath: 'haunted/fog', position: [-800, 640], zIndex: 2000, scale: [2, 2], scroll: [1.2, 1.2], alpha: 0.9 },
    ],
    characters: { bf: { position: [1010, 830], zIndex: 300, cameraOffsets: [-80, -40] }, dad: { position: [360, 830], zIndex: 200, cameraOffsets: [80, -40] }, gf: { position: [690, 780], zIndex: 100, cameraOffsets: [0, 0] } },
  };
}

// ================================================================ portadas
async function cover(out, title, subtitle, bg1, bg2, left, right) {
  const L = left.kind === 'boombox' ? boomboxFrame(left, 'danceLeft', 0) : charFrame({ ...left, facing: 'right' }, 'singRIGHT', 0);
  const R = charFrame({ ...right, facing: 'left' }, 'singLEFT', 0);
  await writePng(out, 640, 360, `<linearGradient id="cg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${bg1}"/><stop offset="1" stop-color="${bg2}"/></linearGradient>
    <rect width="640" height="360" fill="url(#cg)"/>${starfield(640, 360, 40, title.length)}
    <g transform="translate(10,40) scale(.82)">${L}</g><g transform="translate(386,40) scale(.82)">${R}</g>
    <rect y="250" width="640" height="110" fill="#000" opacity=".35"/>
    <text x="320" y="300" font-family="Poppins" font-weight="800" font-size="46" text-anchor="middle" fill="#fff" stroke="#1a0f33" stroke-width="8" paint-order="stroke">${title}</text>
    <text x="320" y="335" font-family="Poppins" font-weight="600" font-size="20" text-anchor="middle" fill="#e6dcff">${subtitle}</text>`);
}

// ================================================================ escritores de chart por formato
function fnfwebChart(score, diff, opts) {
  const tm = tempo(score.spec);
  const notes = chartNotes(score, diff, opts);
  const events = score.sections.map((s) => ({ t: Math.round(tm.toMs(s.beat)), name: 'camFocus', v: { target: s.who === 'player' ? 'bf' : 'dad' } }));
  for (const s of score.sections.slice(-2)) for (let b = 0; b < s.beats; b += 2) events.push({ t: Math.round(tm.toMs(s.beat + b)), name: 'camZoom', v: { add: 0.02, hud: 0.03 } });
  if (opts?.flashAt) events.push({ t: Math.round(tm.toMs(opts.flashAt * 4)), name: 'flash', v: { color: '#ffffff', dur: 600 } });
  const last = score.sections[score.sections.length - 1];
  events.push({ t: Math.round(tm.toMs(last.beat + last.beats)), name: 'hey', v: { target: 'both' } });
  events.sort((a, b) => a.t - b.t);
  return {
    songName: opts.name, bpm: score.spec.bpm, scrollSpeed: { easy: 1.6, normal: 2.0, hard: 2.4 }[diff],
    notes: notes.map((n) => [n.t, n.lane, n.len, n.player ? 1 : 0, ...(n.kind ? [n.kind] : [])]),
    events, player: opts.player, opponent: opts.opponent, gf: opts.gf, stage: opts.stage,
  };
}

function psychChart(score, diff, opts) {
  const tm = tempo(score.spec);
  const notes = chartNotes(score, diff, opts);
  const sections = [];
  const bpmAtBar = (bar) => { let b = score.spec.bpm; for (const c of score.spec.bpmChanges ?? []) if (bar >= c.bar) b = c.bpm; return b; };
  for (let bar = 0; bar < score.totalBars; bar++) {
    const sec = score.sections.find((s) => bar * 4 >= s.beat && bar * 4 < s.beat + s.beats);
    const mustHit = sec ? sec.who === 'player' : false;
    const t0 = tm.toMs(bar * 4), t1 = tm.toMs(bar * 4 + 4);
    const sn = notes.filter((n) => n.t >= t0 - 0.5 && n.t < t1 - 0.5).map((n) => {
      const d = mustHit ? (n.player ? n.lane : n.lane + 4) : (n.player ? n.lane + 4 : n.lane);
      return n.kind ? [n.t, d, n.len, 'Hurt Note'] : [n.t, d, n.len];
    });
    const s = { sectionNotes: sn, sectionBeats: 4, mustHitSection: mustHit, gfSection: false, altAnim: false };
    const bpm = bpmAtBar(bar);
    if (bar > 0 && bpm !== bpmAtBar(bar - 1)) { s.changeBPM = true; s.bpm = bpm; }
    sections.push(s);
  }
  return { song: { song: opts.name, notes: sections, events: [], bpm: score.spec.bpm, needsVoices: true, speed: { easy: 1.8, normal: 2.2, hard: 2.6 }[diff], player1: opts.player, player2: opts.opponent, gfVersion: opts.gf, stage: opts.stage, validScore: true } };
}

function vsliceFiles(score, diffs, opts) {
  const tm = tempo(score.spec);
  const meta = {
    version: '2.2.4', songName: opts.name, artist: 'Funkade (demo original)', timeFormat: 'ms', divisions: 96, looped: false,
    timeChanges: [{ t: 0, b: 0, bpm: score.spec.bpm, n: 4, d: 4, bt: [4, 4, 4, 4] }],
    playData: { songVariations: [], difficulties: diffs, characters: { player: opts.player, girlfriend: opts.gf, opponent: opts.opponent }, stage: opts.stage, noteStyle: 'funkin', ratings: {} },
    generatedBy: 'Funkade tools/gen-mods.mjs',
  };
  const events = score.sections.map((s) => ({ t: Math.round(tm.toMs(s.beat)), e: 'FocusCamera', v: { char: s.who === 'player' ? 0 : 1 } }));
  for (const e of opts.extraEvents ?? []) events.push({ t: Math.round(tm.toMs(e.beat)), e: e.e, v: e.v });
  events.sort((a, b) => a.t - b.t);
  const notes = {}, scroll = {};
  for (const d of diffs) {
    notes[d] = chartNotes(score, d, opts).map((n) => ({ t: n.t, d: n.player ? n.lane : n.lane + 4, l: n.len, ...(n.kind ? { k: n.kind } : {}) }));
    scroll[d] = { easy: 1.7, normal: 2.1, hard: 2.5 }[d];
  }
  return { meta, chart: { version: '2.0.0', scrollSpeed: scroll, events, notes, generatedBy: 'Funkade' } };
}

function audio(dir, songId, score, mode) {
  const a = render(score);
  encode(`${dir}/songs/${songId}/Inst`, [a.L, a.R]);
  if (mode === 'both') {
    const mix = new Float32Array(a.vP.length);
    for (let i = 0; i < mix.length; i++) mix[i] = a.vP[i] + a.vO[i];
    encode(`${dir}/songs/${songId}/Voices`, [mix]);
  } else {
    encode(`${dir}/songs/${songId}/${mode.player}`, [a.vP]);
    encode(`${dir}/songs/${songId}/${mode.opponent}`, [a.vO]);
  }
  return a.durationMs;
}

// ================================================================ main
async function shared() {
  const dir = `${OUT}/shared`;
  rmSync(dir, { recursive: true, force: true });
  await notesAtlas(`${dir}/images/notes`);
  await uiAtlas(`${dir}/images/ui`);
  const face = { kind: 'human', facing: 'right', body: '#8a8aa0', hairStyle: 'none', skin: '#c9c9d6' };
  await iconPng(`${dir}/images/icons/icon-face.png`, face);
  const ph = { kind: 'human', facing: 'right', body: '#6d6d85', hairStyle: 'none', skin: '#b8b8c8', pants: '#3d3d50' };
  await characterAtlas(`${dir}/images/characters/placeholder`, ph, { player: true });
  json(`${dir}/characters/placeholder.json`, { image: 'images/characters/placeholder', scale: 1, flipX: false, anchor: 'feet', anims: charAnims(ph, true), healthColor: '#8a8aa0', icon: 'face', singDuration: 4, danceEvery: 2 });
  log('shared listo');
}

async function demoBase() {
  const dir = `${OUT}/mods/demo-base`;
  rmSync(dir, { recursive: true, force: true });
  const chars = { beat: true, rival: false, bocina: false };
  for (const [id, player] of Object.entries(chars)) {
    const anims = await makeChar(dir, id, player, `images/characters/${id}`);
    json(`${dir}/characters/${id}.json`, { image: `images/characters/${id}`, scale: 1, flipX: false, anchor: 'feet', anims, healthColor: CH[id].color, icon: id, singDuration: 4, danceEvery: CH[id].kind === 'boombox' ? 1 : 2, cameraOffset: [0, 0] });
  }
  json(`${dir}/stages/stage.json`, await stageDemo(dir));
  const songs = [
    { id: 'primer-paso', name: 'Primer Paso', spec: { bpm: 100, seed: 11, root: 57, intro: 2, phrases: 2, style: 'pop' } },
    { id: 'pulso', name: 'Pulso', spec: { bpm: 128, seed: 23, root: 55, intro: 2, phrases: 3, style: 'synth' }, flashAt: 10 },
  ];
  for (const s of songs) {
    const score = compose(s.spec);
    const ms = audio(dir, s.id, score, { player: 'Voices-player', opponent: 'Voices-opponent' });
    for (const d of ['easy', 'normal', 'hard']) json(`${dir}/charts/${s.id}/${d}.json`, fnfwebChart(score, d, { name: s.name, player: 'beat', opponent: 'rival', gf: 'bocina', stage: 'stage', flashAt: s.flashAt }));
    log(`demo-base/${s.id}: ${(ms / 1000).toFixed(1)} s, ${chartNotes(score, 'hard').length} notas (hard)`);
  }
  await cover(`${dir}/cover.webp`, 'Demo Base', 'El motor de Funkade en estado puro', '#2a1650', '#0f2a55', CH.rival, CH.beat);
  json(`${dir}/manifest.json`, {
    id: 'demo-base', name: 'Demo Base', version: '1.0.0', format: 'fnfweb', author: 'Funkade', license: 'CC0-1.0 (contenido original de demostración)',
    description: 'Canciones y personajes originales de demostración para probar el motor: notas, sostenidos, cámara y sincronización.',
    category: 'Oficial', cover: 'cover.webp', popularity: 100, compatibility: 'full',
    songs: songs.map((s) => ({ id: s.id, name: s.name, difficulties: ['easy', 'normal', 'hard'], bpm: s.spec.bpm })),
  });
}

async function modPsych() {
  const dir = `${OUT}/mods/circuito-neon`;
  rmSync(dir, { recursive: true, force: true });
  const chars = { nova: true, robo: false, 'robo-furia': false, altavoz: false };
  for (const [id, player] of Object.entries(chars)) {
    const anims = await makeChar(dir, id, player, `images/characters/${id}`);
    json(`${dir}/characters/${id}.json`, {
      animations: anims.map((a) => ({ anim: a.name, name: a.prefix, fps: a.fps, loop: a.loop, indices: [], offsets: [0, 0] })),
      no_antialiasing: false, image: `characters/${id}`, position: [0, 0], healthicon: id, flip_x: player, healthbar_colors: rgb(CH[id].color),
      camera_position: [0, 0], sing_duration: 4, scale: 1,
    });
  }
  json(`${dir}/stages/neon-city.json`, await stageNeon(dir));
  const songs = [
    { id: 'circuito', name: 'Circuito', spec: { bpm: 150, seed: 31, root: 52, intro: 2, phrases: 3, style: 'synth' } },
    { id: 'engranaje', name: 'Engranaje', spec: { bpm: 120, seed: 47, root: 57, intro: 2, phrases: 3, style: 'pop', bpmChanges: [{ bar: 18, bpm: 140 }] } },
  ];
  for (const s of songs) {
    const score = compose(s.spec);
    const ms = audio(dir, s.id, score, 'both');
    const opts = { name: s.name, player: 'nova', opponent: 'robo', gf: 'altavoz', stage: 'neon-city' };
    json(`${dir}/data/${s.id}/${s.id}-easy.json`, psychChart(score, 'easy', opts));
    json(`${dir}/data/${s.id}/${s.id}.json`, psychChart(score, 'normal', opts));
    json(`${dir}/data/${s.id}/${s.id}-hard.json`, psychChart(score, 'hard', opts));
    const tm = tempo(s.spec);
    const ev = [];
    if (s.id === 'engranaje') {
      ev.push([Math.round(tm.toMs(18 * 4)), [['Change Character', 'dad', 'robo-furia'], ['Screen Shake', '0.4, 0.012', '0.2, 0.006']]]);
      ev.push([Math.round(tm.toMs(18 * 4 + 1)), [['Play Animation', 'hey', 'bf']]]);
      for (let b = 18 * 4; b < 26 * 4; b += 4) ev.push([Math.round(tm.toMs(b)), [['Add Camera Zoom', '0.03', '0.04']]]);
      ev.push([Math.round(tm.toMs(26 * 4)), [['Change Character', 'dad', 'robo']]]);
    } else {
      for (let b = 18 * 4; b < 26 * 4; b += 2) ev.push([Math.round(tm.toMs(b)), [['Add Camera Zoom', '0.015', '0.03']]]);
    }
    const lastBeat = (score.totalBars - 2) * 4;
    ev.push([Math.round(tm.toMs(lastBeat)), [['Hey!', '', '0.8']]]);
    json(`${dir}/data/${s.id}/events.json`, { song: { events: ev, notes: [] } });
    log(`circuito-neon/${s.id}: ${(ms / 1000).toFixed(1)} s`);
  }
  await cover(`${dir}/cover.webp`, 'Circuito Neón', 'Mod en formato Psych Engine', '#04202e', '#5a1546', CH.robo, CH.nova);
  json(`${dir}/manifest.json`, {
    id: 'circuito-neon', name: 'Circuito Neón', version: '1.0.0', format: 'psych', author: 'Funkade', license: 'CC0-1.0 (contenido original de demostración)',
    description: 'Mod de prueba con estructura de Psych Engine: personajes JSON, escenario con objetos animados, cambio de BPM y eventos (Change Character, Add Camera Zoom, Hey!).',
    category: 'Demostración', cover: 'cover.webp', popularity: 80, compatibility: 'full',
    songs: songs.map((s) => ({ id: s.id, name: s.name, difficulties: ['easy', 'normal', 'hard'], bpm: s.spec.bpm })),
  });
}

async function modVslice() {
  const dir = `${OUT}/mods/noche-espectral`;
  rmSync(dir, { recursive: true, force: true });
  const chars = { luz: true, espectro: false, farol: false };
  for (const [id, player] of Object.entries(chars)) {
    const anims = await makeChar(dir, id, player, `images/characters/${id}`);
    json(`${dir}/data/characters/${id}.json`, {
      version: '1.0.0', name: id, renderType: 'sparrow', assetPath: `characters/${id}`, scale: 1, offsets: [0, 0], cameraOffsets: [0, 0],
      flipX: false, singTime: 8, danceEvery: CH[id].kind === 'boombox' ? 1 : 2, healthIcon: { id }, healthBarColor: CH[id].color,
      animations: anims.map((a) => ({ name: a.name, prefix: a.prefix, frameRate: a.fps, looped: a.loop, offsets: [0, 0] })),
    });
  }
  json(`${dir}/data/stages/haunted.json`, await stageHaunted(dir));
  // sprites para el script (murciélago animado y chispa)
  const bat = (i) => `<g transform="translate(60,40)"><ellipse cx="0" cy="0" rx="14" ry="11" fill="#140f24"/><path d="M-10 -2 Q-40 ${-26 + i * 18} -58 ${-4 + i * 10} Q-40 6 -10 6Z" fill="#140f24"/><path d="M10 -2 Q40 ${-26 + i * 18} 58 ${-4 + i * 10} Q40 6 10 6Z" fill="#140f24"/><circle cx="-5" cy="-3" r="2.5" fill="#ff5a6a"/><circle cx="5" cy="-3" r="2.5" fill="#ff5a6a"/></g>`;
  await writeAtlas(`${dir}/images/fx/bat`, 120, 80, [0, 1, 2, 1].map((k, i) => ({ name: `bat${String(i).padStart(4, '0')}`, svg: bat(k) })));
  await writePng(`${dir}/images/fx/spark.png`, 48, 48, `<circle cx="24" cy="24" r="16" fill="#ffe9a8" filter="url(#glow)"/><circle cx="24" cy="24" r="7" fill="#fff"/>`);
  await writePng(`${dir}/images/fx/glow.png`, 400, 400, `<circle cx="200" cy="200" r="150" fill="#bfd6ff" opacity=".35" filter="url(#soft)"/>`);
  const songs = [
    { id: 'espectro', name: 'Espectro', spec: { bpm: 140, seed: 59, root: 50, intro: 2, phrases: 3, style: 'dark' }, hurt: true },
    { id: 'tormenta', name: 'Tormenta (prueba de estrés)', spec: { bpm: 180, seed: 67, root: 52, intro: 2, phrases: 4, style: 'stress' }, hurt: false },
  ];
  for (const s of songs) {
    const score = compose(s.spec);
    const ms = audio(dir, s.id, score, { player: 'Voices-luz', opponent: 'Voices-espectro' });
    const extraEvents = s.id === 'espectro'
      ? [{ beat: 24, e: 'ZoomCamera', v: { zoom: 1.1, duration: 8, ease: 'expoOut', mode: 'direct' } }, { beat: 40, e: 'ZoomCamera', v: { zoom: 0.85, duration: 16, ease: 'sineInOut', mode: 'direct' } },
         { beat: 40, e: 'SetCameraBop', v: { rate: 1, intensity: 1 } }, { beat: 72, e: 'SetCameraBop', v: { rate: 4, intensity: 1 } }, { beat: 56, e: 'ScrollSpeed', v: { scroll: 1.25, duration: 8 } },
         { beat: 88, e: 'ScrollSpeed', v: { scroll: 1, duration: 4 } }, { beat: (score.totalBars - 2) * 4, e: 'PlayAnimation', v: { target: 'bf', anim: 'hey', force: true } }]
      : [{ beat: 8, e: 'SetCameraBop', v: { rate: 1, intensity: 1.2 } }];
    const f = vsliceFiles(score, ['easy', 'normal', 'hard'], { name: s.name, player: 'luz', opponent: 'espectro', gf: 'farol', stage: 'haunted', hurt: s.hurt, extraEvents });
    json(`${dir}/data/songs/${s.id}/${s.id}-metadata.json`, f.meta);
    json(`${dir}/data/songs/${s.id}/${s.id}-chart.json`, f.chart);
    log(`noche-espectral/${s.id}: ${(ms / 1000).toFixed(1)} s, ${f.chart.notes.hard.length} notas (hard)`);
  }
  mkdirSync(`${dir}/scripts`, { recursive: true });
  writeFileSync(`${dir}/scripts/efectos.js`, SCRIPT);
  await cover(`${dir}/cover.webp`, 'Noche Espectral', 'Formato V-Slice · notas dañinas · scripts', '#0b0820', '#3b2370', CH.espectro, CH.luz);
  json(`${dir}/manifest.json`, {
    id: 'noche-espectral', name: 'Noche Espectral', version: '1.0.0', format: 'vslice', author: 'Funkade', license: 'CC0-1.0 (contenido original de demostración)',
    description: 'Mecánicas extra: notas dañinas, zoom y velocidad de scroll por eventos, y un script aislado que añade murciélagos, destellos y partículas. Incluye una canción de estrés.',
    category: 'Demostración', cover: 'cover.webp', popularity: 90, compatibility: 'full',
    songs: songs.map((s) => ({ id: s.id, name: s.name, difficulties: ['easy', 'normal', 'hard'], bpm: s.spec.bpm })),
    scripts: ['scripts/efectos.js'],
    permissions: ['camera', 'sprites', 'characters'],
    scriptImages: ['images/fx/bat', 'images/fx/spark', 'images/fx/glow'],
    compatNotes: ['El script se ejecuta en un sandbox sin acceso a red ni a tus datos.'],
  });
}

const SCRIPT = `// Script de ejemplo de Funkade. Se ejecuta en un sandbox aislado (iframe con origen opaco + Worker).
// Solo puede usar el objeto "game" y los permisos declarados en manifest.json.
let bats = 0, sparks = 0;

function onCreate() {
  game.addSprite('moonGlow', 'images/fx/glow', -190, -110, { scroll: 0.1, alpha: 0.5, z: 5, scale: 1 });
  game.log('efectos.js cargado para', game.song);
}

function spawnBat() {
  const name = 'bat' + (bats++ % 24);
  const y = 80 + Math.random() * 320;
  game.removeSprite(name);
  game.addSprite(name, 'images/fx/bat', -300, y, { anim: 'bat', fps: 14, z: 150, scale: 0.7 + Math.random() * 0.5, scroll: 0.7 });
  game.tween(name, 'x', 1900, 3500 + Math.random() * 2000, 'linear');
  game.tween(name, 'y', y - 120 + Math.random() * 240, 4000, 'sineInOut');
}

function spawnSpark() {
  // usado por la canción de estrés: hasta 200 partículas vivas a la vez
  const name = 'spark' + (sparks++ % 200);
  const x = -300 + Math.random() * 1900;
  game.removeSprite(name);
  game.addSprite(name, 'images/fx/spark', x, 1000, { z: 1500, scale: 0.6 + Math.random(), alpha: 0.9 });
  game.tween(name, 'y', -100 - Math.random() * 300, 1500 + Math.random() * 1500, 'quadOut');
  game.tween(name, 'alpha', 0, 2600, 'linear');
}

function onBeatHit(beat) {
  if (game.song === 'tormenta') {
    if (beat % 16 === 0 && beat > 0) game.flash('#ffffff', 250);
    return;
  }
  if (beat > 0 && beat % 2 === 0) spawnBat();
  if (beat >= 24 && beat % 16 === 0) game.flash('#b9a8ff', 400);
}

function onStepHit(step) {
  if (game.song === 'tormenta' && step > 0) { spawnSpark(); spawnSpark(); spawnSpark(); }
}

function onNoteMiss(lane) {
  game.shake(0.005, 140, 'hud');
}

function onOpponentNoteHit(lane, kind) {
  if (game.song === 'espectro' && Math.random() < 0.08) game.cameraZoom(0.02, 0.02);
}
`;

const which = process.argv[2];
const t0 = Date.now();
if (!which || which === 'shared') await shared();
if (!which || which === 'demo') await demoBase();
if (!which || which === 'psych') await modPsych();
if (!which || which === 'vslice') await modVslice();
console.log(`Generación completa en ${((Date.now() - t0) / 1000).toFixed(1)} s`);
