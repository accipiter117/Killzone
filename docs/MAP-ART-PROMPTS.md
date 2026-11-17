# Map set pieces: ChatGPT prompts

Every set piece on the battle maps is drawn in code today (src/render/props.js,
src/render/ground-art.js). These prompts are for replacing the most visible
ones with painted art later, the same way the soldiers, tanks and flags were
made. Each picture is one object seen straight from above, so it reads at any
turn of the map.

## Rules for every prompt (paste after the description)

> Seen straight from above (top-down, not isometric), as for a tactical
> strategy game. Light from the upper left, so shadows fall down and to the
> right; draw the object only, no shadow on the ground. True low-resolution
> pixel art, drawn at the size given then scaled up 4 times with hard square
> pixels, about 16 colours, flat 3-step shading, a 1-pixel darker outline.
> Grim, war-torn, Helghan setting: grey-brown ash, rust, scorch marks, no
> bright colours except where described. Transparent background (or solid
> #FF00FF magenta if transparency fails), no text, no labels, no logos, no
> anti-aliasing, no blur, no glow.

Sizes are in game units (a standing soldier is about 34 tall, a tank about
64 by 40); ask for the pixel size given, which is the game size divided by 2.

## The prompts

1. **Crashed dropship** (220 x 110, ask for 110 x 55 pixels): "A crashed ISA
   troop dropship lying nose down, its long angular grey hull cracked open
   behind the cockpit, one swept wing torn off and lying beside it, the other
   bent, two engine pods blackened and burnt out, a faded steel-blue band
   round the hull, debris scattered round it."
2. **Knocked-out tank** (64 x 40, ask for 64 x 40 pixels, drawn 2x): "A
   destroyed main battle tank, tracks either side, hull scorched black in the
   middle, turret blown round at an angle with its gun drooping, hatches
   open."
3. **Wrecked APC** (58 x 30): "An eight-wheeled armoured personnel carrier,
   burnt out, rear doors hanging open, wheels blackened."
4. **Freight car** (140 x 26): "A rusty boxcar on rails from above: ribbed
   roof, faded dull red paint, a sliding door half open." Ask for three
   colours: dull red, olive green, grey-blue.
5. **Tank wagon** (120 x 26): "A rail tank wagon carrying petrusite: a long
   grey steel cylinder on its frame, a yellow and black hazard band round the
   middle, a hatch on top."
6. **Shipping containers** (120 x 30): "A ribbed shipping container from
   above, dented, corner castings showing." Ask for rust orange, teal, mustard
   and grey versions on one sheet.
7. **Concrete pillbox** (50 x 40): "A Helghast concrete pillbox, rounded
   corners, a dark firing slit along one long side, stained and chipped."
8. **Pipe rack** (200 x 34, tileable along its length): "Three parallel
   industrial pipes on steel cross beams, flanges every so often, one pipe
   painted rust-red, one grey, one teal, grime and drips."
9. **Ruined cooling tower** (240 x 240): "The broken top of a huge concrete
   cooling tower seen from above: a thick ring of concrete with a large
   section collapsed, rubble inside, dark interior."
10. **The Autarch's statue** (60 x 60): "A grim monumental statue on a square
    stone plinth seen from above: a cloaked, helmeted figure with a red
    triangular emblem at its feet."
11. **Burnt bus** (90 x 28) and **truck** (48 x 22): "A city bus burnt down to
    its frame, roof gone, seats charred" / "A military truck with its canvas
    burnt off, bare ribs over the cargo bed."
12. **Lift bridge leaf** (75 x 48): "One leaf of a steel road lift bridge from
    above: deck plates, railings either side, yellow paint at the hinge end."
    Ask for it lying flat and, on the same sheet, raised (shorter, darker, its
    underside showing).

## Turning them into game art

Save as `tools/sprites/source/prop-<name>.png` (or .webp) and run
`python3 tools/sprites/build_props.py`: it cuts the white away, crops, scales
and writes `assets/sprites/props/<name>.png`. Then add the name to PAINTED
in src/render/props.js. Done so far: the crashed dropship, both tank wrecks, the four containers, the freight cars and tank wagon, the Helghast pillbox, the APC, bus and truck, the Autarch's statue and the lift bridge (sheets of several are split by SPLIT in the script; containers and freight cars pick their picture by the colour the map gives them). The props are drawn in
src/render/props.js by kind (dropship, tankwreck, apc, traincar, tanker,
container, pillbox, pipes, cooling, statue, bus, truck); swapping one for a
picture means loading the image there and drawing it at the prop's size and
turn instead of the code art, with the code art kept as the fallback while it
loads (as the soldier sprites do).
