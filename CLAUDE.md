# Killzone: Front Line (battle prototype)

Fan-made, non-commercial mobile strategy game set in the Killzone universe (ISA vs Helghast). Owner is Matthew: he builds and tests from his phone only, through GitHub Pages, and is not a professional game designer. Explain decisions in gameplay terms, not jargon.

Current scope: the real-time battle layer only, solo against an AI. Not yet: war map, economy, multiplayer, squad levelling, 3D.

## Standing rules
- Vanilla JS ES modules, no frameworks, no build step, static hosting on GitHub Pages (index.html at the repo root).
- Never use em dashes in any copy, code comments or commit messages; use round brackets instead. British spelling. Plain, natural language.
- Simulation is completely separate from rendering and UI. Modules in `src/sim/` must never touch the DOM, canvas, `window`, timers or `Math.random`.
- Determinism: one seeded RNG (mulberry32, `src/sim/rng.js`) for the sim, its state kept in `state.rng`. Cosmetic effects use a separate random source (`src/render/fx-random.js`) so visuals never change outcomes. Fixed timestep sim at 30 ticks per second.
- Every player action is a command object `{tick, side, type, params}` passed through one `applyCommand` function (`src/sim/commands.js`). The AI uses exactly the same commands and order point rules as the player. A battle must be fully reproducible from seed + command log (foundation for replays, auto-resolve and multiplayer).
- Before every commit: run `npm test` (Node only, no browser needed) and keep it passing. Long commit messages explaining what changed and why. Commit and push work in progress on long tasks.
- All tuning numbers (ranges, speeds, damage, timers, costs) live in `src/config.js`, not scattered through code.
- Original placeholder art only, drawn in code. No ripped assets, logos or reproductions of characters from the games.

## Layout
```
index.html, style.css     page and UI styling (colour tokens for light and dark)
src/config.js             every tuning number and the player-facing rule texts
src/sim/                  pure simulation (no DOM, no Math.random)
  rng.js                  mulberry32 on state.rng
  map.js                  map generation entry (trenches map) and ground helpers; point symmetric so both sides get the same ground
  maps.js                 the industrial site and ruined city maps (built on the ISA half and mirrored); walls (T.wall)
  battle.js               createBattle, step (one tick), scoring, end of battle
  squads.js               squad behaviour by role, stances, platoon orders
  combat.js               vision, targeting, shooting, suppression, damage
  features.js             objectives, MG nests, arc tower, comms post, petrusite tanks, artillery, smoke
  commands.js             applyCommand (the only way players and AI change a battle)
  match.js                runs a battle with controllers (AI) and records or replays the command log
  ai.js                   the AI commander (same commands as the player)
  path.js                 route finding round cliffs and through wire gaps
  abilities.js            squad abilities (grenade, barrage, charge, sandbags, mark)
src/render/               canvas drawing, camera (pan, zoom, free rotation), cosmetic effects, terrain painters (terrain.js top-down, works at any rotation; terrain-tilt.js tilted three quarter view with liftAt, north up only), audio.js (synthesised sound),
                          puppet.js + pixel-troopers.js (the detailed soldier sprites)
src/ui/                   DOM panels, input, overlays
src/main.js               wires it together and owns the game loop
test/                     node:test suites (npm test)
tools/balance.mjs         AI vs AI balance runs (node tools/balance.mjs [seeds])
```

## Testing
- `npm test` runs every suite in `test/`.
- `node tools/balance.mjs 10` runs 10 seeds twice with AI profiles swapped and reports win rates and battle length.
- Browser checks: Playwright from the scratchpad (Chromium is preinstalled), local server `python3 -m http.server 8765`.
- Fairness: the map is mirrored, so mirrored AIs should split about 50/50. Any choice that breaks a tie (route search, cover search, flank side) must break it in mirror image order for the Helghast, and AI controllers decide from the same moment before orders apply. Check a new mechanic with the balance tool before committing.
