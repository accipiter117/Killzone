// Shared helpers for the test suites.
import { createBattle, step } from '../src/sim/battle.js';

// A battle where nobody shoots unless a test puts them in range.
export function quietBattle(seed = 11, config = {}) {
  return createBattle(seed, { config });
}

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
