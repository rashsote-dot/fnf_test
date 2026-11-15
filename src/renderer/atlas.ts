// Parser de atlas Sparrow v2 (XML de TexturePacker / Adobe Animate "Generate Sprite Sheet"),
// el formato de sprites más usado por FNF y sus motores. Implementado con regex para que también
// funcione dentro de Web Workers (donde no existe DOMParser).
import type { Frame, Texture } from './texture';

export interface RawFrame { name: string; x: number; y: number; w: number; h: number; fx: number; fy: number; fw: number; fh: number; rotated: boolean }

const TAG_RE = /<SubTexture\b([^>]*)\/?>/g;
const ATTR_RE = /([A-Za-z_:][\w:.-]*)\s*=\s*"([^"]*)"/g;

function decodeEntities(s: string) {
  return s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'");
}

export function parseSparrowXml(xml: string): RawFrame[] {
  const frames: RawFrame[] = [];
  let m: RegExpExecArray | null;
  TAG_RE.lastIndex = 0;
  while ((m = TAG_RE.exec(xml))) {
    const attrs: Record<string, string> = {};
    let a: RegExpExecArray | null;
    ATTR_RE.lastIndex = 0;
    while ((a = ATTR_RE.exec(m[1]))) attrs[a[1]] = a[2];
    const w = +attrs.width || 0, h = +attrs.height || 0;
    const rotated = attrs.rotated === 'true';
    frames.push({
      name: decodeEntities(attrs.name ?? ''),
      x: +attrs.x || 0, y: +attrs.y || 0, w, h,
      fx: +(attrs.frameX ?? 0) || 0, fy: +(attrs.frameY ?? 0) || 0,
      fw: attrs.frameWidth !== undefined ? +attrs.frameWidth : rotated ? h : w,
      fh: attrs.frameHeight !== undefined ? +attrs.frameHeight : rotated ? w : h,
      rotated,
    });
  }
  return frames;
}

export class Atlas {
  frames: Frame[] = [];
  /** factor para dibujar al tamaño original si la textura se reempaquetó a menor resolución (1 / escala) */
  texMul = 1;
  private byName = new Map<string, Frame>();
  private prefixCache = new Map<string, Frame[]>();

  constructor(public tex: Texture, raw: RawFrame[]) {
    for (const r of raw) {
      const f: Frame = { tex, name: r.name, x: r.x, y: r.y, w: r.w, h: r.h, ox: -r.fx, oy: -r.fy, fw: r.fw, fh: r.fh, rotated: r.rotated };
      this.frames.push(f);
      this.byName.set(r.name, f);
    }
  }

  get(name: string) { return this.byName.get(name); }

  /** Frames cuyo nombre empieza por el prefijo, ordenados por el número final (como Flixel). */
  byPrefix(prefix: string, indices?: number[]): Frame[] {
    const key = prefix + '|' + (indices ? indices.join(',') : '');
    const c = this.prefixCache.get(key);
    if (c) return c;
    // Igual que Flixel: addByPrefix acepta cualquier nombre que empiece por el prefijo, pero
    // addByIndices exige "prefijo + número" (así "GF Dancing Beat" no incluye "GF Dancing Beat Hair…").
    const strict = /^\d+(\.png)?$/;
    const list = this.frames.filter((f) => f.name.startsWith(prefix) && (!indices || strict.test(f.name.slice(prefix.length))));
    const numOf = (n: string) => { const mm = /(\d+)(?:\.png)?$/.exec(n); return mm ? parseInt(mm[1], 10) : 0; };
    list.sort((a, b) => numOf(a.name) - numOf(b.name));
    const out = indices ? indices.map((i) => list[i]).filter(Boolean) : list;
    this.prefixCache.set(key, out);
    return out;
  }
}
