// Runs auto-resolved battles off the main thread, so the war map stays
// smooth while they are fought. The battle runs exactly as it would on the
// main thread (same seed, same AI), so the result is identical.

import { resolveBattle } from './battles.js';

self.onmessage = (e) => {
  const { id, rec } = e.data;
  try {
    self.postMessage({ id, result: resolveBattle(rec) });
  } catch (err) {
    self.postMessage({ id, error: String(err && err.message || err) });
  }
};
