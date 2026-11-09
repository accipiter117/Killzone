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
- Vehicles stay as they are (drawn in code) unless the owner says otherwise.

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
   to 7 in the order above).
4. Check the result in `sprite-review.html` before it goes into the game.

## In the game
- Direction from the screen angle the soldier is moving or aiming:
  east = column 2, south-east = 1, south = 0, south-west = 7, west = 6,
  north-west = 5, north = 4, north-east = 3.
- Frames: stand; run1 to run4 while moving; fire and aim alternating while
  shooting; prone1 and prone2 when pinned (alternating while crawling); hit,
  fall, dead when killed; throw1 to throw3 for a grenade.
- Battle size: a standing soldier is about 34 world units tall.
- Atlases in the game (src/render/unit-sprites.js): `isa-rifle-blue` (the ISA
  set with its grey armour tinted towards ISA blue, the owner's chosen look),
  `hgh-rifle`, and `grapple`. Jetpack troopers keep the code-drawn look
  until their own set exists.
- ISA colour: the blue tint is the official ISA look. Any sheet with an ISA
  soldier in it alongside a Helghast (such as the grapple) cannot be tinted
  afterwards without tinting the Helghast too, so brief ChatGPT with
  `docs/sprite-refs/isa-rifle-stand-blue.png` (the blue ISA standing sheet)
  as the ISA reference.
- Grapple: one sprite of an ISA and a Helghast soldier wrestling, 8
  directions (the way the ISA soldier faces), 4 frame loop. Shown when
  opposing soldiers end up within 30 units of each other, at most 2 or 3
  pairs per patch of ground (about 170 units square) so a clash stays a
  firefight, each pair starting on a random frame. Picture only: the rules
  carry on as normal underneath.
