// Port a JavaScript de los eventos Lua de Aura Funkin' (lyrics.lua, bop.lua, backgroundfade.lua,
// Image Fade In/Out.lua, Camera Set Target.lua, CamPosV2.lua y el contador de AURA.lua).
// Se ejecuta en el sandbox de Funkade: solo puede usar el objeto `game`.

const W = 1280, H = 720;
const LYRIC = { y: H / 2 + 120, size: 32, set: '#ffffff', sung: '#f2ff00', font: 'vcr' };
const CAMPOS = { bf: [690, 377.9], dad: [-300, 356.5], middle: [-200, 400], up: [50, -2432.1], rotnug: [-230, 450], nug: [970, 500] };
let bopOn = false, bopCam = 0.025, bopHud = 0.025;
let bgBlackVisible = false;
let lyricX = W / 2;

function onCreate() {
  game.addText('setlyric', '', W / 2, LYRIC.y, { size: LYRIC.size, color: LYRIC.set, font: LYRIC.font, bold: false, border: 2 });
  game.addText('sunglyric', '', W / 2, LYRIC.y, { size: LYRIC.size, color: LYRIC.sung, font: LYRIC.font, bold: false, border: 2, z: 3001 });
  // fondo negro por detrás de los personajes (backgroundfade)
  game.addSprite('bgblack', 'images/black', -1600, -1000, { scroll: 0, scale: 4, alpha: 0, z: 500 });
  // contador de AURA (sustituye a la barra de vida en el mod original)
  game.addText('leftAURA', 'AURA: 50', 40, 600, { size: 32, font: LYRIC.font, bold: false, border: 2 });
  game.addText('rightAURA', '50 :AURA', W - 40, 600, { size: 32, font: LYRIC.font, bold: false, border: 2, align: 'right' });
}

function updateAura() {
  let v = Math.floor(game.health * 50);
  v = Math.max(0, Math.min(100, v));
  game.setText('leftAURA', 'AURA: ' + (100 - v));
  game.setText('rightAURA', v + ' :AURA');
}
function onNoteHit() { updateAura(); }
function onNoteMiss() { updateAura(); }
function onOpponentNoteHit() { updateAura(); }

function onBeatHit() {
  if (bopOn) game.cameraZoom(bopCam, bopHud);
}

function seconds(v) { const n = parseFloat(String(v).split(',')[0]); return isFinite(n) ? n * 1000 : 0; }
function easeOf(v) { const p = String(v).split(','); return p[1] ? p[1].trim() : 'sineinout'; }

function onEvent(name, v1, v2) {
  switch (name) {
    case 'lyrics':
      if (v1 === 'setcolor') LYRIC.set = '#' + String(v2).replace('#', '');
      else if (v1 === 'sungcolor') LYRIC.sung = '#' + String(v2).replace('#', '');
      if (v1 === 'set' || v1 === '') {
        lyricX = W / 2 - v2.length * 11; // emula el centrado aproximado del script original
        game.addText('setlyric', v2, lyricX, LYRIC.y, { size: LYRIC.size, color: LYRIC.set, font: LYRIC.font, bold: false, border: 2 });
        game.addText('sunglyric', '', lyricX, LYRIC.y, { size: LYRIC.size, color: LYRIC.sung, font: LYRIC.font, bold: false, border: 2, z: 3001 });
      }
      if (v1 === 'sung') game.addText('sunglyric', v2, lyricX, LYRIC.y, { size: LYRIC.size, color: LYRIC.sung, font: LYRIC.font, bold: false, border: 2, z: 3001 });
      break;
    case 'bop':
      bopCam = v1 === '' ? 0.025 : parseFloat(v1);
      bopHud = v2 === '' ? 0.025 : parseFloat(v2);
      bopOn = !bopOn;
      break;
    case 'backgroundfade': {
      const ms = seconds(v2);
      bgBlackVisible = !bgBlackVisible;
      game.tween('bgblack', 'alpha', bgBlackVisible ? 1 : 0, ms, 'linear');
      break;
    }
    case 'Image Fade In':
      game.removeSprite('img_' + v1);
      game.addSprite('img_' + v1, 'images/' + v1, 0, 0, { hud: true, alpha: 0, z: 9000 });
      game.tween('img_' + v1, 'alpha', 1, seconds(v2), 'linear');
      break;
    case 'Image Fade Out':
      game.tween('img_' + v1, 'alpha', 0, seconds(v2), 'linear');
      break;
    case 'Camera Set Target': {
      const t = String(v1 || '').toLowerCase();
      game.focus(t === 'b' ? 'bf' : t === 'd' ? 'dad' : t === 'g' ? 'gf' : t === 'm' ? 'middle' : '');
      break;
    }
    case 'CamPosV2': {
      const key = String(v1).trim().toLowerCase();
      if (CAMPOS[key]) game.cameraPos(CAMPOS[key][0], CAMPOS[key][1]);
      else if (key.includes(',')) { const [x, y] = key.split(',').map(Number); game.cameraPos(x, y); }
      break;
    }
  }
}
