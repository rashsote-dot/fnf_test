// Renderizador por lotes (sprite batcher). WebGL2 por defecto; Canvas2D como respaldo.
// El motor entrega quads ya transformados (4 esquinas en píxeles del canvas) y el renderer
// los agrupa por textura para minimizar draw calls.
import { Diag } from '../core/diagnostics';
import type { Frame, Texture } from './texture';

export interface Renderer {
  readonly kind: 'webgl2' | 'canvas2d';
  readonly width: number;
  readonly height: number;
  resize(w: number, h: number): void;
  createTexture(src: ImageBitmap | HTMLCanvasElement | OffscreenCanvas, label: string): Texture;
  deleteTexture(t: Texture): void;
  white: Texture;
  begin(clear: string): void;
  /** quad con esquinas TL, TR, BR, BL; color RGBA 0..1 (sin premultiplicar) */
  quad(f: Frame, x0: number, y0: number, x1: number, y1: number, x2: number, y2: number, x3: number, y3: number, r: number, g: number, b: number, a: number, flipX: boolean): void;
  end(): void;
  destroy(): void;
}

let texSeq = 1;

export function parseColor(c: string | undefined, out: Float32Array | number[] = [1, 1, 1]): number[] | Float32Array {
  if (!c) { out[0] = out[1] = out[2] = 1; return out; }
  let h = c.replace('#', '').replace(/^0x/i, '');
  if (h.length === 3) h = h.split('').map((x) => x + x).join('');
  if (h.length === 8) h = h.slice(2);
  const n = parseInt(h, 16) || 0;
  out[0] = ((n >> 16) & 255) / 255; out[1] = ((n >> 8) & 255) / 255; out[2] = (n & 255) / 255;
  return out;
}

// ---------------------------------------------------------------- WebGL2
const VS = `#version 300 es
in vec2 aPos; in vec2 aUv; in vec4 aCol;
uniform vec2 uRes;
out vec2 vUv; out vec4 vCol;
void main(){ vUv=aUv; vCol=aCol; vec2 p=aPos/uRes*2.0-1.0; gl_Position=vec4(p.x,-p.y,0.0,1.0); }`;
const FS = `#version 300 es
precision mediump float;
in vec2 vUv; in vec4 vCol; uniform sampler2D uTex; out vec4 o;
void main(){ o=texture(uTex,vUv)*vCol; }`;

const MAX_QUADS = 8192;
const STRIDE = 5; // x, y, u, v, color(u32) → 5 * 4 bytes

export class WebGL2Renderer implements Renderer {
  readonly kind = 'webgl2' as const;
  width = 0; height = 0;
  private gl: WebGL2RenderingContext;
  private buf: ArrayBuffer = new ArrayBuffer(MAX_QUADS * 4 * STRIDE * 4);
  private f32 = new Float32Array(this.buf);
  private u32 = new Uint32Array(this.buf);
  private count = 0;
  private cur: Texture | null = null;
  private vbo: WebGLBuffer;
  private uRes: WebGLUniformLocation;
  white: Texture;

  constructor(private canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl2', { alpha: false, antialias: false, premultipliedAlpha: true, powerPreference: 'high-performance', desynchronized: true, preserveDrawingBuffer: false });
    if (!gl) throw new Error('WebGL2 no disponible');
    this.gl = gl;
    const prog = gl.createProgram()!;
    for (const [type, src] of [[gl.VERTEX_SHADER, VS], [gl.FRAGMENT_SHADER, FS]] as const) {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? 'shader');
      gl.attachShader(prog, s);
    }
    gl.bindAttribLocation(prog, 0, 'aPos'); gl.bindAttribLocation(prog, 1, 'aUv'); gl.bindAttribLocation(prog, 2, 'aCol');
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) ?? 'link');
    gl.useProgram(prog);
    this.uRes = gl.getUniformLocation(prog, 'uRes')!;
    gl.uniform1i(gl.getUniformLocation(prog, 'uTex'), 0);
    const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
    this.vbo = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, this.buf.byteLength, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, STRIDE * 4, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, STRIDE * 4, 8);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 4, gl.UNSIGNED_BYTE, true, STRIDE * 4, 16);
    const idx = new Uint16Array(MAX_QUADS * 6);
    for (let i = 0, v = 0; i < idx.length; i += 6, v += 4) { idx[i] = v; idx[i + 1] = v + 1; idx[i + 2] = v + 2; idx[i + 3] = v; idx[i + 4] = v + 2; idx[i + 5] = v + 3; }
    // MAX_QUADS*4 = 32768 vértices < 65535, cabe en Uint16
    const ibo = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.disable(gl.DEPTH_TEST);
    const c = document.createElement('canvas'); c.width = c.height = 4;
    const cx = c.getContext('2d')!; cx.fillStyle = '#fff'; cx.fillRect(0, 0, 4, 4);
    this.white = this.createTexture(c, 'white');
    this.white.isWhite = true;
    canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); Diag.warn('Contexto WebGL perdido; recarga la página si no se recupera.'); });
  }

  resize(w: number, h: number) {
    this.width = w; this.height = h;
    this.canvas.width = w; this.canvas.height = h;
    this.gl.viewport(0, 0, w, h);
    this.gl.uniform2f(this.uRes, w, h);
  }

  createTexture(src: ImageBitmap | HTMLCanvasElement | OffscreenCanvas, label: string): Texture {
    const gl = this.gl;
    const t = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, !(src instanceof ImageBitmap));
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src as TexImageSource);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.cur = null;
    const w = src.width, h = src.height; // leer ANTES de close(): close() pone el tamaño a 0
    const bytes = w * h * 4;
    Diag.textureBytes += bytes;
    // la imagen ya está en la GPU: liberamos la copia en CPU
    if (src instanceof ImageBitmap) src.close();
    return { id: texSeq++, width: w, height: h, source: src, gl: t, bytes, label };
  }

  deleteTexture(t: Texture) {
    if (t.gl) { this.gl.deleteTexture(t.gl); t.gl = null; Diag.textureBytes -= t.bytes; }
  }

  begin(clear: string) {
    const c = parseColor(clear);
    const gl = this.gl;
    gl.clearColor(c[0], c[1], c[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    this.count = 0; this.cur = null;
    Diag.drawCalls = 0; Diag.sprites = 0;
  }

  private flush() {
    if (!this.count || !this.cur) return;
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.cur.gl);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.f32, 0, this.count * 4 * STRIDE);
    gl.drawElements(gl.TRIANGLES, this.count * 6, gl.UNSIGNED_SHORT, 0);
    Diag.drawCalls++;
    this.count = 0;
  }

  quad(f: Frame, x0: number, y0: number, x1: number, y1: number, x2: number, y2: number, x3: number, y3: number, r: number, g: number, b: number, a: number, flipX: boolean) {
    if (f.tex !== this.cur) { this.flush(); this.cur = f.tex; }
    if (this.count >= MAX_QUADS) this.flush();
    const tw = f.tex.width, th = f.tex.height;
    let u0 = f.x / tw, v0 = f.y / th, u1 = (f.x + f.w) / tw, v1 = (f.y + f.h) / th;
    // UV por esquina (TL, TR, BR, BL)
    let au = u0, av = v0, bu = u1, bv = v0, cu = u1, cv = v1, du = u0, dv = v1;
    if (f.rotated) {
      // Sparrow "rotated": almacenado girado 90° en sentido horario
      au = u1; av = v0; bu = u1; bv = v1; cu = u0; cv = v1; du = u0; dv = v0;
    }
    if (flipX) { let tu = au, tv = av; au = bu; av = bv; bu = tu; bv = tv; tu = du; tv = dv; du = cu; dv = cv; cu = tu; cv = tv; }
    const aa = a < 0 ? 0 : a > 1 ? 1 : a;
    const col = ((aa * 255) << 24 | ((b * aa * 255) & 255) << 16 | ((g * aa * 255) & 255) << 8 | ((r * aa * 255) & 255)) >>> 0;
    const o = this.count * 4 * STRIDE;
    const F = this.f32, U = this.u32;
    F[o] = x0; F[o + 1] = y0; F[o + 2] = au; F[o + 3] = av; U[o + 4] = col;
    F[o + 5] = x1; F[o + 6] = y1; F[o + 7] = bu; F[o + 8] = bv; U[o + 9] = col;
    F[o + 10] = x2; F[o + 11] = y2; F[o + 12] = cu; F[o + 13] = cv; U[o + 14] = col;
    F[o + 15] = x3; F[o + 16] = y3; F[o + 17] = du; F[o + 18] = dv; U[o + 19] = col;
    this.count++;
    Diag.sprites++;
  }

  end() { this.flush(); }

  destroy() {
    const ext = this.gl.getExtension('WEBGL_lose_context');
    ext?.loseContext();
  }
}

// ---------------------------------------------------------------- Canvas2D (respaldo)
export class Canvas2DRenderer implements Renderer {
  readonly kind = 'canvas2d' as const;
  width = 0; height = 0;
  private ctx: CanvasRenderingContext2D;
  white: Texture;
  private lastTex: Texture | null = null;

  constructor(private canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });
    if (!ctx) throw new Error('Canvas2D no disponible');
    this.ctx = ctx;
    const c = document.createElement('canvas'); c.width = c.height = 1;
    this.white = { id: texSeq++, width: 1, height: 1, source: c, gl: null, bytes: 4, isWhite: true, label: 'white' };
  }
  resize(w: number, h: number) { this.width = w; this.height = h; this.canvas.width = w; this.canvas.height = h; }
  createTexture(src: ImageBitmap | HTMLCanvasElement | OffscreenCanvas, label: string): Texture {
    const bytes = src.width * src.height * 4;
    Diag.textureBytes += bytes;
    return { id: texSeq++, width: src.width, height: src.height, source: src, gl: null, bytes, label };
  }
  deleteTexture(t: Texture) { if (t.source instanceof ImageBitmap) t.source.close(); Diag.textureBytes -= t.bytes; }
  begin(clear: string) {
    const c = this.ctx;
    c.setTransform(1, 0, 0, 1, 0, 0); c.globalAlpha = 1; c.fillStyle = clear; c.fillRect(0, 0, this.width, this.height);
    Diag.drawCalls = 0; Diag.sprites = 0; this.lastTex = null;
  }
  quad(f: Frame, x0: number, y0: number, x1: number, y1: number, _x2: number, _y2: number, x3: number, y3: number, r: number, g: number, b: number, a: number, flipX: boolean) {
    const c = this.ctx;
    if (a <= 0) return;
    c.globalAlpha = a > 1 ? 1 : a;
    if (f.tex.isWhite) {
      c.setTransform(x1 - x0, y1 - y0, x3 - x0, y3 - y0, x0, y0);
      c.fillStyle = `rgb(${(r * 255) | 0},${(g * 255) | 0},${(b * 255) | 0})`;
      c.fillRect(0, 0, 1, 1);
    } else if (f.rotated) {
      // el recorte está girado en el atlas: lo dibujamos con la rotación inversa
      const lw = f.h, lh = f.w;
      let ax = (x1 - x0) / lw, ay = (y1 - y0) / lw, bx = (x3 - x0) / lh, by = (y3 - y0) / lh, ex = x0, ey = y0;
      if (flipX) { ex = x1; ey = y1; ax = -ax; ay = -ay; }
      c.setTransform(ax, ay, bx, by, ex, ey);
      c.transform(0, -1, 1, 0, 0, f.w); // gira -90°
      c.drawImage(f.tex.source as CanvasImageSource, f.x, f.y, f.w, f.h, 0, 0, f.w, f.h);
    } else {
      let ax = (x1 - x0) / f.w, ay = (y1 - y0) / f.w, ex = x0, ey = y0;
      if (flipX) { ex = x1; ey = y1; ax = -ax; ay = -ay; }
      c.setTransform(ax, ay, (x3 - x0) / f.h, (y3 - y0) / f.h, ex, ey);
      c.drawImage(f.tex.source as CanvasImageSource, f.x, f.y, f.w, f.h, 0, 0, f.w, f.h);
    }
    if (this.lastTex !== f.tex) { Diag.drawCalls++; this.lastTex = f.tex; }
    Diag.sprites++;
  }
  end() { this.ctx.setTransform(1, 0, 0, 1, 0, 0); this.ctx.globalAlpha = 1; }
  destroy() {}
}

export function createRenderer(canvas: HTMLCanvasElement, prefer: 'auto' | 'webgl2' | 'canvas2d'): Renderer {
  if (prefer !== 'canvas2d') {
    try { return new WebGL2Renderer(canvas); } catch (e) { Diag.warn('WebGL2 no disponible, usando Canvas2D: ' + (e as Error).message); }
  }
  return new Canvas2DRenderer(canvas);
}
