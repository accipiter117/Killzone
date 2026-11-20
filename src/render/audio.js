// Sound effects, synthesised with the Web Audio API (no audio files).
// Cosmetic only: driven by the sim's events, never feeds back into it.
// Sounds near the middle of the view are loudest; far ones fade out, and
// the number per frame is capped so a big firefight stays readable.

import { fx } from './fx-random.js';

export function createAudio() {
  // mix: play alongside the player's own music (Spotify and so on) instead
  // of taking over the phone's audio.
  const a = { ctx: null, master: null, noise: null, enabled: true, mix: true, budget: 0, lastWhistle: 0, played: 0 };
  return a;
}

// Browsers only allow sound after the player has touched the page.
// Called on every touch, tap and key press until sound is running.
// iPhones need the audio started from a real tap (touchend or click count,
// pointerdown alone may not) and a silent sound played straight away.
// Two ways to share the phone's audio:
// - mix (the default): the page's sound is 'ambient', so it plays over the
//   player's own music without stopping it (the silent switch mutes it).
// - not mix: the page's sound is media 'playback' (a looping silent <audio>
//   element plus the audioSession setting), so the silent switch does not
//   mute it, but music from other apps stops.
export function unlockAudio(a) {
  try {
    if (!a.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      applySession(a);
      a.ctx = new AC();
      a.master = a.ctx.createGain();
      a.master.gain.value = 0.8;
      a.master.connect(a.ctx.destination);
      const len = a.ctx.sampleRate;
      a.noise = a.ctx.createBuffer(1, len, a.ctx.sampleRate);
      const d = a.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = fx() * 2 - 1;
    }
    if (a.ctx.state !== 'running') a.ctx.resume();
    if (!a.primed) {
      const b = a.ctx.createBuffer(1, 1, 22050);
      const src = a.ctx.createBufferSource();
      src.buffer = b;
      src.connect(a.ctx.destination);
      src.start(0);
      a.primed = true;
    }
    if (!a.mediaEl && !a.mix) {
      a.mediaEl = document.createElement('audio');
      a.mediaEl.setAttribute('playsinline', '');
      a.mediaEl.loop = true;
      a.mediaEl.src = silentWav();
      a.mediaEl.volume = 0.01;
      const p = a.mediaEl.play();
      if (p && p.catch) p.catch(() => { a.mediaEl = null; });
    }
  } catch { /* sound is a nicety; never break the game over it */ }
}

function applySession(a) {
  try { if (navigator.audioSession) navigator.audioSession.type = a.mix ? 'ambient' : 'playback'; } catch { /* older browsers */ }
}

// Switch between playing over the player's music and taking over the audio.
export function setMix(a, on) {
  a.mix = on;
  applySession(a);
  if (on && a.mediaEl) { try { a.mediaEl.pause(); } catch { /* fine */ } a.mediaEl = null; }
  if (!on && a.ctx) unlockAudio(a);
}

// A tiny silent WAV file built in code (no audio files are shipped).
function silentWav() {
  const rate = 8000, n = 800;
  const buf = new ArrayBuffer(44 + n);
  const v = new DataView(buf);
  const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); v.setUint32(4, 36 + n, true); str(8, 'WAVE'); str(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate, true); v.setUint16(32, 1, true); v.setUint16(34, 8, true);
  str(36, 'data'); v.setUint32(40, n, true);
  for (let i = 0; i < n; i++) v.setUint8(44 + i, 128);
  let bin = '';
  new Uint8Array(buf).forEach((b) => { bin += String.fromCharCode(b); });
  return 'data:audio/wav;base64,' + btoa(bin);
}

export const audioRunning = (a) => !!(a.ctx && a.ctx.state === 'running');

function env(a, gain, attack, decay) {
  a.played++; // counted so tests can confirm sounds are being made
  const g = a.ctx.createGain();
  const t = a.ctx.currentTime;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  g.connect(a.master);
  return g;
}

function noiseBurst(a, gain, { type = 'bandpass', freq = 1800, q = 0.8, attack = 0.002, decay = 0.09 } = {}) {
  const src = a.ctx.createBufferSource();
  src.buffer = a.noise;
  src.playbackRate.value = 0.8 + fx() * 0.4;
  const f = a.ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = env(a, gain, attack, decay);
  src.connect(f).connect(g);
  src.start(a.ctx.currentTime, fx() * 0.5);
  src.stop(a.ctx.currentTime + attack + decay + 0.05);
}

function tone(a, gain, { wave = 'sine', from = 440, to = from, attack = 0.005, decay = 0.2 } = {}) {
  const o = a.ctx.createOscillator();
  o.type = wave;
  const t = a.ctx.currentTime;
  o.frequency.setValueAtTime(from, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + attack + decay);
  o.connect(env(a, gain, attack, decay));
  o.start(t);
  o.stop(t + attack + decay + 0.05);
}

const SOUNDS = {
  shot(a, g, side, heavy) {
    // ISA rifles crack a little higher, Helghast weapons bark lower.
    noiseBurst(a, g * (heavy ? 0.5 : 0.6), { freq: (side === 0 ? 2100 : 1500) * (0.9 + fx() * 0.2), decay: heavy ? 0.06 : 0.09 });
    tone(a, g * 0.25, { from: side === 0 ? 180 : 140, to: 60, decay: 0.05 });
  },
  boom(a, g, big) {
    noiseBurst(a, g * (big ? 1.2 : 0.9), { type: 'lowpass', freq: big ? 380 : 520, q: 0.5, attack: 0.005, decay: big ? 1.3 : 0.8 });
    tone(a, g * 0.7, { from: big ? 70 : 95, to: 30, decay: big ? 0.9 : 0.6 });
  },
  zap(a, g) {
    tone(a, g * 0.25, { wave: 'sawtooth', from: 1300, to: 180, decay: 0.25 });
    noiseBurst(a, g * 0.3, { freq: 4000, q: 2, decay: 0.15 });
  },
  whistle(a, g) { tone(a, g * 0.12, { from: 1500, to: 550, attack: 0.05, decay: 2.4 }); },
  thump(a, g) { tone(a, g * 0.3, { from: 300, to: 120, decay: 0.12 }); },
  chime(a, g, good) {
    tone(a, g * 0.18, { from: good ? 660 : 440, decay: 0.25 });
    setTimeout(() => a.ctx && tone(a, g * 0.18, { from: good ? 990 : 330, decay: 0.35 }), 120);
  },
  horn(a, g, good) { tone(a, g * 0.16, { wave: 'square', from: good ? 220 : 150, to: good ? 260 : 110, attack: 0.03, decay: 0.5 }); },
  smoke(a, g) { noiseBurst(a, g * 0.35, { type: 'lowpass', freq: 900, decay: 0.7, attack: 0.05 }); },
  // A tank's main gun: a hard crack, a heavy low boom and a ring of steel.
  cannon(a, g, side) {
    noiseBurst(a, g * 0.9, { type: 'highpass', freq: 1800, decay: 0.05 });
    noiseBurst(a, g * 1.1, { type: 'lowpass', freq: 420, q: 0.6, attack: 0.003, decay: 0.7 });
    tone(a, g * 0.6, { from: side === 0 ? 110 : 90, to: 34, decay: 0.55 });
    tone(a, g * 0.08, { wave: 'sawtooth', from: side === 0 ? 520 : 430, to: 300, decay: 0.35 });
  },
  // Gunship autocannon: short, deep thuds in quick succession.
  autocannon(a, g) {
    noiseBurst(a, g * 0.55, { type: 'lowpass', freq: 700, q: 0.7, decay: 0.08 });
    tone(a, g * 0.35, { from: 140, to: 55, decay: 0.07 });
  },
  // Arc tower discharge: an electric snap, a buzzing arc and crackle.
  arc(a, g) {
    noiseBurst(a, g * 0.5, { type: 'highpass', freq: 5000, decay: 0.03 });
    tone(a, g * 0.18, { wave: 'square', from: 95, to: 70, decay: 0.3 });
    tone(a, g * 0.16, { wave: 'sawtooth', from: 1600, to: 220, decay: 0.22 });
    for (let k = 1; k <= 3; k++) setTimeout(() => a.ctx && noiseBurst(a, g * 0.25, { freq: 3000 + fx() * 3000, q: 3, decay: 0.03 }), 40 * k + fx() * 40);
  },
  // An aircraft taking off or touching down: a rising or falling whoosh.
  whoosh(a, g, up) {
    noiseBurst(a, g * 0.5, { type: 'bandpass', freq: up ? 600 : 400, q: 0.6, attack: 0.25, decay: 1.1 });
    tone(a, g * 0.08, { wave: 'sawtooth', from: up ? 180 : 320, to: up ? 340 : 160, attack: 0.2, decay: 1 });
  },
  click(a) { tone(a, 0.12, { from: 1400, to: 900, decay: 0.03 }); },
};

// How loud something at (x, y) is, from where the camera is looking.
function nearness(cam, x, y) {
  const cx = cam.x + cam.vw / cam.z / 2, cy = cam.y + cam.vh / cam.z / 2;
  const d = Math.hypot(x - cx, y - cy);
  const reach = Math.max(500, cam.vw / cam.z);
  return Math.max(0, 1 - d / (reach * 1.4));
}

export function newFrame(a) { a.budget = 7; }

// Play the sounds for one tick's events. playerSide tells good news from bad.
export function playEvents(a, events, cam, playerSide) {
  if (!a.enabled || !a.ctx) return;
  if (a.ctx.state !== 'running') { a.ctx.resume(); return; }
  for (const e of events) {
    if (a.budget <= 0) return;
    let g;
    switch (e.type) {
      case 'shot':
        g = nearness(cam, e.x1, e.y1);
        if (g < 0.05 || fx() > 0.55) continue; // thin out the chatter
        SOUNDS.shot(a, g, e.side, e.src === 'mg');
        a.budget--;
        break;
      case 'shell': case 'tankBlast': case 'grenadeBlast':
        g = Math.max(0.25, nearness(cam, e.x, e.y));
        SOUNDS.boom(a, g, e.type === 'tankBlast');
        a.budget -= 2;
        break;
      case 'tankShot':
        g = Math.max(0.3, nearness(cam, e.x1, e.y1));
        SOUNDS.cannon(a, g, e.side);
        a.budget -= 2;
        break;
      case 'strafe':
        g = nearness(cam, e.x1, e.y1);
        if (g < 0.05) continue;
        SOUNDS.autocannon(a, g);
        a.budget--;
        break;
      case 'aircraft': SOUNDS.whoosh(a, Math.max(0.3, nearness(cam, e.x, e.y)), true); break;
      case 'landed': SOUNDS.whoosh(a, Math.max(0.3, nearness(cam, e.x, e.y)), false); break;
      case 'lightning':
        // Thunder: a crack, then a long low roll.
        noiseBurst(a, 0.9, { type: 'highpass', freq: 1200, decay: 0.12 });
        noiseBurst(a, 1.2, { type: 'lowpass', freq: 160, q: 0.6, attack: 0.05, decay: 2.4 });
        a.budget -= 2;
        break;
      case 'vehicleDestroyed':
        SOUNDS.boom(a, Math.max(0.4, nearness(cam, e.x, e.y)), true);
        SOUNDS.horn(a, 1, e.side !== playerSide);
        a.budget -= 2;
        break;
      case 'wallBroken': SOUNDS.thump(a, Math.max(0.3, nearness(cam, e.x, e.y))); break;
      case 'zap': SOUNDS.arc(a, Math.max(0.2, nearness(cam, e.x1, e.y1))); a.budget--; break;
      case 'throw': SOUNDS.thump(a, nearness(cam, e.x1, e.y1)); break;
      case 'smoke': SOUNDS.smoke(a, Math.max(0.3, nearness(cam, e.x, e.y))); break;
      case 'strike':
        if (a.ctx.currentTime - a.lastWhistle > 1) { SOUNDS.whistle(a, 1); a.lastWhistle = a.ctx.currentTime; }
        break;
      case 'capture': SOUNDS.chime(a, 1, e.side === playerSide); break;
      case 'broken': SOUNDS.horn(a, 1, e.side !== playerSide); break;
      case 'rallied': SOUNDS.horn(a, 1, e.side === playerSide); break;
      default:
    }
  }
}

// ---- Sounds that keep going -------------------------------------------------
// Tank engines, aircraft and the arc towers' hum, each faded by distance from
// the middle of the view, and a low bed of weather under everything. Made
// once and kept (one set per tank, aircraft or tower), their volume eased
// towards where it should be every frame; all fade out when paused or done.

// A looping noise source through a filter into its own gain.
function noiseLoop(a, type, freq, q = 0.7) {
  const src = a.ctx.createBufferSource();
  src.buffer = a.noise;
  src.loop = true;
  const f = a.ctx.createBiquadFilter();
  f.type = type; f.frequency.value = freq; f.Q.value = q;
  const g = a.ctx.createGain();
  g.gain.value = 0;
  src.connect(f).connect(g).connect(a.master);
  src.start();
  return { src, f, g, stop() { try { src.stop(); } catch { /* fine */ } g.disconnect(); } };
}
function oscLoop(a, wave, freq) {
  const o = a.ctx.createOscillator();
  o.type = wave; o.frequency.value = freq;
  const g = a.ctx.createGain();
  g.gain.value = 0;
  o.connect(g).connect(a.master);
  o.start();
  return { o, g, stop() { try { o.stop(); } catch { /* fine */ } g.disconnect(); } };
}
const ease = (a, param, v, t = 0.15) => param.setTargetAtTime(v, a.ctx.currentTime, t);

function engineVoice(a, side) {
  // Diesel growl (two detuned saws, low-passed) plus a rumble of track noise.
  const lp = a.ctx.createBiquadFilter();
  lp.type = 'lowpass'; lp.frequency.value = 220;
  const g = a.ctx.createGain(); g.gain.value = 0;
  const base = side === 0 ? 42 : 36;
  const o1 = a.ctx.createOscillator(), o2 = a.ctx.createOscillator();
  o1.type = o2.type = 'sawtooth';
  o1.frequency.value = base; o2.frequency.value = base * 1.51;
  o1.connect(lp); o2.connect(lp); lp.connect(g).connect(a.master);
  o1.start(); o2.start();
  const rumble = noiseLoop(a, 'lowpass', 140);
  return {
    set(level, moving) {
      ease(a, g.gain, level * (0.05 + 0.07 * moving));
      ease(a, o1.frequency, base * (1 + 0.45 * moving), 0.4);
      ease(a, o2.frequency, base * 1.51 * (1 + 0.45 * moving), 0.4);
      ease(a, rumble.g.gain, level * 0.12 * moving);
    },
    stop() { try { o1.stop(); o2.stop(); } catch { /* fine */ } g.disconnect(); rumble.stop(); },
  };
}

function aircraftVoice(a, kind) {
  // Turbine whine and the beat of the fans.
  const whine = oscLoop(a, 'sawtooth', kind === 'gunship' ? 420 : 300);
  const lp = a.ctx.createBiquadFilter();
  lp.type = 'lowpass'; lp.frequency.value = 900;
  whine.g.disconnect(); whine.g.connect(lp).connect(a.master);
  const wash = noiseLoop(a, 'bandpass', 500, 0.5);
  // A slow pulse on the wash for the rotor beat.
  const lfo = a.ctx.createOscillator(), depth = a.ctx.createGain();
  lfo.frequency.value = kind === 'gunship' ? 11 : 8; depth.gain.value = 0;
  lfo.connect(depth).connect(wash.g.gain); lfo.start();
  return {
    set(level, alt) {
      ease(a, whine.g.gain, level * 0.035);
      ease(a, whine.o.frequency, (kind === 'gunship' ? 420 : 300) * (0.8 + 0.3 * alt), 0.5);
      ease(a, wash.g.gain, level * 0.16);
      ease(a, depth.gain, level * 0.1);
    },
    stop() { whine.stop(); wash.stop(); try { lfo.stop(); } catch { /* fine */ } depth.disconnect(); },
  };
}

function humVoice(a) {
  // An arc tower's mains hum with a faint fizz.
  const hum = oscLoop(a, 'square', 50);
  const fizz = noiseLoop(a, 'highpass', 6000);
  return {
    set(level) { ease(a, hum.g.gain, level * 0.012); ease(a, fizz.g.gain, level * 0.03); },
    stop() { hum.stop(); fizz.stop(); },
  };
}

// The weather bed: wind for storms and dust (gusting with the weather's
// strength), drizzle and a low drone for petrusite haze, a faint breeze when
// clear.
const BED = {
  clear: { wind: [180, 0.04], hiss: [0, 0], drone: 0 },
  storm: { wind: [260, 0.22], hiss: [5000, 0.05], drone: 0.01 },
  dust: { wind: [700, 0.2], hiss: [2500, 0.06], drone: 0 },
  haze: { wind: [220, 0.07], hiss: [7000, 0.09], drone: 0.018 },
};
function bedVoice(a) {
  const wind = noiseLoop(a, 'lowpass', 300, 0.8);
  const hiss = noiseLoop(a, 'highpass', 6000);
  const drone = oscLoop(a, 'sine', 55);
  return {
    set(kind, strength, level) {
      const b = BED[kind] || BED.clear;
      ease(a, wind.f.frequency, b.wind[0] * (0.7 + 0.6 * strength), 0.8);
      ease(a, wind.g.gain, level * b.wind[1] * (0.35 + 0.65 * strength), 0.8);
      if (b.hiss[0]) ease(a, hiss.f.frequency, b.hiss[0], 0.8);
      ease(a, hiss.g.gain, level * b.hiss[1] * (0.4 + 0.6 * strength), 0.8);
      ease(a, drone.g.gain, level * b.drone, 0.8);
    },
    stop() { wind.stop(); hiss.stop(); drone.stop(); },
  };
}

// Every frame: bring each continuous sound to the level it should have.
// quiet: paused, battle over or sound off (everything fades out).
export function updateAmbient(a, state, cam, quiet) {
  if (!a.ctx || a.ctx.state !== 'running') return;
  a.voices = a.voices || new Map();
  const want = new Set();
  const voice = (key, make) => { want.add(key); if (!a.voices.has(key)) a.voices.set(key, make()); return a.voices.get(key); };
  const off = quiet || !a.enabled || !state;
  if (!off) {
    for (const v of state.vehicles || []) {
      if (!v.alive || v.absent) continue;
      const lvl = nearness(cam, v.x, v.y);
      if (lvl <= 0.02) continue;
      voice(`tank${v.id}`, () => engineVoice(a, v.side)).set(lvl, Math.min(1, (v.moved || 0) * 1.5));
    }
    for (const c of state.aircraft || []) {
      const lvl = Math.max(0.15, nearness(cam, c.x, c.y));
      voice(`air${c.id}`, () => aircraftVoice(a, c.kind)).set(lvl, c.alt);
    }
    for (const site of state.sites) {
      if (site.kind !== 'arc' || site.owner === null) continue;
      const lvl = nearness(cam, site.x, site.y);
      if (lvl <= 0.1) continue;
      voice(`arc${site.id}`, () => humVoice(a)).set(lvl);
    }
    if (state.weather) voice('bed', () => bedVoice(a)).set(state.weather.kind, state.weather.strength || 0, 1);
  }
  // Fade out and then let go of anything no longer wanted.
  for (const [key, v] of a.voices) {
    if (want.has(key)) { v.fadeAt = 0; continue; }
    if (!v.fadeAt) {
      v.fadeAt = a.ctx.currentTime;
      if (key === 'bed') v.set('clear', 0, 0); else v.set(0, 0);
    } else if (a.ctx.currentTime - v.fadeAt > 1.5) { v.stop(); a.voices.delete(key); }
  }
}

export const uiClick = (a) => { if (a.enabled && a.ctx && a.ctx.state === 'running') SOUNDS.click(a); };
