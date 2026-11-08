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
- Hold objectives to score a point per second each. The higher score when the timer ends wins, or break every enemy platoon for an immediate win.
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

Platoon mixes: 1st (Rifle, Heavy, Engineer), 2nd (Rifle, Assault, Engineer), 3rd (Assault, Heavy, Recon).

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
| Order point refill | `orders.regenSec` (9) | 6 or 12 | Lower = more orders, more micro; higher = each order matters more. |
| Order point cap | `orders.cap` (6) | 4 or 8 | How much you can save up for a big turn. |
| Pinning threshold | `suppression.pinAt` (55) | 40 or 70 | Lower = squads hit the dirt sooner, battles slow down and heavies matter more. |
| Cover strength | `cover.trench.hit` (0.6) | 0.4 or 0.75 | How much safer trenches are; high values make defending very strong. |
| Wire slowdown | `wire.speedMult` (0.22) | 0.1 or 0.4 | How much engineers matter. |
| Artillery damage | `artillery.damage` (85) | 60 or 110 | Whether artillery is a nudge or a platoon killer. |
| Artillery cost / reload | `orders.cost.artillery` (3), `artillery.cooldownSec` (25) | 4, 40 | How often barrages come in. |
| Break point | `battle.breakAt` (0.3) | 0.4 | Higher = platoons run sooner, shorter battles. |
| Capture time | `capture.objectiveSec` (14) | 8 or 20 | How quickly objectives change hands. |
| Battle length | `battle.durationSec` (600) | 300 | Also selectable in the menu. |
| Margin of victory | `battle.margin` (narrow 0.2, clear 0.6) | | Decides narrow / clear / crushing (and later, how far the front moves). |
| Role stats | `roles.*` | | Range, speed, damage, accuracy and suppression per squad type. |

## For developers

- Vanilla JavaScript modules, no build step, no dependencies. Open `index.html` through any static server (for example `python3 -m http.server`).
- `src/sim/` is the whole battle with no DOM: fixed 30 ticks per second, one seeded RNG, and every order is a command object passed through `applyCommand`. The AI issues the same commands with the same order point rules.
- `npm test` runs the Node test suite (determinism and replays, AI vs AI battles finishing on time, capture and flipping, pinned squads not advancing, wire slowing until cut, petrusite tanks exploding once, order points, routing, map symmetry).
- `node tools/balance.mjs 10 standard aggressive` plays 10 seeds twice with the AI profiles swapped between sides and reports win rates by side and profile, average battle length and margins. With the standard AI on both sides, the last 20 game run came out ISA 60 percent, Helghast 40 percent (noise at this sample size), average 9 minutes 7 seconds.
- See [`CLAUDE.md`](CLAUDE.md) for the standing rules and file layout.
