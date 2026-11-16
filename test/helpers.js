// Shared helpers for the test suites.
import { createBattle, step } from '../src/sim/battle.js';

// Mechanics tests run on the old mirrored trench map: plain, predictable
// ground with every feature in a known place. The bespoke maps have their
// own tests (test/bespoke.test.js).
export const MIRROR = { map: { type: 'mirror-trenches' }, world: { width: 3000, height: 1100 } };
const withMirror = (config) => ({ ...config, map: { ...MIRROR.map, ...(config.map || {}) }, world: { ...MIRROR.world, ...(config.world || {}) } });

// A battle where nobody shoots unless a test puts them in range.
export function quietBattle(seed = 11, config = {}) {
  return createBattle(seed, { config: withMirror(config) });
}
export const mirrorBattle = (seed, options = {}) => createBattle(seed, { ...options, config: withMirror(options.config || {}) });

export function run(state, ticks) {
  for (let i = 0; i < ticks; i++) step(state);
}

export function squadSoldiers(state, squadId) {
  return state.squads[squadId].soldiers.map((id) => state.soldiers[id]);
}

// Teleport a squad to a point and keep it there.
export function place(state, squadId, x, y) {
  squadSoldiers(state, squadId).forEach((s, i) => {
    s.x = s.tx = x + (i - 2) * 6;
    s.y = s.ty = y;
  });
}

// Take a squad off the field entirely.
export function remove(state, squadId) {
  for (const s of squadSoldiers(state, squadId)) s.fled = true;
}
