// Script de ejemplo de Funkade. Se ejecuta en un sandbox aislado (iframe con origen opaco + Worker).
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
