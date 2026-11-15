import type { InternalCharacter } from '../core/types';
import type { Atlas } from '../renderer/atlas';
import { Animator, Sprite } from '../renderer/sprite';

const SING = ['singLEFT', 'singDOWN', 'singUP', 'singRIGHT'];

export class Character extends Sprite {
  holdTimer = 0;
  danced = false;
  specialAnim = false; // 'hey' y similares: no se interrumpen con el baile
  baseW = 0; baseH = 0;
  danceSpeed = 1;
  stunned = false;

  constructor(public def: InternalCharacter, atlas: Atlas, public isPlayer: boolean) {
    super();
    const an = new Animator();
    for (const a of def.anims) an.addFromAtlas(atlas, a.name, a.prefix, a.fps, a.loop, a.indices, a.offset);
    this.anim = an;
    this.scaleX = this.scaleY = def.scale;
    this.flipX = def.flipX;
    const idle = an.has('danceLeft') ? 'danceLeft' : 'idle';
    an.play(idle, true);
    const f = an.current ?? atlas.frames[0];
    this.baseW = (f?.fw ?? 100) * def.scale;
    this.baseH = (f?.fh ?? 100) * def.scale;
    this.update(0);
  }

  /** coloca al personaje según el punto del escenario */
  place(x: number, y: number) {
    if (this.def.anchor === 'feet') {
      this.x = x - this.baseW / 2 + this.def.position[0];
      this.y = y - this.baseH + this.def.position[1];
    } else {
      this.x = x + this.def.position[0];
      this.y = y + this.def.position[1];
    }
  }

  midX() { return this.x + this.baseW / 2; }
  midY() { return this.y + this.baseH / 2; }

  sing(lane: number, miss: boolean, suffix = '') {
    const an = this.anim!;
    let name = SING[lane] + (miss ? 'miss' : '') + suffix;
    if (!an.has(name)) name = SING[lane] + (miss ? 'miss' : '');
    this.setColor('#ffffff');
    if (!an.has(name)) {
      if (!miss) return;
      name = SING[lane];
      this.setColor('#8080ff'); // sin animación de fallo: tinte azul, como hace Psych
    }
    an.play(name, true);
    this.holdTimer = 0;
    this.specialAnim = false;
  }

  playSpecial(name: string, force = true) {
    if (this.anim!.play(name, force)) { this.specialAnim = true; this.holdTimer = 0; this.setColor('#ffffff'); }
  }

  dance(beat: number) {
    const an = this.anim!;
    if (this.specialAnim && !an.finished) return;
    const n = an.name;
    if (n.startsWith('sing')) return; // aún cantando: updateHold vuelve al baile cuando expire
    if (beat % Math.max(1, Math.round(this.def.danceEvery * this.danceSpeed)) !== 0) return;
    this.specialAnim = false;
    this.setColor('#ffffff');
    if (an.has('danceLeft')) { this.danced = !this.danced; an.play(this.danced ? 'danceRight' : 'danceLeft', true); }
    else an.play('idle', true);
  }

  /** llamado cada frame; stepMs = duración de un paso (1/4 de beat) */
  updateHold(dtMs: number, stepMs: number, holdingKey: boolean) {
    const an = this.anim!;
    if (!an.name.startsWith('sing')) return;
    this.holdTimer += dtMs;
    // el jugador mantiene la pose mientras sostenga la tecla (como en el juego original)
    if (this.isPlayer && holdingKey) { this.holdTimer = 0; return; }
    if (this.holdTimer > stepMs * this.def.singDuration * 1.1) {
      this.holdTimer = 0;
      this.setColor('#ffffff');
      if (an.has('danceLeft')) an.play(this.danced ? 'danceRight' : 'danceLeft', true);
      else an.play('idle', true);
    }
  }
}
