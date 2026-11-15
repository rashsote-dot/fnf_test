// Bucle principal. Solo corre mientras hay una escena activa (en el catálogo no se dibuja nada).
import { Diag } from './diagnostics';
import { settings } from './settings';
import { createRenderer, type Renderer } from '../renderer/renderer';
import { VIEW_W } from '../renderer/sprite';

export interface Scene {
  update(now: number, dtMs: number): void;
  render(r: Renderer, px: number): void;
}

export class Engine {
  renderer: Renderer;
  scene: Scene | null = null;
  private raf = 0;
  private last = 0;
  private lastDrawn = 0;
  private ro: ResizeObserver;
  resScale = 1;
  private slowSince = 0;
  private fastSince = 0;
  onAutoQuality: ((scale: number) => void) | null = null;

  constructor(public canvas: HTMLCanvasElement) {
    this.renderer = createRenderer(canvas, settings.renderer);
    Diag.renderer = this.renderer.kind === 'webgl2' ? 'WebGL2 (batch)' : 'Canvas2D (respaldo)';
    this.applyQuality();
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(canvas);
  }

  applyQuality() {
    const q = settings.quality;
    this.resScale = q === 'low' ? 0.5 : q === 'medium' ? 0.75 : 1;
    this.resize();
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    if (!rect.width) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(320, Math.round(Math.min(rect.width * dpr, 2560) * this.resScale));
    const h = Math.round((w * 9) / 16);
    if (w !== this.renderer.width || h !== this.renderer.height) this.renderer.resize(w, h);
    Diag.resolutionScale = this.resScale;
  }

  get px() { return this.renderer.width / VIEW_W; }

  start(scene: Scene) {
    this.scene = scene;
    Diag.resetFrames();
    this.resize();
    if (!this.raf) { this.last = performance.now(); this.raf = requestAnimationFrame(this.frame); }
  }

  stop() {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  /** dibuja un frame sin avanzar el estado (útil al pausar) */
  redraw() {
    if (!this.scene) return;
    this.scene.render(this.renderer, this.px);
  }

  private frame = (now: number) => {
    this.raf = requestAnimationFrame(this.frame);
    const cap = settings.fpsCap;
    if (cap > 0 && now - this.lastDrawn < 1000 / cap - 1) return;
    this.lastDrawn = now;
    const dt = Math.min(100, now - this.last);
    this.last = now;
    const scene = this.scene;
    if (!scene) return;
    const t0 = performance.now();
    scene.update(now, dt);
    scene.render(this.renderer, this.px);
    const cpu = performance.now() - t0;
    Diag.pushFrame(dt, cpu);
    this.autoQuality(now, dt);
  };

  /** Calidad adaptativa: si los frames van lentos de forma sostenida, baja la resolución interna. */
  private autoQuality(now: number, dt: number) {
    if (settings.quality !== 'auto') return;
    const budget = 1000 / 55;
    if (dt > budget * 1.35) {
      this.fastSince = 0;
      if (!this.slowSince) this.slowSince = now;
      if (now - this.slowSince > 2500 && this.resScale > 0.5) {
        this.resScale = Math.max(0.5, this.resScale - 0.25);
        this.slowSince = 0;
        this.resize();
        Diag.warn(`Rendimiento bajo: resolución interna reducida al ${Math.round(this.resScale * 100)}%`);
        this.onAutoQuality?.(this.resScale);
      }
    } else {
      this.slowSince = 0;
      if (this.resScale < 1) {
        if (!this.fastSince) this.fastSince = now;
        if (now - this.fastSince > 15000 && dt < budget * 0.6) { this.resScale = Math.min(1, this.resScale + 0.25); this.fastSince = 0; this.resize(); }
      }
    }
  }

  destroy() { this.stop(); this.ro.disconnect(); this.renderer.destroy(); }
}
