// The Kesh petrusite refinery.
//
// The ISA come in through the freight terminal on the west side: four rail
// tracks crowded with freight cars and tank wagons (long walls with gaps
// between them), a raised loading dock you can fight along, container stacks
// in the south yard and the freight office. A sludge canal splits the site;
// it is crossed by a pipe bridge catwalk in the north, by the pump house
// (built over the canal: the fight for B is indoors) and by a road bridge in
// the south. The Helghast hold the refinery itself: pipe racks with
// catwalks over them, storage tanks that burst when hit, venting haze, smoke
// stacks, the ruined cooling tower, and the process hall (C) behind blast
// doors worked from the control room.

import { WK } from '../map.js';
import { kit } from './kit.js';

export function refineryMap(seedInt, cfg) {
  const W = 2600, H = 1500;
  const t = kit(W, H, cfg.world.cell, 'industrial', seedInt, 0x51ed270b);

  // ---- Freight terminal (ISA, west). -----------------------------------------
  t.pad(0, 300, 1180, 640, 'dark', 60);
  for (const y of [350, 420, 490, 560]) t.rail([[-20, y], [1180, y]]);
  // Freight on the tracks: long walls with gaps between them.
  const cars = [[1, 330, 'traincar', '#6a3b2a'], [1, 620, 'tanker'], [1, 900, 'traincar', '#4b5a3a'],
    [2, 200, 'traincar', '#5b3326'], [2, 520, 'traincar', '#6a3b2a'], [2, 980, 'tanker'],
    [3, 420, 'tanker'], [3, 760, 'traincar', '#3f4a52'],
    [4, 260, 'traincar', '#5b3326'], [4, 600, 'tanker'], [4, 1020, 'traincar', '#6a3b2a']];
  for (const [k, x, kind, col] of cars) t.prop(kind, x, 280 + k * 70, kind === 'tanker' ? 120 : 140, 26, 0, { solid: true, col });
  t.prop('crane', 700, 455, 420, 300, Math.PI / 2, { cab: 40 });
  // The loading dock: a raised concrete platform along the south of the yard.
  t.raise(260, 660, 1100, 720, 1, 'concrete');
  t.stairs(260, 660, 300, 720); t.stairs(660, 700, 720, 740); t.stairs(1060, 660, 1100, 720);
  t.ramp(680, 650, 26);
  t.prop('crates', 400, 690, 40, 30, 0, { low: true }); t.prop('crates', 900, 690, 30, 30, 0, { low: true });
  // The signal box (comms) on the north edge, up a flight of stairs.
  t.raise(820, 120, 940, 220, 1, 'concrete');
  t.stairs(840, 220, 900, 250);
  t.building(840, 140, 920, 200, [['s', 0.5, 26]], WK.brick);
  // South yard: container stacks in lanes, the freight office (A).
  t.road([[-20, 1180], [600, 1180], [1180, 1180], [1300, 1180], [1420, 1180]], 24, 'concrete');
  const stacks = [[300, 820, 0, '#7a4a2c'], [300, 880, 0, '#3f6f74'], [520, 840, 0.05, '#a08a3c'], [700, 1000, 1.57, '#6c6f73'],
    [900, 820, 0, '#3f6f74'], [960, 960, 1.57, '#7a4a2c'], [1060, 1060, 0, '#a08a3c'], [820, 1300, 0, '#6c6f73'], [1000, 1300, 0.1, '#7a4a2c']];
  for (const [x, y, a, col] of stacks) t.prop('container', x, y, 120, 30, a, { solid: true, col });
  t.building(410, 980, 610, 1120, [['n', 0.5, 40], ['e', 0.4, 36], ['s', 0.6, 40], ['w', 0.5, 30]], WK.brick);
  t.ruin(410, 980, 610, 1120, 0.15);
  t.pad(150, 1260, 420, 1440, 'dark', 50);
  t.prop('truck', 360, 1420, 48, 22, 0.1, { solid: true });
  t.craters(10, 100, 700, 1150, 1460);
  t.debris(0, 640, 1180, H, 0.04);

  // ---- The sludge canal and its crossings. --------------------------------------
  t.river([[1300, -40], [1290, 500], [1310, 1000], [1300, 1540]], 38);
  // Pipe bridge with a catwalk in the north: raised, crossing the canal.
  t.prop('pipes', 1300, 360, 360, 30, 0, { n: 3 });
  t.bridge([[1240, 400], [1360, 400]], 14);
  t.raise(1180, 386, 1420, 414, 1, 'grate');
  t.stairs(1160, 386, 1190, 414); t.stairs(1410, 386, 1440, 414);
  t.haze(1300, 300, 140, 90);
  // Sludge has spilled over the west bank in front of the pump house.
  t.mud(1140, 760, 110, 150);
  t.mud(1090, 600, 70, 60);
  // The pump house straddles the canal: its floor is the crossing (B).
  t.building(1210, 680, 1390, 840, [['w', 0.5, 50], ['e', 0.5, 50], ['n', 0.3, 30], ['s', 0.7, 30]], WK.concrete);
  t.bridge([[1215, 760], [1385, 760]], 70);
  // The road bridge in the south.
  t.bridge([[1240, 1180], [1360, 1180]], 26);
  t.road([[1360, 1180], [1700, 1180], [2000, 1240], [2620, 1260]], 24, 'concrete');

  // ---- The refinery (Helghast, east). ----------------------------------------------
  t.pad(1420, 0, 2600, 1500, null, 70);
  // Pipe racks run east-west with catwalks on top.
  for (const [y, x0, x1] of [[520, 1500, 2050], [980, 1520, 2000]]) {
    t.prop('pipes', (x0 + x1) / 2, y, x1 - x0, 34, 0, { solid: true, n: 3 });
    t.raise(x0, y - 50, x1, y - 26, 1, 'grate');
    t.stairs(x0 - 30, y - 50, x0, y - 26); t.stairs(x1, y - 50, x1 + 30, y - 26); t.stairs((x0 + x1) / 2 - 15, y - 26, (x0 + x1) / 2 + 15, y - 12);
  }
  // Storage tanks (they burst when hit) and the haze from cracked vents.
  t.petrol([[1600, 300], [1700, 220], [1800, 330], [1650, 760], [2260, 1100], [1560, 1350]]);
  t.haze(1750, 760, 200, 130);
  t.haze(2050, 1260, 180, 120);
  // Smoke stacks and the ruined cooling tower.
  t.prop('stack', 2380, 620, 60, 60, 0, { solid: true });
  t.prop('stack', 2460, 700, 50, 50, 0, { solid: true });
  t.prop('cooling', 1980, 1320, 240, 240, 0);
  // The cooling tower's broken ring as walls (enter through the break).
  for (let a = -0.4; a < 4.6; a += 0.05) {
    const x = 1980 + Math.cos(a) * 108, y = 1320 + Math.sin(a) * 108;
    t.wall(x - 6, y - 6, x + 6, y + 6, WK.prop);
  }
  // The process hall (C) behind blast doors, with the control room.
  t.building(1980, 560, 2300, 860, [['e', 0.5, 50], ['n', 0.7, 40]], WK.concrete);
  t.prop('pipes', 2140, 650, 180, 26, 0, { solid: true, n: 2, col: '#7b7d78' });
  t.prop('crates', 2120, 780, 50, 30, 0, { low: true });
  // The blast doors start open (the Helghast's quick way out of the hall
  // towards B); whoever takes the control room can shut them.
  const doors = t.gate({ id: 'doors', kind: 'door', name: 'blast doors', x: 1985, y: 710, w: 10, h: 90, lever: 'control', closed: false });
  t.hazard(1960, 660, 1975, 760);
  t.building(2320, 860, 2440, 960, [['w', 0.5, 30], ['n', 0.5, 30]], WK.concrete);
  // A gantry over the north yard with the arc tower on it.
  t.raise(2160, 260, 2420, 340, 1, 'grate');
  t.stairs(2130, 280, 2160, 320); t.stairs(2420, 280, 2450, 320);
  t.prop('silo', 1560, 1100, 60, 60, 0, { solid: true });
  t.prop('pylon', 1920, 130, 18, 18, 0);
  t.prop('container', 2300, 1180, 100, 28, 0.2, { solid: true, col: '#4a4f52' });
  t.prop('hedgehog', 1500, 820, 22, 22); t.prop('hedgehog', 1480, 640, 22, 22);
  t.prop('banner', 2000, 520, 6, 6); t.prop('banner', 2280, 940, 6, 6); t.prop('lamp', 1700, 1150, 6, 6);
  // Compressor sheds and container stacks on the east bank: walls the
  // defenders can move behind on their way to B.
  t.building(1470, 590, 1600, 700, [['w', 0.5, 34], ['e', 0.5, 34], ['s', 0.5, 30]], WK.metal);
  t.building(1470, 830, 1600, 940, [['w', 0.5, 34], ['e', 0.5, 34], ['n', 0.5, 30]], WK.metal);
  t.prop('container', 1690, 650, 110, 28, 1.57, { solid: true, col: '#4a4f52' });
  t.prop('container', 1690, 880, 110, 28, 1.57, { solid: true, col: '#7a4a2c' });
  t.prop('container', 1850, 760, 100, 28, 0, { solid: true, col: '#3f6f74' });
  // Refinery clutter: valve houses, drums, crates and barriers between the
  // racks, so the defenders have cover of their own on the way to B.
  for (const [x, y, a] of [[1840, 860, 0.2], [1600, 1180, 0], [1900, 420, 0], [2240, 1020, 0], [1560, 1040, 0.3]]) t.prop('valve', x, y, 40, 30, a, { solid: true });
  for (const [x, y] of [[1460, 760], [1760, 700], [1520, 1060], [1880, 640], [2060, 900], [1700, 1260], [1600, 420]]) t.prop('barrels', x, y, 26, 22, 0, { low: true });
  for (const [x, y, a] of [[1640, 760, 0], [1580, 1300, 0]]) t.prop('jersey', x, y, 66, 12, a, { low: true });
  t.prop('crates', 1820, 1080, 40, 28, 0.2, { low: true }); t.prop('crates', 2000, 380, 30, 30, 0, { low: true });
  t.pad(2300, 1260, 2560, 1460, 'dark', 50);
  t.building(2420, 1280, 2560, 1400, [['w', 0.5, 70]], WK.metal);
  t.debris(1420, 0, W, H, 0.03);

  // ---- Sites. -------------------------------------------------------------------------
  const objR = cfg.map.objectiveRadius, fR = cfg.map.featureRadius;
  t.site('A', 'objective', 510, 1050, objR);
  t.site('B', 'objective', 1300, 760, objR);
  t.site('C', 'objective', 2140, 720, objR);
  t.site('comms', 'comms', 880, 170, fR, 'signal box');
  t.site('arc', 'arc', 1470, 330, fR, 'captured arc tower');
  t.site('comms2', 'comms', 1900, 150, fR, 'relay mast');
  t.site('mg1', 'mg', 760, 1240, fR, 'MG by the road');
  t.site('mg2', 'mg', 1760, 470, fR, 'MG on the catwalk');
  t.site('control', 'lever', 2380, 910, fR, 'control room');
  t.site('depot0', 'depot', 280, 1350, fR, 'truck park', 0);
  t.site('depot1', 'depot', 2440, 1340, fR, 'refinery garage', 1);
  doors.lever = 'control';

  t.deploy(0, [[230, 200], [210, 760], [240, 1240]], [140, 1180]);
  // The Helghast tank starts in the garage yard's north end, so its drive to
  // B (about 1220) matches the ISA tank's (about 1270); from the far corner
  // it was 1630 and the ISA tank always reached the fight at B first.
  t.deploy(1, [[2240, 180], [2200, 760], [2160, 1150]], [2460, 1180]);
  t.lane(0, [1300, 400], 'C');
  t.lane(1, [1300, 1180], 'A');
  return t.map;
}
