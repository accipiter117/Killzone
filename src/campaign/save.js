// Saving a campaign: to this browser (localStorage) and as a text code that
// can be copied to another device. A save holds the campaign state itself
// (JSON-serialisable by design), including every battle's seed and command
// log, so replays still work after loading.
//
// Every save carries a version number. upgradeSave brings an older save up
// to date one version at a time, so old campaigns keep loading as the rules
// grow.

import { CAMPAIGN } from '../config.js';

const KEY = 'kz.campaign';
const KIND = 'kz-campaign';

export function packSave(cm) {
  return { kind: KIND, version: CAMPAIGN.version, seed: cm.seed, options: cm.options, state: cm.state };
}

// One entry per version: how to turn a version n save into version n + 1.
const UPGRADES = {
  // 1: (data) => { data.state.newThing = 0; },
};

export function upgradeSave(data) {
  if (!data || data.kind !== KIND || !data.state) throw new Error('That is not a Front Line campaign save');
  let v = data.version || 1;
  if (v > CAMPAIGN.version) throw new Error('This save comes from a newer version of the game');
  while (v < CAMPAIGN.version) {
    if (UPGRADES[v]) UPGRADES[v](data);
    v++;
  }
  data.version = v;
  data.state.version = v;
  // Fields added after version 1 went out get sensible defaults here.
  const s = data.state;
  s.lastBattles = s.lastBattles || [];
  s.history = s.history || [];
  s.battleCount = s.battleCount || s.history.length;
  return data;
}

export function unpackSave(data) {
  const d = upgradeSave(data);
  return { seed: d.seed, options: d.options || {}, state: d.state, log: [] };
}

export function saveCampaign(cm) {
  try {
    localStorage.setItem(KEY, JSON.stringify(packSave(cm)));
    return true;
  } catch {
    return false; // private mode or storage full
  }
}

export function loadCampaign() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? unpackSave(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export function hasSave() {
  try { return !!localStorage.getItem(KEY); } catch { return false; }
}

export function deleteSave() {
  try { localStorage.removeItem(KEY); } catch { /* nothing to do */ }
}

// ---- Text codes -----------------------------------------------------------
// "KZ1." + base64 of the gzipped save where the browser can compress, or
// "KZ0." + base64 of the plain JSON where it cannot.

const toB64 = (bytes) => {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};
const fromB64 = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

async function pipe(bytes, stream) {
  const out = new Blob([bytes]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

export async function exportCode(cm) {
  const json = new TextEncoder().encode(JSON.stringify(packSave(cm)));
  if (typeof CompressionStream === 'function') {
    try { return 'KZ1.' + toB64(await pipe(json, new CompressionStream('gzip'))); } catch { /* fall through */ }
  }
  return 'KZ0.' + toB64(json);
}

export async function importCode(code) {
  const text = String(code || '').replace(/\s+/g, '');
  const m = /^KZ([01])\.(.+)$/.exec(text);
  if (!m) throw new Error('That does not look like a campaign code (it should start with KZ)');
  let bytes = fromB64(m[2]);
  if (m[1] === '1') {
    if (typeof DecompressionStream !== 'function') throw new Error('This browser cannot open compressed codes');
    bytes = await pipe(bytes, new DecompressionStream('gzip'));
  }
  return unpackSave(JSON.parse(new TextDecoder().decode(bytes)));
}
