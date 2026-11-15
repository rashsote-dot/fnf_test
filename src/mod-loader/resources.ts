// Alcance de recursos: todo lo que se carga para una canción se registra aquí y se libera de golpe
// al salir (texturas de GPU incluidas), evitando fugas de memoria al cambiar de canción o de mod.
import { Diag } from '../core/diagnostics';
import { Atlas, parseSparrowXml } from '../renderer/atlas';
import type { Renderer } from '../renderer/renderer';
import type { Texture } from '../renderer/texture';
import { LoadError, type ModSource } from './source';

export class ResourceScope {
  private textures: Texture[] = [];
  private atlases = new Map<string, Promise<Atlas>>();
  disposed = false;

  /** escalas de reempaquetado del manifiesto ('images/ruta' en minúsculas → escala) */
  texScales: Record<string, number> = {};

  constructor(public renderer: Renderer, public source: ModSource, public label: string) {}

  async texture(path: string): Promise<Texture> {
    const blob = await this.source.blob(path);
    const t0 = performance.now();
    const bmp = await createImageBitmap(blob, { premultiplyAlpha: 'premultiply', colorSpaceConversion: 'none' });
    if (this.disposed) { bmp.close(); throw new Error('scope disposed'); }
    const max = 8192;
    if (bmp.width > max || bmp.height > max) Diag.warn(`Textura ${path} (${bmp.width}x${bmp.height}) supera ${max}px; puede fallar en GPUs modestas.`);
    const tex = this.renderer.createTexture(bmp, path);
    Diag.recordLoad(`gpu ${path}`, performance.now() - t0, tex.bytes);
    this.textures.push(tex);
    return tex;
  }

  /** Carga un atlas Sparrow (ruta sin extensión: carga .png y .xml). Si no hay XML, crea un único frame. */
  /** atlas ya cargado (síncrono) o undefined */
  loaded = new Map<string, Atlas>();
  cached(pathNoExt: string): Atlas | undefined { return this.loaded.get(pathNoExt.toLowerCase()); }

  atlas(pathNoExt: string): Promise<Atlas> {
    const key = pathNoExt.toLowerCase();
    let p = this.atlases.get(key);
    if (!p) {
      p = (async () => {
        const [tex, xml] = await Promise.all([
          this.texture(pathNoExt + '.png'),
          this.source.blob(pathNoExt + '.xml').then((b) => b.text()).catch((e) => { if (e instanceof LoadError) return null; throw e; }),
        ]);
        const raw = xml ? parseSparrowXml(xml) : [{ name: 'full', x: 0, y: 0, w: tex.width, h: tex.height, fx: 0, fy: 0, fw: tex.width, fh: tex.height, rotated: false }];
        const atlas = new Atlas(tex, raw);
        const sc = this.texScales[key];
        if (sc && sc > 0 && sc !== 1) atlas.texMul = 1 / sc;
        return atlas;
      })();
      this.atlases.set(key, p);
      p.then((a) => this.loaded.set(key, a), () => this.atlases.delete(key));
    }
    return p;
  }

  /** registra una textura creada fuera del alcance (p. ej. textos) para liberarla al salir */
  track(t: Texture) { this.textures.push(t); }

  dispose() {
    this.disposed = true;
    for (const t of this.textures) this.renderer.deleteTexture(t);
    this.textures = [];
    this.atlases.clear();
  }
}
