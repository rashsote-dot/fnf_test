export interface Texture {
  id: number;
  width: number;
  height: number;
  source: ImageBitmap | HTMLCanvasElement | OffscreenCanvas;
  gl: WebGLTexture | null;
  bytes: number;
  /** textura blanca 1x1 usada para rectángulos de color */
  isWhite?: boolean;
  label: string;
}

/** Región de un atlas. ox/oy = desplazamiento del recorte dentro de la caja original (frameX/frameY invertidos). */
export interface Frame {
  tex: Texture;
  name: string;
  x: number; y: number; w: number; h: number;
  ox: number; oy: number;
  fw: number; fh: number;
  rotated: boolean;
}

export function fullFrame(tex: Texture, name = 'full'): Frame {
  return { tex, name, x: 0, y: 0, w: tex.width, h: tex.height, ox: 0, oy: 0, fw: tex.width, fh: tex.height, rotated: false };
}
