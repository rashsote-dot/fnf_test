export type EaseFn = (t: number) => number;

const c1 = 1.70158, c3 = c1 + 1, c2 = c1 * 1.525;
const bounceOut: EaseFn = (t) => {
  const n1 = 7.5625, d1 = 2.75;
  if (t < 1 / d1) return n1 * t * t;
  if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
  if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
  return n1 * (t -= 2.625 / d1) * t + 0.984375;
};

/** Curvas de FlxEase (los nombres de Psych: 'quadOut', 'sineInOut', 'circIn', 'bounceOut'…) */
export const EASES: Record<string, EaseFn> = {
  linear: (t) => t,
  quadin: (t) => t * t, quadout: (t) => t * (2 - t), quadinout: (t) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t),
  cubein: (t) => t * t * t, cubeout: (t) => 1 - Math.pow(1 - t, 3), cubeinout: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  quartin: (t) => t ** 4, quartout: (t) => 1 - (1 - t) ** 4, quartinout: (t) => (t < 0.5 ? 8 * t ** 4 : 1 - (-2 * t + 2) ** 4 / 2),
  quintin: (t) => t ** 5, quintout: (t) => 1 - (1 - t) ** 5, quintinout: (t) => (t < 0.5 ? 16 * t ** 5 : 1 - (-2 * t + 2) ** 5 / 2),
  sinein: (t) => 1 - Math.cos((t * Math.PI) / 2), sineout: (t) => Math.sin((t * Math.PI) / 2), sineinout: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
  expoin: (t) => (t === 0 ? 0 : Math.pow(2, 10 * t - 10)), expoout: (t) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t)),
  expoinout: (t) => (t === 0 || t === 1 ? t : t < 0.5 ? Math.pow(2, 20 * t - 10) / 2 : (2 - Math.pow(2, -20 * t + 10)) / 2),
  circin: (t) => 1 - Math.sqrt(1 - t * t), circout: (t) => Math.sqrt(1 - (t - 1) ** 2),
  circinout: (t) => (t < 0.5 ? (1 - Math.sqrt(1 - (2 * t) ** 2)) / 2 : (Math.sqrt(1 - (-2 * t + 2) ** 2) + 1) / 2),
  backin: (t) => c3 * t * t * t - c1 * t * t, backout: (t) => 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2,
  backinout: (t) => (t < 0.5 ? ((2 * t) ** 2 * ((c2 + 1) * 2 * t - c2)) / 2 : ((2 * t - 2) ** 2 * ((c2 + 1) * (t * 2 - 2) + c2) + 2) / 2),
  elasticin: (t) => (t === 0 || t === 1 ? t : -Math.pow(2, 10 * t - 10) * Math.sin((t * 10 - 10.75) * ((2 * Math.PI) / 3))),
  elasticout: (t) => (t === 0 || t === 1 ? t : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1),
  elasticinout: (t) => (t === 0 || t === 1 ? t : t < 0.5 ? -(Math.pow(2, 20 * t - 10) * Math.sin((20 * t - 11.125) * ((2 * Math.PI) / 4.5))) / 2 : (Math.pow(2, -20 * t + 10) * Math.sin((20 * t - 11.125) * ((2 * Math.PI) / 4.5))) / 2 + 1),
  bouncein: (t) => 1 - bounceOut(1 - t), bounceout: bounceOut,
  bounceinout: (t) => (t < 0.5 ? (1 - bounceOut(1 - 2 * t)) / 2 : (1 + bounceOut(2 * t - 1)) / 2),
  smoothstepin: (t) => 2 * (t / 2) * (t / 2) * (3 - t), smoothstepout: (t) => t * t * (3 - 2 * t), smoothstepinout: (t) => t * t * (3 - 2 * t),
};

export function ease(name: string): EaseFn {
  return EASES[String(name ?? 'linear').toLowerCase().replace(/[^a-z]/g, '')] ?? EASES.linear;
}

interface Tw { obj: Record<string, number>; prop: string; from: number; to: number; dur: number; t: number; fn: EaseFn; tag?: string; done?: () => void; set?: (v: number) => void }

export class Tweens {
  private list: Tw[] = [];
  /** anima obj[prop] hacia "to". Si se indica set(), se usa en lugar de asignar la propiedad (p. ej. colores). */
  to(obj: object, prop: string, to: number, durMs: number, easeName = 'linear', opts: { tag?: string; done?: () => void; set?: (v: number) => void; from?: number } = {}) {
    const o = obj as Record<string, number>;
    if (opts.tag) this.cancel(opts.tag);
    // reemplaza tweens previos de la misma propiedad
    this.list = this.list.filter((t) => !(t.obj === o && t.prop === prop));
    if (durMs <= 0) { if (opts.set) opts.set(to); else o[prop] = to; opts.done?.(); return; }
    this.list.push({ obj: o, prop, from: opts.from ?? (+o[prop] || 0), to, dur: durMs, t: 0, fn: ease(easeName), tag: opts.tag, done: opts.done, set: opts.set });
  }
  cancel(tag: string) { this.list = this.list.filter((t) => t.tag !== tag); }
  has(tag: string) { return this.list.some((t) => t.tag === tag); }
  update(dtMs: number) {
    if (!this.list.length) return;
    const finished: Tw[] = [];
    let w = 0;
    const cur = this.list;
    for (let i = 0; i < cur.length; i++) {
      const tw = cur[i];
      tw.t += dtMs;
      const k = Math.min(1, tw.t / tw.dur);
      const v = tw.from + (tw.to - tw.from) * tw.fn(k);
      if (tw.set) tw.set(v); else tw.obj[tw.prop] = v;
      if (k < 1) cur[w++] = tw; else finished.push(tw);
    }
    cur.length = w;
    // las devoluciones de llamada pueden crear tweens nuevos: se ejecutan al final
    for (const tw of finished) tw.done?.();
  }
  clear() { this.list = []; }
}
