// The Corinth River crossing, north of Pyrrhus.
//
// The ISA have forced a bridgehead on the west bank: ash flats churned by
// their own bombardment, a crashed dropship, wrecked armour along the supply
// road, a ruined pumping station. The Helghast hold the east bank, where a
// bluff rises from the water with a concrete trench line and pillboxes along
// its crest; behind it their fuel depot and motor pool.
//
// Three ways across: the highway's lift bridge (raised or lowered from the
// bridgehouse on the east bank), a gravel ford in the north, and a ford of
// rubble beside the collapsed rail bridge in the south, where a ruptured
// petrusite main vents haze. The Helghast have the high ground and the
// bridge controls; the ISA have more cover, the quick supply road, the comms
// mast and two ways round.

import { WK } from '../map.js';
import { kit } from './kit.js';

export function riverMap(seedInt, cfg) {
  const W = 3000, H = 1200;
  const t = kit(W, H, cfg.world.cell, 'trenches', seedInt, 0x7c15e3d1);
  const { rand } = t;

  // ---- Under everything: the rail line, then the river over it. ------------
  t.rail([[-20, 1060], [800, 1050], [1500, 1010], [1580, 1004]]);
  t.rail([[1730, 994], [2200, 975], [3020, 960]]);
  const river = [[1700, -40], [1650, 160], [1680, 400], [1650, 640], [1610, 860], [1650, 1060], [1690, 1240]];
  t.river(river, 58);

  // ---- West bank (ISA): ash flats, the supply road, the landing zone. -------
  t.ash(500, 400, 300, 200); t.ash(900, 900, 260, 160); t.ash(1250, 300, 200, 160);
  t.road([[-20, 760], [300, 740], [700, 700], [1100, 660], [1450, 646], [1592, 642]], 26, 'asphalt');
  t.road([[700, 700], [760, 900], [700, 1100], [690, 1220]], 18, 'dirt');
  // Landing zone pads by the west edge.
  t.pad(120, 860, 380, 1080, 'dark', 50);
  t.hazard(120, 860, 380, 866);
  // The crashed dropship, nose down in the flats.
  t.prop('dropship', 560, 300, 220, 110, -0.35, { solid: true, shrink: 0.7 });
  t.scorch(600, 290, 140);
  // Wrecked armour and trucks along the road: cover on the way to the bridge.
  t.prop('tankwreck', 980, 620, 64, 40, 0.3, { solid: true });
  t.prop('apc', 1220, 700, 58, 30, -0.2, { solid: true });
  t.prop('truck', 1350, 610, 48, 22, 0.15, { solid: true });
  t.prop('tankwreck', 820, 470, 64, 40, -1.1, { solid: true, col: '#5d5747' });
  t.scorch(980, 620, 50); t.scorch(1220, 700, 40);
  // Mud along the west bank: the low ground by the water drags.
  t.mud(1480, 380, 90, 140); t.mud(1460, 880, 100, 130); t.mud(1520, 1120, 70, 60);
  // The comms mast on a low rise in the north.
  t.hill(820, 190, 170, 110, 1);
  t.ramp(670, 220, 40); t.ramp(960, 260, 38); t.ramp(820, 300, 36);
  t.prop('pylon', 830, 170, 18, 18, 0);
  // The ruined pumping station (objective A) with its water tower.
  t.building(540, 760, 720, 900, [['e', 0.5, 40], ['n', 0.3, 34], ['s', 0.7, 34], ['w', 0.5, 30]], WK.brick);
  t.ruin(540, 760, 720, 900, 0.3);
  t.prop('silo', 760, 950, 40, 40, 0, { solid: true });
  t.prop('crates', 600, 940, 40, 26, 0.1, { low: true });
  // An ISA forward position: sandbags and crates facing the river.
  t.sandbags(1260, 470, 40, 0); t.prop('crates', 1300, 520, 28, 20, 0, { low: true });
  t.prop('crates', 1180, 860, 42, 28, 0.4, { low: true });
  t.prop('deadtree', 300, 300, 30, 30); t.prop('deadtree', 400, 560, 26, 26); t.prop('deadtree', 1100, 1000, 30, 30);
  // The Helghast checkpoint on the west bridge approach, now abandoned.
  t.prop('jersey', 1470, 590, 70, 12, 0, { low: true });
  t.prop('jersey', 1470, 700, 70, 12, 0, { low: true });
  t.sandbags(1500, 646, 46, Math.PI);
  t.prop('banner', 1530, 600, 6, 6); t.prop('lamp', 1440, 620, 6, 6);
  t.craters(26, 400, 40, 1560, 1160);

  // ---- The crossings. -------------------------------------------------------
  // The lift bridge carries the highway; its deck is a gate.
  t.road([[1708, 642], [2110, 640]], 26, 'asphalt');
  const bridge = t.gate({ id: 'bridge', kind: 'bridge', name: 'lift bridge', x: 1650, y: 642, w: 150, h: 48, lever: 'lever' });
  // North ford: a gravel bar.
  t.ford([[1560, 236], [1770, 222]], 36);
  // South: the fallen rail bridge (piers and girders in the water) and a
  // rubble ford beside it.
  t.prop('pipes', 1650, 1010, 150, 22, -0.05, { solid: true, inWater: true, n: 2, col: '#5b4a3a' });
  t.prop('stack', 1600, 980, 26, 26, 0, { solid: true, inWater: true });
  t.prop('stack', 1700, 1040, 26, 26, 0, { solid: true, inWater: true });
  t.ford([[1560, 940], [1760, 930]], 26);

  // ---- East bank (Helghast): the bluff and its trench line. ------------------
  t.band([[1772, 0], [1760, 120], [1784, 260], [1766, 420], [1780, 560], [1764, 760], [1790, 900], [1770, 1060], [1782, H]],
    [[2070, 0], [2110, 160], [2060, 340], [2100, 520], [2080, 720], [2120, 880], [2060, 1040], [2090, H]], 1);
  // The road cuts through the bluff to the bridge.
  t.lower(1740, 610, 2100, 672);
  // Ways up: the cut's banks, the ford exits, stairs along the bluff.
  t.ramp(1790, 236, 50); t.ramp(1790, 930, 44);
  for (const y of [90, 420, 560, 730, 860, 1130]) t.ramp(1770, y, 30);
  for (const y of [300, 560, 730, 1000]) t.ramp(2085, y, 40);
  t.trench([[1880, -20], [1900, 120], [1870, 260], [1900, 420], [1880, 560], [1890, 600]], 12);
  t.trench([[1890, 690], [1880, 760], [1900, 900], [1870, 1040], [1890, 1220]], 12);
  t.wire([[1815, 20], [1815, 1180]], [[190, 280], [520, 760], [880, 980], [1100, 1160]]);
  t.prop('pillbox', 1920, 470, 50, 40, Math.PI, { solid: true, shrink: 0.75 });
  t.prop('pillbox', 1920, 830, 50, 40, Math.PI, { solid: true, shrink: 0.75 });
  // The bridgehouse (the lever that works the bridge).
  t.building(1940, 520, 2020, 590, [['s', 0.5, 30], ['e', 0.5, 26]], WK.concrete);
  t.prop('banner', 1960, 700, 6, 6); t.prop('banner', 2040, 700, 6, 6);
  // The ruptured petrusite main by the rail bridge: haze over the south.
  t.haze(1880, 1040, 170, 120);
  t.prop('pipes', 2100, 1080, 160, 18, 0.1, { solid: true, n: 1, col: '#8a6a3c' });

  // ---- Behind the bluff: depot and motor pool. --------------------------------
  t.road([[2100, 640], [2400, 600], [2650, 520], [3020, 500]], 24, 'asphalt');
  t.road([[2400, 600], [2600, 820], [2700, 960]], 18, 'concrete');
  // The fuel depot (objective C): a walled compound with tanks inside.
  t.wall(2300, 300, 2560, 310, WK.concrete); t.wall(2300, 300, 2310, 360, WK.concrete); t.wall(2300, 420, 2310, 500, WK.concrete);
  t.wall(2550, 300, 2560, 500, WK.concrete); t.wall(2300, 490, 2400, 500, WK.concrete); t.wall(2460, 490, 2560, 500, WK.concrete);
  t.pad(2310, 310, 2550, 490, null, 40);
  t.prop('silo', 2500, 350, 50, 50, 0, { solid: true });
  t.prop('tanker', 2380, 460, 90, 24, 0, { solid: true });
  t.prop('crates', 2470, 450, 30, 20, 0, { low: true });
  // The motor pool (the vehicle depot).
  t.pad(2600, 860, 2900, 1080, 'dark', 50);
  t.building(2760, 880, 2900, 990, [['w', 0.5, 70]], WK.metal);
  t.prop('truck', 2660, 1040, 48, 22, 0);
  t.prop('container', 2660, 900, 60, 24, 0.2, { solid: true, col: '#4a4f52' });
  // A Helghast tank knocked out by the ISA bombardment, behind the bluff.
  t.prop('tankwreck', 2300, 780, 64, 40, 2.6, { solid: true, side: 'hgh' });
  t.prop('hedgehog', 2200, 380, 22, 22); t.prop('hedgehog', 2240, 860, 22, 22); t.prop('hedgehog', 2180, 760, 22, 22);
  t.prop('stack', 2860, 300, 44, 44, 0, { solid: true });
  t.prop('pylon', 2270, 150, 18, 18, 0);
  t.prop('lamp', 2300, 640, 6, 6); t.prop('lamp', 2600, 540, 6, 6);
  t.craters(14, 2100, 40, 2960, 1160, 10, 20);
  t.debris(2100, 0, W, H, 0.03);

  // ---- Sites. ----------------------------------------------------------------------
  const objR = cfg.map.objectiveRadius, fR = cfg.map.featureRadius;
  t.site('A', 'objective', 630, 830, objR);
  t.site('B', 'objective', 1800, 644, objR);
  t.site('C', 'objective', 2430, 400, objR);
  t.site('comms', 'comms', 820, 200, fR, 'comms mast');
  t.site('arc', 'arc', 1380, 250, fR, 'captured arc tower');
  t.site('comms2', 'comms', 2250, 170, fR, 'relay mast');
  t.site('mg1', 'mg', 1260, 460, fR);
  t.site('mg2', 'mg', 1940, 830, fR);
  t.site('lever', 'lever', 1980, 555, fR, 'bridgehouse');
  t.site('depot0', 'depot', 250, 970, fR, 'landing pad', 0);
  t.site('depot1', 'depot', 2700, 960, fR, 'motor pool', 1);
  bridge.lever = 'lever';
  // Petrusite tanks where stray fire finds them: by the depot and the ford.
  t.petrol([[2340, 560], [1990, 1150], [1350, 1100], [2620, 700]]);

  t.deploy(0, [[260, 300], [230, 620], [270, 940]], [150, 760]);
  t.deploy(1, [[2640, 230], [2590, 640], [2570, 1000]], [2880, 500]);
  // Flanking routes for the AI: the ISA round by the north ford, the
  // Helghast by the south ford.
  t.lane(0, [1700, 230], 'C');
  t.lane(1, [1650, 935], 'A');
  void rand;
  return t.map;
}
