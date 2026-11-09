// Fighting the battles nobody plays by hand: a small pool of Web Workers,
// or the main thread (a battle at a time, yielding between them) where
// workers are not available.

import { resolveBattle } from './battles.js';

export function createResolver() {
  const pool = [];
  let failed = false;
  const size = Math.max(1, Math.min(3, (navigator.hardwareConcurrency || 2) - 1));
  try {
    for (let i = 0; i < size; i++) pool.push({ w: new Worker(new URL('./worker.js', import.meta.url), { type: 'module' }), busy: false });
  } catch {
    failed = true;
  }
  let nextId = 1;
  const waiting = new Map();
  for (const p of pool) {
    p.w.onmessage = (e) => {
      const job = waiting.get(e.data.id);
      waiting.delete(e.data.id);
      p.busy = false;
      if (!job) return;
      if (e.data.error) job.reject(new Error(e.data.error));
      else job.resolve(e.data.result);
    };
    // A worker that cannot start (or crashes) hands its battle back to the
    // main thread, and the pool is not used again.
    p.w.onerror = (e) => {
      if (e && e.preventDefault) e.preventDefault();
      failed = true;
      for (const [id, job] of waiting) { waiting.delete(id); job.reject(new Error('worker failed')); }
    };
  }

  const onMain = (rec) => new Promise((resolve) => setTimeout(() => resolve(resolveBattle(rec)), 30));

  function run(rec) {
    if (failed || !pool.length) return onMain(rec);
    return new Promise((resolve, reject) => {
      const go = () => {
        const p = pool.find((x) => !x.busy);
        if (!p) { setTimeout(go, 50); return; }
        p.busy = true;
        const id = nextId++;
        waiting.set(id, { resolve, reject });
        p.w.postMessage({ id, rec });
      };
      go();
    }).catch(() => { failed = true; return onMain(rec); });
  }
  return { run, size: () => (failed ? 0 : pool.length) };
}
