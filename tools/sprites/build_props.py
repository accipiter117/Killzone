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


def cut(im):
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
    ys, xs = np.where(~bg)
    return Image.fromarray(a[ys.min():ys.max() + 1, xs.min():xs.max() + 1])


def main():
    os.makedirs(OUT, exist_ok=True)
    for path in sorted(glob.glob(os.path.join(SRC, 'prop-*.*'))):
        name = os.path.splitext(os.path.basename(path))[0][5:]
        img = cut(Image.open(path))
        w = WIDTH.get(name, 160)
        img = img.resize((w, round(img.height * w / img.width)), Image.LANCZOS)
        a = np.asarray(img).copy()
        a[..., 3] = np.where(a[..., 3] > 110, 255, 0)
        out = Image.fromarray(a).quantize(colors=255, method=Image.FASTOCTREE, dither=Image.NONE)
        out.save(os.path.join(OUT, f'{name}.png'), optimize=True)
        print(name, out.size, os.path.getsize(os.path.join(OUT, f'{name}.png')), 'bytes')


if __name__ == '__main__':
    main()
