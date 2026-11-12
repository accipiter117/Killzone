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
    pinnedAccuracy: 0.4, // pinned squads barely fire back...
    pinnedFireSlow: 2.5, // ...and slowly
    // Fire and manoeuvre: a squad faces its threat and its cover only works
    // that way. Fire from the side (beyond frontArc degrees of its facing)
    // or the rear (beyond rearArc) gets round the cover, hits harder and
    // pins faster. Squads turn slowly (turnRate a think), pinned ones not at all.
    flank: { frontArc: 60, rearArc: 125, sideCover: 0.4, sideDamage: 1.25, sideSupp: 1.6, rearDamage: 1.6, rearSupp: 2.4, turnRate: 0.15, feedEverySec: 12 },
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
    // Pinned behaviour by stance: crawlOn scales how far out a pinned squad
    // crawls onto its post; crawlBack > 0 prefers cover behind, < 0 cover
    // ahead; support is the share of range platoon mates close to when
    // helping a pinned squad; unpinShare is how far suppression must fall
    // before a pinned squad gets up (higher = up sooner).
    cautious: { label: 'Cautious', pause: 4, speedMult: 0.9, pinMult: 0.85, coverAt: 12, crawlOn: 0.6, crawlBack: 0.9, support: 1, unpinShare: 0.45 },
    balanced: { label: 'Balanced', pause: 2, speedMult: 1, pinMult: 1, coverAt: 30, crawlOn: 1, crawlBack: 0.3, support: 0.85, unpinShare: 0.55 },
    aggressive: { label: 'Aggressive', pause: 0.5, speedMult: 1.1, pinMult: 1.3, coverAt: 999, crawlOn: 2, crawlBack: -0.5, support: 0.6, unpinShare: 0.7 },
  },

  squad: {
    thinkEveryTicks: 10,
    boundMin: 60,
    boundMax: 170,
    flankOffset: 170,
    reconBackoff: 210,
    crawlOnReach: 110, // a pinned squad this close to the edge of the post it is taking crawls in
    crawlCoverReach: 90, // a squad pinned in the open crawls to cover this close
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
    // Fire and blasts at an enemy MG nest pile up on it: it fires slower,
    // and past silencedAt its crew keep their heads down and stop firing.
    mgSilence: { perShot: 0.25, blast: 45, decay: 18, fireMult: 2, silencedAt: 70, recoverShare: 0.5 },
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
  // Downed and medics. A soldier dropped by bullets goes down for bleedSec
  // instead of dying; one soldier in every squad is a medic who can get
  // a downed platoon mate within reach back up on part of their health.
  // Blasts and shells kill outright (and finish off the downed).
  medic: { bleedSec: 25, reviveSec: 3, reach: 220, reviveHp: 0.35, maxSupp: 40, killOutright: ['artillery', 'grenade', 'petrusite', 'tankgun', 'dive', 'charge'] },

  // Engineers' ability becomes a field repair when their own tank is damaged
  // (and no enemy tank is close enough to breach).
  repair: { label: 'Repair', range: 260, reach: 40, workSec: 4, heal: 0.35, needBelow: 0.85, cooldownSec: 35, runSec: 14 },
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
  mg: ['MG nest', 'Capture it and it fires on any enemy in range, pinning them down. Heavy fire, grenades and shells on an enemy nest slow it and can silence it for a while.'],
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
  sandbags: 'Engineers throw up a sandbag wall facing the enemy: instant cover. With an enemy tank close by, they plant a breaching charge on it instead; with your own tank damaged nearby, they repair it.',
  repair: 'Engineers run to your damaged tank and patch it up: after a few seconds of work it gets back about a third of its armour.',
  breach: 'Engineers run up to the enemy tank and plant a breaching charge: it goes off after a few seconds for heavy damage.',
  overwatch: 'The tank fires an aimed heavy shell at the best target in range (the enemy tank first).',
  mark: 'Recon marks an enemy group for ten seconds: everyone can see them and hits them more often.',
  dive: 'Jetpack squad leaps onto the nearest enemy group and lands with a stomp that hurts and pins them.',
  vanish: 'Infiltrators go fully hidden for eight seconds, even up close, and shake off being pinned: slip away or set up the next ambush.',
};

// Turn-based battles (src/tactics): the same battlefield, armies and live
// visuals, but the two sides take turns, every platoon and the tank get two
// actions, and these rules (not the live fight) decide every loss.
export const TACTICS = {
  tile: 120, // world units per grid tile (a platoon stands on one tile)
  turns: 10, // rounds; then the side with the most objective points wins
  ap: 2, // actions per unit per turn
  move: 3, // tiles per move action (a dash spends both actions for twice as far)
  tankMove: 4,
  range: 5, // tiles a platoon can fire at
  tankRange: 6,
  sight: 7, // tiles a unit can see (with a clear line)
  base: 65, // hit chance before modifiers (percent)
  tankBase: 75,
  falloff: 4, // percent lost per tile beyond 2
  cover: { full: 40, half: 20 }, // percent off the hit chance (flanking ignores it)
  height: 10, // firing down from higher ground
  pinned: 15, // a pinned unit shoots worse and has one action
  overwatch: 10, // overwatch shots are snap shots
  kills: { base: 1, perStrength: 2, heavy: 1, tank: 3 }, // soldiers killed by a hit: 1 + 2 x strength (+1 with heavies), the tank gun 3
  vsTank: { platoon: 1, heavy: 2, tank: 4, of: 12 }, // a hit on a tank takes this many twelfths of its armour
  grenade: { range: 2, kills: 2, cooldown: 3 }, // always lands, ignores cover, pins; rifle squads only
  breakAt: 0.3, // a platoon below this share of its soldiers breaks and runs
  objectivePoints: 10, // per objective held at the end of each round
  ai: { fireAt: 50, fireAfterMove: 35 }, // the AI shoots at these odds or better
};

// The war map campaign (src/campaign). Every strategic number lives here.
// Roma Invicta style: a board of named provinces, armies of up to three
// platoons, one move each per turn, attacks fought (or auto-resolved) on
// the spot, then the Helghast take their turn.
export const CAMPAIGN = {
  version: 2, // save format; version 1 was the old sector map (not carried over)
  // The board: rows x cols provinces; the ISA hold the bottom half, the
  // Helghast the top half (the Helghast half mirrors the ISA half).
  board: { rows: 4, cols: 4, width: 360, height: 560, jitter: [18, 22], wiggle: 11 },
  // The ISA half, row by row from the front to the rear (row 2 is the
  // front, row 3 the rear): each province's site and its own name. The
  // Helghast half is the same turned through 180 degrees with its own names.
  provinces: [
    [{ site: 'factory', isa: 'Calder Mill', hgh: 'Drosk Mill' }, { site: 'comms', isa: 'Relay Nine', hgh: 'Spire Relay' }, { site: 'airfield', isa: 'Highfield', hgh: 'Ashfall Strip' }, { site: 'city', isa: 'Port Sefton', hgh: 'Vosk' }],
    [{ site: 'tankworks', isa: 'Tamsin Yard', hgh: 'Grael Yard' }, { site: 'capital', isa: 'Fort Corvane', hgh: 'Kessra Hold' }, { site: 'power', isa: 'Elden Station', hgh: 'Morvek Plant' }, { site: 'city', isa: 'Arden', hgh: 'Brennic Foundry' }],
  ],
  supply: { capital: 4, city: 3, factory: 3, tankworks: 2, power: 2, comms: 2, airfield: 2, none: 1 }, // paid each turn while connected to the capital
  kit: { capital: 'city', city: 'city', factory: 'industrial', tankworks: 'industrial', power: 'industrial', comms: 'trenches', airfield: 'trenches', none: 'trenches' }, // battle map per site
  start: { supply: 20 },
  // Starting armies per side: where (row, col on its own half) and platoons.
  armies: [{ at: [0, 1], platoons: 3 }, { at: [0, 3], platoons: 2 }, { at: [1, 1], platoons: 1 }],
  costs: { refillPerSoldier: 1, recruit: 12, dig: 4 },
  maxArmies: 5,
  maxPlatoons: 3, // per army (and so per side in one battle)
  attrition: 2, // soldiers an army cut off from its capital loses each turn
  homeBonus: 0.25, // defending your own home half: the AI counts it, and the defenders fight from trenches
  occupiedSupply: 1, // an enemy home province you hold pays only this (its people will not work for you)
  catchUp: 2, // supply a turn for each province a side holds fewer than the other (the war economy)
  ceasefire: 1, // no attacks until this turn is over (both sides set up first)
  surrenderAt: 2, // a side holding this many provinces or fewer at the end of a turn gives up
  turns: 18, // the war ends after this many turns (most provinces wins)
  pushEvery: 3, // every few turns the Helghast make a big push (attack at worse odds, and extra supply)
  pushSupply: 8,
  objective: { every: 4, reward: 8, count: 2 }, // a new objective every few turns: take N named provinces in time for a supply reward
  battle: { durationSec: 360 }, // every campaign battle, played or auto-resolved
  aiAttackOdds: 0.55, // the campaign AI attacks at these odds or better (0.4 during a push)
  aiPushOdds: 0.4,
  templates: [['rifle', 'heavy', 'engineer'], ['jump', 'assault', 'engineer'], ['infiltrator', 'heavy', 'recon']],
  sergeants: {
    isa: ['Sgt Hale', 'Sgt Okafor', 'Sgt Brandt', 'Sgt Reyes', 'Sgt Lindqvist', 'Sgt Moreau', 'Sgt Adeyemi', 'Sgt Kowal', 'Sgt Tanaka', 'Sgt Byrne'],
    hgh: ['Sgt Vrell', 'Sgt Draxx', 'Sgt Korrin', 'Sgt Malvek', 'Sgt Tesh', 'Sgt Grozan', 'Sgt Ulvar', 'Sgt Pyke', 'Sgt Stahl', 'Sgt Varno'],
  },
};

export const SITE_RULES = {
  capital: ['Capital', 'Pays 4 supply a turn and raises new platoons. Lose it and the war is lost.'],
  city: ['City', 'Pays 3 supply a turn while connected to your capital.'],
  factory: ['Factory', 'Pays 3 supply a turn while connected to your capital.'],
  tankworks: ['Tank works', 'Your tank joins every battle while this is held and connected to your capital.'],
  power: ['Power plant', 'Artillery is available in every battle while this is held and connected.'],
  comms: ['Comms hub', '+1 starting order point in every battle while held and connected.'],
  airfield: ['Airfield', 'Jetpack squads fight in your platoons while held and connected (otherwise they fight as riflemen).'],
  none: ['Open ground', 'Pays 1 supply a turn.'],
};

export const SIDE_NAMES = ['ISA', 'Helghast'];
export const PLATOON_NAMES = ['1st Platoon', '2nd Platoon', '3rd Platoon'];
