"""Cut the ChatGPT sprite sheets (tools/sprites/source) into clean, game-sized frames.

Each sheet is 8 columns (directions) by N rows (frames). For every cell:
find the figure, harden its edge (no grey fringe), scale it down with area
averaging so the detail survives, and record where its feet touch the
ground. Every sheet is scaled so the soldier comes out the same size.
Writes one packed atlas PNG and a JSON index for the game.
"""
import json, sys
from PIL import Image

import os
UP = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'source') + '/'
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'assets', 'sprites')  # usage: python3 tools/sprites/build_atlas.py
H = 76  # final standing height in pixels

# file, rows, frame names, scale rule
SHEETS = [
    ('stand', 'hgh-rifle-stand.png', 1, ['stand']),
    ('run', 'hgh-rifle-run.png', 4, ['run1', 'run2', 'run3', 'run4']),
    ('fire', 'hgh-rifle-fire.png', 2, ['fire', 'aim']),
    ('prone', 'hgh-rifle-prone.png', 2, ['prone1', 'prone2']),
    ('die', 'hgh-rifle-die.png', 3, ['hit', 'fall', 'dead']),
    ('throw', 'hgh-rifle-throw.png', 3, ['throw1', 'throw2', 'throw3']),
]

def figure(cell):
    a = cell.split()[3]
    hard = a.point(lambda v: 255 if v > 110 else 0)
    # Drop loose specks (tiny islands of pixels) so they cannot move the
    # feet line; keep anything sizeable, such as a dropped rifle.
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
    # him (a dropped rifle); drop specks and bits bleeding in from the next cell.
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
            if len(comp) < max(30, total * 0.015) or not near:
                for x, y in comp:
                    px[x, y] = 0
    return hard.getbbox(), hard

def first_bbox(path, rows):
    im = Image.open(UP + path).convert('RGBA')
    W, Hh = im.size
    b, _ = figure(im.crop((0, 0, W // 8, Hh // rows)))
    return b

# Scale per sheet: upright sheets by the height of the soldier facing the
# viewer in the first frame (allowing for bent knees), the lying sheets
# by matching their helmet size to the grenade sheet drawn at the same scale.
def h_of(name):
    path, rows = {s[0]: (s[1], s[2]) for s in SHEETS}[name]
    b = first_bbox(path, rows)
    return b[3] - b[1]

scale = {
    'stand': H / h_of('stand'),
    'fire': H * 0.97 / h_of('fire'),
    'run': H * 0.95 / h_of('run'),
    'throw': H * 0.95 / h_of('throw'),
}
scale['die'] = scale['throw']
# Lying down he is about as long as he is tall, plus the rifle out in front:
# size the prone sheet by the side view (right facing, first frame).
pim = Image.open(UP + 'hgh-rifle-prone.png').convert('RGBA')
pb, _ = figure(pim.crop((pim.width * 2 // 8, 0, pim.width * 3 // 8, pim.height // 2)))
# ChatGPT drew this sheet chunkier than the rest, so it is sized by eye
# to match the helmets of the standing and running frames.
scale['prone'] = H * 0.85 / (pb[2] - pb[0])

frames = {}
tiles = []
for name, path, rows, fnames in SHEETS:
    im = Image.open(UP + path).convert('RGBA')
    W, Hh = im.size
    cw, ch = W / 8, Hh / rows
    s = scale[name]
    for r, fname in enumerate(fnames):
        for d in range(8):
            cell = im.crop((round(d * cw), round(r * ch), round((d + 1) * cw), round((r + 1) * ch)))
            b, hard = figure(cell)
            if not b:
                continue
            # Harden the outline: keep only solid pixels, drop the soft halo.
            rgba = cell.copy()
            rgba.putalpha(hard)
            crop = rgba.crop(b)
            w = max(1, round(crop.width * s)); h = max(1, round(crop.height * s))
            # Area-average the colour over solid pixels only, then re-harden.
            pre = Image.new('RGBA', crop.size)
            pre.paste(crop, (0, 0), crop)
            small = pre.resize((w, h), Image.BOX)
            al = small.split()[3].point(lambda v: 255 if v > 120 else 0)
            rgb = small.convert('RGB')
            # Undo the darkening from averaging with transparent pixels.
            px, pa, src = rgb.load(), small.split()[3].load(), small.load()
            for y in range(h):
                for x in range(w):
                    a_ = pa[x, y]
                    if a_ > 0:
                        c = src[x, y]
                        px[x, y] = tuple(min(255, round(v * 255 / a_)) for v in c[:3])
            out = rgb.convert('RGBA'); out.putalpha(al)
            # Feet: the bottom of the figure; across, the middle of its lowest
            # part (so a rifle or flash sticking out does not shift him).
            m = out.split()[3].load()
            band = max(1, h // 5)
            xs = [x for y in range(h - band, h) for x in range(w) if m[x, y]]
            fx = round(sum(xs) / len(xs)) if xs else w // 2
            if name in ('prone', 'die'):
                xs = [x for y in range(h) for x in range(w) if m[x, y]]
                fx = round(sum(xs) / len(xs))
            tiles.append((f'{fname}:{d}', out, fx, h))

# Pack into rows.
PAD = 2
width = 1024
x = y = rowh = 0
places = {}
for key, img, fx, fy in tiles:
    if x + img.width + PAD > width:
        x = 0; y += rowh + PAD; rowh = 0
    places[key] = (x, y, img.width, img.height, fx, fy)
    x += img.width + PAD
    rowh = max(rowh, img.height)
atlas = Image.new('RGBA', (width, y + rowh + PAD))
for key, img, fx, fy in tiles:
    px_, py_, *_ = places[key]
    atlas.paste(img, (px_, py_))
atlas.save(OUT + '/hgh-rifle.png', optimize=True)
json.dump({'image': 'hgh-rifle.png', 'height': H, 'frames': places,
           'directions': ['S', 'SE', 'E', 'NE', 'N', 'NW', 'W', 'SW']}, open(OUT + '/hgh-rifle.json', 'w'))
print('frames', len(tiles), 'atlas', atlas.size, {k: round(v, 3) for k, v in scale.items()})
