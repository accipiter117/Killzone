// The outskirts of Pyrrhus.
//
// The ISA push in from the west through a bombed suburb: brick terraces
// with their roofs gone, a church whose tower still stands (the comms post),
// a park of dead trees and shell holes, and burnt-out vehicles along the
// avenue. An elevated highway crosses the north of the map, broken in the
// middle where a span has fallen: high ground for whoever holds each end.
// In the middle is the Autarch's plaza (B), raised above the streets, with
// his statue and banners. The Helghast hold the east: brutalist apartment
// blocks and the Ministry (C), with checkpoint barriers across the avenue
// and the street to the south worked from the checkpoint post, tank traps,
// and haze from a burst gas main.

import { WK } from '../map.js';
import { kit } from './kit.js';

export function pyrrhusMap(seedInt, cfg) {
  const W = 2400, H = 1700;
  const t = kit(W, H, cfg.world.cell, 'city', seedInt, 0x2545f491);

  // ---- Streets. ---------------------------------------------------------------
  t.road([[-20, 860], [600, 860], [1100, 860], [1500, 860], [2420, 860]], 34, 'asphalt');
  t.road([[700, -20], [700, 1720]], 22, 'asphalt');
  t.road([[1720, -20], [1720, 1720]], 22, 'asphalt');
  t.road([[-20, 1360], [700, 1360], [1720, 1360], [2420, 1360]], 20, 'asphalt');
  t.road([[700, 420], [1720, 420]], 18, 'asphalt', { lines: false });

  // ---- The elevated highway along the north, its middle span fallen. ------------
  t.raise(200, 150, 1080, 230, 1, 'concrete', { road: true });
  t.raise(1320, 150, 2200, 230, 1, 'concrete', { road: true });
  t.stairs(170, 150, 200, 230); t.stairs(2200, 150, 2230, 230);
  t.ramp(640, 240, 30); t.ramp(1760, 240, 30);
  t.debris(1080, 120, 1320, 260, 0.45);
  t.prop('jersey', 1120, 190, 60, 12, 1.2, { solid: true }); t.prop('jersey', 1270, 180, 60, 12, -1.0, { solid: true });
  t.prop('bus', 600, 190, 70, 24, 0.05, { solid: true });
  t.prop('truck', 1500, 200, 48, 22, -0.1, { solid: true });

  // ---- The suburb (ISA, west). ----------------------------------------------------
  const terraces = [[260, 300, 520, 380], [260, 460, 520, 560], [260, 1000, 520, 1100], [820, 980, 1080, 1080], [820, 1160, 1080, 1260]];
  for (const [x0, y0, x1, y1] of terraces) {
    const mid = Math.round((x0 + x1) / 20) * 10;
    t.building(x0, y0, mid + 10, y1, [['s', 0.5, 34], ['w', 0.5, 30]], WK.brick);
    t.building(mid, y0, x1, y1, [['n', 0.5, 34], ['e', 0.5, 30]], WK.brick);
    t.ruin(x0, y0, x1, y1, 0.22);
  }
  // The church (A) and its tower.
  t.building(540, 600, 780, 800, [['w', 0.5, 50], ['e', 0.5, 40], ['s', 0.3, 34], ['n', 0.7, 34]], WK.brick);
  t.ruin(540, 600, 780, 800, 0.12);
  t.raise(780, 600, 850, 670, 2, 'concrete', { rails: false });
  t.raise(780, 670, 850, 720, 1, 'concrete', { rails: false });
  t.stairs(790, 720, 840, 740); t.ramp(815, 670, 18);
  // The park: dead trees, craters, mud.
  for (const [x, y] of [[300, 1450], [380, 1520], [460, 1440], [540, 1560], [600, 1470], [340, 1600], [500, 1640]]) t.prop('deadtree', x, y, 30, 30);
  t.craters(10, 240, 1400, 640, 1680, 14, 26);
  t.mud(450, 1500, 160, 100);
  t.haze(420, 680, 150, 110); // smoke from the burning terrace
  // Burnt-out vehicles along the avenue.
  t.prop('bus', 480, 830, 90, 28, 0.08, { solid: true });
  t.prop('apc', 1000, 900, 58, 30, -0.3, { solid: true });
  t.prop('tankwreck', 900, 820, 64, 40, 0.6, { solid: true, col: '#4e4a3d' });
  t.prop('truck', 820, 1390, 48, 22, 0.2, { solid: true });
  t.prop('lamp', 600, 830, 6, 6); t.prop('lamp', 900, 830, 6, 6); t.prop('lamp', 1200, 890, 6, 6);
  t.prop('crates', 760, 1080, 30, 30, 0, { low: true });
  t.pad(100, 1450, 220, 1640, 'dark', 40);
  t.debris(0, 0, 1150, H, 0.05);

  // ---- The Autarch's plaza (B). ----------------------------------------------------
  t.raise(1040, 700, 1380, 1020, 1, 'concrete');
  for (const [x, y] of [[1040, 860], [1380, 860], [1210, 700], [1210, 1020]]) t.ramp(x, y, 34);
  t.prop('statue', 1210, 860, 60, 60, 0, { solid: true, shrink: 0.6 });
  for (const [x, y] of [[1080, 740], [1340, 740], [1080, 980], [1340, 980]]) t.prop('banner', x, y, 6, 6);
  t.prop('jersey', 1100, 860, 50, 12, 1.57, { low: true }); t.prop('jersey', 1320, 860, 50, 12, 1.57, { low: true });

  // ---- The blocks (Helghast, east). --------------------------------------------------
  const blocks = [[1560, 300, 1680, 620], [1780, 300, 2080, 520], [1780, 1000, 2080, 1260], [1560, 1100, 1680, 1300], [1780, 1440, 2100, 1640]];
  for (const [x0, y0, x1, y1] of blocks) {
    t.building(x0, y0, x1, y1, [['w', 0.3, 34], ['e', 0.7, 34], ['n', 0.5, 30], ['s', 0.5, 30]], WK.concrete);
    t.ruin(x0, y0, x1, y1, 0.06);
  }
  // The Ministry (C).
  t.building(1820, 640, 2120, 820, [['w', 0.5, 40], ['e', 0.5, 50], ['s', 0.3, 40]], WK.concrete);
  t.prop('banner', 1810, 630, 6, 6); t.prop('banner', 1810, 830, 6, 6);
  // Checkpoint barriers on the avenue and the south street, from the post.
  t.gate({ id: 'barrier', kind: 'barrier', name: 'avenue checkpoint', x: 1600, y: 860, w: 12, h: 76, lever: 'post' });
  t.gate({ id: 'barrier2', kind: 'barrier', name: 'south checkpoint', x: 1600, y: 1360, w: 12, h: 48, lever: 'post' });
  t.building(1560, 740, 1660, 810, [['e', 0.5, 28]], WK.concrete);
  t.prop('jersey', 1580, 960, 70, 12, 1.57, { low: true });
  t.prop('tankwreck', 1920, 935, 64, 40, 3.4, { solid: true, side: 'hgh' });
  for (const [x, y] of [[1540, 700], [1540, 1000], [1520, 1180], [1540, 1460], [1520, 560]]) t.prop('hedgehog', x, y, 22, 22, 0.3);
  t.haze(1900, 1340, 170, 90);
  t.prop('pylon', 2260, 380, 18, 18); t.prop('stack', 2280, 1180, 50, 50, 0, { solid: true });
  t.pad(2150, 1440, 2380, 1640, 'dark', 50);
  t.hazard(2150, 1440, 2380, 1446);
  t.debris(1500, 0, W, H, 0.025);

  // ---- Sites. -----------------------------------------------------------------------------
  const objR = cfg.map.objectiveRadius, fR = cfg.map.featureRadius;
  t.site('A', 'objective', 660, 700, objR);
  t.site('B', 'objective', 1210, 790, objR);
  t.site('C', 'objective', 1880, 730, objR);
  t.site('comms', 'comms', 815, 635, fR, 'church tower');
  t.site('arc', 'arc', 980, 440, fR, 'captured arc tower');
  t.site('comms2', 'comms', 1640, 190, fR, 'relay mast');
  t.site('mg1', 'mg', 640, 190, fR, 'MG on the highway');
  t.site('mg2', 'mg', 1620, 1180, fR, 'MG in the block');
  t.site('post', 'lever', 1610, 775, fR, 'checkpoint post');
  t.site('depot0', 'depot', 160, 1550, fR, 'vehicle yard', 0);
  t.site('depot1', 'depot', 2260, 1540, fR, 'underground garage', 1);
  t.petrol([[1700, 980], [2200, 1000], [880, 300], [1460, 1500]]);

  t.deploy(0, [[200, 400], [180, 860], [200, 1260]], [100, 860]);
  t.deploy(1, [[2260, 400], [2280, 860], [2300, 1330]], [2350, 860]);
  t.lane(0, [1500, 190], 'C');
  t.lane(1, [1150, 1360], 'A');
  return t.map;
}
