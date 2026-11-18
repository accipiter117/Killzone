# Unit sprite guide (official)

How every unit's sprites are made: the owner generates sprite sheets in
ChatGPT from these briefs, and `tools/sprites/build_atlas.py` cuts them into
game frames. Agreed with the owner after the Helghast rifleman review
(sprite-review.html). Follow it for every new unit.

## Which units get which sprites
- One shared infantry set per faction (ISA and Helghast) is used for every
  ordinary infantry squad: rifle, assault, engineer, infiltrator.
- Specialists get their own sets later, in a separate pass: jetpack
  (flying), heavy weapons, sniper / recon, and any others the owner names.
- Tanks have their own sets (see "Tanks" below).

## The six sheets per unit
Each sheet is 8 columns (directions) by N rows (frames).

| Sheet | Rows (top to bottom) |
| --- | --- |
| 1. Standing (the reference sheet) | 1: rifle held at the ready, not firing |
| 2. Running | 1: right foot forward; 2: passing, legs together; 3: left foot forward; 4: passing |
| 3. Firing | 1: muzzle flash, rifle kicked back; 2: same pose, no flash |
| 4. Prone / pinned | 1: lying flat, rifle forward; 2: crawling, one elbow and opposite knee forward |
| 5. Dying | 1: hit, jolted back; 2: falling backwards; 3: dead on his back, rifle beside him |
| 6. Grenade throw | 1: ready, grenade at chest; 2: wind up, arm back over shoulder; 3: release, grenade just leaving the hand |

Make the standing sheet first and attach it to every later prompt as the
reference.

## Rules for every sheet (put these in every prompt)
- Columns are the 8 directions in this order, left to right: facing the
  viewer, front-right, right, back-right, facing away, back-left, left,
  front-left. For prone, dying and throwing, the direction is the way the
  soldier faces or throws.
- Equal square cells, the same size as the reference sheet.
- The soldier the same size in every cell, centred, with the boots (or
  whatever touches the ground) on the same baseline.
- Transparent background (or solid #FF00FF magenta if transparency fails),
  no ground shadow, no floor line, no text or labels.
- Crisp hard-edged pixel art: no anti-aliasing, no blur, no soft gradients,
  no glow halo.
- Colours, proportions and level of detail identical to the reference
  sheet in every cell.
- Effects (muzzle flash, grenade) small and kept inside their cell.
- No blood.

## Prompt templates
Sheet 1 (no attachment beyond the design reference):

> Create a pixel art sprite sheet of a single [FACTION / UNIT] soldier,
> [DESCRIPTION OF THE LOOK], holding a rifle in both hands at the ready (low,
> angled across the body, not firing). Layout: exactly 8 columns in 1 row of
> equal square cells. One direction per column, in this order, left to
> right: facing the viewer, front-right, right, back-right, facing away,
> back-left, left, front-left. [RULES]

Sheets 2 to 6: "Using the attached sprite sheet as the exact reference (same
soldier, same colours, same pixel size and level of detail), create a
[ACTION] sprite sheet. Layout: 8 columns by [N] rows of equal cells, each
cell exactly the same size as one cell in the attached sheet. Columns are
the same 8 directions in the same order as the attached sheet. Rows, top to
bottom: [ROWS]. [RULES]"

## Turning sheets into game frames
1. Save the sheets in `tools/sprites/source/` as
   `<faction>-<unit>-<sheet>.png` (sheet: stand, run, fire, prone, die,
   throw), e.g. `isa-rifle-run.png`.
2. Run `python3 tools/sprites/build_atlas.py`. It hardens the edges, drops
   specks and bleed from neighbouring cells, scales every sheet to the same
   soldier size (ChatGPT rarely keeps one scale between sheets; the prone
   sheet usually needs sizing by eye to match the helmets), and records each
   frame's foot point.
3. Output: `assets/sprites/<faction>-<unit>.png` (atlas) and `.json`
   (frame rectangles and foot points, keyed `frame:direction`, direction 0
   to 7 in the order above), plus `@2` and `@4` copies at half and quarter
   size, listed under `levels` in the JSON. The full atlas is cut at up to
   192 pixels standing (what a phone shows fully zoomed in), but never
   enlarged past the size ChatGPT drew the sheet; the game picks the copy
   that matches each soldier's size on screen, so zoomed out stays crisp.
   Detail is limited by the art itself: ChatGPT's "pixel art" is drawn in
   chunky blocks (each art pixel several sheet pixels wide), so briefs for
   more detailed units must ask for fine pixel art (see below).
4. Check the result in `sprite-review.html` before it goes into the game.

## In the game
- Direction from the screen angle the soldier is moving or aiming:
  east = column 2, south-east = 1, south = 0, south-west = 7, west = 6,
  north-west = 5, north = 4, north-east = 3.
- Frames: stand; run1 to run4 while moving; fire and aim alternating while
  shooting; prone1 and prone2 when pinned (alternating while crawling); hit,
  fall, dead when killed; throw1 to throw3 for a grenade.
- Battle size: a standing soldier is about 34 world units tall (about 100
  screen pixels, 200 real pixels on a phone, when fully zoomed in).
- Atlases in the game (src/render/unit-sprites.js): `isa-rifle`, `hgh-rifle`,
  `grapple` and the two tanks. Jetpack troopers keep the code-drawn look
  until their own set exists.
- ISA colours: since the fine pixel ISA set (Nov 2026) the ISA are drawn in
  their real Killzone 2 colours (olive, khaki, sage, an orange scarf, amber
  visor), not tinted blue. The old blue tint came from early sheets based on
  other pixel art and is gone. Brief any sheet with an ISA soldier in it
  (such as a new grapple) with `tools/sprites/source/isa-rifle-stand.png`
  as the ISA reference.
- Grapple: one sprite of an ISA and a Helghast soldier wrestling, 8
  directions (the way the ISA soldier faces), 4 frame loop. Shown when
  opposing soldiers end up within 30 units of each other, at most 2 or 3
  pairs per patch of ground (about 170 units square) so a clash stays a
  firefight, each pair starting on a random frame. Picture only: the rules
  carry on as normal underneath.

## Tanks
Two sheets per tank, 8 directions in the same order, turret and gun always
pointing the way the hull faces:
1. Reference (standing still): 1 row. Brief with the owner's design
   pictures plus a finished tank sheet (or a soldier sheet for the first)
   as the style reference; ask for true low-resolution pixel art (drawn
   small, scaled up 4 times with hard pixels, about 16 colours, flat 3 or 4
   step shading, 1 pixel dark outline, no text or markings). Check the
   main cannon is there in every view (end on as a round muzzle when facing
   the viewer).
2. Animation: 5 rows: driving A, driving B (tracks shifted half a link),
   firing (flash and recoil), damaged (scorched, still whole, no smoke),
   wreck (burnt, turret askew, gun drooping, no flames or smoke).
Helghast: charcoal and gunmetal with rust, orange flash. ISA: sand and
khaki (the owner's choice), yellow-white flash. Files:
`tools/sprites/source/<faction>-tank-stand.png` and `-anim.png`; atlases
`assets/sprites/<faction>-tank`. In the game the tank faces the way it last
drove; under half health it shows the damaged frame; the game adds its own
smoke and tracers.

## Flags
Two sheets per side, one row each, wind blowing right, no pole (the game
draws the pole): `wave` (6 frame loop) and `raise` (5 frames: hanging limp,
stirring, 30 degrees, 60 degrees, almost fully out). Make the ISA waving
sheet first and attach it to the Helghast prompts as the style reference.
Keep the hoist (top-left corner) in the same place in every frame, and no
lettering (so the game could mirror a flag). ISA: flat teal field, white
badge with the globe and C mark, ring of stars, pale laurel. Helghast:
maroon field, black disc, white-outlined black three-arrow triangle with red
segments. Files: `tools/sprites/source/<side>-flag-<wave|raise>.webp`; run
`python3 tools/sprites/build_flags.py` to write `assets/sprites/flags.png`
and `.json` (each frame's rectangle and hoist corner). In the game a pole
stands on each objective marker: the holder's flag waves at the top; an
enemy capture lowers it over the first half and raises theirs over the
second (an unheld objective raises the taker's flag over the whole capture).

## Fine pixel briefs (from the Helghast set, Nov 2026)
The Helghast rifleman was redone as fine, detailed pixel art from the
owner's Killzone 2 reference picture. What worked:
- Standing sheet first, from one clean full-body reference picture (more
  pictures blend into a muddle). Describe the kit piece by piece, ask for
  "fine, highly detailed modern pixel art with small pixels, NOT chunky",
  about 200 art pixels tall, and strong contrast (lighter pouches, gaiters
  and mask, edge highlights) so he reads against dark ground.
- Every later sheet: a fresh chat with the standing sheet attached, and
  "same size, same proportions, same head size; do not make him shorter,
  squatter or cuter".
- At most 2 rows per image (8 columns by 2 rows fits ChatGPT's landscape
  shape with tall cells). Asked for 4 rows, ChatGPT squashed the soldier
  into a big-headed chibi. Longer sheets come as parts:
  `<unit>-<sheet>-1.png`, `-2.png`, holding the next rows in order; the
  script joins them and sizes each part by its own first frame. A part
  with a lying pose is sized by length (`parts` in build_atlas.py).
- Check the facing-viewer and facing-away columns: ChatGPT tends to aim
  and throw sideways there. Ask again for those two columns only.
- ChatGPT's "transparent" background is often a drawn chequer or white;
  the script cuts both away.
- The script keeps glowing orange (eyes, flashes) visible in the smaller
  zoomed-out copies.
