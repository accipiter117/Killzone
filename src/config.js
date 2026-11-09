// Every tuning number for the battle lives here. Units: world units (the map is
// 3000 x 1100), seconds, and hit points. Change a number, reload, play.

export const CONFIG = {
  tickRate: 30, // simulation steps per second (fixed timestep)

  battle: {
    durationSec: 600, // default battle length (10 minutes)
    scorePerObjectiveSec: 1, // points per second for each objective held
    breakAt: 0.3, // a platoon below this share of its soldiers breaks and routs
    rallyLine: 70, // broken platoons fall back to this far from their own edge...
    rallyZone: 160, // ...and once all are within this distance of it, they regroup
    rallySec: 25, // for this long, then rejoin the fight (once per battle)
    rallyShareHome: 0.7, // the regroup clock starts once this share of survivors are back...
    rallyMaxWaitSec: 30, // ...or this long after breaking, whichever comes first
    rallyBreakShare: 0.5, // a rallied platoon breaks for good after losing half of what was left
    margin: { narrow: 0.2, clear: 0.6 }, // score gap as a share of total score: below narrow = narrow win, below clear = clear win, else crushing
  },

  world: { width: 3000, height: 1100, cell: 10 },
  // Each map's size: the trench line is long and thin; the built-up maps are
  // deeper (the view can be turned to suit).
  mapSizes: { trenches: { width: 3000, height: 1100 }, industrial: { width: 2400, height: 1500 }, city: { width: 2200, height: 1700 } },

  map: {
    trenchX: [300, 360], // ISA trench centre line (Helghast is mirrored)
    trenchWiggle: 34,
    trenchHalfWidth: 13,
    wireOffset: [95, 125], // distance from trench to its wire belt
    wireHalfWidth: 10,
    wireGaps: [2, 3], // gaps per wire belt
    wireGapLength: [60, 100],
    craters: [18, 26], // per half of the map (fewer, so hills and ruins matter more)
    craterRadius: [12, 28],
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
      rampRadius: 36,
    },
  },

  // High ground: range, sight and accuracy per level above the target, and
  // how much slower climbing a ramp is.
  height: { rangePerLevel: 0.15, hitPerLevel: 0.15, rampSpeed: 0.7 },

  deploy: { x: 190, spreadY: [0.22, 0.5, 0.78] },

  orders: {
    start: 3,
    cap: 6,
    regenSec: 6, // seconds per order point
    amendSec: 5, // a movement order can be changed free for this long after giving it
    squadFollowUpSec: 10, // after a paid platoon order, its squads can be placed one by one free for this long (part of the same order)
    commsRegenMult: 1.75, // owning the comms post speeds refill by this much
    cost: { move: 1, take: 1, hold: 1, fallback: 1, stance: 0, artillery: 3, smoke: 2, ability: 0, reinforce: 2, vmove: 1, vability: 0, focus: 1, squad: 1 },
  },

  // Squad roles. range/sight in world units, fireInterval in seconds,
  // accuracy is the hit chance at point blank against a target in the open.
  roles: {
    rifle: { label: 'Rifle', speed: 34, range: 260, sight: 300, hp: 100, fireInterval: 1.3, damage: 30, accuracy: 0.5, suppress: 7 },
    heavy: { label: 'Heavy', speed: 25, range: 320, sight: 300, hp: 120, fireInterval: 0.32, damage: 11, accuracy: 0.26, suppress: 9 },
    assault: { label: 'Assault', speed: 44, range: 150, sight: 280, hp: 115, fireInterval: 0.9, damage: 26, accuracy: 0.55, suppress: 6, closeRange: 90, closeMult: 1.8 },
    engineer: { label: 'Engineer', speed: 32, range: 220, sight: 280, hp: 100, fireInterval: 1.3, damage: 26, accuracy: 0.45, suppress: 6, cutRate: 0.5, cutRadius: 32 },
    recon: { label: 'Recon', speed: 36, range: 400, sight: 480, hp: 90, fireInterval: 2.2, damage: 45, accuracy: 0.6, suppress: 8 },
    // Jetpack troopers fly straight over cliffs, wire and trenches, but get
    // no cover while in the air.
    jump: { label: 'Jetpack', speed: 58, range: 180, sight: 300, hp: 85, fireInterval: 0.6, damage: 20, accuracy: 0.5, suppress: 6, flies: true },
    // Infiltrators stay hidden until they fire or an enemy comes close; their
    // first shots from hiding hit much harder.
    infiltrator: { label: 'Infiltrator', speed: 38, range: 240, sight: 320, hp: 90, fireInterval: 1.3, damage: 32, accuracy: 0.6, suppress: 5, hidden: true, revealDist: 110, revealSec: 4, ambushMult: 1.7 },
  },

  // Three squads per platoon, five soldiers per squad.
  platoons: [
    ['rifle', 'heavy', 'engineer'],
    ['jump', 'assault', 'engineer'],
    ['infiltrator', 'heavy', 'recon'],
  ],
  soldiersPerSquad: 5,

  combat: {
    damageMult: 0.8, // scales every bullet's damage: lower = longer battles where objectives matter more
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
    sandbag: { hit: 0.55, supp: 0.45, speed: 0.85 },
    wall: { hit: 0.6, supp: 0.4, speed: 1 }, // never stood in; listed so every ground type has an entry
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
    slotSpacing: 60, // squads of a platoon on a move order stand one tile apart
    arriveDist: 28,
    routSpeedMult: 1.25,
    stallSec: 8, // no headway for this long and a squad pushes straight on...
    pushSec: 4, // ...for this long, ignoring cover, wire detours and waiting
    platoonLead: 170, // a squad this far ahead of its platoon's slowest squad waits for it
    paceAhead: 18, // soldiers this far in front of their squad's centre slow down
    paceBehind: 22, // soldiers this far behind it speed up
    nearEnough: 110, // a squad this close to its goal but stuck counts as arrived
    highCoverBonus: 25, // when settling into cover, a level of high ground is worth this many units of walking
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

  // The tank: one per side, deployed behind its own lines. Same numbers for
  // both sides (only the look differs). damageFrom says how much of each
  // kind of hit gets through its armour.
  tank: {
    hp: 1000, speed: 30, radius: 28, sight: 380, rampSpeed: 0.6, deployX: 110,
    // Toned down against infantry after playtesting (tank shells were over half the kills): a smaller burst
    // and a slower reload after firing at troops; unchanged against the other tank.
    mainGun: { range: 430, reloadSec: 5.5, reloadVsInfantrySec: 8, accuracy: 0.7, vsTank: 160, blastRadius: 26, blastDamage: 52, suppress: 30 },
    mg: { range: 280, fireInterval: 0.25, damage: 7, accuracy: 0.28, suppress: 7 },
    damageFrom: { rifle: 0.04, heavy: 0.35, other: 0.06, blast: 1.6, arc: 1.2 },
    overwatch: { label: 'Overwatch', cooldownSec: 20, vsTank: 280, blastDamage: 80 },
    coverRadius: 55, // infantry this close to their own tank, with it between them and the shooter, are covered
    coverHit: 0.5,
    crushRadius: 36, // wire this close under the tank is flattened (a lane a squad can walk through)
    wreckRadius: 26, // the burnt-out wreck becomes cover
  },
  // What killed a soldier, in plain words (for the feed and the end screen).
  causes: {
    rifle: 'rifle fire', heavy: 'heavy machine guns', assault: 'assault squads', engineer: 'engineer fire', recon: 'snipers',
    jump: 'jetpack troopers', infiltrator: 'infiltrators', mg: 'an MG nest', tankmg: 'the tank machine gun', tankgun: 'tank shells',
    artillery: 'artillery', grenade: 'grenades', petrusite: 'a petrusite explosion', arc: 'the arc tower', dive: 'jetpack landings', charge: 'a breaching charge',
  },
  historyEverySec: 5,
  // Walls (industrial and city maps): how much of a blast's radius knocks
  // them down, and how wide a hole a tank shell makes.
  walls: { breakShare: 0.55, tankShell: 22 },
  // Focus fire: a platoon's squads shoot one chosen enemy squad first.
  focus: { durationSec: 40 },
  // Engineers' ability becomes a breaching charge when an enemy tank is close.
  breach: { label: 'Breach', range: 220, plantDist: 40, fuseSec: 2.5, damage: 380, cooldownSec: 25, runSec: 14, speedMult: 1.3 },

  // Reinforcements: refill the weakest squad of a platoon with fresh
  // soldiers who arrive from your own lines. Cooldown is per side.
  reinforce: { soldiers: 5, cooldownSec: 35, nearSiteReach: 600, joinSpeedMult: 1.7 },

  // Squad abilities: free, one per role, each on its own cooldown.
  abilities: {
    grenade: { label: 'Grenade', cooldownSec: 18, range: 190, fuseSec: 1.1, radius: 38, damage: 75, suppress: 40 },
    barrage: { label: 'Barrage', cooldownSec: 24, durationSec: 6, fireMult: 2.5, suppressMult: 1.8 },
    charge: { label: 'Charge', cooldownSec: 22, durationSec: 5, range: 260, speedMult: 2.1 },
    sandbags: { label: 'Sandbags', cooldownSec: 30, radius: 26, thickness: 9, offset: 14 },
    mark: { label: 'Mark', cooldownSec: 24, durationSec: 10, radius: 170, hitMult: 1.4 },
    dive: { label: 'Dive', cooldownSec: 20, range: 320, flightSec: 1.2, radius: 38, damage: 45, suppress: 45 },
    vanish: { label: 'Vanish', cooldownSec: 25, durationSec: 8 },
  },

  // Interface pacing: game speed while a platoon is selected or a strike is
  // being aimed (slow motion, as in Bad North).
  // grid: tile size for move orders (orders snap to tile centres; a
  // platoon's three squads take the tile and the ones above and below).
  ui: { slowMo: 0.25, tile: 60 },

  ai: {
    thinkSec: 4,
    siteValue: { objective: 10, comms: 4, mg: 3, arc: 3 },
    threatRadius: 320, // enemies seen this close to a site count as massing on it
    threatValue: 0.6, // extra value per enemy soldier massing on a site
    reinforceBelow: 0.65, tankRetreatHp: 0.35, tankRetreatX: 200, tankBehind: 90, tankReorderDist: 120, focusRange: 380, focusEverySec: 30, // the AI reinforces a platoon below this strength
    highGroundValue: 0.35, // extra value per level of high ground a site sits on
    garrison: 10, // soldiers an objective needs before the AI sends others elsewhere...
    garrisonPerLevel: 11, // ...plus this many per level of high ground it sits on
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
  wire: ['Barbed wire', 'Slows infantry to a crawl until an engineer squad cuts it or a tank rolls it flat.'],
  objective: ['Objective', 'Score points while you hold it. The bar fills while only your troops are inside and stalls when contested.'],
  mg: ['MG nest', 'Capture it and it fires on any enemy in range, pinning them down.'],
  arc: ['Arc tower', 'Capture it and it zaps nearby enemies every few seconds.'],
  comms: ['Comms post', 'Capture it and your order points refill faster.'],
  sandbag: ['Sandbags', 'Cover built by engineers: as good as a trench.'],
  focus: ['Focus fire', 'With a platoon selected, tap an enemy squad: all three of its squads shoot that squad first while they can see it (1 point, 40 seconds).'],
  armour: ['Tank', 'Heavily armoured: rifles barely scratch it. Heavies, grenades, artillery, arc towers, dives, engineer charges and the other tank hurt it. Infantry close behind it are covered.'],
  wreck: ['Tank wreck', 'A burnt-out tank: cover for infantry.'],
  tank: ['Petrusite tank', 'Explodes when hit by stray fire or shells, hurting everyone nearby.'],
};

export const ABILITY_HELP = {
  grenade: 'Rifle squad throws a grenade at the nearest enemy in range. Hurts anyone near the blast.',
  barrage: 'Heavy squad holds still and pours out fire for six seconds, pinning whoever it hits.',
  charge: 'Assault squad shakes off suppression and sprints at the nearest enemy.',
  sandbags: 'Engineers throw up a sandbag wall facing the enemy: instant cover. With an enemy tank close by, they plant a breaching charge on it instead.',
  breach: 'Engineers run up to the enemy tank and plant a breaching charge: it goes off after a few seconds for heavy damage.',
  overwatch: 'The tank fires an aimed heavy shell at the best target in range (the enemy tank first).',
  mark: 'Recon marks an enemy group for ten seconds: everyone can see them and hits them more often.',
  dive: 'Jetpack squad leaps onto the nearest enemy group and lands with a stomp that hurts and pins them.',
  vanish: 'Infiltrators go fully hidden for eight seconds, even up close: slip away or set up the next ambush.',
};

// The war map campaign (src/campaign). Every strategic number lives here.
export const CAMPAIGN = {
  version: 1, // save format; bump and add an upgrade step when the save shape changes
  grid: { cols: 80, rows: 40, sectorCols: 4, sectorRows: 3 }, // per side: 4 columns of 3 sectors
  // Region per sector column (ISA half, west to east); the Helghast half
  // mirrors the shapes with its own names.
  regions: { isa: ['ISA capital district', 'Landing beaches', 'Mountain line', 'Mountain line'], hgh: ['Helghast capital district', 'Industrial belt', 'Petrusite basin', 'Petrusite basin'] },
  // Sites per side: kind, sector (column, row on that side's half), defence.
  sites: [
    { kind: 'capital', at: [0, 1], defence: 3 },
    { kind: 'city', at: [1, 0], defence: 2 },
    { kind: 'factory', at: [1, 2], defence: 2 },
    { kind: 'tankworks', at: [0, 2], defence: 0 },
    { kind: 'power', at: [0, 0], defence: 0 },
    { kind: 'comms', at: [2, 1], defence: 0 },
    { kind: 'airfield', at: [1, 1], defence: 0 },
    { kind: 'factory', at: [2, 2], defence: 1 },
    { kind: 'city', at: [3, 0], defence: 1 },
  ],
  siteValue: { capital: 6, city: 3, factory: 3, tankworks: 2, power: 2, comms: 2, airfield: 2 },
  // Income per round from each connected site.
  income: { capital: { manpower: 6, materiel: 2, power: 2 }, city: { manpower: 4 }, factory: { materiel: 4 }, power: { power: 4 } },
  regionBonus: { manpower: 2, materiel: 2, power: 2 }, // holding every site in a region
  start: { manpower: 10, materiel: 10, power: 4 },
  costs: { refillPerSoldier: { manpower: 1 }, fortify: { materiel: 4 }, recruit: { manpower: 12, materiel: 8, power: 2 }, artilleryPerBattle: { power: 1 } },
  maxPlatoons: 8, // per side
  moveRange: 2, // sectors a platoon can move in one round, through its own ground
  // Front movement (cells flipped) by margin of victory; crushing takes the
  // whole sector and breaks through into the next.
  push: { narrow: 22, clear: 55, crushing: 999, breakthrough: 45, defenderNarrow: 10, walkover: 999 }, // walkover: nobody defending, the whole sector falls
  attrition: 1, // soldiers a cut-off platoon loses per round
  minStrength: 0.25, // a platoon this weak cannot attack
  battle: { durationSec: 360 }, // every campaign battle, played or auto-resolved
  maxPerSide: 3, // platoons per side in one battle
  roundsPerNight: 3,
  nights: 8, // the default final night
  templates: [['rifle', 'heavy', 'engineer'], ['jump', 'assault', 'engineer'], ['infiltrator', 'heavy', 'recon']],
  sergeants: {
    isa: ['Sgt Hale', 'Sgt Okafor', 'Sgt Brandt', 'Sgt Reyes', 'Sgt Lindqvist', 'Sgt Moreau', 'Sgt Adeyemi', 'Sgt Kowal', 'Sgt Tanaka', 'Sgt Byrne'],
    hgh: ['Sgt Vrell', 'Sgt Draxx', 'Sgt Korrin', 'Sgt Malvek', 'Sgt Tesh', 'Sgt Grozan', 'Sgt Ulvar', 'Sgt Pyke', 'Sgt Stahl', 'Sgt Varno'],
  },
};

export const SITE_RULES = {
  capital: ['Capital', 'Pays manpower, materiel and power. Lose it and the war is lost.'],
  city: ['City', 'Pays manpower (refills squads) while held and connected to your capital.'],
  factory: ['Factory', 'Pays materiel (trenches, recruiting) while held and connected to your capital.'],
  tankworks: ['Tank works', 'Your tank joins battles while this is held and connected to your capital.'],
  power: ['Power plant', 'Pays power; artillery is available in battle while this is held and connected.'],
  comms: ['Comms hub', '+1 starting order point in every battle while held and connected.'],
  airfield: ['Airfield', 'Jetpack squads fight in your platoons while held and connected (otherwise they fight as riflemen).'],
};

export const SIDE_NAMES = ['ISA', 'Helghast'];
export const PLATOON_NAMES = ['1st Platoon', '2nd Platoon', '3rd Platoon'];
