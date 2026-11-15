// Skins de notas. Lee el formato estándar de FNF/Psych (NOTE_assets: "arrowLEFT", "left press", "left confirm",
// "purple0", "purple hold piece", "purple hold end"/"pruple end hold") y, como respaldo, la skin generada de Funkade.
import type { Atlas } from '../renderer/atlas';
import type { Frame } from '../renderer/texture';

const DIRS = ['LEFT', 'DOWN', 'UP', 'RIGHT'];
const COLORS = ['purple', 'blue', 'green', 'red'];
const SHORT = ['L', 'D', 'U', 'R'];

export class NoteSkin {
  static: Frame[][] = [];
  press: Frame[][] = [];
  confirm: Frame[][] = [];
  note: Frame[] = [];
  hold: Frame[] = [];
  holdEnd: Frame[] = [];
  /** escala de dibujo para que la nota mida como en FNF (frames de ~160 px × 0.7) */
  scale = 0.7;

  constructor(public atlas: Atlas, texMul = 1) {
    const a = atlas;
    const first = (...prefixes: string[]) => { for (const p of prefixes) { const f = a.byPrefix(p); if (f.length) return f; } return [] as Frame[]; };
    const fnf = a.byPrefix('arrowLEFT').length > 0 || a.byPrefix('purple').length > 0;
    for (let i = 0; i < 4; i++) {
      const d = DIRS[i], c = COLORS[i], dl = d.toLowerCase(), sh = SHORT[i];
      if (fnf) {
        this.static.push(first('arrow' + d, `arrow static instance ${i + 1}`));
        this.press.push(first(dl + ' press', `${dl} press`));
        this.confirm.push(first(dl + ' confirm', `${dl} confirm`));
        this.note.push(first(c + '0', c + ' alone', c + 'Scroll', c + ' instance', c)[0]);
        this.hold.push(first(c + ' hold piece', c + ' hold')[0]);
        this.holdEnd.push(first(c + ' hold end', i === 0 ? 'pruple end hold' : c + ' end hold', c + ' tail')[0]);
      } else {
        this.static.push(first('static' + sh));
        this.press.push(first('press' + sh));
        this.confirm.push(first('confirm' + sh));
        this.note.push(first('note' + sh)[0]);
        this.hold.push(first('hold' + sh)[0]);
        this.holdEnd.push(first('holdEnd' + sh)[0]);
      }
      // si faltan animaciones, se reutiliza lo que haya
      if (!this.press[i].length) this.press[i] = this.static[i];
      if (!this.confirm[i].length) this.confirm[i] = this.press[i];
    }
    // Psych dibuja notas y receptores a 0.7 del tamaño del frame (setGraphicSize(width * 0.7))
    this.scale = 0.7 * texMul;
  }

  get ok() { return this.static.every((s) => s.length > 0) && this.note.every(Boolean); }

  /** frame genérico para la cabeza de nota de un tipo especial (generada) */
  static hurtFrame(gen: Atlas, lane: number): Frame | undefined { return gen.byPrefix('hurt' + SHORT[lane])[0]; }
}
