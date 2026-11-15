#!/usr/bin/env python3
"""
Reempaquetador de atlas Sparrow para la web.

Muchos mods traen atlas de 8192x4096 o 8192x8192 px: ocupan 128-256 MB de memoria de GPU cada uno
y no cargan en GPUs que solo admiten 4096 px (la mayoría de móviles). Esta herramienta:

  1. conserva solo los frames de las animaciones indicadas (--keep "prefijo1" "prefijo2" ...)
  2. elimina frames duplicados (misma región o mismos píxeles)
  3. recorta los bordes transparentes (ajustando frameX/frameY, así los offsets no cambian)
  4. empaqueta todo en una sola hoja de como máximo --max px; si no cabe, reduce la escala
  5. escribe el PNG + XML nuevos e imprime la escala aplicada (multiplica la "scale" del personaje por 1/escala)

Uso:
  python3 tools/repack_atlas.py entrada(.png/.xml sin extensión) salida [--keep P ...] [--max 4096] [--scale 1.0]
"""
import argparse, hashlib, json, re, sys
from xml.sax.saxutils import escape
from PIL import Image

ATTR = re.compile(r'([A-Za-z_:][\w:.-]*)\s*=\s*"([^"]*)"')


def parse(xml):
    out = []
    for m in re.finditer(r'<SubTexture\b([^>]*)/?>', xml):
        a = dict(ATTR.findall(m.group(1)))
        w, h = int(float(a['width'])), int(float(a['height']))
        rot = a.get('rotated') == 'true'
        out.append(dict(
            name=a['name'], x=int(float(a['x'])), y=int(float(a['y'])), w=w, h=h,
            fx=int(float(a.get('frameX', 0))), fy=int(float(a.get('frameY', 0))),
            fw=int(float(a.get('frameWidth', h if rot else w))), fh=int(float(a.get('frameHeight', w if rot else h))),
            rot=rot))
    return out


def shelf_pack(sizes, width):
    """empaquetado por estantes; sizes = [(i, w, h)] ordenados por alto desc. Devuelve posiciones y alto total."""
    x = y = shelf_h = 0
    pos = {}
    for i, w, h in sizes:
        if x + w > width:
            y += shelf_h + 2
            x = shelf_h = 0
        pos[i] = (x, y)
        x += w + 2
        shelf_h = max(shelf_h, h)
    return pos, y + shelf_h


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('src')
    ap.add_argument('dst')
    ap.add_argument('--keep', nargs='*', default=None, help='prefijos de animación a conservar')
    ap.add_argument('--max', type=int, default=4096)
    ap.add_argument('--scale', type=float, default=1.0, help='escala inicial (se reduce sola si no cabe)')
    args = ap.parse_args()

    img = Image.open(args.src + '.png').convert('RGBA')
    frames = parse(open(args.src + '.xml', encoding='utf-8').read())
    if args.keep:
        frames = [f for f in frames if any(f['name'].startswith(k) for k in args.keep)]
    if not frames:
        sys.exit('No quedan frames con esos prefijos')

    # regiones únicas → imagen recortada
    uniq = {}      # clave de región -> índice en crops
    crops = []     # (imagen recortada, l, t)
    by_hash = {}
    frame_crop = []
    for f in frames:
        key = (f['x'], f['y'], f['w'], f['h'], f['rot'])
        if key not in uniq:
            c = img.crop((f['x'], f['y'], f['x'] + f['w'], f['y'] + f['h']))
            if f['rot']:
                c = c.rotate(90, expand=True)  # Sparrow guarda girado en sentido horario
            bb = c.getbbox() or (0, 0, 1, 1)
            t = c.crop(bb)
            hsh = hashlib.md5(t.tobytes() + bytes(str(t.size), 'ascii') + bytes(str(bb[:2]), 'ascii')).hexdigest()
            if hsh in by_hash:
                uniq[key] = by_hash[hsh]
            else:
                crops.append((t, bb[0], bb[1]))
                uniq[key] = by_hash[hsh] = len(crops) - 1
        frame_crop.append(uniq[key])

    scale = args.scale
    while True:
        sizes = sorted(((i, max(1, round(c.width * scale)), max(1, round(c.height * scale))) for i, (c, _, _) in enumerate(crops)), key=lambda s: -s[2])
        area = sum(w * h for _, w, h in sizes)
        width = min(args.max, max(max(w for _, w, _ in sizes), int((area * 1.15) ** 0.5)))
        pos, height = shelf_pack(sizes, width)
        if height <= args.max:
            break
        scale *= 0.92

    sheet = Image.new('RGBA', (width, height), (0, 0, 0, 0))
    dims = {}
    for i, w, h in sizes:
        c = crops[i][0]
        if scale != 1:
            c = c.resize((w, h), Image.LANCZOS)
        sheet.paste(c, pos[i])
        dims[i] = (w, h)
    sheet.save(args.dst + '.png', optimize=True)

    name = args.dst.replace('\\', '/').split('/')[-1]
    lines = ['<?xml version="1.0" encoding="utf-8"?>', f'<TextureAtlas imagePath="{name}.png">']
    for f, ci in zip(frames, frame_crop):
        _, l, t = crops[ci]
        x, y = pos[ci]
        w, h = dims[ci]
        fx = (f['fx'] - l) * scale
        fy = (f['fy'] - t) * scale
        lines.append(f'\t<SubTexture name="{escape(f["name"], {chr(34): "&quot;"})}" x="{x}" y="{y}" width="{w}" height="{h}" '
                     f'frameX="{round(fx)}" frameY="{round(fy)}" frameWidth="{round(f["fw"] * scale)}" frameHeight="{round(f["fh"] * scale)}"/>')
    lines.append('</TextureAtlas>')
    open(args.dst + '.xml', 'w', encoding='utf-8').write('\n'.join(lines) + '\n')

    before = img.width * img.height * 4 / 1048576
    after = width * height * 4 / 1048576
    print(json.dumps({'frames': len(frames), 'unique': len(crops), 'sheet': [width, height], 'scale': round(scale, 4),
                      'gpuMB_before': round(before, 1), 'gpuMB_after': round(after, 1)}))


if __name__ == '__main__':
    main()
