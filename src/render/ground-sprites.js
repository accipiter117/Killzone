// The owner's painted craters and rubble (tools/sprites/build_props.py),
// used by both terrain painters. They are painted into the battlefield
// picture, so once they have loaded the game repaints it (main.js); until
// then the code-drawn craters and stones stand in.

import { hash } from '../sim/map.js';

const CRATERS = ['crater-1', 'crater-2', 'crater-3', 'crater-4'];
const RUBBLE = { concrete: ['rubble-c1', 'rubble-c2', 'rubble-c3', 'rubble-c4'], brick: ['rubble-b1', 'rubble-b2', 'rubble-b3', 'rubble-b4'] };
const IMG = {};
export let groundReady = false;

export function loadGroundSprites(base = 'assets/sprites/props/') {
  const names = [...CRATERS, ...RUBBLE.concrete, ...RUBBLE.brick];
  return Promise.all(names.map((n) => new Promise((ok, no) => {
    const img = new Image();
    img.onload = () => { IMG[n] = img; ok(); };
    img.onerror = no;
    img.src = `${base}${n}.png`;
  }))).then(() => { groundReady = true; }, () => { groundReady = false; });
}

// A crater by size: small fresh ones, medium broken-rimmed, big deep ones,
// and now and then an old half-filled one. The picture's splash of thrown
// earth reaches past the bowl, so it is drawn larger than the crater.
export function drawCraterSprite(g, cr, lift = 0) {
  if (!groundReady) return false;
  const old = hash(Math.round(cr.x), Math.round(cr.y), 7) < 0.22;
  const name = old ? 'crater-4' : cr.r < 15 ? 'crater-1' : cr.r < 23 ? 'crater-2' : 'crater-3';
  const img = IMG[name], s = cr.r * 2.7;
  const turn = hash(Math.round(cr.y), Math.round(cr.x), 3) * Math.PI * 2;
  g.save();
  g.translate(cr.x, cr.y - lift);
  g.rotate(turn);
  g.globalAlpha = 0.92;
  g.imageSmoothingEnabled = true;
  g.drawImage(img, -s / 2, -s / 2, s, (s * img.height) / img.width);
  g.restore();
  return true;
}

// A rubble pile, concrete or brick, about `size` across.
export function drawRubbleSprite(g, x, y, kind, size, pick) {
  if (!groundReady) return false;
  const list = RUBBLE[kind] || RUBBLE.concrete;
  const img = IMG[list[Math.floor(pick * list.length) % list.length]];
  g.imageSmoothingEnabled = true;
  g.drawImage(img, x - size / 2, y - size / 2, size, (size * img.height) / img.width);
  return true;
}

// Brick if a brick wall stands (or stood) close by, otherwise concrete.
export function rubbleKind(map, i) {
  if (!map.wallKind) return 'concrete';
  const cx = i % map.cols, cy = (i / map.cols) | 0;
  for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
    const x = cx + dx, y = cy + dy;
    if (x < 0 || y < 0 || x >= map.cols || y >= map.rows) continue;
    if (map.wallKind[y * map.cols + x] === 1) return 'brick';
  }
  return 'concrete';
}
