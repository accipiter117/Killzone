"""Cut the ChatGPT sprite sheets (tools/sprites/source) into clean, game-sized frames.

Usage: python3 tools/sprites/build_atlas.py  (writes assets/sprites/)

Each sheet is 8 columns (directions) by N rows (frames); see
docs/SPRITE-GUIDE.md. For every cell: find the figure, harden its edge (no
grey fringe), drop specks and bits bleeding in from the next cell, scale it
down with area averaging so the detail survives, and record where its feet
touch the ground. Every sheet is scaled so the soldier comes out the same
size. Sheets drawn on white (ChatGPT does not always manage transparency)
have the white cut away first. Writes one packed atlas PNG and a JSON index
per unit.
"""
import colorsys, json, os, sys
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, 'source')
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, '..', '..', 'assets', 'sprites')
H = 76  # final standing height in pixels

# Each unit: its sheets as (sheet, rows, frame names, scale), where scale is
# (kind, factor): 'h' sizes the sheet so the first frame facing the viewer
# is factor * H tall; 'w' so the first frame in the right-facing column is
# factor * H wide (for lying poses); 'as' copies another sheet's scale.
RIFLE = [
    ('stand', 1, ['stand'], ('h', 1.0)),
    ('run', 4, ['run1', 'run2', 'run3', 'run4'], ('h', 0.95)),
    ('fire', 2, ['fire', 'aim'], ('h', 0.97)),
    ('prone', 2, ['prone1', 'prone2'], ('w', 0.85)),
    ('die', 3, ['hit', 'fall', 'dead'], ('as', 'throw')),
    ('throw', 3, ['throw1', 'throw2', 'throw3'], ('h', 0.95)),
]
TANK = [
    ('stand', 1, ['idle'], ('w', 2.4)),
    ('anim', 5, ['move1', 'move2', 'fire', 'damaged', 'wreck'], ('w', 2.4)),
]
UNITS = {
    'hgh-rifle': {'sheets': RIFLE},
    # The ISA dying sheet came from its own request, so it is sized by its
    # own first frame (jolted back, a little shorter than standing).
    'isa-rifle': {'sheets': [s if s[0] != 'die' else ('die', 3, ['hit', 'fall', 'dead'], ('h', 0.93)) for s in RIFLE], 'tint': 'isa-rifle-blue'},
    # One ISA and one Helghast locked together; 8 directions given as the
    # way the ISA soldier faces; a 4 frame struggling loop.
    'grapple': {'sheets': [('grapple', 4, ['grapple1', 'grapple2', 'grapple3', 'grapple4'], ('h', 0.9))], 'file': 'grapple.png'},
    # Tanks: a reference sheet (standing still) and an animation sheet
    # (two driving frames, firing, damaged, wreck), 8 directions each; both
    # sized so the side view is the same length.
    'hgh-tank': {'sheets': TANK},
    'isa-tank': {'sheets': TANK},
}


def load(path):
    """The sheet as RGBA, with a white background cut away if it has no transparency."""
    im = Image.open(path).convert('RGBA')
    if im.split()[3].getextrema()[0] > 0:
        a = np.asarray(im).astype(np.int16)
        light = (a[..., :3].min(axis=2) > 175) & (a[..., :3].max(axis=2) - a[..., :3].min(axis=2) < 30)
        # The background is the light area joined to the edge of the sheet:
        # grow it inwards from the border until it stops changing (light
        # pixels inside the soldier, such as highlights, are never reached).
        bg = np.zeros_like(light)
        bg[0, :] = light[0, :]; bg[-1, :] = light[-1, :]; bg[:, 0] = light[:, 0]; bg[:, -1] = light[:, -1]
        while True:
            grown = bg.copy()
            grown[1:, :] |= bg[:-1, :]; grown[:-1, :] |= bg[1:, :]; grown[:, 1:] |= bg[:, :-1]; grown[:, :-1] |= bg[:, 1:]
            grown &= light
            if (grown == bg).all():
                break
            bg = grown
        # Pockets of white trapped inside a pose (between an arm and the body)
        # are background too; tiny bright specks (highlights) are kept.
        white = (a[..., :3].min(axis=2) > 236) & ~bg
        ys, xs = np.nonzero(white)
        seen = set()
        Wd = white.shape[1]
        for y0, x0 in zip(ys, xs):
            if (y0, x0) in seen:
                continue
            stack, comp = [(y0, x0)], []
            seen.add((y0, x0))
            while stack:
                y, x = stack.pop()
                comp.append((y, x))
                for ny, nx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
                    if 0 <= ny < white.shape[0] and 0 <= nx < Wd and white[ny, nx] and (ny, nx) not in seen:
                        seen.add((ny, nx)); stack.append((ny, nx))
            if len(comp) > 250:
                for y, x in comp:
                    bg[y, x] = True
        # The soft edge where the soldier was blended into the white: pale,
        # colourless pixels touching the background go too (two passes).
        pale = (a[..., :3].min(axis=2) > 125) & (a[..., :3].max(axis=2) - a[..., :3].min(axis=2) < 40)
        for _ in range(2):
            near = np.zeros_like(bg)
            near[1:, :] |= bg[:-1, :]; near[:-1, :] |= bg[1:, :]; near[:, 1:] |= bg[:, :-1]; near[:, :-1] |= bg[:, 1:]
            bg = bg | (near & pale)
        arr = np.asarray(im).copy()
        arr[bg, 3] = 0
        im = Image.fromarray(arr)
    return im


def figure(cell):
    a = cell.split()[3]
    hard = a.point(lambda v: 255 if v > 110 else 0)
    w, h = hard.size
    px = hard.load()
    seen = bytearray(w * h)
    comps = []
    total = sum(1 for y in range(h) for x in range(w) if px[x, y])
    for y0 in range(h):
        for x0 in range(w):
            if not px[x0, y0] or seen[y0 * w + x0]:
                continue
            stack, comp = [(x0, y0)], []
            seen[y0 * w + x0] = 1
            while stack:
                x, y = stack.pop()
                comp.append((x, y))
                for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                    if 0 <= nx < w and 0 <= ny < h and px[nx, ny] and not seen[ny * w + nx]:
                        seen[ny * w + nx] = 1
                        stack.append((nx, ny))
            comps.append(comp)
    # Keep the soldier (the biggest island) and anything sizeable close to
    # him (a dropped rifle, a grenade in flight); drop specks and bleed.
    if comps:
        main = max(comps, key=len)
        mx0 = min(x for x, _ in main); mx1 = max(x for x, _ in main)
        my0 = min(y for _, y in main); my1 = max(y for _, y in main)
        mw, mh = mx1 - mx0, my1 - my0
        for comp in comps:
            if comp is main:
                continue
            cx0 = min(x for x, _ in comp); cx1 = max(x for x, _ in comp)
            cy0 = min(y for _, y in comp); cy1 = max(y for _, y in comp)
            near = cx1 >= mx0 - mw * 0.35 and cx0 <= mx1 + mw * 0.35 and cy1 >= my0 - mh * 0.2 and cy0 <= my1 + mh * 0.35
            if len(comp) < max(30, total * 0.012) or not near:
                for x, y in comp:
                    px[x, y] = 0
    return hard.getbbox(), hard


def blue(img):
    """ISA armour tint: greys pulled towards the ISA's slate blue; already
    coloured pixels (the visor, hands, flash) are left alone."""
    a = np.asarray(img).astype(np.float32) / 255
    out = a.copy()
    rgb = a[..., :3]
    mx, mn = rgb.max(axis=2), rgb.min(axis=2)
    grey = (mx - mn) < 0.12
    lum = (0.3 * rgb[..., 0] + 0.59 * rgb[..., 1] + 0.11 * rgb[..., 2])
    slate = np.array([0.62, 0.78, 1.0])
    for c in range(3):
        out[..., c] = np.where(grey, np.clip(lum * (0.72 + 0.42 * slate[c]), 0, 1), rgb[..., c])
    return Image.fromarray((out * 255).round().astype(np.uint8))


def build(unit, spec):
    sheets = spec['sheets']
    files = {s[0]: os.path.join(SRC, spec.get('file') or f'{unit}-{s[0]}.png') for s in sheets}
    have = [s for s in sheets if os.path.exists(files[s[0]])]
    missing = [s[0] for s in sheets if s not in have]
    ims = {s[0]: load(files[s[0]]) for s in have}
    scale = {}
    for name, rows, _, (kind, f) in have:
        im = ims[name]
        W, Hh = im.size
        if kind == 'h':
            b, _ = figure(im.crop((0, 0, W // 8, Hh // rows)))
            scale[name] = H * f / (b[3] - b[1])
        elif kind == 'w':
            b, _ = figure(im.crop((W * 2 // 8, 0, W * 3 // 8, Hh // rows)))
            scale[name] = H * f / (b[2] - b[0])
    for name, _, _, (kind, f) in have:
        if kind == 'as':
            scale[name] = scale.get(f) or scale['stand']
    tiles = []
    for name, rows, fnames, _ in have:
        im = ims[name]
        W, Hh = im.size
        cw, ch = W / 8, Hh / rows
        s = scale[name]
        for r, fname in enumerate(fnames):
            for d in range(8):
                cell = im.crop((round(d * cw), round(r * ch), round((d + 1) * cw), round((r + 1) * ch)))
                b, hard = figure(cell)
                if not b:
                    continue
                rgba = cell.copy()
                rgba.putalpha(hard)
                crop = rgba.crop(b)
                w = max(1, round(crop.width * s)); h = max(1, round(crop.height * s))
                pre = Image.new('RGBA', crop.size)
                pre.paste(crop, (0, 0), crop)
                small = pre.resize((w, h), Image.BOX)
                arr = np.asarray(small).astype(np.float32)
                al = arr[..., 3:4]
                rgb = np.where(al > 0, np.clip(arr[..., :3] * 255 / np.maximum(al, 1), 0, 255), 0)
                alpha = np.where(arr[..., 3] > 120, 255, 0)
                out = Image.fromarray(np.dstack([rgb, alpha]).round().astype(np.uint8), 'RGBA')
                # Feet: the bottom of the figure; across, the middle of its
                # lowest part (so a rifle or flash sticking out does not shift
                # him), or of the whole figure when lying down.
                m = np.asarray(out)[..., 3] > 0
                ys, xs = np.nonzero(m[h - max(1, h // 5):] if name not in ('prone', 'die') else m)
                fx = round(xs.mean()) if len(xs) else w // 2
                tiles.append((f'{fname}:{d}', out, fx, h))
    PAD, width = 2, 1024
    x = y = rowh = 0
    places = {}
    for key, img, fx, fy in tiles:
        if x + img.width + PAD > width:
            x = 0; y += rowh + PAD; rowh = 0
        places[key] = (x, y, img.width, img.height, fx, fy)
        x += img.width + PAD
        rowh = max(rowh, img.height)
    atlas = Image.new('RGBA', (width, y + rowh + PAD))
    for key, img, _, _ in tiles:
        atlas.paste(img, places[key][:2])
    meta = {'height': H, 'frames': places, 'missing': missing, 'directions': ['S', 'SE', 'E', 'NE', 'N', 'NW', 'W', 'SW']}
    atlas.save(os.path.join(OUT, f'{unit}.png'), optimize=True)
    json.dump({**meta, 'image': f'{unit}.png'}, open(os.path.join(OUT, f'{unit}.json'), 'w'))
    if spec.get('tint'):
        blue(atlas).save(os.path.join(OUT, spec['tint'] + '.png'), optimize=True)
        json.dump({**meta, 'image': spec['tint'] + '.png'}, open(os.path.join(OUT, spec['tint'] + '.json'), 'w'))
    print(unit, 'frames', len(tiles), 'atlas', atlas.size, 'missing', missing, {k: round(v, 3) for k, v in scale.items()})


only = sys.argv[2:] or list(UNITS)
for unit in only:
    build(unit, UNITS[unit])
