#!/usr/bin/env python3
"""
Importador automático de mods para Funkade.

Convierte un mod de FNF (Psych Engine 0.6/0.7/1.0, compilación completa con .exe, V-Slice o
FNF 0.2.x antiguo) al formato que lee la web, sin escribir código:

  python3 tools/mod-importer/import_mod.py MOD.zip|MOD.rar|MOD.7z|carpeta|URL [opciones]

Opciones:
  --id ID              identificador (carpeta) del mod; por defecto se deduce del nombre
  --name NOMBRE        nombre visible en el catálogo
  --category CAT       categoría (por defecto "Mods de la comunidad")
  --description TEXTO  descripción corta
  --author TEXTO       créditos
  --popularity N       orden en "Más populares" (mayor = antes; 150+ lo pone como destacado)
  --out DIR            carpeta de mods (por defecto public/mods)
  --report FICHERO     escribe un informe en Markdown

Qué hace:
  - detecta el formato y combina las capas (assets/, assets/shared/, mods/<mod>/)
  - copia SOLO lo que usan las canciones: charts, eventos, personajes, iconos, escenario y audio
  - reempaqueta atlas gigantes (≤ 4096 px, sin frames duplicados) y ajusta la escala
  - traduce escenarios hechos en Lua (makeLuaSprite, addAnimationByPrefix…) a objetos JSON
  - genera audio .ogg + .m4a (Safari), manifest.json, portada y un informe de compatibilidad
Requisitos: Python 3.9+, Pillow, ffmpeg; 7z (o unrar) para .rar/.7z.
"""
import argparse, ast, json, os, re, shutil, subprocess, sys, tempfile, urllib.request, zipfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
from PIL import Image, ImageDraw, ImageFilter, ImageFont  # noqa: E402

MAX_TEX = 4096
log_lines = []


def log(msg):
    log_lines.append(msg)
    print('·', msg)


# ------------------------------------------------------------------ extracción
def extract(src, tmp):
    if re.match(r'^https?://', src):
        dst = Path(tmp) / 'descarga'
        log(f'Descargando {src}')
        req = urllib.request.Request(src, headers={'User-Agent': 'Mozilla/5.0 Funkade-importer'})
        with urllib.request.urlopen(req) as r, open(dst, 'wb') as f:
            shutil.copyfileobj(r, f)
        src = str(dst)
    p = Path(src)
    if p.is_dir():
        return p
    out = Path(tmp) / 'mod'
    out.mkdir()
    with open(p, 'rb') as f:
        head = f.read(8)
    if head.startswith(b'PK'):
        with zipfile.ZipFile(p) as z:
            for info in z.infolist():
                name = info.filename.replace('\\', '/')
                if name.startswith('/') or '..' in name.split('/'):
                    continue  # rutas peligrosas
                z.extract(info, out)
    else:
        tool = shutil.which('7zz') or shutil.which('7z') or shutil.which('7za')
        if tool:
            subprocess.run([tool, 'x', '-y', f'-o{out}', str(p)], check=True, stdout=subprocess.DEVNULL)
        elif shutil.which('unrar') and head.startswith(b'Rar!'):
            subprocess.run(['unrar', 'x', '-o+', str(p), str(out) + '/'], check=True, stdout=subprocess.DEVNULL)
        else:
            sys.exit('No se puede abrir el archivo: instala 7-Zip (7z) para .rar/.7z, o usa .zip')
    return out


# ------------------------------------------------------------------ sistema de archivos virtual
class VFS:
    """Une varias capas (las posteriores tienen prioridad). Búsqueda sin distinguir mayúsculas."""
    def __init__(self, layers):
        self.files = {}
        self.layers = layers
        for layer in layers:
            for f in layer.rglob('*'):
                if f.is_file():
                    self.files[f.relative_to(layer).as_posix().lower()] = f

    def get(self, rel):
        return self.files.get(rel.replace('\\', '/').lower().lstrip('/'))

    def glob(self, pattern):
        rx = re.compile('^' + re.escape(pattern.lower()).replace(r'\*', '[^/]*') + '$')
        return sorted(k for k in self.files if rx.match(k))

    def json(self, rel):
        f = self.get(rel)
        if not f:
            return None
        txt = f.read_text(encoding='utf-8', errors='replace').lstrip('﻿')
        try:
            return json.loads(txt)
        except json.JSONDecodeError:
            try:
                return json.loads(txt[:txt.rfind('}') + 1])
            except Exception:
                return None


def find_layers(root):
    """Devuelve (capas, tipo). tipo: 'psych' | 'vslice' | 'legacy'"""
    dirs = [d for d in [root, *root.rglob('*')] if d.is_dir()]
    lower = lambda d: {c.name.lower(): c for c in d.iterdir()}
    # 1) compilación con .exe: assets/ (+ assets/shared) y mods/<x>
    for d in sorted(dirs, key=lambda x: len(x.parts)):
        kids = lower(d)
        if 'assets' in kids and kids['assets'].is_dir():
            a = kids['assets']
            ak = lower(a)
            layers = [a] + ([ak['shared']] if 'shared' in ak else [])
            if 'mods' in kids:
                for m in sorted(kids['mods'].iterdir()):
                    if m.is_dir() and any((m / x).exists() for x in ('data', 'songs', 'characters', 'images')):
                        layers.append(m)
            vfs = VFS(layers)
            has_chars = bool(vfs.glob('characters/*.json'))
            if vfs.glob('data/songs/*/*-metadata.json'):
                return layers, 'vslice'
            return layers, 'psych' if has_chars else 'legacy'
    # 2) carpeta de mod suelta
    cands = []
    for d in dirs:
        kids = lower(d)
        if 'data' in kids and ('songs' in kids or 'characters' in kids or 'weeks' in kids or 'images' in kids):
            cands.append(d)
    if not cands:
        sys.exit('No se encontró una estructura de mod reconocible (falta data/ + songs/).')
    top = min(cands, key=lambda x: len(x.parts))
    vfs = VFS([top])
    return [top], 'vslice' if vfs.glob('data/songs/*/*-metadata.json') else 'psych'


# ------------------------------------------------------------------ utilidades
def slug(s):
    s = re.sub(r'[^a-z0-9]+', '-', s.lower()).strip('-')
    return s or 'mod'


def song_path(name):
    """Equivalente a Paths.formatToSongPath de Psych"""
    s = name.lower().replace(' ', '-')
    return re.sub(r'[~&\\;:<>#]', '', s)


def write(dst, src):
    dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(src, dst)


def encode_audio(src, dst_noext, mono=False):
    """Copia/convierte a .ogg y genera .m4a para Safari."""
    dst_noext.parent.mkdir(parents=True, exist_ok=True)
    ogg = dst_noext.with_suffix('.ogg')
    if src.suffix.lower() == '.ogg':
        shutil.copyfile(src, ogg)
    else:
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', str(src), '-c:a', 'libvorbis', '-q:a', '4', str(ogg)], check=True)
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', str(ogg), '-c:a', 'aac', '-b:a', '96k' if mono else '128k', str(dst_noext.with_suffix('.m4a'))], check=True)


TEX_SCALE = {}
COPIED = {}


def copy_atlas(vfs, ref, out_root, keep=None, report=None):
    """Copia images/<ref>.png (+.xml). Reempaqueta si es enorme. Devuelve la escala aplicada (1 = sin cambios) o None si no existe.
    La escala se anota en TEX_SCALE (→ manifest.textureScale) para que el motor la compense: los JSON del mod no se tocan."""
    key = ref.lower()
    if key in COPIED and keep is None:
        return COPIED[key]
    sc = _copy_atlas(vfs, ref, out_root, keep, report)
    COPIED[key] = sc
    if sc not in (None, 1.0):
        TEX_SCALE[f'images/{ref}'.lower()] = sc
    return sc


def _copy_atlas(vfs, ref, out_root, keep=None, report=None):
    png, xml = vfs.get(f'images/{ref}.png'), vfs.get(f'images/{ref}.xml')
    if not png:
        if vfs.get(f'images/{ref}/animation.json') or vfs.get(f'images/{ref}/Animation.json'):
            report and report.append(f'«{ref}» es un Texture Atlas de Adobe Animate (no soportado).')
        return None
    dst = out_root / 'images' / ref
    dst.parent.mkdir(parents=True, exist_ok=True)
    with Image.open(png) as im:
        w, h = im.size
    if xml and (max(w, h) > MAX_TEX or w * h > MAX_TEX * MAX_TEX * 0.55):
        res = repack(png, xml, dst, keep)
        log(f'Atlas {ref}: {w}x{h} → {res["sheet"][0]}x{res["sheet"][1]} (escala {res["scale"]}, {res["gpuMB_before"]}→{res["gpuMB_after"]} MB de GPU)')
        return res['scale']
    if not xml and max(w, h) > MAX_TEX:
        f = MAX_TEX / max(w, h)
        with Image.open(png) as im:
            im.resize((round(w * f), round(h * f)), Image.LANCZOS).save(str(dst) + '.png', optimize=True)
        log(f'Imagen {ref}: {w}x{h} reducida al {round(f * 100)} %')
        return f
    shutil.copyfile(png, str(dst) + '.png')
    if xml:
        shutil.copyfile(xml, str(dst) + '.xml')
    return 1.0


def repack(png, xml, dst, keep):
    """Ejecuta el reempaquetador como subproceso (mismo algoritmo que tools/repack_atlas.py)."""
    tmpdir = tempfile.mkdtemp()
    try:
        # repack_atlas espera <src>.png y <src>.xml con el mismo nombre
        base = Path(tmpdir) / 'a'
        shutil.copyfile(png, str(base) + '.png')
        shutil.copyfile(xml, str(base) + '.xml')
        args = [sys.executable, str(HERE.parent / 'repack_atlas.py'), str(base), str(dst)]
        if keep:
            args += ['--keep', *keep]
        r = subprocess.run(args, check=False, capture_output=True, text=True)
        if r.returncode != 0 and keep:  # si los prefijos no coinciden, reempaquetar todo
            r = subprocess.run(args[:4], check=True, capture_output=True, text=True)
        elif r.returncode != 0:
            raise RuntimeError(r.stderr)
        return json.loads(r.stdout.strip().splitlines()[-1])
    finally:
        shutil.rmtree(tmpdir, ignore_errors=True)


# ------------------------------------------------------------------ Lua de escenarios → objetos
def lua_stage_objects(code):
    """Traduce las llamadas más comunes de escenarios Lua de Psych a objetos de stage JSON (Psych 1.0)."""
    code = re.sub(r'--\[\[.*?\]\]', '', code, flags=re.S)
    code = re.sub(r'--[^\n]*', '', code)
    env = {}
    for m in re.finditer(r'(?:local\s+)?([A-Za-z_]\w*)\s*=\s*(-?[\d.]+)\s*(?:\n|;)', code):
        env.setdefault(m.group(1), float(m.group(2)))
    # solo lo que se crea al cargar: cuerpos de onCreate/onCreatePost (lo demás ocurre durante la canción)
    bodies = re.findall(r'function\s+onCreate(?:Post)?\s*\(\s*\)(.*?)(?=\nfunction\s|\Z)', code, flags=re.S)
    if bodies:
        code = '\n'.join(bodies)
    hud_tags = set(re.findall(r"setObjectCamera\s*\(\s*['\"](\w+)['\"]\s*,\s*['\"](?:hud|camhud|other|camother)['\"]", code, flags=re.I))

    def num(expr, default=0.0):
        expr = expr.strip()
        for k, v in env.items():
            expr = re.sub(rf'\b{k}\b', repr(v), expr)
        try:
            node = ast.parse(expr, mode='eval')
            if all(isinstance(n, (ast.Expression, ast.BinOp, ast.UnaryOp, ast.Constant, ast.operator, ast.unaryop)) for n in ast.walk(node)):
                return float(eval(compile(node, '<lua>', 'eval'), {'__builtins__': {}}))
        except Exception:
            pass
        return default

    def args(s):
        out, depth, cur, q = [], 0, '', None
        for ch in s:
            if q:
                cur += ch
                if ch == q:
                    q = None
            elif ch in '\'"':
                q = ch; cur += ch
            elif ch == '(':
                depth += 1; cur += ch
            elif ch == ')':
                depth -= 1; cur += ch
            elif ch == ',' and depth == 0:
                out.append(cur.strip()); cur = ''
            else:
                cur += ch
        if cur.strip():
            out.append(cur.strip())
        return out

    def sval(a):
        a = a.strip()
        return a[1:-1] if len(a) >= 2 and a[0] in '\'"' and a[-1] == a[0] else None

    sprites, order = {}, []
    for m in re.finditer(r'\b(makeLuaSprite|makeAnimatedLuaSprite|setScrollFactor|scaleObject|setGraphicSize|setProperty|addAnimationByPrefix|addAnimationByIndices|makeGraphic|addLuaSprite|playAnim|objectPlayAnimation)\s*\(([^()]*(?:\([^()]*\)[^()]*)*)\)', code):
        fn, a = m.group(1), args(m.group(2))
        tag = sval(a[0]) if a else None
        if not tag:
            continue
        if fn in ('makeLuaSprite', 'makeAnimatedLuaSprite'):
            img = sval(a[1]) if len(a) > 1 else ''
            sprites[tag] = {'type': 'animatedSprite' if fn == 'makeAnimatedLuaSprite' else 'sprite', 'name': tag, 'image': img or '',
                            'x': num(a[2]) if len(a) > 2 else 0, 'y': num(a[3]) if len(a) > 3 else 0, 'scale': [1, 1], 'scroll': [1, 1], 'alpha': 1, 'animations': []}
            continue
        s = sprites.get(tag)
        if not s:
            continue
        if fn == 'setScrollFactor' and len(a) >= 3:
            s['scroll'] = [num(a[1], 1), num(a[2], 1)]
        elif fn == 'scaleObject' and len(a) >= 3:
            s['scale'] = [num(a[1], 1), num(a[2], 1)]
        elif fn == 'makeGraphic' and len(a) >= 3:
            s['type'] = 'square'; s['scale'] = [num(a[1], 1), num(a[2], 1)]
            col = sval(a[3]) if len(a) > 3 else 'FFFFFF'
            s['color'] = (col or 'FFFFFF').replace('#', '').replace('0x', '')[-6:]
        elif fn == 'addAnimationByPrefix' and len(a) >= 3:
            s['animations'].append({'anim': sval(a[1]) or 'idle', 'name': sval(a[2]) or '', 'fps': num(a[3], 24) if len(a) > 3 else 24, 'loop': (a[4].strip() == 'true') if len(a) > 4 else True, 'indices': [], 'offsets': [0, 0]})
        elif fn in ('playAnim', 'objectPlayAnimation') and len(a) >= 2:
            s['firstAnimation'] = sval(a[1])
        elif fn == 'setProperty' and len(a) >= 2:
            key = tag  # 'tag.prop'
            parts = key.split('.', 1)
            if len(parts) == 2 and parts[0] in sprites:
                sp, prop = sprites[parts[0]], parts[1]
                if prop == 'alpha':
                    sp['alpha'] = num(a[1], 1)
                elif prop == 'scale.x':
                    sp['scale'][0] = num(a[1], 1)
                elif prop == 'scale.y':
                    sp['scale'][1] = num(a[1], 1)
                elif prop == 'visible' and a[1].strip() == 'false':
                    sp['alpha'] = 0
                elif prop in ('x', 'y'):
                    sp[prop] = num(a[1], sp[prop])
        elif fn == 'addLuaSprite':
            front = len(a) > 1 and a[1].strip() == 'true'
            order.append((tag, front))
    # setProperty('tag.prop', v): el primer argumento lleva el punto
    for m in re.finditer(r"setProperty\s*\(\s*['\"]([\w]+)\.([\w.]+)['\"]\s*,\s*([^)]+)\)", code):
        tag, prop, val = m.group(1), m.group(2), m.group(3)
        sp = sprites.get(tag)
        if not sp:
            continue
        if prop == 'alpha':
            sp['alpha'] = num(val, 1)
        elif prop == 'scale.x':
            sp['scale'][0] = num(val, 1)
        elif prop == 'scale.y':
            sp['scale'][1] = num(val, 1)
        elif prop == 'visible' and val.strip() == 'false':
            sp['alpha'] = 0
    seen = set()
    def ok(t):
        if t in seen or t not in sprites or t in hud_tags:
            return False
        seen.add(t)
        sp = sprites[t]
        return sp['type'] == 'square' or bool(sp['image'])
    behind = [sprites[t] for t, f in order if not f and ok(t)]
    front = [sprites[t] for t, f in order if f and ok(t)]
    for s in behind + front:
        if s['type'] == 'animatedSprite' and s['animations'] and not s.get('firstAnimation'):
            s['firstAnimation'] = s['animations'][0]['anim']
    return behind, front


# ------------------------------------------------------------------ scripts Lua, skins y UI del mod
LUA_WANTED = set()
FONTS = []
STR_RX = re.compile(r"""(['"])((?:(?!\1)[^\\\n]|\\.){1,120})\1""")


def copy_lua(vfs, out, songs, chars_needed, custom_events, report):
    """Copia los .lua que Psych cargaría y los recursos (imágenes, sonidos, fuentes, personajes) que nombran."""
    want = set(LUA_WANTED)
    want |= {k for k in vfs.glob('scripts/*.lua')}
    for e in custom_events:
        k = f'custom_events/{e}.lua'.lower()
        if vfs.get(k):
            want.add(k)
    want |= {k for k in vfs.glob('custom_notetypes/*.lua')}
    for c in list(chars_needed):
        if vfs.get(f'characters/{c}.lua'):
            want.add(f'characters/{c}.lua'.lower())
    for sng in songs:
        want |= {k for k in vfs.files if k.startswith(f"data/{sng['id']}/") and k.endswith('.lua')}
    if not want:
        return
    lits = set()
    n = 0
    for k in sorted(want):
        f = vfs.get(k)
        if not f:
            continue
        code = f.read_text(encoding='utf-8', errors='replace')
        write(out / k, f)
        n += 1
        lits |= {m.group(2) for m in STR_RX.finditer(code)}
        # personajes añadidos por script
        for m in re.finditer(r"addCharacterToList\s*\(\s*['\"]([^'\"]+)['\"]\s*,\s*['\"]?(\w+)", code):
            chars_needed.setdefault(m.group(1), m.group(2).lower() in ('boyfriend', 'bf', '0'))
    imgs = snds = 0
    for lit in lits:
        lit = lit.replace('\\', '/').strip()
        if not lit or len(lit) > 100:
            continue
        base = lit[:-4] if lit.lower().endswith('.png') else lit
        if vfs.get(f'images/{base}.png'):
            if copy_atlas(vfs, base, out, None, report) is not None:
                imgs += 1
        elif '/' in base:
            # rutas construidas con concatenación ('pop-ups/'..nombre, 'dropimages/image'..i): se copian todas las que empiezan así
            pre = f'images/{base}'.lower()
            hits = [k for k in vfs.files if k.startswith(pre) and k.endswith('.png')][:80]
            for k in hits:
                orig = '/'.join(vfs.get(k).parts[-len(Path(k).parts):])  # misma ruta con mayúsculas originales
                if copy_atlas(vfs, orig[7:-4], out, None, report) is not None:
                    imgs += 1
        for ext in ('ogg', 'mp3', 'wav'):
            snd = vfs.get(f'sounds/{lit}.{ext}')
            if snd:
                encode_audio(snd, out / 'sounds' / lit)
                snds += 1
                break
        fnt = vfs.get(f'fonts/{lit}') or vfs.get(f'fonts/{lit}.ttf') or vfs.get(f'fonts/{lit}.otf')
        if fnt:
            dst = f'fonts/{fnt.name}'
            write(out / dst, fnt)
            if dst not in FONTS:
                FONTS.append(dst)
    log(f'Scripts Lua: {n} (con {imgs} imágenes y {snds} sonidos referenciados)')
    report.append(f'{n} scripts Lua se ejecutan en el intérprete aislado de la web (API de Psych compatible; las funciones no implementadas se ignoran).')


def copy_ui(vfs, out, report):
    """Skin de notas, notas dañinas, puntuaciones y cuenta atrás del propio mod (sin cambiarlas)."""
    skins = {'NOTE_assets', 'HURTNOTE_assets'}
    for k in vfs.glob('data/*/*.json'):
        try:
            ch = vfs.json(k) or {}
            sng = ch['song'] if isinstance(ch.get('song'), dict) else ch
            if sng.get('arrowSkin'):
                skins.add(str(sng['arrowSkin']))
        except Exception:
            pass
    for k in vfs.glob('images/noteskins/*.png'):
        skins.add('noteSkins/' + Path(vfs.get(k).name).stem)
    got = [sk for sk in sorted(skins) if vfs.get(f'images/{sk}.png') and vfs.get(f'images/{sk}.xml') and copy_atlas(vfs, sk, out, None, report) is not None]
    if got:
        log('Skins de notas: ' + ', '.join(got))
    for n in ('sick', 'good', 'bad', 'shit', 'ready', 'set', 'go', 'healthBar', 'timeBar'):
        if vfs.get(f'images/{n}.png'):
            copy_atlas(vfs, n, out, None, report)
    for f in ('vcr.ttf', 'pixel.otf'):
        src = vfs.get(f'fonts/{f}')
        if src:
            write(out / 'fonts' / f, src)
            if f'fonts/{f}' not in FONTS:
                FONTS.append(f'fonts/{f}')


# ------------------------------------------------------------------ importación Psych
BUILTIN_EVENTS = {'Hey!', 'Add Camera Zoom', 'Play Animation', 'Camera Follow Pos', 'Change Character', 'Screen Shake', 'Change Scroll Speed', 'Set GF Speed', 'Set Cam Zoom', ''}


def import_psych(vfs, out, meta, report):
    pack = vfs.json('pack.json') or {}
    # canciones y dificultades: weeks/*.json o carpetas de data/
    songs = []
    for wk in vfs.glob('weeks/*.json'):
        w = vfs.json(wk) or {}
        diffs = [d.strip().lower() for d in str(w.get('difficulties', '') or '').split(',') if d.strip()]
        for sng in w.get('songs', []):
            if isinstance(sng, list) and sng:
                songs.append((str(sng[0]), diffs))
    if not songs:
        seen = set()
        for k in vfs.glob('data/*/*.json'):
            sid = k.split('/')[1]
            if sid not in seen:
                seen.add(sid); songs.append((sid, []))
    result_songs, chars_needed, stages_needed = [], {}, set()
    gf_missing = set()
    custom_events, inst_missing = set(), []
    for name, diffs in songs:
        sid = song_path(name)
        files = [k for k in vfs.glob(f'data/{sid}/*.json') if not k.endswith('/events.json')]
        if not files:
            report.append(f'Canción «{name}»: no se encontró su chart (data/{sid}/).')
            continue
        avail = {}
        for k in files:
            stem = Path(k).stem
            if stem == sid:
                avail['normal'] = k
            elif stem.startswith(sid + '-'):
                avail[stem[len(sid) + 1:]] = k
        if not avail:
            continue
        order = [d for d in diffs if d in avail] or sorted(avail, key=lambda d: ['easy', 'normal', 'hard'].index(d) if d in ['easy', 'normal', 'hard'] else 9)
        # en Psych, si la semana solo define una dificultad y existe <cancion>.json, ese archivo es el chart por defecto
        if diffs and not any(d in avail for d in diffs) and 'normal' in avail:
            order = ['normal']
        bpm = 0
        for d in order:
            ch = vfs.json(avail[d]) or {}
            s = ch['song'] if isinstance(ch.get('song'), dict) else ch
            bpm = bpm or s.get('bpm', 0)
            for slot, key in (('bf', 'player1'), ('dad', 'player2'), ('gf', 'gfVersion')):
                c = s.get(key) or (s.get('player3') if key == 'gfVersion' else None)
                if c:
                    chars_needed.setdefault(str(c), slot == 'bf')
            if s.get('stage'):
                stages_needed.add(str(s['stage']))
            evs = list(s.get('events', []))
            ej = vfs.json(f'data/{sid}/events.json')
            if ej:
                evs += (ej['song'] if isinstance(ej.get('song'), dict) else ej).get('events', [])
            for e in evs:
                for sub in (e[1] if isinstance(e, list) and len(e) > 1 and isinstance(e[1], list) else []):
                    if not sub:
                        continue
                    if sub[0] == 'Change Character' and len(sub) > 2:
                        chars_needed.setdefault(str(sub[2]).strip(), str(sub[1]).lower().strip() in ('bf', 'boyfriend', '0'))
                    elif sub[0] not in BUILTIN_EVENTS:
                        custom_events.add(str(sub[0]))
            # copia del chart con nombre normalizado (minúsculas, como lo pide la web)
            dst_name = f'{sid}.json' if d == 'normal' else f'{sid}-{d}.json'
            write(out / 'data' / sid / dst_name, vfs.get(avail[d]))
        if vfs.get(f'data/{sid}/events.json'):
            write(out / 'data' / sid / 'events.json', vfs.get(f'data/{sid}/events.json'))
        # audio
        first = vfs.json(avail[order[0]]) or {}
        s0 = first['song'] if isinstance(first.get('song'), dict) else first
        p1, p2 = str(s0.get('player1', 'bf')), str(s0.get('player2', 'dad'))
        audio = {k.split('/')[-1]: vfs.get(k) for k in vfs.files if k.startswith(f'songs/{sid}/') and k.rsplit('.', 1)[-1] in ('ogg', 'mp3', 'wav')}
        def pick(*names):
            for n in names:
                for ext in ('ogg', 'mp3', 'wav'):
                    f = audio.get(f'{n.lower()}.{ext}')
                    if f:
                        return f
            return None
        inst = pick('inst')
        if not inst:
            inst_missing.append(name)
            report.append(f'Canción «{name}»: falta el instrumental (songs/{sid}/Inst.ogg).')
            continue
        encode_audio(inst, out / 'songs' / sid / 'Inst')
        # Psych 0.7.3+: cada personaje puede indicar su archivo de voces (vocals_file → Voices-<x>)
        vfile = lambda cid: str((vfs.json(f'characters/{cid}.json') or {}).get('vocals_file') or cid)
        vp = pick('voices-player', f'voices-{vfile(p1)}', f'voices-{p1}')
        vo = pick('voices-opponent', f'voices-{vfile(p2)}', f'voices-{p2}')
        if vp:
            encode_audio(vp, out / 'songs' / sid / 'Voices-Player', mono=True)
        if vo:
            encode_audio(vo, out / 'songs' / sid / 'Voices-Opponent', mono=True)
        if not vp and not vo and pick('voices'):
            encode_audio(pick('voices'), out / 'songs' / sid / 'Voices', mono=True)
        pretty = name if name != sid else name.replace('-', ' ').title()
        result_songs.append({'id': sid, 'name': pretty, 'difficulties': order, **({'bpm': round(bpm)} if bpm else {})})
        log(f'Canción «{pretty}»: dificultades {", ".join(order)}')

    # scripts Lua (se ejecutan en el intérprete aislado de la web) y lo que referencian
    LUA_WANTED.update(f'stages/{st}.lua'.lower() for st in stages_needed if vfs.get(f'stages/{st}.lua'))
    copy_lua(vfs, out, result_songs, chars_needed, custom_events, report)
    copy_ui(vfs, out, report)
    # personajes
    for cid, is_player in list(chars_needed.items()):
        cj = vfs.json(f'characters/{cid}.json')
        if not cj or not vfs.get(f"images/{str(cj.get('image', '')).split(',')[0].strip()}.png"):
            if cid.lower() in ('gf', 'gf-christmas', 'gf-car', 'gf-pixel', 'gf-tankmen', 'girlfriend'):
                gf_missing.add(cid)
                continue
            report.append(f'Personaje «{cid}» no incluido en el mod (se usará un personaje de reemplazo).')
            continue
        image = str(cj.get('image', '')).split(',')[0].strip()
        if ',' in str(cj.get('image', '')):
            report.append(f'Personaje «{cid}» usa varios atlas; solo se usa el primero.')
        keep = [str(a.get('name', '')) for a in cj.get('animations', []) if a.get('name')]
        sc = copy_atlas(vfs, image, out, keep, report)
        if sc is None:
            report.append(f'Personaje «{cid}»: no se encontró su imagen images/{image}.png.')
            continue
        cj['image'] = image
        (out / 'characters').mkdir(parents=True, exist_ok=True)
        (out / 'characters' / f'{cid}.json').write_text(json.dumps(cj, indent=1, ensure_ascii=False), encoding='utf-8')
        icon = str(cj.get('healthicon', cid))
        src_icon = vfs.get(f'images/icons/icon-{icon}.png') or vfs.get(f'images/icons/{icon}.png')
        if src_icon:
            write(out / 'images' / 'icons' / f'icon-{icon}.png', src_icon)
        log(f'Personaje «{cid}» ({"jugador" if is_player else "oponente/gf"})')


    # escenarios
    for st in stages_needed:
        sj = vfs.json(f'stages/{st}.json')
        if sj is None:
            report.append(f'Escenario «{st}» no incluido: se usará uno por defecto.')
            continue
        objs = sj.get('objects') or []
        if vfs.get(f'stages/{st}.lua'):
            LUA_WANTED.add(f'stages/{st}.lua')
        kept = []
        for o in objs:
            if o.get('type') in ('sprite', 'animatedSprite') and not o.get('image'):
                continue
            if o.get('type') in ('sprite', 'animatedSprite') and o.get('image'):
                sc = copy_atlas(vfs, o['image'], out, None, report)
                if sc is None:
                    report.append(f'Escenario «{st}»: falta la imagen images/{o["image"]}.png')
                    continue
            kept.append(o)
        sj['objects'] = kept
        if gf_missing:
            sj['hide_girlfriend'] = True
        (out / 'stages').mkdir(parents=True, exist_ok=True)
        (out / 'stages' / f'{st}.json').write_text(json.dumps(sj, indent=1, ensure_ascii=False), encoding='utf-8')

    # inventario de lo no soportado
    hx = [k for k in vfs.files if k.endswith(('.hx', '.hxs', '.hscript'))]
    if hx:
        report.append(f'{len(hx)} scripts HScript no se ejecutan en la web.')
    no_lua = sorted(e for e in custom_events if not vfs.get(f'custom_events/{e}.lua'))
    if no_lua:
        report.append('Eventos personalizados sin script: ' + ', '.join(no_lua))
    if [k for k in vfs.files if k.endswith(('.mp4', '.webm'))]:
        report.append('Incluye vídeos/cinemáticas, que no se reproducen.')
    if vfs.glob('shaders/*.frag'):
        report.append('Shaders propios (efectos visuales GLSL) no se aplican.')
    return result_songs, pack


# ------------------------------------------------------------------ V-Slice (copia directa de datos)
def import_vslice(vfs, out, report):
    songs = []
    for k in vfs.glob('data/songs/*/*-metadata.json'):
        sid = k.split('/')[2]
        m = vfs.json(k) or {}
        songs.append({'id': sid, 'name': m.get('songName', sid), 'difficulties': (m.get('playData') or {}).get('difficulties', ['normal'])})
    prefixes = ('data/songs/', 'data/characters/', 'data/stages/', 'songs/', 'images/')
    for k, f in vfs.files.items():
        if k.startswith(prefixes) and not k.endswith(('.lua', '.hx', '.hxc')):
            write(out / Path(*Path(k).parts), f)
    report.append('V-Slice: se copiaron los datos tal cual (sin reempaquetar). Los scripts HScript (.hxc) no se ejecutan.')
    return songs


# ------------------------------------------------------------------ portada
def make_cover(out, title, subtitle):
    W, H = 1280, 720
    c = Image.new('RGBA', (W, H), (14, 10, 28, 255))
    # fondo: la imagen de escenario más grande
    imgs = sorted((p for p in (out / 'images').rglob('*.png') if not p.with_suffix('.xml').exists() and 'icons' not in p.parts), key=lambda p: -p.stat().st_size)
    if imgs:
        with Image.open(imgs[0]) as bg:
            bg = bg.convert('RGBA')
            r = max(W / bg.width, H / bg.height)
            bg = bg.resize((int(bg.width * r) + 1, int(bg.height * r) + 1)).filter(ImageFilter.GaussianBlur(4))
            c.alpha_composite(bg, ((W - bg.width) // 2, (H - bg.height) // 2))
    # personajes: primer frame de su animación idle
    chars = sorted((out / 'characters').glob('*.json')) if (out / 'characters').exists() else []
    picks = []
    for cj in chars:
        j = json.loads(cj.read_text(encoding='utf-8'))
        idle = next((a for a in j.get('animations', []) if a.get('anim') in ('idle', 'danceLeft')), None)
        x = out / 'images' / (j.get('image', '') + '.xml')
        if not idle or not x.exists():
            continue
        m = re.search(r'name="' + re.escape(idle['name']) + r'[^"]*"\s+x="(\d+)"\s+y="(\d+)"\s+width="(\d+)"\s+height="(\d+)"', x.read_text(encoding='utf-8', errors='replace'))
        if m:
            picks.append((j.get('flip_x', False), x.with_suffix('.png'), tuple(map(int, m.groups()))))
    for i, (flip, png, (x, y, w, h)) in enumerate(picks[:2]):
        with Image.open(png) as im:
            fr = im.convert('RGBA').crop((x, y, x + w, y + h))
        fr.thumbnail((560, 560))
        if i == 1:
            c.alpha_composite(fr, (W - fr.width - 30, H - fr.height - 20))
        else:
            c.alpha_composite(fr, (30, H - fr.height - 20))
    g = Image.new('RGBA', (W, H))
    d = ImageDraw.Draw(g)
    for yy in range(H):
        d.line([(0, yy), (W, yy)], fill=(8, 6, 18, int(max(0, yy - 330) / 390 * 235)))
    c.alpha_composite(g)
    font = None
    for name in ('Poppins-Bold.ttf', 'DejaVuSans-Bold.ttf', 'LiberationSans-Bold.ttf'):
        try:
            path = subprocess.run(['fc-match', '-f', '%{file}', name.split('.')[0]], capture_output=True, text=True).stdout.strip()
            if path and name.split('-')[0].lower() in path.lower():
                font = path; break
        except Exception:
            pass
    def F(sz):
        try:
            return ImageFont.truetype(font, sz) if font else ImageFont.load_default()
        except Exception:
            return ImageFont.load_default()
    d = ImageDraw.Draw(c)
    size = 96
    while size > 40 and d.textlength(title.upper(), font=F(size)) > W - 80:
        size -= 6
    d.text((W // 2, 560), title.upper(), font=F(size), fill='white', anchor='mm', stroke_width=9, stroke_fill=(20, 10, 40))
    if subtitle:
        d.text((W // 2, 640), subtitle[:60], font=F(36), fill=(255, 140, 200), anchor='mm', stroke_width=5, stroke_fill=(20, 10, 40))
    c.convert('RGB').resize((640, 360), Image.LANCZOS).save(out / 'cover.webp', quality=82)


# ------------------------------------------------------------------ main
def main():
    ap = argparse.ArgumentParser(description='Importa un mod de FNF a Funkade.')
    ap.add_argument('input')
    ap.add_argument('--id'); ap.add_argument('--name'); ap.add_argument('--category', default='Mods de la comunidad')
    ap.add_argument('--description'); ap.add_argument('--author'); ap.add_argument('--popularity', type=int, default=60)
    ap.add_argument('--out', default='public/mods'); ap.add_argument('--report')
    a = ap.parse_args()
    with tempfile.TemporaryDirectory() as tmp:
        root = extract(a.input, tmp)
        layers, kind = find_layers(root)
        log(f'Formato detectado: {kind} · capas: ' + ', '.join(str(l.relative_to(root)) or '.' for l in layers))
        vfs = VFS(layers)
        is_build = layers[0].name.lower() == 'assets'
        pack = {} if is_build else (vfs.json('pack.json') or {})
        # en compilaciones con .exe, los pack.json suelen ser de sub-mods (HUD, etc.): usamos el nombre del archivo
        guess = Path(a.input.rstrip('/')).stem if is_build or layers[-1] == root else layers[-1].name
        guess = re.sub(r'[_\-]+', ' ', re.sub(r'(?i)(demo)?(final|real)+$', '', guess)).strip().title() if is_build else guess
        name = a.name or pack.get('name') or guess
        mid = slug(a.id or name)
        out = Path(a.out) / mid
        if out.exists():
            shutil.rmtree(out)
        out.mkdir(parents=True)
        report = []
        if kind == 'vslice':
            songs, fmt = import_vslice(vfs, out, report), 'vslice'
        else:
            if kind == 'legacy':
                report.append('Compilación de FNF 0.2.x: los personajes y escenarios están programados en el .exe; se necesita adaptarlos a mano (ver docs/agregar-mod.md, ejemplo VS Garcello).')
            songs, pack = import_psych(vfs, out, {}, report)
            fmt = 'psych'
        if not songs:
            shutil.rmtree(out)
            sys.exit('No se pudo importar ninguna canción. Revisa el informe:\n- ' + '\n- '.join(report))
        desc = a.description or re.sub(r'\s+', ' ', str(pack.get('description', '')).strip())[:220] or f'{len(songs)} canción(es) importada(s) automáticamente.'
        partial = any(('no se aplican' in r) or ('no se ejecutan en la web' in r) or ('sin soporte' in r) or ('reemplazo' in r) or ('no soportado' in r) for r in report)
        manifest = {
            'id': mid, 'name': name, 'version': '1.0.0', 'format': fmt,
            'author': a.author or 'Autores originales del mod · importado con Funkade',
            'license': 'Mod de fans; recursos de sus autores originales.',
            'description': desc, 'category': a.category, 'cover': 'cover.webp', 'popularity': a.popularity,
            'compatibility': 'partial' if partial else 'full', 'compatNotes': report[:8], 'songs': songs,
        }
        if TEX_SCALE:
            manifest['textureScale'] = {k: round(v, 5) for k, v in sorted(TEX_SCALE.items())}
        if FONTS:
            manifest['fonts'] = FONTS
        (out / 'manifest.json').write_text(json.dumps(manifest, indent=2, ensure_ascii=False), encoding='utf-8')
        try:
            make_cover(out, name, f'{len(songs)} canción' + ('es' if len(songs) != 1 else ''))
        except Exception as e:
            log(f'No se pudo generar la portada: {e}')
        size = sum(f.stat().st_size for f in out.rglob('*') if f.is_file())
        md = [f'## Mod importado: {name}', '', f'- Carpeta: `public/mods/{mid}`', f'- Formato: **{fmt}** ({kind})', f'- Canciones: ' + ', '.join(f"{s['name']} ({'/'.join(s['difficulties'])})" for s in songs),
              f'- Tamaño: {size / 1048576:.1f} MB', f'- Compatibilidad: **{"Parcial" if partial else "Completa"}**', '', '### Avisos', *(f'- {r}' for r in report or ['Ninguno']), '', '### Registro', *(f'- {l}' for l in log_lines)]
        print('\n'.join(md))
        if a.report:
            Path(a.report).write_text('\n'.join(md) + '\n', encoding='utf-8')
        if size > 150 * 1048576:
            print(f'\nAVISO: el mod ocupa {size / 1048576:.0f} MB. GitHub Pages admite ~1 GB en total por sitio.')


if __name__ == '__main__':
    main()
