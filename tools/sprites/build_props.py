"""Cut the owner's ChatGPT set-piece pictures (tools/sprites/source/prop-*.webp
or .png) into game art: assets/sprites/props/<name>.png.

Usage: python3 tools/sprites/build_props.py

Each picture is one object seen from above on white (or transparent). The
white is cut away by flooding in from the edges, so white inside the object
stays; loose debris round it is kept. The result is cropped to the object,
scaled down to WIDTH pixels wide (about twice its size in the game, so it
stays sharp zoomed in) and its edges hardened. docs/MAP-ART-PROMPTS.md has the
prompts.
"""
import glob, os
from collections import deque
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, 'source')
OUT = os.path.join(HERE, '..', '..', 'assets', 'sprites', 'props')
WIDTH = {'dropship': 440}  # pixels wide in the atlas, per prop (default 160)
# Sheets holding several props side by side: split at the gaps, left to right.
SPLIT = {'tankwrecks': ['tankwreck-isa', 'tankwreck-hgh']}


def cut(im, crop=True):
    a = np.asarray(im.convert('RGBA')).copy()
    h, w = a.shape[:2]
    rgb = a[..., :3].astype(np.int16)
    pale = (a[..., 3] < 40) | ((rgb.min(axis=2) > 200) & (rgb.max(axis=2) - rgb.min(axis=2) < 24))
    bg = np.zeros((h, w), bool)
    q = deque((y, x) for y in range(h) for x in (0, w - 1) if pale[y, x])
    q.extend((y, x) for x in range(w) for y in (0, h - 1) if pale[y, x])
    for y, x in q: bg[y, x] = True
    while q:
        y, x = q.popleft()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < h and 0 <= nx < w and pale[ny, nx] and not bg[ny, nx]:
                bg[ny, nx] = True; q.append((ny, nx))
    a[..., 3] = np.where(bg, 0, 255)
    if not crop: return a
    ys, xs = np.where(~bg)
    return Image.fromarray(a[ys.min():ys.max() + 1, xs.min():xs.max() + 1])


def split(a, n):
    """n pieces, split at the widest empty column runs."""
    cols = (a[..., 3] > 0).sum(axis=0) > 0
    runs, x, w = [], 0, len(cols)
    while x < w:
        if not cols[x]:
            s0 = x
            while x < w and not cols[x]: x += 1
            if s0 > 0 and x < w: runs.append((x - s0, s0, x))
        x += 1
    cuts = sorted(sorted(runs, reverse=True)[:n - 1], key=lambda r: r[1])
    edges = [0] + [(r[1] + r[2]) // 2 for r in cuts] + [w]
    out = []
    for k in range(n):
        piece = a[:, edges[k]:edges[k + 1]]
        ys, xs = np.where(piece[..., 3] > 0)
        out.append(Image.fromarray(piece[ys.min():ys.max() + 1, xs.min():xs.max() + 1]))
    return out


def save(img, name):
    w = WIDTH.get(name, 160)
    img = img.resize((w, round(img.height * w / img.width)), Image.LANCZOS)
    a = np.asarray(img).copy()
    a[..., 3] = np.where(a[..., 3] > 110, 255, 0)
    out = Image.fromarray(a).quantize(colors=255, method=Image.FASTOCTREE, dither=Image.NONE)
    out.save(os.path.join(OUT, f'{name}.png'), optimize=True)
    print(name, out.size, os.path.getsize(os.path.join(OUT, f'{name}.png')), 'bytes')


def main():
    os.makedirs(OUT, exist_ok=True)
    for path in sorted(glob.glob(os.path.join(SRC, 'prop-*.*'))):
        name = os.path.splitext(os.path.basename(path))[0][5:]
        if name in SPLIT:
            for piece, part in zip(split(cut(Image.open(path), crop=False), len(SPLIT[name])), SPLIT[name]):
                save(piece, part)
        else:
            save(cut(Image.open(path)), name)


if __name__ == '__main__':
    main()
