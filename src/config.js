// Every tuning number for the battle lives here. Units: world units (the map is
// 3000 x 1100), seconds, and hit points. Change a number, reload, play.

export const CONFIG = {
  tickRate: 30, // simulation steps per second (fixed timestep)

  battle: {
    durationSec: 600, // default battle length (10 minutes)
    scorePerObjectiveSec: 1, // points per second for each objective held
    breakAt: 0.3, // a platoon below this share of its soldiers breaks and routs
    margin: { narrow: 0.2, clear: 0.6 }, // score gap as a share of total score: below narrow = narrow win, below clear = clear win, else crushing
  },

  world: { width: 3000, height: 1100, cell: 10 },

  map: {
    trenchX: [300, 360], // ISA trench centre line (Helghast is mirrored)
    trenchWiggle: 34,
    trenchHalfWidth: 13,
    wireOffset: [95, 125], // distance from trench to its wire belt
    wireHalfWidth: 10,
    wireGaps: [2, 3], // gaps per wire belt
    wireGapLength: [60, 100],
    craters: [38, 52], // per half of the map
    craterRadius: [10, 26],
    tanksPerHalf: 3,
    objectiveRadius: 90,
    featureRadius: 45,
    ruinsPerObjective: [3, 5],
    hills: {
      centre: [150, 125], // the raised ground round B (radii, mirrored so the hill is wider)
      centreOffset: 60,
      top: [58, 52], // the second tier right on B
      ridges: [1, 2], // extra ridges per half of the map
      ridgeSize: [90, 150],
      rampRadius: 30,
    },
  },

  // High ground: range, sight and accuracy per level above the target, and
  // how much slower climbing a ramp is.
  height: { rangePerLevel: 0.15, hitPerLevel: 0.15, rampSpeed: 0.7 },

  deploy: { x: 190, spreadY: [0.22, 0.5, 0.78] },

  orders: {
    start: 3,
    cap: 6,
    regenSec: 9, // seconds per order point
    commsRegenMult: 1.75, // owning the comms post speeds refill by this much
    cost: { move: 1, take: 1, hold: 1, fallback: 1, stance: 0, artillery: 3, smoke: 2 },
  },

  // Squad roles. range/sight in world units, fireInterval in seconds,
  // accuracy is the hit chance at point blank against a target in the open.
  roles: {
    rifle: { label: 'Rifle', speed: 34, range: 260, sight: 300, hp: 100, fireInterval: 1.3, damage: 30, accuracy: 0.5, suppress: 7 },
    heavy: { label: 'Heavy', speed: 25, range: 320, sight: 300, hp: 120, fireInterval: 0.32, damage: 11, accuracy: 0.26, suppress: 9 },
    assault: { label: 'Assault', speed: 44, range: 150, sight: 280, hp: 115, fireInterval: 0.9, damage: 26, accuracy: 0.55, suppress: 6, closeRange: 90, closeMult: 1.8 },
    engineer: { label: 'Engineer', speed: 32, range: 220, sight: 280, hp: 100, fireInterval: 1.3, damage: 26, accuracy: 0.45, suppress: 6, cutRate: 0.5, cutRadius: 32 },
    recon: { label: 'Recon', speed: 36, range: 400, sight: 480, hp: 90, fireInterval: 2.2, damage: 45, accuracy: 0.6, suppress: 8 },
  },

  // Three squads per platoon, five soldiers per squad.
  platoons: [
    ['rifle', 'heavy', 'engineer'],
    ['rifle', 'assault', 'engineer'],
    ['assault', 'heavy', 'recon'],
  ],
  soldiersPerSquad: 5,

  combat: {
    rangeFalloff: 0.65, // hit chance drops by this share at maximum range
    pinnedAccuracy: 0.6,
    pinnedFireSlow: 1.8,
    strayRadius: 34, // misses land up to this far from the target
    retargetSec: 0.5,
    visionEveryTicks: 6,
  },

  suppression: {
    max: 100,
    pinAt: 55, // squad becomes Pinned at this level
    unpinShare: 0.55, // and stays pinned until it drops below pinAt * this
    hitMult: 1.5, // a hit suppresses more than a near miss
    decay: 10, // per second while under fire
    quietDecay: 26, // per second once nobody has shot at the squad for quietSec
    quietSec: 2,
  },

  // Cover: hit = share of incoming hits removed, supp = suppression multiplier.
  cover: {
    open: { hit: 0, supp: 1, speed: 1 },
    trench: { hit: 0.6, supp: 0.4, speed: 1 },
    rubble: { hit: 0.45, supp: 0.55, speed: 0.85 },
    crater: { hit: 0.35, supp: 0.6, speed: 0.85 },
    building: { hit: 0.5, supp: 0.5, speed: 0.8, rangeMult: 1.2, artilleryMult: 2 },
  },
  wire: { speedMult: 0.22 },

  stances: {
    cautious: { label: 'Cautious', pause: 4, speedMult: 0.9, pinMult: 0.85, coverAt: 12 },
    balanced: { label: 'Balanced', pause: 2, speedMult: 1, pinMult: 1, coverAt: 30 },
    aggressive: { label: 'Aggressive', pause: 0.5, speedMult: 1.1, pinMult: 1.3, coverAt: 999 },
  },

  squad: {
    thinkEveryTicks: 10,
    boundMin: 60,
    boundMax: 170,
    flankOffset: 170,
    reconBackoff: 210,
    slotSpacing: 75,
    arriveDist: 28,
    routSpeedMult: 1.25,
    stallSec: 8, // no headway for this long and a squad pushes straight on...
    pushSec: 4, // ...for this long, ignoring cover, wire detours and waiting
    platoonLead: 170, // a squad this far ahead of its platoon's slowest squad waits for it
    paceAhead: 18, // soldiers this far in front of their squad's centre slow down
    paceBehind: 22, // soldiers this far behind it speed up
  },

  capture: { objectiveSec: 14, featureSec: 8, decaySec: 30 },

  features: {
    mg: { range: 330, fireInterval: 0.25, damage: 10, accuracy: 0.3, suppress: 14 },
    arc: { range: 220, intervalSec: 4, targets: 3, damage: 45, suppress: 30 },
    tank: { radius: 16, blastRadius: 95, damage: 120, suppress: 60 },
  },

  artillery: {
    warningSec: 3,
    shells: 9,
    spreadSec: 2.4,
    radius: 115,
    blastRadius: 42,
    damage: 85,
    suppressRadius: 95,
    suppress: 45,
    craterRadius: [14, 22],
    cooldownSec: 25,
  },

  smoke: { radius: 120, durationSec: 22 },

  ai: {
    thinkSec: 4,
    siteValue: { objective: 10, comms: 5, mg: 4, arc: 4 },
    artilleryMinCluster: 5,
    artillerySafeDist: 170,
    fallbackStrength: 0.5,
    fallbackSupp: 45,
  },
};

// One short rule per thing on the battlefield, shown when the player inspects it.
export const RULES = {
  open: ['Open ground', 'No cover here. Cross it quickly or under smoke.'],
  trench: ['Trench', 'Cover: soldiers here are hit far less often and shrug off suppression.'],
  rubble: ['Rubble', 'Cover: fewer hits and less suppression, slightly slower going.'],
  crater: ['Shell crater', 'Light cover. Artillery leaves new ones behind.'],
  building: ['Ruined building', 'Longer range and good cover, but artillery does double damage inside.'],
  wire: ['Barbed wire', 'Slows infantry to a crawl until an engineer squad cuts it.'],
  objective: ['Objective', 'Score points while you hold it. The bar fills while only your troops are inside and stalls when contested.'],
  mg: ['MG nest', 'Capture it and it fires on any enemy in range, pinning them down.'],
  arc: ['Arc tower', 'Capture it and it zaps nearby enemies every few seconds.'],
  comms: ['Comms post', 'Capture it and your order points refill faster.'],
  tank: ['Petrusite tank', 'Explodes when hit by stray fire or shells, hurting everyone nearby.'],
};

export const SIDE_NAMES = ['ISA', 'Helghast'];
export const PLATOON_NAMES = ['1st Platoon', '2nd Platoon', '3rd Platoon'];
