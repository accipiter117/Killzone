// Touch and mouse on the battlefield: one finger drags to pan, two fingers
// pinch to zoom and twist to turn the view, a short touch is a tap (allowing ~12px of finger drift), and
// a long press inspects whatever is under the finger.

import { zoomAt, panBy, rotateAt, centreOn } from '../render/camera.js';

const TAP_SLOP = 12;
const LONG_PRESS_MS = 550;

export function attachMapInput(el, cam, { onTap, onLongPress }) {
  const pts = new Map();
  let mode = 'none';
  let start = null;
  let last = null;
  let pinch = null;
  let longTimer = 0;
  const local = (e) => {
    const r = el.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const cancelLong = () => { clearTimeout(longTimer); longTimer = 0; };

  el.addEventListener('pointerdown', (e) => {
    try { el.setPointerCapture(e.pointerId); } catch { /* not every pointer can be captured */ }
    pts.set(e.pointerId, local(e));
    if (pts.size === 1) {
      mode = 'pending';
      start = local(e);
      last = start;
      cancelLong();
      longTimer = setTimeout(() => {
        if (mode === 'pending') { mode = 'done'; onLongPress(start.x, start.y); }
      }, LONG_PRESS_MS);
    } else if (pts.size === 2) {
      cancelLong();
      const [a, b] = [...pts.values()];
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, z: cam.z, mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, ang: Math.atan2(b.y - a.y, b.x - a.x), rot: cam.rot };
      mode = 'pinch';
    }
  });

  el.addEventListener('pointermove', (e) => {
    if (!pts.has(e.pointerId)) return;
    const p = local(e);
    pts.set(e.pointerId, p);
    if (mode === 'pending' && Math.hypot(p.x - start.x, p.y - start.y) > TAP_SLOP) {
      mode = 'pan';
      cancelLong();
    }
    if (mode === 'pan') {
      panBy(cam, p.x - last.x, p.y - last.y);
      last = p;
    } else if (mode === 'pinch' && pts.size >= 2) {
      const [a, b] = [...pts.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      // Pan with the midpoint, then zoom and turn about it.
      panBy(cam, mid.x - pinch.mid.x, mid.y - pinch.mid.y);
      pinch.mid = mid;
      zoomAt(cam, mid.x, mid.y, pinch.z * (d / pinch.d));
      if (cam.canRotate) {
        let turn = Math.atan2(b.y - a.y, b.x - a.x) - pinch.ang;
        if (turn > Math.PI) turn -= Math.PI * 2;
        if (turn < -Math.PI) turn += Math.PI * 2;
        // A small dead zone so a plain pinch does not wobble the view.
        if (Math.abs(turn) > 0.08 || pinch.turning) { pinch.turning = true; rotateAt(cam, mid.x, mid.y, pinch.rot + turn); }
      }
    }
  });

  const end = (e) => {
    if (!pts.has(e.pointerId)) return;
    pts.delete(e.pointerId);
    if (mode === 'pending' && pts.size === 0) {
      cancelLong();
      mode = 'none';
      onTap(start.x, start.y);
      return;
    }
    if (mode === 'pinch' && pts.size === 1) {
      // One finger left after a pinch: carry on panning, never a tap.
      mode = 'pan';
      last = [...pts.values()][0];
    }
    if (pts.size === 0) { mode = 'none'; cancelLong(); }
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', (e) => { mode = 'done'; end(e); });

  el.addEventListener('wheel', (e) => {
    e.preventDefault();
    const p = local(e);
    zoomAt(cam, p.x, p.y, cam.z * Math.exp(-e.deltaY * 0.0015));
  }, { passive: false });
  el.addEventListener('contextmenu', (e) => e.preventDefault());
}

// Tap or drag on the minimap to jump the view there.
export function attachMinimapInput(el, cam) {
  let down = false;
  const jump = (e) => {
    const r = el.getBoundingClientRect();
    centreOn(cam, ((e.clientX - r.left) / r.width) * cam.W, ((e.clientY - r.top) / r.height) * cam.H);
  };
  el.addEventListener('pointerdown', (e) => { e.stopPropagation(); down = true; el.setPointerCapture(e.pointerId); jump(e); });
  el.addEventListener('pointermove', (e) => { if (down) jump(e); });
  el.addEventListener('pointerup', () => { down = false; });
  el.addEventListener('pointercancel', () => { down = false; });
}
