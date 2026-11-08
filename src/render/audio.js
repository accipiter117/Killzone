// Sound effects, synthesised with the Web Audio API (no audio files).
// Cosmetic only: driven by the sim's events, never feeds back into it.
// Sounds near the middle of the view are loudest; far ones fade out, and
// the number per frame is capped so a big firefight stays readable.

import { fx } from './fx-random.js';

export function createAudio() {
  const a = { ctx: null, master: null, noise: null, enabled: true, budget: 0, lastWhistle: 0, played: 0 };
  return a;
}

// Browsers only allow sound after the player has touched the page.
// Called on every touch, tap and key press until sound is running.
// iPhones need three things: the audio started from a real tap (touchend or
// click count, pointerdown alone may not), a silent sound played straight
// away, and the page's audio treated as media playback so the silent switch
// does not mute it (done with a looping silent <audio> element, plus the
// newer audioSession setting where the browser has it).
export function unlockAudio(a) {
  try {
    if (!a.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      if (navigator.audioSession) navigator.audioSession.type = 'playback';
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
    if (!a.mediaEl) {
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
      case 'zap': SOUNDS.zap(a, Math.max(0.2, nearness(cam, e.x1, e.y1))); a.budget--; break;
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

export const uiClick = (a) => { if (a.enabled && a.ctx && a.ctx.state === 'running') SOUNDS.click(a); };
