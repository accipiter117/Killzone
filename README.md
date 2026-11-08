# Front Line (Killzone fan prototype)

A fan-made, non-commercial battle prototype set in the Killzone universe: the ISA against the Helghast. Not affiliated with Guerrilla Games or Sony. All art is drawn in code.

This is the **battle layer only**: one real-time fight on a trench front line, played solo against an AI. The war map, front line movement, economy and multiplayer come later, and the battle is built so they can slot in (every battle can be replayed exactly from its seed and command log).

Play it: **https://accipiter117.github.io/Killzone/** (once GitHub Pages is switched on, see below). Add `?seed=anything` to the address to fight on a particular map.

## Switching on GitHub Pages (from a phone)

The GitHub app cannot change Pages settings, so use the website in your phone's browser (tick "Desktop site" if the menu is cramped):

1. Open github.com/accipiter117/Killzone and tap **Settings** (top of the repo page, swipe the tab row if you cannot see it).
2. In the left menu (or the dropdown on a phone), tap **Pages**.
3. Under **Build and deployment**, set **Source** to **Deploy from a branch**.
4. Set **Branch** to `main` and the folder to `/ (root)`, then tap **Save**.
5. Wait a minute or two and refresh: the page shows the live address (https://accipiter117.github.io/Killzone/).

The prototype currently lives on the branch `claude/killzone-battle-prototype-eib5jq`. Either merge it into `main` first, or to test straight away pick that branch in step 4 instead of `main`.

## How to play

- You command the **ISA** (left, steel blue). The **Helghast** hold the right (dark grey, orange highlights).
- You have three platoons, each of three squads of five soldiers. You give orders to **platoons**, never to single soldiers.
- **Select** a platoon by tapping its card at the bottom or its soldiers on the map, then **tap the map**:
  - tap an objective (A, B, C) or a capturable post (MG nest, arc tower, comms post) to **take** it;
  - tap open ground to **move** there.
- **Hold** digs the platoon in at the nearest cover. **Fall back** pulls it back towards your edge (even pinned squads crawl back).
- **Stance** (per platoon) trades speed for casualties: Cautious squads pause longer in cover and drop down early under fire; Aggressive ones push through fire and wade straight through wire.
- Every order costs an **order point** (top right). They refill over time, faster if you hold the comms post. Stance changes are free.
- **Artillery** (3 points, 25 second reload): tap the button, then the target. After a 3 second warning, shells land in a circle and hit **everyone**, your troops included. The craters they leave become cover. Squads that can still move will try to scramble out of the warning circle.
- **Smoke** (2 points): blocks sight through an area for about 20 seconds. Good for crossing open ground.
- Hold objectives to score a point per second each. The higher score when the timer ends wins, or break every enemy platoon at once for an immediate win.
- **Breaking and rallying:** a platoon that loses too many men breaks and runs back to its own lines. The first time, the survivors regroup there for 25 seconds and then rejoin the fight (the card counts down). A rallied platoon that loses half of what was left breaks for good and leaves the field.
- **Changing your mind:** for 5 seconds after giving a platoon a movement order you can tap again to change it for free; the card counts down ("Tap the map to change (4s)"). After that the order is locked in.
- **Grid:** while a platoon is selected a faint grid of tiles shows (as in Bad North). Move orders snap to the centre of a tile, and the platoon's three squads take that tile and the ones above and below (highlighted). Fighting is not limited to tiles: soldiers shoot, throw and charge at enemies nearby. The grid can be switched off in the menu.
- **Reinforce** (2 points, 35 second cooldown): up to five fresh soldiers refill the selected platoon's weakest squad. They arrive at the nearest objective or post you hold (or your own lines) and run to rejoin. A platoon that is regrouping after breaking can be reinforced too.
- **Landscape** is the main way to play: the battlefield takes the full height and the controls sit in a column on the right. Portrait works too.
- **Slow motion:** time slows to a quarter while a platoon is selected or a strike is being aimed, so you can think. Tap the card again to let go (switch it off in the menu).
- **Abilities:** each squad has one, shown as a button on its line under the platoon cards. They are free but recharge. Grenade (Rifle), Barrage (Heavy), Charge (Assault), Sandbags (Engineer), Mark (Recon). A button turns blue when using it would work right now.
- **High ground:** raised plateaus with cliffs you cannot climb; only ramps (lighter slopes) lead up. From higher ground soldiers see and shoot further and hit more often, and hills block sight between lower troops. B sits on top of a two tier hill.
- **Sound** is synthesised in code: gunfire, explosions, the artillery whistle, a chime when an objective changes hands and a horn when a platoon breaks or rallies. It starts on your first tap and can be switched off in the menu.
- **Reading the battle:** a platoon's badge turns red with a "!" when one of its squads is pinned; soldiers flash when hit; enemies marked by recon get red brackets.
- **Press and hold** anything (ground, wire, a post, an enemy squad) to see its one rule or what that squad is doing.
- Drag to pan, pinch to zoom, tap or drag the minimap to jump.

### What the squads do by themselves

| Squad | Behaviour |
| --- | --- |
| Rifle | All-rounder. Bounds forward from cover to cover while the enemy is in sight. |
| Heavy | Slow. Stops at long range and suppresses (heavy fire pins enemy squads). |
| Assault | Fast, short range, deadly close up. Swings wide to flank the target. |
| Engineer | Average fighter. Cuts wire on the way (other squads use the gap or wait for it). |
| Recon | Long range and long sight. Hangs back and spots, so the whole side can see further. |

| Ability | Squad | What it does |
| --- | --- | --- |
| Grenade | Rifle | Thrown at the nearest enemy within throwing range; after a short fuse it hurts everyone nearby. |
| Barrage | Heavy | Six seconds of much faster, heavier fire that pins targets. |
| Charge | Assault | Shakes off suppression and sprints at the nearest enemy. |
| Sandbags | Engineer | Builds a sandbag wall facing the enemy: instant cover as good as a trench. |
| Mark | Recon | Tags an enemy group for ten seconds: everyone can see them and hits them more often. |

Platoon mixes: 1st (Rifle, Heavy, Engineer), 2nd (Rifle, Assault, Engineer), 3rd (Assault, Heavy, Recon). Each role has its own look: Heavies carry machine guns and ammo packs, Assault troops are armoured with short guns, Engineers carry tool packs, Recon carry sniper rifles (the Helghast scout is hooded and cloaked).

### The battlefield (one rule each)

- **Trenches, rubble, craters**: cover. Fewer hits land and suppression builds more slowly.
- **Ruined buildings**: longer range and good cover, but artillery does double damage inside.
- **Wire**: slows infantry to a crawl until an engineer squad cuts it.
- **MG nest**: capture it and it fires on enemies in range, pinning them.
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
- `npm test` runs the Node test suite (determinism and replays, AI vs AI battles finishing on time, capture and flipping, pinned squads not advancing, wire slowing until cut, petrusite tanks exploding once, order points, routing, map symmetry, cliffs, ramps and high ground, every ability).
- `node tools/balance.mjs 10 standard aggressive` plays 10 seeds twice with the AI profiles swapped between sides and reports win rates by side and profile, average battle length and margins. 
- `tools/balance.mjs` with the same profile on both sides plays every game on its own map. With both AIs on the standard profile, 200 battles on fresh maps came out 47/53 (within chance); battles average about six and a half minutes and roughly 40 percent go to time.
- The AI has been checked against scripted player strategies (all-in rush on B, spreading out, with and without abilities): it wins most of them, and `test/ai.test.js` guards against the all-in rush becoming a sure win again.
- See [`CLAUDE.md`](CLAUDE.md) for the standing rules and file layout.
