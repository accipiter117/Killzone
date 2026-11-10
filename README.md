# Front Line (Killzone fan prototype)

A fan-made, non-commercial battle prototype set in the Killzone universe: the ISA against the Helghast. Not affiliated with Guerrilla Games or Sony. All art is drawn in code.

Two layers, played solo against an AI: real-time **battles**, and a **campaign** on a war map above them where the battles decide where the front line runs. Multiplayer comes later; both layers are built so it can slot in (every battle and every campaign order is a command that can be replayed exactly).

Play it: **https://accipiter117.github.io/Killzone/**. The start menu offers a campaign (new, continue or load from a code) or a quick battle. Add `?seed=anything` to the address to jump straight into a quick battle on a particular map.

## The war (campaign)

Modelled on Roma Invicta: a war table of named provinces, armies you move one at a time, and real-time battles whenever armies meet.

- **The board:** 16 provinces on a painted war table, the ISA (blue) at the bottom and the Helghast (red) at the top; the Helghast half is the ISA half turned round, so both sides start equal. The trench marks the front. Upright, the board stands as drawn; sideways it turns so your side is on the left. Twist two fingers to turn it any way.
- **Armies:** standards numbered I, II, III... each holding up to three platoons, who keep their sergeants and losses from battle to battle.
- **Your turn:** tap an army (or its chip at the bottom). Badges show what it can do: **March** to a province of yours, **Take** empty enemy ground, or **Fight** an enemy army with the odds shown. Each army acts once a turn; then **End turn**.
- **Battles** start the moment you attack: fight it yourself on the battle screen, or let the AI fight it (in the background). Win and the province is yours and the beaten army falls back (or is lost with nowhere to go). Every battle can be replayed from its result.
- **The Helghast turn:** their armies march and attack; pulsing red borders show where they can strike. When they attack you, you choose to fight or let the AI defend. A turn report sums up what happened.
- **Supply** comes in each turn from provinces joined to your capital (cities and factories pay most). Spend it in the army panel: **Refill** soldiers, **Dig in** (fight from trenches when attacked; uses the army's turn), **Raise** a platoon at your capital (or a new army there). Armies cut off from the capital lose soldiers each turn.
- **Sites** add to every battle while held and joined to the capital: tank works (your tank), power plant (artillery), comms hub (+1 order point), airfield (jetpacks).
- **Pressure:** defending your own home ground helps, and every few turns the Helghast make a big push (with extra supply). An **objective** (gold dashed outline) pays extra supply if taken in time.
- **Comebacks:** enemy home ground you hold pays only 1 supply (its people will not work for you), and a side that has lost ground gets 2 extra supply a turn for each province it is behind. The war opens with a ceasefire turn (no attacks), so neither side gets a free grab.
- **Victory:** take the Helghast capital, hold the most provinces when the last turn ends (12 turns for a short war, 18 for a full one), or push them down to two provinces, when they surrender.
- **Saving:** the war saves itself after every order. Menu, "Save as a code" gives a text code to carry it to another device. (Wars from the old sector map cannot be continued.)


### Campaign numbers worth trying first

All in `CAMPAIGN` in [`src/config.js`](src/config.js).

| What | Where | Try | Effect on play |
| --- | --- | --- | --- |
| Starting armies | `armies` | more platoons in the first army | Bigger opening clashes |
| Supply | `supply`, `start` | lower | Every refill and platoon becomes a real choice |
| Costs | `costs` (refill 1 a soldier, platoon 12, dig in 4) | | How often digging in and recruiting are worth it |
| Home ground | `homeBonus` (0.25) | 0.4 | Harder to push deep into enemy ground; more comebacks |
| The Helghast push | `pushEvery` (3), `pushSupply` (8), `aiPushOdds` (0.4) | | How hard the pressure comes |
| AI boldness | `aiAttackOdds` (0.55) | 0.45 or 0.65 | How readily the Helghast attack |
| Objectives | `objective` (every 4 turns, +8 supply) | | How much the briefings pay |
| War length | `turns` (18) | | Also picked on the start menu (12 or 18) |
| Cut off | `attrition` (2 soldiers a turn) | | How dangerous deep raids are |
| Comebacks | `occupiedSupply` (1), `catchUp` (2), `surrenderAt` (2) | | How hard it is to come back from losing ground, and when a beaten side gives up |
| Battle length | `battle.durationSec` (360) | 300 | Shorter battles, quicker turns |

`node tools/campaign-balance.mjs 6 18 360` plays six AI against AI wars (push and objectives off, so both sides play by the same rules) and reports win rates, how wars end and how many battles are fought.

## How to play

- You command the **ISA** (left, steel blue). The **Helghast** hold the right (dark grey, orange highlights).
- You have three platoons, each of three squads of five soldiers. You give orders to **platoons**, never to single soldiers.
- **Maps:** pick one in the menu for the next battle (or Random).
  - *Trenches*: the original long front line with trenches, wire, a hill at B and ridges.
  - *Industrial site*: container lanes with gaps (the chokepoints), a factory hall at A with doors on three sides, pipe runs, a raised gantry and a raised MG dock, and a control platform at B with a tower on top; fuel tanks explode when hit.
  - *Ruined city*: a street grid of houses you enter by their doors, gutted ruins, rubble heaps to climb and parks, either side of a wide avenue that runs to a raised plaza and monument at B.
  - Every map is mirrored so both sides fight over identical ground. On the built-up maps walls block movement and sight, give cover to anyone beside them, and artillery, grenades, petrusite and tank shells knock them down, opening new routes.
- **Infantry sprites:** every infantry squad (except jetpack troopers) uses pixel art sprites from the owner's ChatGPT sheets, facing any of 8 directions: standing, aiming, running, firing, prone and crawling when pinned, throwing grenades, and falling when hit. Where the armies collide, a few pairs are drawn locked in a grapple (2 or 3 per patch of ground, never in step). The sheets, the cutting script and the rules for making new ones are in `tools/sprites` and `docs/SPRITE-GUIDE.md`.
- **Turning the view:** twist two fingers to turn the map to any angle; troops and tanks stay upright. The compass button turns it back to north. The default top-down look reads from any angle.
- **Tilted look (menu):** hills, walls and ruins stand up in a three quarter view and anything on raised ground is drawn lifted with it; this look keeps north up, so turning is off while it is on.
- **Screen:** the map fills the screen. Clock, objectives and score sit top left; order points, minimap (hidden until you want it), pause and speed top right; your unit chips (three platoons and the tank, each with a strength bar) bottom left; smoke and artillery bottom right.
- **Select** a unit by tapping its chip or its soldiers on the map: its order tray pops up above the chips (orders plus each squad's ability). Then **tap the map**:
  - tap an objective (A, B, C) or a capturable post (MG nest, arc tower, comms post) to **take** it;
  - tap open ground to **move** there.
- **Hold** digs the platoon in at the nearest cover. **Fall back** pulls it back towards your edge (even pinned squads crawl back).
- **Stance** (per platoon) trades speed for casualties, and decides what happens when things go wrong:

  | | Cautious | Balanced | Aggressive |
  | --- | --- | --- | --- |
  | Speed | 90% | 100% | 110% |
  | Pinned | sooner | normal | much harder to pin, and gets up sooner |
  | Under fire | drops into cover early, long pauses between dashes | some cover, short pauses | no stopping for cover |
  | Wire | waits for engineers | waits for engineers | wades straight through |
  | Pinned next to its post | crawls in only from close by | crawls in | crawls in from twice as far out |
  | Pinned in the open | crawls back to cover | crawls to the nearest cover | crawls forward to cover |
  | Helping a pinned platoon mate | fires from full range | closes to 85% of range | closes right in (60%) |

- **Medics and the downed:** one soldier in every squad is a medic (a small cross over them). A soldier dropped by bullets goes down for 25 seconds rather than dying: your downed show a red cross with a ring that runs down. A medic from the same platoon within reach runs (or crawls, if pinned) to them and after 3 seconds gets them back up on about a third of their health. Medics only go out while their own squad is not under heavy fire. Shells, grenades, artillery and other blasts kill outright and finish off the downed. Numbers in `medic` in `src/config.js`.
- Every order costs an **order point** (top right). They refill over time, faster if you hold the comms post. Stance changes are free.
- **Artillery** (3 points, 25 second reload): tap the button, then the target. After a 3 second warning, shells land in a circle and hit **everyone**, your troops included. The craters they leave become cover. Squads that can still move will try to scramble out of the warning circle.
- **Smoke** (2 points): blocks sight through an area for about 20 seconds. Good for crossing open ground.
- Hold objectives to score a point per second each. The higher score when the timer ends wins, or break every enemy platoon at once for an immediate win.
- **Reading the battle:** the bar beside the score shows troops left on each side; a red arc on one of your squads points at whoever is shooting at it; red arrows at the screen edge point to your platoons under heavy fire off screen (and orange ones to objectives the enemy is taking): tap one to look there. Messages with a place (squad wiped out, objective taken, tank destroyed, artillery incoming) can be tapped to jump to it, and a wiped-out squad's message says what did it. The fallen are greyed and fade so they never read as living troops. After the battle, a chart shows troops on the field over time and a table shows what caused the losses on each side.
- **Squad orders:** a platoon order is the shared goal for all three squads. To send one squad somewhere else, pick it in the tray's pills (Platoon, Rifle, Heavy...) or tap one of its soldiers, then tap ground or an objective (1 order point, free to change for 5 seconds), or Hold. A green dot marks a squad on its own orders. Rejoin (free) sends it back; the platoon's next order brings every squad back too. Squads on their own orders do not wait for the rest of the platoon.
- **Focus fire:** with a platoon selected, tap an enemy soldier your side can see: all three squads shoot that squad first for 40 seconds (1 order point), shown by a red target. The AI focuses enemy heavy squads near its platoons.
- **Cover preview:** while a unit is selected, grid tiles are tinted by the best cover a squad could find there: green good (trench, ruins, sandbags), amber some (crater, rubble, high ground).
- **Breaking and rallying:** a platoon that loses too many men breaks and runs back to its own lines. The first time, the survivors regroup there for 25 seconds and then rejoin the fight (a countdown shows). A rallied platoon that loses half of what was left breaks for good and leaves the field.
- **Placing squads:** for 10 seconds after a paid platoon order, picking one of its squads and placing it is free (it counts as part of the same order); the tray stays open and counts down.
- **Changing your mind:** for 5 seconds after giving a platoon a movement order you can tap again to change it for free; the chip shows a green countdown. Slow motion ends as soon as you order, and the tray puts itself away when the free window closes.
- **Grid:** while a platoon is selected a faint grid of tiles shows (as in Bad North). Move orders snap to the centre of a tile, and the platoon's three squads take that tile and the ones above and below (highlighted). Fighting is not limited to tiles: soldiers shoot, throw and charge at enemies nearby. The grid can be switched off in the menu.
- **Reinforce** (2 points, 35 second cooldown for each platoon separately): up to five fresh soldiers refill the selected platoon's weakest squad. They arrive at the nearest objective or post you hold (or your own lines) and run to rejoin. A platoon that is regrouping after breaking can be reinforced too.
- **Landscape** is the main way to play: the battlefield takes the full height and the controls sit in a column on the right. Portrait works too.
- **Slow motion:** time slows to a quarter while a platoon is selected or a strike is being aimed, so you can think. Tap the chip again, or the tray's close button, to let go (switch it off in the menu).
- **Abilities:** each squad has one, shown as a button in the order tray. They are free but recharge. Grenade (Rifle), Barrage (Heavy), Charge (Assault), Sandbags (Engineer), Mark (Recon). A button turns blue when using it would work right now.
- **High ground:** raised plateaus with cliffs you cannot climb; only ramps (lighter slopes) lead up. From higher ground soldiers see and shoot further and hit more often, and hills block sight between lower troops. B sits on top of a two tier hill.
- **Sound** is synthesised in code: gunfire, explosions, the artillery whistle, a chime when an objective changes hands and a horn when a platoon breaks or rallies. It starts on your first tap and can be switched off in the menu.
- **Reading the battle:** a platoon's badge turns red with a "!" when one of its squads is pinned; soldiers flash when hit; enemies marked by recon get red brackets.
- **Press and hold** anything (ground, wire, a post, an enemy squad) to see its one rule or what that squad is doing.
- Drag to pan, pinch to zoom, tap or drag the minimap to jump. In a desktop browser, the space bar pauses and resumes and the arrow keys move the view (on the war map too).

### What the squads do by themselves

When a squad is pinned it is not frozen for good: if it is at the edge of the post it was sent to take, it crawls onto it so the capture keeps going; if it is pinned out in the open, it crawls to the nearest cover (a little back rather than forward). Meanwhile the rest of its platoon moves up to within range of whoever is pinning it and fires back, instead of hanging back or waiting for it.


| Squad | Behaviour |
| --- | --- |
| Rifle | All-rounder. Bounds forward from cover to cover while the enemy is in sight. |
| Heavy | Slow. Stops at long range and suppresses (heavy fire pins enemy squads). |
| Assault | Fast, short range, deadly close up. Swings wide to flank the target. |
| Engineer | Average fighter. Cuts wire on the way (other squads use the gap or wait for it). |
| Recon | Long range and long sight. Hangs back and spots, so the whole side can see further. |
| Jetpack | Flies straight over cliffs, wire and trenches, fast and close range, but lightly armoured and without cover while in the air. |
| Infiltrator | Hidden from the enemy until it fires or someone comes within about 110 units; its first shots from hiding hit much harder. A recon Mark reveals it. |

| Ability | Squad | What it does |
| --- | --- | --- |
| Grenade | Rifle | Thrown at the nearest enemy within throwing range; after a short fuse it hurts everyone nearby. |
| Barrage | Heavy | Six seconds of much faster, heavier fire that pins targets. |
| Charge | Assault | Shakes off suppression and sprints at the nearest enemy. |
| Sandbags | Engineer | Builds a sandbag wall facing the enemy: instant cover as good as a trench. |
| Mark | Recon | Tags an enemy group for ten seconds: everyone can see them and hits them more often. |
| Dive | Jetpack | Leaps onto the nearest enemy group and lands with a stomp that hurts and pins them. |
| Vanish | Infiltrator | Goes fully hidden for eight seconds, even up close, and shakes off being pinned, to slip away or set up the next ambush. |
| Repair | Engineer | Replaces Sandbags while your own tank is damaged and close (and no enemy tank is): the squad runs to it and after four seconds' work it gets back about a third of its armour. |
| Breach | Engineer | Replaces Sandbags while an enemy tank is within reach: the squad sprints to the tank and plants a charge that goes off a few seconds later for heavy damage. |
| Overwatch | Tank | An aimed heavy shell at the best target in range (the enemy tank first). |

### Tanks

Each side has one tank from the start, with the same numbers for both (only the look differs: the ISA tank is low and angular, the Helghast tank tall, riveted and lit by orange vents). It has its own chip: tap it, then tap the ground to drive there (1 order point, free to change for 5 seconds). It cannot enter ruins and slows on ramps. Its main gun reloads slowly and bursts on groups of infantry or hits the enemy tank; its machine gun sprays anyone close. Infantry close behind their own tank are covered from fire coming the other way, and it crushes wire as it goes. It cannot take objectives.

Counters: rifles barely scratch it. Heavies turn their fire on it first and hurt it properly, blasts (grenades, artillery, petrusite, jetpack landings) and the arc tower hurt it more, engineers can breach it, and the other tank duels it. A knocked out tank stays on the field as a burnt wreck that infantry use as cover. The AI drives its tank behind its strongest platoon, pulls it back when badly damaged, and breaches yours with its engineers. Numbers live in `tank` and `breach` in `src/config.js`.

Platoon mixes: 1st (Rifle, Heavy, Engineer), 2nd (Jetpack, Assault, Engineer), 3rd (Infiltrator, Heavy, Recon). Both sides have the same mix; change `platoons` in `src/config.js` to try others. Each role has its own look: Heavies carry machine guns and ammo packs, Assault troops are armoured with short guns, Engineers carry tool packs, Recon carry sniper rifles (the Helghast scout is hooded and cloaked), Jetpack troopers wear twin-thruster packs, Infiltrators wear hoods or soft caps and carry suppressed rifles.

### The battlefield (one rule each)

- **Trenches, rubble, craters**: cover. Fewer hits land and suppression builds more slowly.
- **Ruined buildings**: longer range and good cover, but artillery does double damage inside.
- **Wire**: slows infantry to a crawl until an engineer squad cuts it.
- **MG nest**: capture it and it fires on enemies in range, pinning them. Fire and blasts on an enemy nest slow it down, and enough of them silence it for a while (heavies turn on a firing nest first).
- **Arc tower**: capture it and it zaps nearby enemies every few seconds.
- **Comms post**: capture it and your order points refill faster.
- **Petrusite tanks** (glowing orange cylinders): explode when hit by stray fire or shells, hurting everyone nearby.

The map is different every battle, but the right half is always the left half turned through 180 degrees, so both sides get identical ground.

### Menu

Change the map seed, battle length (5, 10 or 15 minutes), **watch mode** (the AI plays both sides, useful for tuning), and "show every squad's status" (labels over every squad, not just the selected platoon). After a battle, **Watch replay** re-runs it from the seed and the recorded orders and confirms the replay matched.

## Tuning numbers worth trying first

Every number is in [`src/config.js`](src/config.js). Change one, push, reload on your phone.

| What | Where in config.js | Try | Effect on play |
| --- | --- | --- | --- |
| Order point refill | `orders.regenSec` (6) | 4 or 9 | Lower = more orders, more micro; higher = each order matters more. |
| Order point cap | `orders.cap` (6) | 4 or 8 | How much you can save up for a big turn. |
| Pinning threshold | `suppression.pinAt` (55) | 40 or 70 | Lower = squads hit the dirt sooner, battles slow down and heavies matter more. |
| Cover strength | `cover.trench.hit` (0.6) | 0.4 or 0.75 | How much safer trenches are; high values make defending very strong. |
| Wire slowdown | `wire.speedMult` (0.22) | 0.1 or 0.4 | How much engineers matter. |
| Artillery damage | `artillery.damage` (85) | 60 or 110 | Whether artillery is a nudge or a platoon killer. |
| Artillery cost / reload | `orders.cost.artillery` (3), `artillery.cooldownSec` (25) | 4, 40 | How often barrages come in. |
| Break point | `battle.breakAt` (0.3) | 0.4 | Higher = platoons run sooner, shorter battles. |
| Capture time | `capture.objectiveSec` (14) | 8 or 20 | How quickly objectives change hands. |
| Battle length | `battle.durationSec` (600) | 300 | Also selectable in the menu. |
| Lethality | `combat.damageMult` (0.8) | 0.6 or 1 | Lower = longer fights where objectives matter more. |
| Rallying | `battle.rallySec` (25), `battle.rallyBreakShare` (0.5) | 15 or 40 | How long broken platoons take to regroup, and how fragile they are afterwards. |
| AI commitment | `ai.garrison`, `ai.garrisonPerLevel` | | How many soldiers the AI puts on an objective (and on high ground) before sending others elsewhere. |
| Margin of victory | `battle.margin` (narrow 0.2, clear 0.6) | | Decides narrow / clear / crushing (and later, how far the front moves). |
| Role stats | `roles.*` | | Range, speed, damage, accuracy and suppression per squad type. |
| High ground | `height.rangePerLevel`, `height.hitPerLevel` (0.15 each) | 0.1 or 0.25 | How much holding the hill is worth. |
| Hills | `map.hills` | | Size of the B hill, number and size of ridges, ramp width. |
| Abilities | `abilities.*` | | Cooldowns, ranges and strength of each ability. |
| Slow motion | `ui.slowMo` (0.25) | 0.1 or 0.5 | Game speed while you are giving orders. |
| Squad pacing | `squad.stallSec`, `squad.platoonLead` | | How long a stuck squad waits before pushing on; how far a squad may get ahead of its platoon. |

## For developers

- Vanilla JavaScript modules, no build step, no dependencies. Open `index.html` through any static server (for example `python3 -m http.server`).
- `src/sim/` is the whole battle with no DOM: fixed 30 ticks per second, one seeded RNG, and every order is a command object passed through `applyCommand`. The AI issues the same commands with the same order point rules.
- `src/campaign/` is the war map with no DOM: `applyCampaignCommand` is the only way to change a campaign (the player and the campaign AI alike), and seed plus command log rebuilds a campaign exactly. `src/render/warmap.js` draws it and `src/ui/campaign.js` runs its screens.
- `npm test` runs the Node test suite (campaign determinism, supply, defences, front movement by margin, AI campaigns reaching a winner, save and code round trips, determinism and replays, AI vs AI battles finishing on time, capture and flipping, pinned squads not advancing, wire slowing until cut, petrusite tanks exploding once, order points, tanks (driving, armour, breaching, Overwatch, wrecks, rolling cover), routing, map symmetry, cliffs, ramps and high ground, every ability).
- `node tools/balance.mjs 10 standard aggressive` plays 10 seeds twice with the AI profiles swapped between sides and reports win rates by side and profile, average battle length and margins. 
- `tools/balance.mjs` with the same profile on both sides plays every game on its own map. With both AIs on the standard profile, 200 battles on fresh maps came out 47/53 (within chance); battles average about six and a half minutes and roughly 40 percent go to time.
- The AI has been checked against scripted player strategies (all-in rush on B, spreading out, with and without abilities): it wins most of them, and `test/ai.test.js` guards against the all-in rush becoming a sure win again.
- See [`CLAUDE.md`](CLAUDE.md) for the standing rules and file layout.
