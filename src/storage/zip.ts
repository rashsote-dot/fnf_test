// Lector ZIP mínimo usando DecompressionStream nativo (sin librerías).
// Soporta métodos "store" (0) y "deflate" (8), que cubren prácticamente todos los ZIP de mods.

export interface ZipEntry { name: string; size: number; read(): Promise<Uint8Array> }

export function readZip(buf: ArrayBuffer): ZipEntry[] {
  const dv = new DataView(buf);
  const u8 = new Uint8Array(buf);
  // buscar End Of Central Directory (firma 0x06054b50) desde el final
  let eocd = -1;
  for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 65557); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('El archivo no es un ZIP válido.');
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  if (p === 0xffffffff) throw new Error('ZIP64 no soportado. Vuelve a comprimir el mod sin ZIP64.');
  const dec = new TextDecoder();
  const entries: ZipEntry[] = [];
  for (let i = 0; i < count; i++) {
    if (dv.getUint32(p, true) !== 0x02014b50) throw new Error('Directorio central del ZIP dañado.');
    const method = dv.getUint16(p + 10, true);
    const csize = dv.getUint32(p + 20, true);
    const usize = dv.getUint32(p + 24, true);
    const nlen = dv.getUint16(p + 28, true);
    const elen = dv.getUint16(p + 30, true);
    const clen = dv.getUint16(p + 32, true);
    const lho = dv.getUint32(p + 42, true);
    const name = dec.decode(u8.subarray(p + 46, p + 46 + nlen)).replace(/\\/g, '/');
    p += 46 + nlen + elen + clen;
    if (name.endsWith('/')) continue;
    entries.push({
      name,
      size: usize,
      async read() {
        const lnlen = dv.getUint16(lho + 26, true);
        const lelen = dv.getUint16(lho + 28, true);
        const start = lho + 30 + lnlen + lelen;
        const data = u8.subarray(start, start + csize);
        if (method === 0) return data.slice();
        if (method !== 8) throw new Error(`Método de compresión ${method} no soportado en ${name}`);
        const ds = new DecompressionStream('deflate-raw');
        const out = new Response(new Blob([data]).stream().pipeThrough(ds));
        return new Uint8Array(await out.arrayBuffer());
      },
    });
  }
  return entries;
}
