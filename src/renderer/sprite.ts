import type { Atlas } from './atlas';
import type { Renderer } from './renderer';
import type { Frame } from './texture';
import { parseColor } from './renderer';

export const VIEW_W = 1280;
export const VIEW_H = 720;

export interface AnimData { name: string; frames: Frame[]; fps: number; loop: boolean; offset: [number, number] }

export class Animator {
  anims = new Map<string, AnimData>();
  cur: AnimData | null = null;
  frame = 0;
  time = 0;
  finished = true;
  add(a: AnimData) { if (a.frames.length) this.anims.set(a.name, a); }
  addFromAtlas(atlas: Atlas, name: string, prefix: string, fps: number, loop: boolean, indices?: number[], offset: [number, number] = [0, 0]) {
    this.add({ name, frames: atlas.byPrefix(prefix, indices), fps, loop, offset });
  }
  has(n: string) { return this.anims.has(n); }
  play(n: string, force = false): boolean {
    const a = this.anims.get(n);
    if (!a) return false;
    if (!force && this.cur === a && !this.finished) return true;
    this.cur = a; this.frame = 0; this.time = 0; this.finished = false;
    return true;
  }
  update(dtMs: number) {
    const a = this.cur;
    if (!a || this.finished || a.fps <= 0) return;
    this.time += dtMs;
    const fd = 1000 / a.fps;
    while (this.time >= fd) {
      this.time -= fd;
      if (this.frame < a.frames.length - 1) this.frame++;
      else if (a.loop) this.frame = 0;
      else { this.finished = true; break; }
    }
  }
  get current(): Frame | null { return this.cur ? this.cur.frames[this.frame] ?? null : null; }
  get name() { return this.cur?.name ?? ''; }
}

export class Sprite {
  x = 0; y = 0;
  scaleX = 1; scaleY = 1;
  angle = 0;
  alpha = 1;
  visible = true;
  flipX = false;
  scrollX = 1; scrollY = 1;
  offsetX = 0; offsetY = 0;
  color = new Float32Array([1, 1, 1]);
  z = 0;
  frame: Frame | null = null;
  anim: Animator | null = null;
  name = '';
  hud = false;

  constructor(frame: Frame | null = null) { this.frame = frame; }

  setColor(hex: string) { parseColor(hex, this.color); return this; }

  get frameW() { const f = this.anim?.current ?? this.frame; return f ? f.fw : 0; }
  get frameH() { const f = this.anim?.current ?? this.frame; return f ? f.fh : 0; }

  update(dtMs: number) {
    if (this.anim) {
      this.anim.update(dtMs);
      const f = this.anim.current;
      if (f) this.frame = f;
      const o = this.anim.cur?.offset;
      if (o) { this.offsetX = o[0]; this.offsetY = o[1]; }
    }
  }
}

export class Camera {
  scrollX = 0; scrollY = 0;
  zoom = 1;
  shakeTime = 0; shakeIntensity = 0;
  shakeX = 0; shakeY = 0;
  flashAlpha = 0; flashDecay = 0;
  flashColor = new Float32Array([1, 1, 1]);
  alpha = 1;

  update(dtMs: number) {
    if (this.shakeTime > 0) {
      this.shakeTime -= dtMs;
      this.shakeX = (Math.random() * 2 - 1) * this.shakeIntensity * VIEW_W;
      this.shakeY = (Math.random() * 2 - 1) * this.shakeIntensity * VIEW_H;
    } else { this.shakeX = this.shakeY = 0; }
    if (this.flashAlpha > 0) this.flashAlpha = Math.max(0, this.flashAlpha - this.flashDecay * dtMs);
  }
  shake(intensity: number, durMs: number) { this.shakeIntensity = intensity; this.shakeTime = durMs; }
  flash(hex: string, durMs: number) { parseColor(hex, this.flashColor); this.flashAlpha = 1; this.flashDecay = 1 / Math.max(1, durMs); }
}

/** Dibuja un sprite. px = factor de escala entre la vista virtual (1280x720) y los píxeles del canvas. */
export function drawSprite(r: Renderer, s: Sprite, cam: Camera, px: number) {
  const f = s.frame;
  if (!f || !s.visible || s.alpha <= 0.001) return;
  const lw = f.rotated ? f.h : f.w;
  const lh = f.rotated ? f.w : f.h;
  const sx = s.scaleX, sy = s.scaleY;
  let lx = f.ox;
  if (s.flipX) lx = f.fw - (f.ox + lw);
  const ly = f.oy;
  const wx = s.x - s.offsetX - cam.scrollX * s.scrollX;
  const wy = s.y - s.offsetY - cam.scrollY * s.scrollY;
  let ax = lx * sx, ay = ly * sy, bx = (lx + lw) * sx, by = (ly + lh) * sy;
  // esquinas locales (TL, TR, BR, BL)
  let x0 = ax, y0 = ay, x1 = bx, y1 = ay, x2 = bx, y2 = by, x3 = ax, y3 = by;
  if (s.angle !== 0) {
    const cx = (f.fw * sx) / 2, cy = (f.fh * sy) / 2;
    const rad = (s.angle * Math.PI) / 180, c = Math.cos(rad), sn = Math.sin(rad);
    const rot = (x: number, y: number, i: number) => {
      const dx = x - cx, dy = y - cy;
      TMP[i] = cx + dx * c - dy * sn; TMP[i + 1] = cy + dx * sn + dy * c;
    };
    rot(x0, y0, 0); rot(x1, y1, 2); rot(x2, y2, 4); rot(x3, y3, 6);
    x0 = TMP[0]; y0 = TMP[1]; x1 = TMP[2]; y1 = TMP[3]; x2 = TMP[4]; y2 = TMP[5]; x3 = TMP[6]; y3 = TMP[7];
  }
  const z = cam.zoom * px;
  const hw = VIEW_W / 2, hh = VIEW_H / 2;
  const ox = (wx - hw) * z + hw * px + cam.shakeX * px;
  const oy = (wy - hh) * z + hh * px + cam.shakeY * px;
  x0 = x0 * z + ox; y0 = y0 * z + oy; x1 = x1 * z + ox; y1 = y1 * z + oy;
  x2 = x2 * z + ox; y2 = y2 * z + oy; x3 = x3 * z + ox; y3 = y3 * z + oy;
  // descarte de lo que queda fuera de pantalla
  const W = r.width, H = r.height;
  if (Math.max(x0, x1, x2, x3) < 0 || Math.min(x0, x1, x2, x3) > W || Math.max(y0, y1, y2, y3) < 0 || Math.min(y0, y1, y2, y3) > H) return;
  r.quad(f, x0, y0, x1, y1, x2, y2, x3, y3, s.color[0], s.color[1], s.color[2], s.alpha * cam.alpha, s.flipX);
}

const TMP = new Float32Array(8);

/** Rectángulo de color rápido (usa la textura blanca). */
export function drawRect(r: Renderer, x: number, y: number, w: number, h: number, rgb: ArrayLike<number>, a: number, px: number) {
  const f = WHITE_FRAMES.get(r.white.id) ?? (() => {
    const fr: Frame = { tex: r.white, name: 'w', x: 1, y: 1, w: 2, h: 2, ox: 0, oy: 0, fw: 2, fh: 2, rotated: false };
    WHITE_FRAMES.set(r.white.id, fr); return fr;
  })();
  const X0 = x * px, Y0 = y * px, X1 = (x + w) * px, Y1 = (y + h) * px;
  r.quad(f, X0, Y0, X1, Y0, X1, Y1, X0, Y1, rgb[0], rgb[1], rgb[2], a, false);
}
const WHITE_FRAMES = new Map<number, Frame>();

export function whiteFrame(r: Renderer): Frame {
  return { tex: r.white, name: 'w', x: 1, y: 1, w: 2, h: 2, ox: 0, oy: 0, fw: 2, fh: 2, rotated: false };
}
