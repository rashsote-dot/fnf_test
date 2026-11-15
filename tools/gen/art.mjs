// Generador de arte ORIGINAL (vectorial → PNG + atlas Sparrow XML) para los mods de demostración.
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
const require = createRequire(import.meta.url);
let sharp;
try { sharp = require('sharp'); } catch { sharp = require('/opt/npm-tools/node_modules/sharp'); }

export const CW = 300, CH = 380; // celda de personaje

// ---------------------------------------------------------------- atlas
export async function writeAtlas(outNoExt, cellW, cellH, frames, { cols } = {}) {
  const pad = 2;
  const n = frames.length;
  const c = cols ?? Math.max(1, Math.min(n, Math.floor(4096 / (cellW + pad))));
  const rows = Math.ceil(n / c);
  const W = c * (cellW + pad), H = rows * (cellH + pad);
  let body = '';
  let xml = `<?xml version="1.0" encoding="utf-8"?>\n<TextureAtlas imagePath="${outNoExt.split('/').pop()}.png">\n`;
  frames.forEach((f, i) => {
    const x = (i % c) * (cellW + pad), y = Math.floor(i / c) * (cellH + pad);
    body += `<g transform="translate(${x},${y})"><svg width="${cellW}" height="${cellH}" viewBox="0 0 ${cellW} ${cellH}" overflow="hidden">${f.svg}</svg></g>`;
    xml += `\t<SubTexture name="${f.name}" x="${x}" y="${y}" width="${cellW}" height="${cellH}"/>\n`;
  });
  xml += '</TextureAtlas>\n';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${DEFS}${body}</svg>`;
  mkdirSync(dirname(outNoExt), { recursive: true });
  await sharp(Buffer.from(svg)).png({ compressionLevel: 9, palette: false }).toFile(outNoExt + '.png');
  writeFileSync(outNoExt + '.xml', xml);
}

export async function writePng(out, w, h, inner, opts = {}) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${DEFS}${inner}</svg>`;
  mkdirSync(dirname(out), { recursive: true });
  let img = sharp(Buffer.from(svg));
  if (out.endsWith('.webp')) await img.webp({ quality: opts.quality ?? 80 }).toFile(out);
  else await img.png({ compressionLevel: 9 }).toFile(out);
}

const DEFS = `<defs>
<filter id="desat"><feColorMatrix type="matrix" values="0.45 0.35 0.2 0 0.05  0.3 0.4 0.3 0 0.05  0.35 0.35 0.55 0 0.18  0 0 0 1 0"/></filter>
<filter id="glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="6" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
<filter id="soft"><feGaussianBlur stdDeviation="18"/></filter>
<radialGradient id="vign" cx="50%" cy="50%" r="70%"><stop offset="60%" stop-color="#000" stop-opacity="0"/><stop offset="100%" stop-color="#000" stop-opacity=".55"/></radialGradient>
</defs>`;

// ---------------------------------------------------------------- utilidades de color
export function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v) => Math.max(0, Math.min(255, Math.round(k < 0 ? v * (1 + k) : v + (255 - v) * k)));
  return '#' + [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(f).map((v) => v.toString(16).padStart(2, '0')).join('');
}
export function rgb(hex) { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }

// ---------------------------------------------------------------- poses
const POSES = {
  idle: (i) => ({ dx: 0, dy: [0, 2, 5, 2][i % 4], rot: 0, sy: 1, hand: 'idle', mouth: 'smile', look: 0 }),
  singLEFT: (i) => ({ dx: -18 + i * 4, dy: 2, rot: -5, sy: 1, hand: 'left', mouth: 'open', look: -1 }),
  singRIGHT: (i) => ({ dx: 18 - i * 4, dy: 2, rot: 5, sy: 1, hand: 'right', mouth: 'open', look: 1 }),
  singUP: (i) => ({ dx: 0, dy: -16 + i * 5, rot: 0, sy: 1.04, hand: 'up', mouth: 'open', look: 0, up: true }),
  singDOWN: (i) => ({ dx: 0, dy: 16 - i * 4, rot: 0, sy: 0.95, hand: 'down', mouth: 'open', look: 0, down: true }),
  hey: (i) => ({ dx: 0, dy: -6 + i * 3, rot: 0, sy: 1.02, hand: 'hey', mouth: 'grin', look: 0 }),
};

/** posición de la mano con micro en espacio de pantalla */
function handPos(hand, f) {
  switch (hand) {
    case 'left': return [52, 196];
    case 'right': return [248, 196];
    case 'up': return [150 + 72 * f, 58];
    case 'down': return [150 + 84 * f, 296];
    case 'hey': return [150 + 70 * f, 50];
    default: return [150 + 56 * f, 166];
  }
}

function mouth(type, cx, cy, s = 1) {
  switch (type) {
    case 'open': return `<ellipse cx="${cx}" cy="${cy + 2}" rx="${10 * s}" ry="${13 * s}" fill="#3a0d1d"/><ellipse cx="${cx}" cy="${cy + 9}" rx="${6 * s}" ry="${4 * s}" fill="#ff6b8a"/>`;
    case 'frown': return `<path d="M${cx - 12} ${cy + 8} Q${cx} ${cy - 4} ${cx + 12} ${cy + 8}" stroke="#3a0d1d" stroke-width="4" fill="none" stroke-linecap="round"/>`;
    case 'grin': return `<path d="M${cx - 15} ${cy - 2} Q${cx} ${cy + 20} ${cx + 15} ${cy - 2} Z" fill="#3a0d1d"/><path d="M${cx - 11} ${cy} L${cx + 11} ${cy}" stroke="#fff" stroke-width="4"/>`;
    default: return `<path d="M${cx - 12} ${cy} Q${cx} ${cy + 12} ${cx + 12} ${cy}" stroke="#3a0d1d" stroke-width="4" fill="none" stroke-linecap="round"/>`;
  }
}

function eyes(spec, cx, cy, look, miss) {
  const lx = look * 3 + 3;
  if (spec.kind === 'robot') {
    const col = miss ? '#7d8bff' : spec.eye ?? '#5cf7ff';
    return `<rect x="${cx - 34}" y="${cy - 14}" width="68" height="26" rx="12" fill="#101421"/>
      <rect x="${cx - 26 + lx}" y="${cy - 7}" width="16" height="12" rx="5" fill="${col}" filter="url(#glow)"/>
      <rect x="${cx + 6 + lx}" y="${cy - 7}" width="16" height="12" rx="5" fill="${col}" filter="url(#glow)"/>`;
  }
  if (spec.kind === 'ghost') {
    return `<ellipse cx="${cx - 14 + lx}" cy="${cy}" rx="9" ry="14" fill="#1c1030"/><ellipse cx="${cx + 16 + lx}" cy="${cy}" rx="9" ry="14" fill="#1c1030"/>
      <circle cx="${cx - 11 + lx}" cy="${cy - 5}" r="3" fill="#fff"/><circle cx="${cx + 19 + lx}" cy="${cy - 5}" r="3" fill="#fff"/>`;
  }
  return `<ellipse cx="${cx - 13}" cy="${cy}" rx="9" ry="12" fill="#fff"/><ellipse cx="${cx + 14}" cy="${cy - 1}" rx="9" ry="12" fill="#fff"/>
    <circle cx="${cx - 13 + lx}" cy="${cy + 1}" r="5" fill="#1a1530"/><circle cx="${cx + 14 + lx}" cy="${cy}" r="5" fill="#1a1530"/>
    ${miss ? `<path d="M${cx + 34} ${cy - 18} q6 10 0 14 q-6 -4 0 -14z" fill="#8fd8ff"/>` : ''}`;
}

function hair(spec, cx, cy) {
  const hc = spec.hair ?? '#2b1d14';
  switch (spec.hairStyle) {
    case 'cap':
      return `<path d="M${cx - 58} ${cy - 10} Q${cx - 50} ${cy - 72} ${cx + 4} ${cy - 70} Q${cx + 52} ${cy - 66} ${cx + 58} ${cy - 16} Z" fill="${spec.cap ?? '#ff3fa4'}"/>
        <path d="M${cx + 30} ${cy - 22} Q${cx + 80} ${cy - 26} ${cx + 92} ${cy - 12} Q${cx + 60} ${cy - 6} ${cx + 30} ${cy - 10} Z" fill="${shade(spec.cap ?? '#ff3fa4', -0.25)}"/>
        <circle cx="${cx - 4}" cy="${cy - 68}" r="7" fill="${shade(spec.cap ?? '#ff3fa4', -0.2)}"/>`;
    case 'spiky': {
      let d = `M${cx - 60} ${cy - 4}`;
      const pts = [[-66, -40], [-44, -52], [-48, -86], [-18, -66], [-4, -100], [14, -66], [44, -88], [40, -52], [66, -48], [58, -14]];
      for (const [x, y] of pts) d += ` L${cx + x} ${cy + y}`;
      return `<path d="${d} Q${cx} ${cy - 50} ${cx - 60} ${cy - 4}Z" fill="${hc}"/>`;
    }
    case 'bun':
      return `<circle cx="${cx - 14}" cy="${cy - 72}" r="24" fill="${hc}"/><path d="M${cx - 60} ${cy} Q${cx - 62} ${cy - 66} ${cx} ${cy - 62} Q${cx + 58} ${cy - 60} ${cx + 60} ${cy - 10} Q${cx + 20} ${cy - 40} ${cx - 60} ${cy}Z" fill="${hc}"/>`;
    case 'antenna':
      return `<line x1="${cx}" y1="${cy - 58}" x2="${cx}" y2="${cy - 92}" stroke="#9aa3b5" stroke-width="5"/><circle cx="${cx}" cy="${cy - 96}" r="9" fill="${spec.eye ?? '#5cf7ff'}" filter="url(#glow)"/>`;
    case 'hood':
      return `<path d="M${cx - 70} ${cy + 30} Q${cx - 78} ${cy - 80} ${cx} ${cy - 78} Q${cx + 78} ${cy - 80} ${cx + 66} ${cy + 20} Q${cx + 40} ${cy - 50} ${cx} ${cy - 52} Q${cx - 44} ${cy - 50} ${cx - 70} ${cy + 30}Z" fill="${spec.body}"/>`;
    default: return '';
  }
}

/** Personaje humanoide/robot/fantasma. Dibujado mirando a la derecha y espejado si mira a la izquierda. */
export function charFrame(spec, poseName, i, miss = false) {
  const p = POSES[poseName](i);
  const f = spec.facing === 'left' ? -1 : 1;
  const [hxS, hyS] = handPos(p.hand, f);
  const toLocal = (x) => (f === 1 ? x : 300 - x);
  const hx = toLocal(hxS), hy = hyS;
  const look = f === 1 ? p.look : -p.look;
  const body = spec.body, dark = shade(body, -0.3);
  const skin = spec.skin ?? '#ffd9b3';
  const ghost = spec.kind === 'ghost', robot = spec.kind === 'robot';
  const floatY = ghost ? Math.sin((i / 4) * Math.PI * 2) * 6 : 0;
  let legs = '';
  if (!ghost) {
    const pants = spec.pants ?? '#2c2a4a';
    legs = `<rect x="118" y="282" width="27" height="82" rx="11" fill="${pants}"/><rect x="156" y="282" width="27" height="82" rx="11" fill="${pants}"/>
      <ellipse cx="136" cy="366" rx="22" ry="10" fill="${spec.shoe ?? '#1d1b2e'}"/><ellipse cx="174" cy="366" rx="22" ry="10" fill="${spec.shoe ?? '#1d1b2e'}"/>
      <rect x="120" y="356" width="34" height="6" fill="#fff" opacity=".6"/><rect x="158" y="356" width="34" height="6" fill="#fff" opacity=".6"/>`;
  }
  const backHand = p.hand === 'hey' ? [150 - 70 * f, 54] : [150 - 30 * f, 280];
  const bhx = toLocal(backHand[0]), bhy = backHand[1];
  const torso = ghost
    ? `<path d="M88 160 Q88 70 150 66 Q212 70 212 160 L212 330 Q196 312 182 334 Q166 312 150 336 Q134 312 118 334 Q104 312 88 330 Z" fill="${body}" opacity=".93"/>`
    : robot
      ? `<rect x="98" y="176" width="104" height="116" rx="18" fill="${body}"/><rect x="118" y="198" width="64" height="40" rx="8" fill="${dark}"/><circle cx="135" cy="218" r="6" fill="${spec.eye ?? '#5cf7ff'}"/><circle cx="165" cy="218" r="6" fill="#ffd34d"/>`
      : `<rect x="100" y="176" width="100" height="120" rx="34" fill="${body}"/><path d="M118 250 h64 v22 q-32 10 -64 0z" fill="${dark}" opacity=".55"/><rect x="146" y="180" width="8" height="70" fill="${dark}" opacity=".35"/>`;
  const head = ghost ? '' : robot
    ? `<rect x="92" y="60" width="116" height="112" rx="26" fill="${shade(body, 0.15)}"/><rect x="98" y="66" width="104" height="18" rx="9" fill="#fff" opacity=".18"/>`
    : `<circle cx="150" cy="122" r="60" fill="${skin}"/><circle cx="196" cy="132" r="10" fill="#ff8fa3" opacity=".45"/>`;
  const faceCx = ghost ? 158 : 168, faceCy = ghost ? 128 : robot ? 112 : 116;
  const mic = `<rect x="${hx - 5}" y="${hy - 2}" width="10" height="30" rx="4" fill="#2a2a38"/><circle cx="${hx}" cy="${hy - 6}" r="12" fill="#505064"/><circle cx="${hx - 4}" cy="${hy - 10}" r="4" fill="#9a9ab0"/>`;
  const armW = ghost ? 20 : 24;
  const upper = `
    <line x1="125" y1="206" x2="${bhx}" y2="${bhy}" stroke="${dark}" stroke-width="${armW - 2}" stroke-linecap="round"/>
    <circle cx="${bhx}" cy="${bhy}" r="12" fill="${ghost ? body : robot ? '#9aa3b5' : skin}"/>
    ${torso}${head}${hair(spec, 150, ghost ? 120 : 122)}
    ${eyes(spec, faceCx, faceCy, look, miss)}
    ${robot ? `<rect x="${faceCx - 14}" y="${faceCy + 26}" width="28" height="${p.mouth === 'open' ? 16 : 6}" rx="3" fill="#101421"/>` : mouth(miss ? 'frown' : p.mouth, faceCx + 6, ghost ? 160 : 148)}
    <line x1="178" y1="206" x2="${hx}" y2="${hy + 8}" stroke="${body}" stroke-width="${armW}" stroke-linecap="round"/>
    <line x1="178" y1="206" x2="${hx}" y2="${hy + 8}" stroke="#000" stroke-opacity=".12" stroke-width="${armW}" stroke-linecap="round"/>
    ${mic}
    <circle cx="${hx}" cy="${hy + 10}" r="13" fill="${ghost ? body : robot ? '#9aa3b5' : skin}"/>`;
  const shadow = `<ellipse cx="150" cy="368" rx="${ghost ? 50 : 74}" ry="${ghost ? 8 : 11}" fill="#000" opacity="${ghost ? 0.18 : 0.3}"/>`;
  const mirror = f === 1 ? '' : 'matrix(-1,0,0,1,300,0)';
  // la parte superior se desplaza en pantalla (dx), así que el espejo va dentro del grupo de pose
  const upperT = `translate(${p.dx},${p.dy + floatY}) rotate(${p.rot},150,300) translate(0,${300 * (1 - p.sy)}) scale(1,${p.sy})`;
  const inner = `${shadow}<g transform="${mirror}">${legs}</g><g transform="${upperT}"><g transform="${mirror}">${upper}</g></g>`;
  return miss ? `<g filter="url(#desat)">${inner}</g>` : inner;
}

/** Altavoz con cara (rol de "GF"): baila a izquierda y derecha. */
export function boomboxFrame(spec, anim, i) {
  const n = 6;
  const tilt = anim === 'danceLeft' ? -5 + (i / n) * 5 : anim === 'danceRight' ? 5 - (i / n) * 5 : 0;
  const bounce = anim === 'cheer' ? -14 + i * 7 : Math.abs(Math.sin((i / n) * Math.PI)) * -6;
  const pulse = 1 + (i < 2 ? 0.12 - i * 0.05 : 0);
  const col = spec.body, dark = shade(col, -0.35);
  const cone = (cx) => `<circle cx="${cx}" cy="250" r="${46}" fill="#1a1726"/><circle cx="${cx}" cy="250" r="${34 * pulse}" fill="#2c2840"/><circle cx="${cx}" cy="250" r="${13 * pulse}" fill="${spec.accent ?? '#5b8cff'}"/>`;
  const eyesS = anim === 'cheer'
    ? `<path d="M118 178 q10 -12 20 0" stroke="#fff" stroke-width="5" fill="none"/><path d="M162 178 q10 -12 20 0" stroke="#fff" stroke-width="5" fill="none"/>`
    : `<rect x="114" y="166" width="26" height="18" rx="9" fill="#fff"/><rect x="160" y="166" width="26" height="18" rx="9" fill="#fff"/><circle cx="${127 + tilt}" cy="175" r="5" fill="#111"/><circle cx="${173 + tilt}" cy="175" r="5" fill="#111"/>`;
  return `<ellipse cx="150" cy="370" rx="100" ry="10" fill="#000" opacity=".3"/>
    <g transform="translate(0,${bounce}) rotate(${tilt},150,360)">
      <rect x="128" y="330" width="14" height="34" rx="6" fill="${dark}"/><rect x="158" y="330" width="14" height="34" rx="6" fill="${dark}"/>
      <path d="M95 150 Q95 108 150 108 Q205 108 205 150" stroke="${dark}" stroke-width="12" fill="none"/>
      <rect x="40" y="140" width="220" height="196" rx="30" fill="${col}"/>
      <rect x="40" y="140" width="220" height="40" rx="20" fill="#fff" opacity=".12"/>
      <rect x="100" y="156" width="100" height="40" rx="14" fill="${dark}"/>
      ${eyesS}
      ${cone(96)}${cone(204)}
      <rect x="132" y="300" width="36" height="12" rx="6" fill="${spec.accent ?? '#5b8cff'}" opacity=".9"/>
    </g>`;
}

export async function characterAtlas(out, spec, { player = false } = {}) {
  const frames = [];
  if (spec.kind === 'boombox') {
    for (const a of ['danceLeft', 'danceRight']) for (let i = 0; i < 6; i++) frames.push({ name: `${a}${String(i).padStart(4, '0')}`, svg: boomboxFrame(spec, a, i) });
    for (let i = 0; i < 3; i++) frames.push({ name: `cheer${String(i).padStart(4, '0')}`, svg: boomboxFrame(spec, 'cheer', i) });
  } else {
    for (let i = 0; i < 4; i++) frames.push({ name: `idle${String(i).padStart(4, '0')}`, svg: charFrame(spec, 'idle', i) });
    for (const d of ['LEFT', 'DOWN', 'UP', 'RIGHT']) {
      for (let i = 0; i < 2; i++) frames.push({ name: `sing${d}${String(i).padStart(4, '0')}`, svg: charFrame(spec, 'sing' + d, i) });
      if (player) for (let i = 0; i < 2; i++) frames.push({ name: `miss${d}${String(i).padStart(4, '0')}`, svg: charFrame(spec, 'sing' + d, i, true) });
    }
    for (let i = 0; i < 2; i++) frames.push({ name: `hey${String(i).padStart(4, '0')}`, svg: charFrame(spec, 'hey', i) });
  }
  await writeAtlas(out, CW, CH, frames, { cols: 8 });
}

/** Lista de animaciones estándar (nombre interno → prefijo del atlas) */
export function charAnims(spec, player) {
  if (spec.kind === 'boombox') return [
    { name: 'danceLeft', prefix: 'danceLeft', fps: 24, loop: false },
    { name: 'danceRight', prefix: 'danceRight', fps: 24, loop: false },
    { name: 'cheer', prefix: 'cheer', fps: 18, loop: false },
  ];
  const a = [{ name: 'idle', prefix: 'idle', fps: 12, loop: false }];
  for (const d of ['LEFT', 'DOWN', 'UP', 'RIGHT']) {
    a.push({ name: 'sing' + d, prefix: 'sing' + d, fps: 18, loop: false });
    if (player) a.push({ name: `sing${d}miss`, prefix: 'miss' + d, fps: 18, loop: false });
  }
  a.push({ name: 'hey', prefix: 'hey', fps: 12, loop: false });
  return a;
}

export async function iconPng(out, spec) {
  // dos cuadros de 150x150: normal y perdiendo
  const head = (losing) => {
    const s = { ...spec, facing: 'right' };
    if (spec.kind === 'boombox') {
      return `<rect x="18" y="36" width="114" height="92" rx="20" fill="${spec.body}"/><rect x="44" y="48" width="62" height="22" rx="10" fill="${shade(spec.body, -0.35)}"/>
        <circle cx="48" cy="100" r="20" fill="#1a1726"/><circle cx="102" cy="100" r="20" fill="#1a1726"/>
        ${losing ? '<path d="M50 62 l10 4 M90 66 l10 -4" stroke="#fff" stroke-width="4"/>' : '<circle cx="62" cy="59" r="5" fill="#fff"/><circle cx="88" cy="59" r="5" fill="#fff"/>'}`;
    }
    const inner = charFrame(s, 'idle', 0, losing).replace(/<ellipse cx="150" cy="368"[^>]*\/>/, '');
    return `<g transform="translate(75,82) scale(.82) translate(-150,-122)">${inner}</g>`;
  };
  await writePng(out, 300, 150, `<svg x="0" y="0" width="150" height="150" viewBox="0 0 150 150" overflow="hidden">${head(false)}</svg><svg x="150" y="0" width="150" height="150" viewBox="0 0 150 150" overflow="hidden">${head(true)}</svg>`);
}

// ---------------------------------------------------------------- notas (skin común)
const NOTE_COLORS = { L: '#c24bff', D: '#00e5ff', U: '#2bff6b', R: '#ff3b5c' };
const ROT = { L: 0, D: -90, U: 90, R: 180 };
const ARROW = 'M30 80 L78 32 L78 58 L130 58 L130 102 L78 102 L78 128 Z';

export async function notesAtlas(out) {
  const frames = [];
  const cell = 160;
  const arrow = (d, fill, stroke, extra = '', scale = 1, glow = false) =>
    `<g transform="translate(80,80) scale(${scale}) rotate(${ROT[d]}) translate(-80,-80)">
      <path d="${ARROW}" fill="${fill}" stroke="${stroke}" stroke-width="10" stroke-linejoin="round" ${glow ? 'filter="url(#glow)"' : ''}/>
      <path d="${ARROW}" fill="none" stroke="#fff" stroke-opacity=".35" stroke-width="3" transform="translate(4,4) scale(.95)"/>${extra}</g>`;
  for (const d of ['L', 'D', 'U', 'R']) {
    const c = NOTE_COLORS[d];
    frames.push({ name: `static${d}0000`, svg: arrow(d, '#8794b8', '#2a2f45') });
    for (let i = 0; i < 2; i++) frames.push({ name: `press${d}${String(i).padStart(4, '0')}`, svg: arrow(d, shade(c, -0.45), '#1a1d2b', '', 0.9 - i * 0.03) });
    for (let i = 0; i < 3; i++) frames.push({ name: `confirm${d}${String(i).padStart(4, '0')}`, svg: arrow(d, shade(c, 0.35 - i * 0.12), '#ffffff', '', 1.08 - i * 0.04, true) });
    frames.push({ name: `note${d}0000`, svg: arrow(d, c, '#14121f') });
    frames.push({ name: `hurt${d}0000`, svg: arrow(d, '#3a0b12', '#ff2a3d', `<path d="M60 60 L100 100 M100 60 L60 100" stroke="#ff2a3d" stroke-width="12" stroke-linecap="round"/>`) });
    frames.push({ name: `hold${d}0000`, svg: `<rect x="56" y="0" width="48" height="160" fill="${c}"/><rect x="62" y="0" width="10" height="160" fill="#fff" opacity=".35"/>` });
    frames.push({ name: `holdEnd${d}0000`, svg: `<path d="M56 0 L104 0 L104 120 Q80 160 56 120 Z" fill="${c}"/><rect x="62" y="0" width="10" height="120" fill="#fff" opacity=".35"/>` });
  }
  await writeAtlas(out, cell, cell, frames, { cols: 12 });
}

export async function uiAtlas(out) {
  const W = 520, H = 200;
  const text = (t, fill, size = 96, stroke = '#160d2a') =>
    `<text x="${W / 2}" y="${H / 2 + size * 0.35}" font-family="Poppins, DejaVu Sans, sans-serif" font-weight="800" font-size="${size}" text-anchor="middle" fill="${fill}" stroke="${stroke}" stroke-width="14" paint-order="stroke" transform="rotate(-4 ${W / 2} ${H / 2})">${t}</text>`;
  const frames = [
    { name: 'sick0000', svg: text('¡GENIAL!', '#3ee8ff') },
    { name: 'good0000', svg: text('¡BIEN!', '#3ee08f') },
    { name: 'bad0000', svg: text('MAL', '#ffb84d') },
    { name: 'shit0000', svg: text('PÉSIMO', '#a0896e') },
    { name: 'ready0000', svg: text('¿LISTOS?', '#ffffff', 92) },
    { name: 'set0000', svg: text('¡PREPARADOS!', '#ffffff', 72) },
    { name: 'go0000', svg: text('¡YA!', '#ffd34d', 130) },
  ];
  await writeAtlas(out, W, H, frames, { cols: 4 });
}
