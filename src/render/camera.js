// Camera: which part of the world is on screen, how zoomed in, and how far
// the view is turned. x, y = the world point at the top left of the view
// when it is not turned (so the middle of the view is x + vw / 2z,
// y + vh / 2z); z = pixels per world unit; rot = turn in radians.

export function createCamera(worldW, worldH) {
  return { x: 0, y: 0, z: 0.5, rot: 0, vw: 1, vh: 1, W: worldW, H: worldH, minZ: 0.1, maxZ: 3, canRotate: true };
}

export function setViewport(cam, vw, vh) {
  const first = cam.vw === 1;
  cam.vw = vw;
  cam.vh = vh;
  // Zoomed all the way out you can see the whole map.
  cam.minZ = Math.min(vw / cam.W, vh / cam.H);
  cam.maxZ = 3;
  if (first) {
    // Start fitted to the map's height, looking at the ISA lines.
    cam.z = Math.max(cam.minZ, Math.min(vh / cam.H, 1.2));
    cam.x = 0;
    cam.y = 0;
  }
  clampCamera(cam);
}

const centre = (cam) => ({ x: cam.x + cam.vw / cam.z / 2, y: cam.y + cam.vh / cam.z / 2 });
const setCentre = (cam, cx, cy) => { cam.x = cx - cam.vw / cam.z / 2; cam.y = cy - cam.vh / cam.z / 2; };

export function clampCamera(cam) {
  cam.z = Math.max(cam.minZ, Math.min(cam.maxZ, cam.z));
  if (!cam.rot) {
    // Not turned: keep the view inside the map, as it always was.
    const viewW = cam.vw / cam.z, viewH = cam.vh / cam.z;
    cam.x = viewW >= cam.W ? (cam.W - viewW) / 2 : Math.max(0, Math.min(cam.W - viewW, cam.x));
    cam.y = viewH >= cam.H ? (cam.H - viewH) / 2 : Math.max(0, Math.min(cam.H - viewH, cam.y));
    return;
  }
  // Turned: keep the middle of the view over the map.
  const c = centre(cam);
  setCentre(cam, Math.max(0, Math.min(cam.W, c.x)), Math.max(0, Math.min(cam.H, c.y)));
}

export function toWorld(cam, sx, sy) {
  const c = centre(cam);
  const ux = (sx - cam.vw / 2) / cam.z, uy = (sy - cam.vh / 2) / cam.z;
  if (!cam.rot) return { x: c.x + ux, y: c.y + uy };
  const cs = Math.cos(cam.rot), sn = Math.sin(cam.rot);
  return { x: c.x + ux * cs + uy * sn, y: c.y - ux * sn + uy * cs };
}

export function toScreen(cam, wx, wy) {
  const c = centre(cam);
  const dx = wx - c.x, dy = wy - c.y;
  if (!cam.rot) return { x: dx * cam.z + cam.vw / 2, y: dy * cam.z + cam.vh / 2 };
  const cs = Math.cos(cam.rot), sn = Math.sin(cam.rot);
  return { x: (dx * cs - dy * sn) * cam.z + cam.vw / 2, y: (dx * sn + dy * cs) * cam.z + cam.vh / 2 };
}

// The canvas transform that draws world units onto the screen (before the
// device pixel ratio), as [a, b, c, d, e, f] for setTransform.
export function worldMatrix(cam) {
  const c = centre(cam);
  const cs = Math.cos(cam.rot) * cam.z, sn = Math.sin(cam.rot) * cam.z;
  return [cs, sn, -sn, cs, cam.vw / 2 - (cs * c.x - sn * c.y), cam.vh / 2 - (sn * c.x + cs * c.y)];
}

// The part of the world on screen, as a box (bigger than the view when turned).
export function viewBounds(cam) {
  const pts = [toWorld(cam, 0, 0), toWorld(cam, cam.vw, 0), toWorld(cam, 0, cam.vh), toWorld(cam, cam.vw, cam.vh)];
  return { x0: Math.min(...pts.map((p) => p.x)), y0: Math.min(...pts.map((p) => p.y)), x1: Math.max(...pts.map((p) => p.x)), y1: Math.max(...pts.map((p) => p.y)), corners: [pts[0], pts[1], pts[3], pts[2]] };
}

// Move the view by a drag on screen (in screen pixels).
export function panBy(cam, dx, dy) {
  const a = toWorld(cam, 0, 0), b = toWorld(cam, dx, dy);
  cam.x -= b.x - a.x;
  cam.y -= b.y - a.y;
  clampCamera(cam);
}

export function zoomAt(cam, sx, sy, newZ) {
  const w = toWorld(cam, sx, sy);
  cam.z = Math.max(cam.minZ, Math.min(cam.maxZ, newZ));
  const w2 = toWorld(cam, sx, sy);
  cam.x += w.x - w2.x;
  cam.y += w.y - w2.y;
  clampCamera(cam);
}

// Turn the view about a point on screen, which stays where it is.
export function rotateAt(cam, sx, sy, newRot) {
  if (!cam.canRotate) return;
  const w = toWorld(cam, sx, sy);
  let r = newRot % (Math.PI * 2);
  if (r < 0) r += Math.PI * 2;
  // Snap to square when close, so getting back to north is easy.
  for (const q of [0, Math.PI / 2, Math.PI, Math.PI * 1.5, Math.PI * 2]) if (Math.abs(r - q) < 0.07) r = q % (Math.PI * 2);
  cam.rot = r;
  const w2 = toWorld(cam, sx, sy);
  cam.x += w.x - w2.x;
  cam.y += w.y - w2.y;
  clampCamera(cam);
}

export function centreOn(cam, wx, wy) {
  setCentre(cam, wx, wy);
  clampCamera(cam);
}
