// Camera: which part of the world is on screen and how zoomed in.
// x, y = world position of the top left of the view; z = pixels per world unit.

export function createCamera(worldW, worldH) {
  return { x: 0, y: 0, z: 0.5, vw: 1, vh: 1, W: worldW, H: worldH, minZ: 0.1, maxZ: 3 };
}

export function setViewport(cam, vw, vh) {
  const first = cam.vw === 1;
  cam.vw = vw;
  cam.vh = vh;
  // Zoomed all the way out you can see the whole map width.
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

export function clampCamera(cam) {
  cam.z = Math.max(cam.minZ, Math.min(cam.maxZ, cam.z));
  const viewW = cam.vw / cam.z, viewH = cam.vh / cam.z;
  cam.x = viewW >= cam.W ? (cam.W - viewW) / 2 : Math.max(0, Math.min(cam.W - viewW, cam.x));
  cam.y = viewH >= cam.H ? (cam.H - viewH) / 2 : Math.max(0, Math.min(cam.H - viewH, cam.y));
}

export const toWorld = (cam, sx, sy) => ({ x: cam.x + sx / cam.z, y: cam.y + sy / cam.z });
export const toScreen = (cam, wx, wy) => ({ x: (wx - cam.x) * cam.z, y: (wy - cam.y) * cam.z });

export function zoomAt(cam, sx, sy, newZ) {
  const w = toWorld(cam, sx, sy);
  cam.z = Math.max(cam.minZ, Math.min(cam.maxZ, newZ));
  cam.x = w.x - sx / cam.z;
  cam.y = w.y - sy / cam.z;
  clampCamera(cam);
}

export function centreOn(cam, wx, wy) {
  cam.x = wx - cam.vw / cam.z / 2;
  cam.y = wy - cam.vh / cam.z / 2;
  clampCamera(cam);
}
