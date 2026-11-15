"""Cut the owner's ChatGPT flag sheets (tools/sprites/source/*-flag-*.webp)
into game frames.

Usage: python3 tools/sprites/build_flags.py  (writes assets/sprites/flags.png and flags.json)

Each sheet is one row of flags: 'wave' (a 6 frame loop) and 'raise' (5
frames, limp to flying). Some sheets came on white, so the background is cut
away by flooding in from the edges (the white inside the emblems is walled
in by the cloth, so it stays). The flags are found as separate blobs, left
to right, and every frame records its hoist corner (the top of the cloth at
its left edge, where it meets the pole) so the game can pin all frames to
the same point and the flag never judders against the pole.
"""
import json, os, sys
from collections import deque
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, 'source')
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, '..', '..', 'assets', 'sprites')
WIDTH = 96  # a waving flag's width in the atlas, in pixels (drawn at about 30 on screen)
SHEETS = [('isa', 'wave', 6), ('isa', 'raise', 5), ('hgh', 'wave', 6), ('hgh', 'raise', 5)]


def cut_background(im):
    a = np.asarray(im.convert('RGBA')).copy()
    h, w = a.shape[:2]
    rgb = a[..., :3].astype(np.int16)
    # Background: already transparent, or pale and grey (white, or the grey
    # checkerboard ChatGPT sometimes paints in place of transparency).
    pale = (a[..., 3] < 40) | ((rgb.min(axis=2) > 200) & (rgb.max(axis=2) - rgb.min(axis=2) < 24))
    bg = np.zeros((h, w), bool)
    q = deque()
    for x in range(w):
        for y in (0, h - 1):
            if pale[y, x] and not bg[y, x]: bg[y, x] = True; q.append((y, x))
    for y in range(h):
        for x in (0, w - 1):
            if pale[y, x] and not bg[y, x]: bg[y, x] = True; q.append((y, x))
    while q:
        y, x = q.popleft()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < h and 0 <= nx < w and pale[ny, nx] and not bg[ny, nx]:
                bg[ny, nx] = True; q.append((ny, nx))
    a[bg, 3] = 0
    a[~bg, 3] = 255
    return a


def frames(a, n):
    """The n flags in the row, left to right, as (x0, y0, x1, y1) boxes."""
    solid = a[..., 3] > 0
    cols = solid.sum(axis=0) > 3
    runs, x = [], 0
    w = len(cols)
    while x < w:
        if cols[x]:
            s = x
            while x < w and cols[x]: x += 1
            runs.append((s, x))
        x += 1
    runs = sorted(runs, key=lambda r: r[1] - r[0], reverse=True)[:n]
    runs.sort()
    assert len(runs) == n, f'found {len(runs)} flags, expected {n}'
    boxes = []
    for x0, x1 in runs:
        rows = np.where(solid[:, x0:x1].sum(axis=1) > 2)[0]
        boxes.append((x0, rows[0], x1, rows[-1] + 1))
    return boxes


def hoist(a, box):
    """The hoist corner: top of the cloth in its leftmost few columns."""
    x0, y0, x1, y1 = box
    strip = a[y0:y1, x0:x0 + 6, 3] > 0
    ys = np.where(strip.any(axis=1))[0]
    return 0, int(ys[0])


def main():
    out, meta, x = [], {'image': 'flags.png', 'frames': {}}, 0
    for side, kind, n in SHEETS:
        a = cut_background(Image.open(os.path.join(SRC, f'{side}-flag-{kind}.webp')))
        boxes = frames(a, n)
        # ChatGPT drew each sheet at its own size: scale the waving sheet by
        # its first flag, and the raising sheet by its last (almost fully
        # out, so it should match a waving flag).
        ref = boxes[0] if kind == 'wave' else boxes[-1]
        scale = WIDTH / (ref[2] - ref[0])
        names = []
        for i, b in enumerate(boxes):
            hx, hy = hoist(a, b)
            img = Image.fromarray(a[b[1]:b[3], b[0]:b[2]])
            w, h = max(1, round(img.width * scale)), max(1, round(img.height * scale))
            img = img.resize((w, h), Image.LANCZOS)
            px = np.asarray(img).copy()
            px[..., 3] = np.where(px[..., 3] > 110, 255, 0)  # hard edge, no fringe
            img = Image.fromarray(px)
            out.append((img, x))
            name = f'{side}:{kind}{i + 1}'
            meta['frames'][name] = {'x': x, 'y': 0, 'w': w, 'h': h, 'ax': round(hx * scale), 'ay': round(hy * scale)}
            names.append(name)
            x += w + 2
    H = max(img.height for img, _ in out)
    atlas = Image.new('RGBA', (x, H), (0, 0, 0, 0))
    for img, ox in out: atlas.paste(img, (ox, 0))
    os.makedirs(OUT, exist_ok=True)
    # A palette image keeps the file small (the flags use few colours).
    atlas.quantize(colors=255, method=Image.FASTOCTREE, dither=Image.NONE).save(os.path.join(OUT, 'flags.png'), optimize=True)
    with open(os.path.join(OUT, 'flags.json'), 'w') as f: json.dump(meta, f, indent=1)
    print('flags.png', atlas.size, len(meta['frames']), 'frames')


if __name__ == '__main__':
    main()
