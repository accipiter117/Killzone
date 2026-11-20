// Replay codes: a finished battle as a short piece of text (or a link) that
// anyone can paste to watch it again. A battle is fully decided by its seed,
// its settings and the orders given (by both sides, AI included), so that is
// all a code holds: compressed JSON, in URL-safe base64, behind "KZR1.".
// The original battle's fingerprint goes along too, so the replay can say
// whether it came out identical.

const PREFIX = 'KZR1.';
const PLAIN = 'KZR0.'; // for browsers without compression streams

function toB64url(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function fromB64url(s) {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
  const out = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i);
  return out;
}
async function pipe(bytes, stream) {
  const res = new Response(new Blob([bytes]).stream().pipeThrough(stream));
  return new Uint8Array(await res.arrayBuffer());
}

// log: the match's { seed, options, commands }; print: its fingerprint.
export async function encodeReplay(log, print = null) {
  // Orders packed as [tick, side, type, params] to keep the code short.
  const body = { v: 1, seed: log.seed, options: log.options, print, c: log.commands.map((c) => [c.tick, c.side, c.type, c.params]) };
  const json = new TextEncoder().encode(JSON.stringify(body));
  if (typeof CompressionStream === 'function') {
    try { return PREFIX + toB64url(await pipe(json, new CompressionStream('gzip'))); } catch { /* fall through */ }
  }
  return PLAIN + toB64url(json);
}

export async function decodeReplay(code) {
  const text = String(code || '').trim();
  // A whole link pasted in: take the code out of it.
  const fromLink = /[?&]replay=([A-Za-z0-9._-]+)/.exec(text);
  const raw = (fromLink ? fromLink[1] : text).replace(/\s+/g, '');
  const m = /^KZR([01])\.([A-Za-z0-9_-]+)$/.exec(raw);
  if (!m) throw new Error('That does not look like a replay code (it should start with KZR)');
  let bytes = fromB64url(m[2]);
  if (m[1] === '1') {
    if (typeof DecompressionStream !== 'function') throw new Error('This browser cannot open compressed replay codes');
    bytes = await pipe(bytes, new DecompressionStream('gzip'));
  }
  const body = JSON.parse(new TextDecoder().decode(bytes));
  if (body.v !== 1 || !Array.isArray(body.c)) throw new Error('That replay code is from a different version of the game');
  return {
    log: { seed: body.seed, options: body.options, commands: body.c.map(([tick, side, type, params]) => ({ tick, side, type, params })) },
    print: body.print,
  };
}

// A link that opens the game straight into the replay.
export function replayLink(code) {
  const base = location.href.split(/[?#]/)[0];
  return `${base}?replay=${code}`;
}
