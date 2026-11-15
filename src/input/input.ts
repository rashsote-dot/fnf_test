// Entrada de teclado. Cada pulsación se entrega con su event.timeStamp (instante real de la pulsación),
// de modo que el juicio no depende de cuándo se dibuje el siguiente frame.
import { settings } from '../core/settings';

export type LaneHandler = (lane: number, down: boolean, timeStamp: number) => void;

export class Input {
  private held = [new Set<string>(), new Set<string>(), new Set<string>(), new Set<string>()];
  private map = new Map<string, number>();
  onLane: LaneHandler | null = null;
  onKey: ((e: KeyboardEvent) => boolean | void) | null = null;

  constructor() {
    this.rebuild();
    window.addEventListener('keydown', this.down, { capture: true });
    window.addEventListener('keyup', this.up, { capture: true });
    window.addEventListener('blur', this.releaseAll);
  }

  rebuild() {
    this.map.clear();
    settings.keys.forEach((codes, lane) => codes.forEach((c) => c && this.map.set(c, lane)));
  }

  isHeld(lane: number) { return this.held[lane].size > 0; }

  private down = (e: KeyboardEvent) => {
    if (this.onKey && this.onKey(e) === true) return;
    const lane = this.map.get(e.code);
    if (lane === undefined || !this.onLane) return;
    e.preventDefault();
    if (e.repeat) return;
    const set = this.held[lane];
    const was = set.size > 0;
    set.add(e.code);
    if (!was) this.onLane(lane, true, e.timeStamp || performance.now());
  };

  private up = (e: KeyboardEvent) => {
    const lane = this.map.get(e.code);
    if (lane === undefined) return;
    const set = this.held[lane];
    if (!set.delete(e.code)) return;
    if (set.size === 0 && this.onLane) this.onLane(lane, false, e.timeStamp || performance.now());
  };

  releaseAll = () => {
    const now = performance.now();
    this.held.forEach((s, lane) => { if (s.size) { s.clear(); this.onLane?.(lane, false, now); } });
  };

  destroy() {
    window.removeEventListener('keydown', this.down, { capture: true });
    window.removeEventListener('keyup', this.up, { capture: true });
    window.removeEventListener('blur', this.releaseAll);
  }
}
