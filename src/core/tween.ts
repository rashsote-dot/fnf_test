export type EaseFn = (t: number) => number;

export const EASES: Record<string, EaseFn> = {
  linear: (t) => t,
  quadin: (t) => t * t,
  quadout: (t) => t * (2 - t),
  quadinout: (t) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t),
  cubein: (t) => t * t * t,
  cubeout: (t) => 1 - Math.pow(1 - t, 3),
  cubeinout: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  sinein: (t) => 1 - Math.cos((t * Math.PI) / 2),
  sineout: (t) => Math.sin((t * Math.PI) / 2),
  sineinout: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
  expoout: (t) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t)),
  elasticout: (t) => (t === 0 || t === 1 ? t : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1),
  backout: (t) => 1 + 2.70158 * Math.pow(t - 1, 3) + 1.70158 * Math.pow(t - 1, 2),
};

export function ease(name: string): EaseFn {
  return EASES[name.toLowerCase().replace(/[^a-z]/g, '')] ?? EASES.linear;
}

interface Tw { obj: Record<string, number>; prop: string; from: number; to: number; dur: number; t: number; fn: EaseFn }

export class Tweens {
  private list: Tw[] = [];
  to(obj: object, prop: string, to: number, durMs: number, easeName = 'linear') {
    const o = obj as Record<string, number>;
    // reemplaza tweens previos de la misma propiedad
    this.list = this.list.filter((t) => !(t.obj === o && t.prop === prop));
    if (durMs <= 0) { o[prop] = to; return; }
    this.list.push({ obj: o, prop, from: +o[prop] || 0, to, dur: durMs, t: 0, fn: ease(easeName) });
  }
  update(dtMs: number) {
    if (!this.list.length) return;
    let w = 0;
    for (let i = 0; i < this.list.length; i++) {
      const tw = this.list[i];
      tw.t += dtMs;
      const k = Math.min(1, tw.t / tw.dur);
      tw.obj[tw.prop] = tw.from + (tw.to - tw.from) * tw.fn(k);
      if (k < 1) this.list[w++] = tw;
    }
    this.list.length = w;
  }
  clear() { this.list = []; }
}
