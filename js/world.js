'use strict';
/* Bayhaven: city layout, static meshes, collision, road graph, zones, security, minimap base. */

class PropBatch {
  constructor() { this.pos = []; this.nor = []; this.col = []; this.idx = []; this.n = 0; this.c = new THREE.Color(); }
  box(cx, cy, cz, sx, sy, sz, color, ry) {
    const c = this.c.set(color), cs = Math.cos(ry || 0), sn = Math.sin(ry || 0);
    const h = [sx / 2, sy / 2, sz / 2];
    for (let f = 0; f < 6; f++) {
      const ax = f >> 1, sg = (f & 1) ? -1 : 1;
      const n = [0, 0, 0], u = [0, 0, 0], v = [0, 0, 0];
      n[ax] = sg; u[(ax + 1) % 3] = 1; v[(ax + 2) % 3] = 1;
      const b = this.n;
      for (const [a, bb] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        const lx = (n[0] + u[0] * a + v[0] * bb) * h[0], ly = (n[1] + u[1] * a + v[1] * bb) * h[1], lz = (n[2] + u[2] * a + v[2] * bb) * h[2];
        this.pos.push(cx + lx * cs + lz * sn, cy + ly, cz - lx * sn + lz * cs);
        this.nor.push(n[0] * cs + n[2] * sn, n[1], -n[0] * sn + n[2] * cs);
        this.col.push(c.r, c.g, c.b);
      }
      if (sg > 0) this.idx.push(b, b + 1, b + 2, b, b + 2, b + 3); else this.idx.push(b, b + 2, b + 1, b, b + 3, b + 2);
      this.n += 4;
    }
  }
  build(scene, shadows) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.n > 65000 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true }));
    m.castShadow = shadows !== false; m.receiveShadow = true; m.frustumCulled = false;
    scene.add(m);
    return m;
  }
}

class GroundBatch {
  constructor(mat) { this.mat = mat; this.pos = []; this.uv = []; this.idx = []; this.n = 0; }
  quad(p, uv, y) {
    const b = this.n;
    for (let k = 0; k < 4; k++) { this.pos.push(p[k][0], y, p[k][1]); this.uv.push(uv[k][0], uv[k][1]); }
    const cy = (p[1][1] - p[0][1]) * (p[2][0] - p[0][0]) - (p[1][0] - p[0][0]) * (p[2][1] - p[0][1]);
    if (cy > 0) this.idx.push(b, b + 1, b + 2, b, b + 2, b + 3); else this.idx.push(b, b + 2, b + 1, b, b + 3, b + 2);
    this.n += 4;
  }
  rect(x0, z0, x1, z1, y, scale) {
    const s = scale || 4;
    this.quad([[x0, z0], [x1, z0], [x1, z1], [x0, z1]], [[x0 / s, z0 / s], [x1 / s, z0 / s], [x1 / s, z1 / s], [x0 / s, z1 / s]], y);
  }
  strip(ax, az, bx, bz, hw, y, tile) {
    const L = dist(ax, az, bx, bz); if (L < 0.01) return;
    const dx = (bx - ax) / L, dz = (bz - az) / L, px = -dz * hw, pz = dx * hw, v = L / (tile || 6);
    this.quad([[ax - px, az - pz], [ax + px, az + pz], [bx + px, bz + pz], [bx - px, bz - pz]], [[0, 0], [1, 0], [1, v], [0, v]], y);
  }
  build(scene) {
    if (!this.n) return null;
    const g = new THREE.BufferGeometry(), nor = new Float32Array(this.n * 3);
    for (let i = 0; i < this.n; i++) nor[i * 3 + 1] = 1;
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setIndex(this.n > 65000 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    const m = new THREE.Mesh(g, this.mat); m.receiveShadow = true; m.frustumCulled = false;
    scene.add(m);
    return m;
  }
}

const W = {
  CELL: 50, N: 8, RH: 6, IH: 15.5, RING: 17.25, HWH: 15,
  colliders: [], cells: new Map(), GS: 10, qid: 1,
  nodes: [], nodeMap: new Map(), edges: [],
  blocks: [], blockGrid: [], alleys: [], trails: [], forestExits: [], places: { helipads: [], shops: [] }, robs: [], buildings: [],
  parkingSpots: [], curbSpots: [], trees: [], cams: [], alarms: [], lampSpots: [],
};
W.HALF = W.N * 25;          // the street grid spans ±HALF
W.HWY = W.HALF + 160;       // Ring Highway centreline (6 lanes, 30 m wide)
W.RR = 80;                  // radius of the ring's sweeping corners
W.SHORE = W.HWY + W.HWH + 20; // south: beach ends and the harbor begins
W.BOUND = W.HWY + W.HWH + 28; // fences on the north, east and west edges
W.MAPH = W.BOUND + 12;      // half-size of the area the minimap covers
W.rp = (k) => -W.HALF + 50 * k;
W.bc = (i) => -W.HALF + 25 + 50 * i;
W.FOREST = { minX: W.rp(5) + 6, maxX: W.HALF + 45, minZ: -(W.HALF + 45), maxZ: W.rp(2) - 6 };
W.FOREST_C = { x: (W.FOREST.minX + W.FOREST.maxX) / 2, z: (W.FOREST.minZ + W.FOREST.maxZ) / 2 };

W.ZONES = {
  highway: { label: 'HIGHWAY', hint: 'Fast · exposed · roadblocks · choppers see far', sight: 95, evade: 1.3, car: 1.6 },
  street: { label: 'STREETS', hint: 'Traffic · patrols', sight: 45, evade: 1, car: 1.15 },
  alley: { label: 'ALLEY', hint: 'Hidden · tight · dead ends · cover from choppers', sight: 18, evade: 0.55, car: 0.7 },
  forest: { label: 'FOREST PARK', hint: 'Hidden · slow · 4 exits · trees block choppers', sight: 16, evade: 0.5, car: 0.75 },
  rooftop: { label: 'ROOFTOP', hint: 'Cops on the street can\'t reach or see you · choppers can', sight: 8, evade: 0.8, car: 1 },
  outskirts: { label: 'OUTSKIRTS', hint: 'Open ground', sight: 60, evade: 1.1, car: 0.95 },
  beach: { label: 'BEACH', hint: 'Open sand · no cover', sight: 70, evade: 1.2, car: 0.8 },
  air: { label: 'AIRBORNE', hint: 'Fast · every cop can see you', sight: 90, evade: 1.5, car: 1 },
};

/* Block layout: BLOCKS[j][i], i = west→east, j = north→south. F = Forest Park. */
const BLOCKS = [
  ['park', 'city', 'deadS', 'city', 'alleyNS', 'F', 'F', 'F'],
  ['alleyNS', 'hospital', 'alleyNS', 'jewel', 'deadE', 'F', 'F', 'F'],
  ['shop', 'alleyEW', 'bank', 'alleyNS', 'liquor', 'city', 'alleyNS', 'park'],
  ['deadE', 'quick', 'alleyEW', 'downtown', 'downtown', 'alleyNS', 'pawn', 'irondog'],
  ['city', 'hideout', 'burger', 'deadN', 'downtown', 'police', 'alleyEW', 'deadW'],
  ['gas', 'alleyNS', 'parking', 'electro', 'city', 'alleyEW', 'pizza', 'city'],
  ['city', 'deadN', 'deli', 'alleyEW', 'park', 'city', 'deadS', 'alleyNS'],
  ['park', 'alleyEW', 'boomtown', 'deadW', 'phones', 'alleyNS', 'city', 'chop'],
];

const STORES = {
  quick: { name: 'Quick-Stop', q: 0, cash: [180, 360], base: 0, hold: 3.5, wall: '#3f8f63', sign: 'QUICK-STOP', bg: '#1d6b45', fg: '#fff6cf' },
  liquor: { name: 'Liquor Barn', q: 3, cash: [220, 420], base: 0, hold: 3.5, wall: '#8a5a3a', sign: 'LIQUOR BARN', bg: '#5b2f1c', fg: '#ffd27a' },
  burger: { name: 'Burger Jack', q: 1, cash: [140, 320], base: 0, hold: 3.5, wall: '#c9503c', sign: 'BURGER JACK', bg: '#f2b632', fg: '#7a1d10' },
  electro: { name: 'Electro Mart', q: 2, cash: [380, 680], base: 0, hold: 4, wall: '#3a5f8f', sign: 'ELECTRO MART', bg: '#16243a', fg: '#5ff0ff' },
  pawn: { name: "Lucky's Pawn", q: 0, cash: [420, 760], base: 0, hold: 4, wall: '#7b6a3a', sign: "LUCKY'S PAWN", bg: '#2b2a12', fg: '#f5df5a' },
  jewel: { name: 'Glimmer & Co.', q: 2, cash: [1800, 2800], base: 1, hold: 6, wall: '#2c2c3a', sign: 'GLIMMER & CO.', bg: '#111118', fg: '#e8d38a' },
  pizza: { name: 'Pizza Palace', q: 1, cash: [160, 340], base: 0, hold: 3.5, wall: '#b8452f', sign: 'PIZZA PALACE', bg: '#1f6b3a', fg: '#ffffff' },
  deli: { name: 'Corner Deli', q: 2, cash: [150, 300], base: 0, hold: 3.5, wall: '#c9a66b', sign: 'CORNER DELI', bg: '#3b2a1a', fg: '#ffe2a8' },
  phones: { name: 'Cell Shack', q: 3, cash: [450, 800], base: 0, hold: 4, wall: '#4b3a8f', sign: 'CELL SHACK', bg: '#1a1240', fg: '#7cf7c9' },
  irondog: { name: 'Iron Dog Arms', q: 2, shop: true, wall: '#3d4a52', sign: 'IRON DOG ARMS', bg: '#141a1f', fg: '#9be7ff' },
  boomtown: { name: 'Boom Town Explosives', q: 1, shop: true, wall: '#8f2d1f', sign: 'BOOM TOWN', bg: '#1a0f0a', fg: '#ffb703' },
  shop: { name: 'Hardline Supply', q: 1, shop: true, wall: '#4a4f45', sign: 'HARDLINE SUPPLY', bg: '#1b1d18', fg: '#ff8a3d' },
};

let rnd = Math.random;

/* ---------------- spatial hash ---------------- */
function gkey(ix, iz) { return (ix + 1000) * 4096 + (iz + 1000); }
W.insert = function (c) {
  for (let ix = Math.floor(c.minX / W.GS); ix <= Math.floor(c.maxX / W.GS); ix++)
    for (let iz = Math.floor(c.minZ / W.GS); iz <= Math.floor(c.maxZ / W.GS); iz++) {
      const k = gkey(ix, iz); let a = W.cells.get(k);
      if (!a) W.cells.set(k, (a = [])); a.push(c);
    }
};
W.addCollider = function (minX, minZ, maxX, maxZ, h, kind, noLos) {
  const c = { minX, minZ, maxX, maxZ, h: h || 10, kind: kind || 'wall', noLos: !!noLos, q: 0 };
  W.colliders.push(c); W.insert(c); return c;
};
W.removeCollider = function (c) {
  if (c.removed) return;
  for (let ix = Math.floor(c.minX / W.GS); ix <= Math.floor(c.maxX / W.GS); ix++)
    for (let iz = Math.floor(c.minZ / W.GS); iz <= Math.floor(c.maxZ / W.GS); iz++) {
      const a = W.cells.get(gkey(ix, iz)); if (!a) continue; const i = a.indexOf(c); if (i >= 0) a.splice(i, 1);
    }
  c.removed = true;
  if (c.physBody) { try { c.physBody.destroy(); c.physBody.delete(); } catch (e) { /* gone */ } c.physBody = null; }
};
W.addCircle = function (x, z, r, kind) {
  const c = { circle: true, x, z, r, minX: x - r, maxX: x + r, minZ: z - r, maxZ: z + r, h: 5, kind, noLos: true, q: 0 };
  W.colliders.push(c); W.insert(c); return c;
};
W.queryBox = function (x0, z0, x1, z1) {
  const out = [], q = ++W.qid;
  for (let ix = Math.floor(x0 / W.GS); ix <= Math.floor(x1 / W.GS); ix++)
    for (let iz = Math.floor(z0 / W.GS); iz <= Math.floor(z1 / W.GS); iz++) {
      const a = W.cells.get(gkey(ix, iz)); if (!a) continue;
      for (const c of a) if (c.q !== q) { c.q = q; out.push(c); }
    }
  return out;
};
/* Push circle p{x,z} radius r out of all static colliders. Returns deepest hit {nx,nz,depth} or null. */
W.collideCircle = function (p, r, y) {
  let hit = null;
  const list = W.queryBox(p.x - r - 0.5, p.z - r - 0.5, p.x + r + 0.5, p.z + r + 0.5);
  for (const c of list) {
    if (y > 0 && c.h <= y) continue;
    let nx = 0, nz = 0, pen = 0;
    if (c.circle) {
      const dx = p.x - c.x, dz = p.z - c.z, rr = r + c.r, d2 = dx * dx + dz * dz;
      if (d2 >= rr * rr) continue;
      const d = Math.sqrt(d2) || 1e-4; nx = dx / d; nz = dz / d; pen = rr - d;
    } else {
      const qx = clamp(p.x, c.minX, c.maxX), qz = clamp(p.z, c.minZ, c.maxZ);
      const dx = p.x - qx, dz = p.z - qz, d2 = dx * dx + dz * dz;
      if (d2 >= r * r) continue;
      if (d2 > 1e-8) { const d = Math.sqrt(d2); nx = dx / d; nz = dz / d; pen = r - d; }
      else {
        const l = p.x - c.minX, rt = c.maxX - p.x, t = p.z - c.minZ, b = c.maxZ - p.z, m = Math.min(l, rt, t, b);
        if (m === l) nx = -1; else if (m === rt) nx = 1; else if (m === t) nz = -1; else nz = 1;
        pen = m + r;
      }
    }
    p.x += nx * pen; p.z += nz * pen;
    if (!hit || pen > hit.depth) hit = { nx, nz, depth: pen, c };
  }
  return hit;
};
function segAABB(ax, az, bx, bz, c) {
  let t0 = 0, t1 = 1; const dx = bx - ax, dz = bz - az;
  if (Math.abs(dx) < 1e-9) { if (ax < c.minX || ax > c.maxX) return -1; }
  else { let ta = (c.minX - ax) / dx, tb = (c.maxX - ax) / dx; if (ta > tb) { const s = ta; ta = tb; tb = s; } t0 = Math.max(t0, ta); t1 = Math.min(t1, tb); if (t0 > t1) return -1; }
  if (Math.abs(dz) < 1e-9) { if (az < c.minZ || az > c.maxZ) return -1; }
  else { let ta = (c.minZ - az) / dz, tb = (c.maxZ - az) / dz; if (ta > tb) { const s = ta; ta = tb; tb = s; } t0 = Math.max(t0, ta); t1 = Math.min(t1, tb); if (t0 > t1) return -1; }
  return t0;
}
W.segAABB = segAABB;
W.segBlocked = function (ax, az, bx, bz, y) {
  const list = W.queryBox(Math.min(ax, bx), Math.min(az, bz), Math.max(ax, bx), Math.max(az, bz));
  for (const c of list) { if (c.noLos || (y > 0 && c.h <= y)) continue; if (segAABB(ax, az, bx, bz, c) >= 0) return true; }
  return false;
};
/* the roof you'd be standing on at height y (0 = street level) */
W.floorAt = function (x, z, y) {
  let f = 0;
  for (const b of W.buildings) {
    if (b.h > y + 0.6 || b.h <= f) continue;
    if (x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ) f = b.h;
  }
  return f;
};
/* up on the roofs, taller neighbouring buildings are walls */
W.collideBuildings = function (p, r, y) {
  for (const b of W.buildings) {
    if (b.h <= y + 0.5) continue;
    if (p.x + r < b.minX || p.x - r > b.maxX || p.z + r < b.minZ || p.z - r > b.maxZ) continue;
    const qx = clamp(p.x, b.minX, b.maxX), qz = clamp(p.z, b.minZ, b.maxZ), dx = p.x - qx, dz = p.z - qz, d = Math.hypot(dx, dz);
    if (d >= r) continue;
    if (d > 1e-4) { p.x += dx / d * (r - d); p.z += dz / d * (r - d); }
    else { const l = p.x - b.minX, rt = b.maxX - p.x, t = p.z - b.minZ, bt = b.maxZ - p.z, m = Math.min(l, rt, t, bt); if (m === l) p.x = b.minX - r; else if (m === rt) p.x = b.maxX + r; else if (m === t) p.z = b.minZ - r; else p.z = b.maxZ + r; }
  }
};
/* first hit fraction along segment against tall colliders (for camera) */
W.segHitT = function (ax, az, bx, bz, minH) {
  const list = W.queryBox(Math.min(ax, bx), Math.min(az, bz), Math.max(ax, bx), Math.max(az, bz));
  let best = 1;
  for (const c of list) { if (c.noLos || c.h < (minH || 3)) continue; const t = segAABB(ax, az, bx, bz, c); if (t >= 0 && t < best) best = t; }
  return best;
};

/* ---------------- zones ---------------- */
const inRect = (x, z, r) => x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ;
W.ringDist = (x, z) => { const k = W.HWY - W.RR; return Math.abs(Math.hypot(x - clamp(x, -k, k), z - clamp(z, -k, k)) - W.RR); };
W.onHighway = (x, z) => W.ringDist(x, z) <= W.HWH + 0.5;
W.zoneAt = function (x, z) {
  if (inRect(x, z, W.FOREST)) return 'forest';
  for (const a of W.alleys) if (inRect(x, z, a)) return 'alley';
  if (W.onHighway(x, z)) return 'highway';
  if (z > W.HWY + W.HWH + 0.5) return 'beach';
  if (Math.abs(x) <= W.HALF + 6 && Math.abs(z) <= W.HALF + 6) return 'street';
  for (const e of W.edges) if (!e.hwy && segPointDist(x, z, W.nodes[e.a].x, W.nodes[e.a].z, W.nodes[e.b].x, W.nodes[e.b].z) <= 6.5) return 'street';
  return 'outskirts';
};
W.onTrail = function (x, z) {
  for (const t of W.trails) if (segPointDist(x, z, t[0], t[1], t[2], t[3]) < 3.2) return true;
  return dist(x, z, W.FOREST_C.x, W.FOREST_C.z) < 13;
};
W.blockAt = function (x, z) {
  const i = Math.floor((x + W.HALF) / 50), j = Math.floor((z + W.HALF) / 50);
  if (i < 0 || j < 0 || i >= W.N || j >= W.N) return null;
  return W.blockGrid[j][i];
};
W.nearestBlock = function (x, z) {
  let best = null, bd = 1e9;
  for (const b of W.blocks) { const d = dist(x, z, b.cx, b.cz); if (d < bd) { bd = d; best = b; } }
  return best;
};
W.corner = (b, sx, sz) => ({ x: b.cx + sx * W.RING, z: b.cz + sz * W.RING });

/* ---------------- road graph ---------------- */
W.addNode = function (x, z, hwy, half) {
  const k = x + ',' + z;
  if (W.nodeMap.has(k)) return W.nodeMap.get(k);
  const id = W.nodes.length;
  W.nodes.push({ id, x, z, hwy: !!hwy, adj: [], half: half != null ? half : hwy ? W.HWH : 6 });
  W.nodeMap.set(k, id); return id;
};
W.addEdge = function (a, b, hwy, arc) {
  if (a == null || b == null || a === b) return;
  if (W.nodes[a].adj.includes(b)) return;
  W.nodes[a].adj.push(b); W.nodes[b].adj.push(a);
  W.edges.push({ a, b, hwy: !!hwy, arc: !!arc });
};
W.nearestNode = function (x, z, filter) {
  let best = -1, bd = 1e9;
  for (const n of W.nodes) { if (filter && !filter(n)) continue; const d = dist(x, z, n.x, n.z); if (d < bd) { bd = d; best = n.id; } }
  return best;
};
function buildGraph() {
  const exists = (x, z) => !(x > W.FOREST.minX && x < W.FOREST.maxX + 20 && z < W.FOREST.maxZ && z > W.FOREST.minZ - 20);
  const id = {};
  for (let k = 0; k <= W.N; k++) for (let l = 0; l <= W.N; l++) {
    const x = W.rp(k), z = W.rp(l);
    if (exists(x, z)) id[k + ',' + l] = W.addNode(x, z, false);
  }
  for (let k = 0; k <= W.N; k++) for (let l = 0; l <= W.N; l++) {
    const a = id[k + ',' + l]; if (a == null) continue;
    if (id[(k + 1) + ',' + l] != null) W.addEdge(a, id[(k + 1) + ',' + l]);
    if (id[k + ',' + (l + 1)] != null) W.addEdge(a, id[k + ',' + (l + 1)]);
  }
  const H = W.HWY, G0 = W.HALF, C = W.CONNECT;
  const hn = (x, z) => W.addNode(x, z, true);
  // the loop: straights (with junctions where connectors join) and curved corners (no junction pads)
  const k = H - W.RR, seq = [];
  const straight = (list, mk) => { for (const v of [-k, ...list, k]) seq.push({ id: mk(v), arc: false }); };
  const corner = (cx, cz, a0) => { for (let i = 1; i < 4; i++) { const a = a0 + (i / 4) * Math.PI / 2; seq.push({ id: W.addNode(+(cx + Math.cos(a) * W.RR).toFixed(2), +(cz + Math.sin(a) * W.RR).toFixed(2), true, 0), arc: true }); } };
  const endNode = (x, z) => W.addNode(x, z, true, 0);
  const sq = (list, mk, endMk) => { seq.push({ id: endMk(-k), arc: false }); for (const v of list) seq.push({ id: mk(v), arc: false }); seq.push({ id: endMk(k), arc: false }); };
  sq(C.n, (x) => hn(x, -H), (x) => endNode(x, -H)); corner(k, -k, -Math.PI / 2);
  sq(C.e, (z) => hn(H, z), (z) => endNode(H, z)); corner(k, k, 0);
  sq(C.s.slice().reverse(), (x) => hn(x, H), (x) => endNode(-x, H)); corner(-k, k, Math.PI / 2);
  sq(C.w.slice().reverse(), (z) => hn(-H, z), (z) => endNode(-H, -z)); corner(-k, -k, Math.PI);
  void straight;
  for (let i = 0; i < seq.length; i++) {
    const a = seq[i], b = seq[(i + 1) % seq.length];
    W.addEdge(a.id, b.id, true, a.arc || b.arc || (W.nodes[a.id].half === 0 && W.nodes[b.id].half === 0));
  }
  for (const x of C.n) W.addEdge(W.nodeMap.get(x + ',' + -G0), hn(x, -H));
  for (const x of C.s) W.addEdge(W.nodeMap.get(x + ',' + G0), hn(x, H));
  for (const z of C.w) W.addEdge(W.nodeMap.get(-G0 + ',' + z), hn(-H, z));
  for (const z of C.e) W.addEdge(W.nodeMap.get(G0 + ',' + z), hn(H, z));
}
/* where grid roads connect out to the Ring Highway */
W.CONNECT = { n: [-100, 50], s: [-100, 0, 100], w: [-100, 0, 100], e: [-100, 0, 100] };

/* ring parameterisation of the highway, clockwise from the NW corner */
W.ringSegs = function () {
  if (W._rs) return W._rs;
  const H = W.HWY, R = W.RR, k = H - R, S = 2 * k, A = Math.PI * R / 2;
  W._rs = [
    { t: 'line', ax: -k, az: -H, dx: 1, dz: 0, len: S }, { t: 'arc', cx: k, cz: -k, a0: -Math.PI / 2, len: A },
    { t: 'line', ax: H, az: -k, dx: 0, dz: 1, len: S }, { t: 'arc', cx: k, cz: k, a0: 0, len: A },
    { t: 'line', ax: k, az: H, dx: -1, dz: 0, len: S }, { t: 'arc', cx: -k, cz: k, a0: Math.PI / 2, len: A },
    { t: 'line', ax: -H, az: k, dx: 0, dz: -1, len: S }, { t: 'arc', cx: -k, cz: -k, a0: Math.PI, len: A },
  ];
  W.RLEN = W._rs.reduce((t, g) => t + g.len, 0);
  return W._rs;
};
W.ringParam = function (x, z) {
  let best = 0, bd = 1e9, acc = 0;
  for (const g of W.ringSegs()) {
    let s, px, pz;
    if (g.t === 'line') { s = clamp((x - g.ax) * g.dx + (z - g.az) * g.dz, 0, g.len); px = g.ax + g.dx * s; pz = g.az + g.dz * s; }
    else {
      let da = Math.atan2(z - g.cz, x - g.cx) - g.a0; da = ((da % TAU) + TAU) % TAU;
      if (da > Math.PI / 2) da = da > Math.PI / 2 + (TAU - Math.PI / 2) / 2 ? 0 : Math.PI / 2;
      s = da * W.RR; px = g.cx + Math.cos(g.a0 + da) * W.RR; pz = g.cz + Math.sin(g.a0 + da) * W.RR;
    }
    const d = dist(x, z, px, pz);
    if (d < bd) { bd = d; best = acc + s; }
    acc += g.len;
  }
  return best;
};
W.ringPoint = function (s) {
  const segs = W.ringSegs(), L = W.RLEN; s = ((s % L) + L) % L;
  for (const g of segs) {
    if (s <= g.len) {
      if (g.t === 'line') return { x: g.ax + g.dx * s, z: g.az + g.dz * s, tx: g.dx, tz: g.dz, arc: false };
      const a = g.a0 + s / W.RR;
      return { x: g.cx + Math.cos(a) * W.RR, z: g.cz + Math.sin(a) * W.RR, tx: -Math.sin(a), tz: Math.cos(a), arc: true };
    }
    s -= g.len;
  }
  return W.ringPoint(0);
};

/* ---------------- textures ---------------- */
function makeTextures() {
  const T = {};
  T.grass = canvasTex(128, 128, (g, w, h) => { g.fillStyle = '#6a9a45'; g.fillRect(0, 0, w, h); speckle(g, w, h, ['#5d8c3c', '#78a852', '#628f40', '#83b05a'], 700, 2.5); });
  T.forest = canvasTex(128, 128, (g, w, h) => { g.fillStyle = '#3f4f2c'; g.fillRect(0, 0, w, h); speckle(g, w, h, ['#4b3a26', '#56653a', '#34431f', '#6b5a3a'], 900, 2.5); });
  T.sand = canvasTex(128, 128, (g, w, h) => { g.fillStyle = '#e6d3a3'; g.fillRect(0, 0, w, h); speckle(g, w, h, ['#d9c58f', '#f0e2b8', '#cdb882', '#efe6c9'], 900, 2); });
  T.dirt = canvasTex(64, 64, (g, w, h) => { g.fillStyle = '#9a7a52'; g.fillRect(0, 0, w, h); speckle(g, w, h, ['#8a6a44', '#a8885e', '#7c5f3e'], 300, 2); });
  T.asphalt = canvasTex(128, 128, (g, w, h) => { g.fillStyle = '#3b3e44'; g.fillRect(0, 0, w, h); speckle(g, w, h, ['#34373c', '#44474d', '#2f3236'], 900, 2); });
  T.alley = canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = '#34302d'; g.fillRect(0, 0, w, h); speckle(g, w, h, ['#2a2725', '#3e3934', '#28241f'], 900, 3);
    g.fillStyle = 'rgba(20,30,35,0.45)'; for (let i = 0; i < 4; i++) { g.beginPath(); g.ellipse(Math.random() * w, Math.random() * h, 10 + Math.random() * 14, 6 + Math.random() * 8, 0, 0, TAU); g.fill(); }
  });
  T.sidewalk = canvasTex(64, 64, (g, w, h) => {
    g.fillStyle = '#a9a295'; g.fillRect(0, 0, w, h); speckle(g, w, h, ['#a09a8d', '#b2ac9f'], 200, 2);
    g.strokeStyle = '#9f988b'; g.lineWidth = 2; g.strokeRect(1, 1, 31, 31); g.strokeRect(33, 1, 30, 31); g.strokeRect(1, 33, 31, 30); g.strokeRect(33, 33, 30, 30);
  });
  T.plaza = canvasTex(64, 64, (g, w, h) => {
    g.fillStyle = '#98917f'; g.fillRect(0, 0, w, h); speckle(g, w, h, ['#90897a', '#a29b8b'], 200, 2);
    g.strokeStyle = '#958e80'; g.lineWidth = 1; for (let i = 0; i <= 64; i += 16) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 64); g.moveTo(0, i); g.lineTo(64, i); g.stroke(); }
  });
  T.road = canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = '#3b3e44'; g.fillRect(0, 0, w, h); speckle(g, w, h, ['#34373c', '#45484e', '#303338'], 800, 2);
    g.fillStyle = '#e9e4d6'; g.fillRect(5, 0, 2, h); g.fillRect(w - 7, 0, 2, h);
    g.fillStyle = '#f2c230'; g.fillRect(w / 2 - 2, 0, 4, h / 2);
  });
  T.hwy = canvasTex(384, 128, (g, w, h) => {
    g.fillStyle = '#44474d'; g.fillRect(0, 0, w, h); speckle(g, w, h, ['#3d4046', '#4d5056', '#383b40'], 2200, 2);
    g.fillStyle = '#e9e4d6'; g.fillRect(6, 0, 3, h); g.fillRect(w - 9, 0, 3, h);
    for (const f of [1 / 6, 2 / 6, 4 / 6, 5 / 6]) g.fillRect(w * f - 1, 0, 3, h / 2);
    g.fillStyle = '#f2c230'; g.fillRect(w / 2 - 5, 0, 3, h); g.fillRect(w / 2 + 2, 0, 3, h);
  });
  T.white = new THREE.MeshLambertMaterial({ color: 0xe9e4d6 });
  return T;
}
function facadeTex(wall, win, frame, litP, kind) {
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = wall; g.fillRect(0, 0, w, h);
    speckle(g, w, h, ['rgba(0,0,0,0.06)', 'rgba(255,255,255,0.05)'], 500, 3);
    if (kind === 'brick') { g.strokeStyle = 'rgba(0,0,0,0.12)'; g.lineWidth = 1; for (let y = 0; y < h; y += 8) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); } }
    for (let fy = 0; fy < 2; fy++) for (let fx = 0; fx < 2; fx++) {
      const x0 = fx * 128, y0 = fy * 128;
      if (kind === 'glass') {
        g.fillStyle = Math.random() < litP ? '#ffe7a8' : win; g.fillRect(x0 + 4, y0 + 10, 120, 100);
        g.fillStyle = frame; g.fillRect(x0 + 62, y0 + 10, 4, 100); g.fillRect(x0, y0 + 112, 128, 14);
      } else {
        for (const wx of [18, 74]) {
          g.fillStyle = frame; g.fillRect(x0 + wx - 4, y0 + 26, 44, 74);
          g.fillStyle = Math.random() < litP ? '#ffe2a0' : win; g.fillRect(x0 + wx, y0 + 30, 36, 66);
          g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(x0 + wx + 2, y0 + 32, 8, 62);
          g.fillStyle = frame; g.fillRect(x0 + wx - 6, y0 + 98, 48, 6);
        }
      }
    }
  });
}
function signTex(text, bg, fg, sub) {
  return canvasTex(512, 128, (g, w, h) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.strokeStyle = fg; g.lineWidth = 6; g.strokeRect(8, 8, w - 16, h - 16);
    g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
    let size = 64; g.font = `${size}px Bungee, Impact, sans-serif`;
    while (g.measureText(text).width > w - 50 && size > 20) { size -= 2; g.font = `${size}px Bungee, Impact, sans-serif`; }
    g.fillText(text, w / 2, sub ? h / 2 - 12 : h / 2 + 2);
    if (sub) { g.font = '22px "Barlow Condensed", Arial, sans-serif'; g.fillText(sub, w / 2, h - 30); }
  });
}

/* ---------------- builders ---------------- */
let S, P, GB, TEX, FAC;

function addBuilding(cx, cz, w, d, h, style, opts) {
  opts = opts || {};
  const geo = new THREE.BoxGeometry(w, h, d);
  const uv = geo.attributes.uv;
  for (let f = 0; f < 6; f++) {
    if (f === 2 || f === 3) continue;
    const span = f < 2 ? d : w;
    for (let k = 0; k < 4; k++) { const i = f * 4 + k; uv.setXY(i, uv.getX(i) * span / 8, uv.getY(i) * h / 7); }
  }
  const fac = FAC[style] || FAC.brick;
  const side = opts.color ? new THREE.MeshLambertMaterial({ color: opts.color }) : new THREE.MeshLambertMaterial({ map: fac.tex });
  const roof = new THREE.MeshLambertMaterial({ color: fac.roof });
  const mesh = new THREE.Mesh(geo, [side, side, roof, roof, side, side]);
  mesh.position.set(cx, h / 2, cz); mesh.castShadow = true; mesh.receiveShadow = true;
  S.add(mesh);
  const b = { minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2, h, mesh, mats: [side, roof], fade: 1 };
  W.buildings.push(b);
  if (opts.collide !== false) W.addCollider(b.minX, b.minZ, b.maxX, b.maxZ, h, 'building');
  if (h > 9 && rnd() < 0.7) {
    P.box(cx + (rnd() - 0.5) * w * 0.4, h + 0.7, cz + (rnd() - 0.5) * d * 0.4, 2.4, 1.4, 1.8, '#8d9197');
    if (rnd() < 0.5) P.box(cx + (rnd() - 0.5) * w * 0.5, h + 0.5, cz + (rnd() - 0.5) * d * 0.5, 1.4, 1, 1.4, '#7a7e84');
  }
  P.box(cx, h + 0.25, cz - d / 2 + 0.15, w, 0.5, 0.3, fac.trim); P.box(cx, h + 0.25, cz + d / 2 - 0.15, w, 0.5, 0.3, fac.trim);
  P.box(cx - w / 2 + 0.15, h + 0.25, cz, 0.3, 0.5, d, fac.trim); P.box(cx + w / 2 - 0.15, h + 0.25, cz, 0.3, 0.5, d, fac.trim);
  return b;
}
function addSign(x, y, z, face, text, bg, fg, w, h, sub) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w || 8, h || 2), new THREE.MeshBasicMaterial({ map: signTex(text, bg, fg, sub) }));
  m.position.set(x, y, z);
  m.rotation.y = { s: 0, n: Math.PI, e: Math.PI / 2, w: -Math.PI / 2 }[face];
  S.add(m); return m;
}
const FACE_N = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] };
const FACE_YAW = { n: Math.PI, s: 0, e: Math.PI / 2, w: -Math.PI / 2 };

function bHeight(cx, cz, mul) {
  const d = Math.hypot(cx, cz);
  return (7 + rnd() * 6 + Math.max(0, 38 - d * 0.3) * (0.5 + rnd() * 0.5)) * (mul || 1);
}
function styleFor(h) {
  if (h > 26) return pick(['glass', 'dark', 'concrete']);
  if (h > 15) return pick(['concrete', 'brick', 'dark', 'stucco']);
  return pick(['brick', 'stucco', 'brick', 'concrete']);
}

/* Security: alarm box + cameras attached to a rob target */
function addAlarm(target, x, z, face) {
  const [nx, nz] = FACE_N[face];
  P.box(x, 1.6, z, face === 'e' || face === 'w' ? 0.25 : 0.9, 1.1, face === 'e' || face === 'w' ? 0.9 : 0.25, '#c43b2f');
  P.box(x + nx * 0.14, 1.85, z + nz * 0.14, face === 'e' || face === 'w' ? 0.05 : 0.3, 0.3, face === 'e' || face === 'w' ? 0.3 : 0.05, '#ffd34d');
  const a = { target, x: x + nx * 1.4, z: z + nz * 1.4, wx: x, wz: z, cutT: 0, light: null };
  const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 0.22), new THREE.MeshBasicMaterial({ color: 0xff3030 }));
  lamp.position.set(x + nx * 0.2, 2.35, z + nz * 0.2); S.add(lamp); a.light = lamp;
  target.sec.alarm = a; W.alarms.push(a);
}
function addCam(target, x, z, face, yawOff, range) {
  const [nx, nz] = FACE_N[face];
  const cx = x + nx * 0.5, cz = z + nz * 0.5, yaw = FACE_YAW[face] + (yawOff || 0);
  const grp = new THREE.Group(); grp.position.set(cx, 4.6, cz); S.add(grp);
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.35, 0.8), lam(0xdedede)); body.position.z = 0.25; body.castShadow = true; grp.add(body);
  const lens = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 0.05), new THREE.MeshBasicMaterial({ color: 0x111111 })); lens.position.z = 0.66; grp.add(lens);
  const led = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), new THREE.MeshBasicMaterial({ color: 0xff2020 })); led.position.set(0.12, 0.2, 0.4); grp.add(led);
  const fov = 0.9, r = range || 14;
  const coneMat = new THREE.MeshBasicMaterial({ color: 0xff3b30, transparent: true, opacity: 0.16, depthWrite: false });
  const cone = new THREE.Mesh(new THREE.CircleGeometry(r, 18, -Math.PI / 2 - fov / 2, fov), coneMat);
  cone.rotation.x = -Math.PI / 2;
  const coneG = new THREE.Group(); coneG.position.set(cx, 0.07, cz); coneG.add(cone); S.add(coneG);
  const c = { target, x: cx, z: cz, y: 4.6, base: yaw, yaw, sweep: 0.55, fov, range: r, phase: rnd() * TAU, loopT: 0, deadT: 0, grp, coneG, coneMat, led };
  target.sec.cams.push(c); W.cams.push(c);
}

function makeRob(id, kind, name, x, z, o) {
  const r = Object.assign({ id, kind, name, x, z, r: kind === 'atm' ? 1.3 : 1.8, cd: 0, sec: { alarm: null, cams: [] } }, o);
  W.robs.push(r); W.places[id] = r; return r;
}

function cityBlock(b, mul) {
  const { cx, cz } = b;
  for (let q = 0; q < 4; q++) {
    if (b.storeQ === q) continue;
    const sx = (q === 1 || q === 3) ? 1 : -1, sz = q >= 2 ? 1 : -1;
    const w = 13.6 + rnd() * 1.1, d = 13.6 + rnd() * 1.1, h = bHeight(cx, cz, mul);
    addBuilding(cx + sx * (15.1 - w / 2), cz + sz * (15.1 - d / 2), w, d, h, styleFor(h), { collide: false });
  }
  W.addCollider(cx - 15.1, cz - 15.1, cx + 15.1, cz + 15.1, 8, 'block');
}

function storeLot(b, key) {
  const st = STORES[key]; const { cx, cz } = b; const q = st.q;
  const sx = (q === 1 || q === 3) ? 1 : -1, sz = q >= 2 ? 1 : -1;
  const w = 14.2, d = 13.4, h = 6.2;
  const x = cx + sx * (15.1 - w / 2), z = cz + sz * (15.1 - d / 2);
  addBuilding(x, z, w, d, h, 'stucco', { collide: false, color: st.wall });
  const face = sz < 0 ? 'n' : 's', fz = cz + sz * 15.1, [, nz] = FACE_N[face];
  // storefront: window, door, awning, sign
  P.box(x, 1.6, fz + nz * 0.05, w - 3, 2.4, 0.12, '#a9d6e5');
  P.box(x + 4, 1.3, fz + nz * 0.08, 1.6, 2.6, 0.12, '#2a2622');
  P.box(x, 3.25, fz + nz * 0.9, w - 1.5, 0.18, 1.8, st.bg);
  addSign(x, 4.6, fz + nz * 0.08, face, st.sign, st.bg, st.fg, 9, 2.2);
  const mz = cz + sz * 17.3;
  const side = sx > 0 ? 'e' : 'w', sideX = cx + sx * 15.1;
  if (st.shop) {
    const sp = { id: key, name: st.name, x: x + 4, z: mz, r: 1.8 };
    W.places[key] = sp; W.places.shops = W.places.shops || []; W.places.shops.push(sp);
  } else {
    const r = makeRob(key, key === 'jewel' ? 'jewel' : 'store', st.name, x + 4, mz, { hold: st.hold, cash: st.cash, base: st.base, cool: key === 'jewel' ? 240 : 150 });
    addAlarm(r, sideX, z, side);
    addCam(r, x - w / 2 + 1.2, fz, face, sx * 0.25, 13);
    if (key === 'jewel') addCam(r, x + w / 2 - 1.2, fz, face, -sx * 0.25, 13);
  }
}

function alleyBlock(b, o, dead) {
  const { cx, cz } = b, AW = 3;
  const m = (u, v) => { switch (o) { case 'n': return [cx + v, cz + u]; case 's': return [cx - v, cz - u]; case 'w': return [cx + u, cz - v]; default: return [cx - u, cz + v]; } };
  const rect = (u0, u1, v0, v1) => { const [x0, z0] = m(u0, v0), [x1, z1] = m(u1, v1); return { minX: Math.min(x0, x1), maxX: Math.max(x0, x1), minZ: Math.min(z0, z1), maxZ: Math.max(z0, z1) }; };
  const bld = (u0, u1, v0, v1) => {
    const r = rect(u0, u1, v0, v1), h = bHeight(cx, cz);
    addBuilding((r.minX + r.maxX) / 2, (r.minZ + r.maxZ) / 2, r.maxX - r.minX, r.maxZ - r.minZ, h, styleFor(h), { collide: false });
  };
  const col = (u0, u1, v0, v1, h) => { const r = rect(u0, u1, v0, v1); W.addCollider(r.minX, r.minZ, r.maxX, r.maxZ, h || 8, 'block'); };
  const end = dead ? 6.5 : 15.5;
  if (dead) {
    bld(-15.1, 6.3, -15.1, -3.4); bld(-15.1, 6.3, 3.4, 15.1); bld(6.9, 15.1, -15.1, 15.1);
    col(-15.1, 15.1, -15.1, -AW); col(-15.1, 15.1, AW, 15.1); col(6.5, 15.1, -AW, AW);
    // dead-end wall and junk
    const [wx, wz] = m(6.3, 0); const vert = (o === 'n' || o === 's');
    P.box(wx, 1.6, wz, vert ? 6 : 0.4, 3.2, vert ? 0.4 : 6, '#7d4a3a');
  } else {
    bld(-15.1, -0.4, -15.1, -3.4); bld(0.4, 15.1, -15.1, -3.4); bld(-15.1, -0.4, 3.4, 15.1); bld(0.4, 15.1, 3.4, 15.1);
    col(-15.1, 15.1, -15.1, -AW); col(-15.1, 15.1, AW, 15.1);
  }
  const zr = rect(-15.5, end, -AW, AW);
  const exits = [m(-15.5 - 4, 0)];
  if (!dead) exits.push(m(15.5 + 4, 0));
  const alley = Object.assign({ dead, exits: exits.map(([x, z]) => ({ x, z })), cx, cz }, zr);
  W.alleys.push(alley);
  GB.alley.rect(zr.minX, zr.minZ, zr.maxX, zr.maxZ, 0.035, 8);
  // dumpsters + crates narrow the alley
  const spots = dead ? [-9, 1] : [-10, 2, 10];
  for (const u of spots) {
    if (rnd() < 0.3) continue;
    const v = (rnd() < 0.5 ? -1 : 1) * (AW - 0.8);
    const [x, z] = m(u, v); const vert = (o === 'n' || o === 's');
    const sx = vert ? 1.5 : 2.4, sz = vert ? 2.4 : 1.5;
    P.box(x, 0.75, z, sx, 1.5, sz, pick(['#2f6b4a', '#2f4f6b', '#6b4a2f']));
    W.addCollider(x - sx / 2, z - sz / 2, x + sx / 2, z + sz / 2, 1.5, 'prop', true);
  }
  // fire-escape stripes on the walls
  for (const v of [-AW - 0.05, AW + 0.05]) for (let u = -12; u < end - 3; u += 8) {
    const [x, z] = m(u, v); const vert = (o === 'n' || o === 's');
    for (let y = 4; y < 12; y += 3.5) P.box(x, y, z, vert ? 0.5 : 2.6, 0.15, vert ? 2.6 : 0.5, '#2b2b2e');
  }
}

function parkBlock(b) {
  const { cx, cz } = b;
  GB.grass.rect(cx - 15.5, cz - 15.5, cx + 15.5, cz + 15.5, 0.03, 10);
  GB.sidewalk.rect(cx - 1.5, cz - 15.5, cx + 1.5, cz + 15.5, 0.04, 4);
  GB.sidewalk.rect(cx - 15.5, cz - 1.5, cx + 15.5, cz + 1.5, 0.04, 4);
  P.box(cx, 0.4, cz, 6, 0.8, 6, '#9aa3a8'); P.box(cx, 0.82, cz, 5, 0.1, 5, '#4aa3d8'); P.box(cx, 1.6, cz, 0.8, 2.4, 0.8, '#b8bfc4');
  W.addCircle(cx, cz, 3.2, 'fountain');
  for (let k = 0; k < 14; k++) {
    const x = cx + (rnd() * 2 - 1) * 13, z = cz + (rnd() * 2 - 1) * 13;
    if (Math.abs(x - cx) < 3.5 || Math.abs(z - cz) < 3.5) continue;
    W.addTree(x, z, 'round');
  }
  for (const [dx, dz, r] of [[-6, 3, 0], [6, -3, 0], [3, 6, Math.PI / 2], [-3, -6, Math.PI / 2]]) {
    P.box(cx + dx, 0.45, cz + dz, 2.2, 0.15, 0.6, '#8a5a32', r); P.box(cx + dx, 0.2, cz + dz, 2, 0.4, 0.15, '#333', r);
  }
}

function specialBlock(b) {
  const { cx, cz, type } = b;
  if (type === 'bank') {
    const x = cx, z = cz - 3;
    addBuilding(x, z, 26, 17, 13, 'bank');
    for (let k = -2; k <= 3; k++) { const px = x - 10 + (k + 2) * 4; P.box(px, 4.5, z + 9.4, 1, 9, 1, '#e8e2d2'); W.addCircle(px, z + 9.4, 0.55, 'column'); }
    P.box(x, 9.6, z + 9.5, 25, 1.4, 3.4, '#ddd6c4'); P.box(x, 0.15, z + 12, 22, 0.3, 2.4, '#cfc8b8');
    addSign(x, 9.6, z + 11.25, 's', 'BAYHAVEN FEDERAL', '#ddd6c4', '#3b3a33', 14, 1.6);
    const r = makeRob('bank', 'bank', 'Bayhaven Federal Vault', x, z + 11.6, { hold: 10, cash: [6500, 8500], base: 2, cool: 420, needs: 'drill' });
    addAlarm(r, x + 13, z + 2, 'e');
    addCam(r, x - 12.4, z + 8.5, 's', 0.35, 15); addCam(r, x + 12.4, z + 8.5, 's', -0.35, 15);
    W.places.bankLot = { id: 'bankLot', x: cx - 5, z: cz - 25 - 5 };
  } else if (type === 'hospital') {
    addBuilding(cx, cz - 4, 28, 18, 12, 'hospital');
    addSign(cx, 10, cz + 5.05, 's', 'BAYHAVEN GENERAL', '#f4f4f0', '#c8282d', 13, 1.8);
    P.box(cx, 6, cz + 5.1, 2.6, 0.8, 0.1, '#c8282d'); P.box(cx, 6, cz + 5.1, 0.8, 2.6, 0.1, '#c8282d');
    W.places.hospital = { id: 'hospital', name: 'Bayhaven General', x: cx, z: cz + 11 };
  } else if (type === 'police') {
    addBuilding(cx - 6.5, cz + 4, 17, 18, 10, 'police');
    addSign(cx - 6.5, 8, cz - 5.05, 'n', 'POLICE', '#1d3557', '#ffffff', 8, 1.8, 'BAYHAVEN PD · PRECINCT 4');
    W.places.police = { id: 'police', name: 'Precinct 4', x: cx - 6.5, z: cz - 10 };
    W.places.policeLot = [{ x: cx - 12.5, z: cz - 9, h: 0 }, { x: cx - 0.5, z: cz - 9, h: 0 }];
    helipad(cx + 9, cz + 4, 'police', Math.PI);
  } else if (type === 'hideout') {
    addBuilding(cx, cz + 6, 24, 14, 7, 'garage');
    P.box(cx - 4, 2, cz - 1.05, 7, 4, 0.2, '#6e7377'); P.box(cx + 6, 1.3, cz - 1.05, 1.6, 2.6, 0.2, '#3b2a20');
    addSign(cx, 5.6, cz - 1.2, 'n', 'KADE AUTO', '#20252b', '#ffb703', 8, 1.6);
    W.places.hideout = { id: 'hideout', name: 'Kade Auto (hideout)', x: cx, z: cz - 6 };
    W.places.spawn = { x: cx + 6, z: cz - 8 };
  } else if (type === 'chop') {
    GB.asphalt.rect(cx - 15.5, cz - 15.5, cx + 15.5, cz + 15.5, 0.035, 12);
    addBuilding(cx, cz + 9.5, 30, 11, 7, 'metal');
    addSign(cx, 5.8, cz + 3.95, 'n', "RUSTY'S CHOP SHOP", '#2a1f14', '#ff7b29', 10, 1.8);
    for (const sx of [-1, 1]) {
      const x = cx + sx * 15.2;
      for (let z = cz - 15.5; z < cz + 4; z += 2.5) P.box(x, 1, z, 0.12, 2, 2.4, '#8c949a');
      W.addCollider(x - 0.2, cz - 15.5, x + 0.2, cz + 4, 2, 'fence', true);
    }
    for (let k = 0; k < 3; k++) P.box(cx - 10 + k * 3, 0.6, cz + 2, 2.4, 1.2, 4, pick(['#7a3b2a', '#4b5563', '#6b6b3a']));
    W.places.chop = { id: 'chop', name: "Rusty's Chop Shop", x: cx, z: cz - 7, r: 6 };
  } else if (type === 'gas') {
    GB.asphalt.rect(cx - 15.5, cz - 15.5, cx + 15.5, cz + 15.5, 0.035, 12);
    addBuilding(cx, cz + 10.5, 16, 9, 5, 'stucco', { color: '#d9d2c3' });
    addSign(cx, 4.2, cz + 5.95, 'n', 'FUEL & GO', '#0b6e4f', '#ffffff', 7, 1.6);
    P.box(cx, 5.2, cz - 6, 18, 0.5, 10, '#e8e8e8'); P.box(cx, 5.55, cz - 6, 18.2, 0.25, 10.2, '#0b6e4f');
    for (const [dx, dz] of [[-7.5, -3.5], [7.5, -3.5], [-7.5, -8.5], [7.5, -8.5]]) { P.box(cx + dx, 2.5, cz + dz, 0.5, 5, 0.5, '#cfcfcf'); W.addCircle(cx + dx, cz + dz, 0.4, 'pillar'); }
    for (const dx of [-3.5, 3.5]) {
      const pm = new THREE.Mesh(new THREE.BoxGeometry(1, 1.6, 0.8), lam('#d62828')); pm.position.set(cx + dx, 0.8, cz - 6); pm.castShadow = true; S.add(pm);
      const sc = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.35, 0.05), new THREE.MeshBasicMaterial({ color: 0x9be7ff })); sc.position.set(0, 0.35, 0.43); pm.add(sc);
      const c = W.addCollider(cx + dx - 0.5, cz - 6.4, cx + dx + 0.5, cz - 5.6, 1.6, 'prop', true); c.destructible = { kind: 'pump', ref: pm, x: cx + dx, z: cz - 6 };
    }
    const r = makeRob('gas', 'store', 'Fuel & Go', cx + 3, cz + 3.8, { hold: 3.5, cash: [200, 380], base: 0, cool: 150 });
    addAlarm(r, cx - 8, cz + 10.5, 'w');
    addCam(r, cx - 6.5, cz + 6, 'n', 0.2, 13);
  } else if (type === 'parking') {
    GB.asphalt.rect(cx - 15.5, cz - 15.5, cx + 15.5, cz + 15.5, 0.035, 12);
    for (const row of [-1, 1]) for (let k = 0; k < 7; k++) {
      const x = cx - 13.5 + k * 4.5;
      GB.white.rect(x - 2.25 - 0.08, cz + row * 9 - 2.8, x - 2.25 + 0.08, cz + row * 9 + 2.8, 0.045, 1);
      if (k < 6) W.parkingSpots.push({ x: x, z: cz + row * 9.5, h: row < 0 ? 0 : Math.PI });
    }
    P.box(cx + 13, 1.3, cz, 2.2, 2.6, 2.2, '#e0c35a');
  }
}

function blockGround(b) {
  const { cx, cz } = b, o = 19;
  GB.sidewalk.rect(cx - o, cz - o, cx + o, cz + o, 0.02, 4);
  if (!['park', 'parking', 'gas', 'chop'].includes(b.type)) GB.plaza.rect(cx - 15.5, cz - 15.5, cx + 15.5, cz + 15.5, 0.03, 4);
  for (const [dx, dz, sx, sz] of [[0, -o, 38, 0.3], [0, o, 38, 0.3], [-o, 0, 0.3, 38], [o, 0, 0.3, 38]]) P.box(cx + dx, 0.08, cz + dz, sx, 0.16, sz, '#9b958a', 0);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    W.lampSpots.push({ x: cx + sx * 18.2, z: cz + sz * 18.2, sx });
  }
}

function buildRoads() {
  for (const n of W.nodes) if (n.half > 0) GB.asphalt.rect(n.x - n.half, n.z - n.half, n.x + n.half, n.z + n.half, 0.04, 12);
  for (const g of W.ringSegs()) {
    if (g.t !== 'arc') continue;
    const N = 24, ri = W.RR - W.HWH, ro = W.RR + W.HWH;
    for (let i = 0; i < N; i++) {
      const a1 = g.a0 + (i / N) * Math.PI / 2, a2 = g.a0 + ((i + 1) / N) * Math.PI / 2, v1 = (i / N) * g.len / 6, v2 = ((i + 1) / N) * g.len / 6;
      const P1 = (a, r) => [g.cx + Math.cos(a) * r, g.cz + Math.sin(a) * r];
      GB.hwy.quad([P1(a1, ri), P1(a1, ro), P1(a2, ro), P1(a2, ri)], [[0, v1], [1, v1], [1, v2], [0, v2]], 0.04);
    }
  }
  for (const e of W.edges) {
    if (e.arc) continue;
    const a = W.nodes[e.a], b = W.nodes[e.b], L = dist(a.x, a.z, b.x, b.z);
    const dx = (b.x - a.x) / L, dz = (b.z - a.z) / L;
    const ax = a.x + dx * a.half, az = a.z + dz * a.half, bx = b.x - dx * b.half, bz = b.z - dz * b.half;
    if (e.hwy) GB.hwy.strip(ax, az, bx, bz, W.HWH, 0.04, 6);
    else {
      GB.road.strip(ax, az, bx, bz, 6, 0.04, 6);
      // crosswalks at grid ends
      for (const [n, sgn] of [[a, 1], [b, -1]]) {
        if (n.hwy) continue;
        const cxp = n.x + dx * sgn * 7.6, czp = n.z + dz * sgn * 7.6;
        for (let k = -2.5; k <= 2.5; k++) {
          const ox = -dz * k * 2, oz = dx * k * 2;
          const x0 = cxp + ox, z0 = czp + oz;
          const ex = Math.abs(dx) > 0.5 ? 1.2 : 0.45, ez = Math.abs(dx) > 0.5 ? 0.45 : 1.2;
          GB.white.rect(x0 - ex, z0 - ez, x0 + ex, z0 + ez, 0.05, 1);
        }
      }
      // curb parking spots along long grid edges
      if (L > 40) for (let t = 14; t < L - 14; t += 9) for (const side of [-1, 1]) {
        const px = a.x + dx * t + -dz * 5 * side, pz = a.z + dz * t + dx * 5 * side;
        W.curbSpots.push({ x: px, z: pz, h: Math.atan2(dx * side, dz * side) });
      }
    }
  }
}

function barrierLine(axis, coord, from, to, gaps) {
  const pieces = []; let s = from;
  const gs = gaps.slice().sort((a, b) => a[0] - b[0]);
  for (const [g0, g1] of gs) { if (g0 > s) pieces.push([s, g0]); s = Math.max(s, g1); }
  if (s < to) pieces.push([s, to]);
  for (const [p0, p1] of pieces) {
    const mid = (p0 + p1) / 2, len = p1 - p0;
    if (axis === 'x') { P.box(mid, 0.5, coord, len, 1.0, 0.9, '#b9b4a8'); W.addCollider(p0, coord - 0.45, p1, coord + 0.45, 1.0, 'barrier', true); }
    else { P.box(coord, 0.5, mid, 0.9, 1.0, len, '#b9b4a8'); W.addCollider(coord - 0.45, p0, coord + 0.45, p1, 1.0, 'barrier', true); }
  }
}

/* a helipad with a parked chopper you can steal */
function helipad(x, z, kind, yaw) {
  GB.asphalt.rect(x - 6, z - 6, x + 6, z + 6, 0.045, 12);
  const ring = new THREE.Mesh(new THREE.RingGeometry(4.6, 5.1, 32), new THREE.MeshBasicMaterial({ color: kind === 'police' ? 0xffd23f : 0xffffff }));
  ring.rotation.x = -Math.PI / 2; ring.position.set(x, 0.06, z); S.add(ring);
  GB.white.rect(x - 1.6, z - 2.2, x - 0.9, z + 2.2, 0.055, 1); GB.white.rect(x + 0.9, z - 2.2, x + 1.6, z + 2.2, 0.055, 1); GB.white.rect(x - 1, z - 0.35, x + 1, z + 0.35, 0.055, 1);
  W.places.helipads.push({ x, z, yaw, kind });
}

function buildHighwayEdges() {
  const H = W.HWY, O = H + W.HWH + 0.6, I = H - W.HWH - 0.6, C = W.CONNECT, g = (c, w) => [c - (w || 6.5), c + (w || 6.5)];
  const F = W.FOREST;
  const k = H - W.RR;
  barrierLine('x', -O, -k, k, []);
  barrierLine('x', O, -k, k, [g(0, 8), g(45, 9)]);
  barrierLine('z', -O, -k, k, []);
  barrierLine('z', O, -k, k, []);
  barrierLine('x', -I, -k, k, [...C.n.map((x) => g(x)), g(W.forestN, 5)]);
  barrierLine('x', I, -k, k, C.s.map((x) => g(x)));
  barrierLine('z', -I, -k, k, C.w.map((z) => g(z)));
  barrierLine('z', I, -k, k, [...C.e.map((z) => g(z)), g(W.forestE, 5)]);
  for (const sg of W.ringSegs()) {
    if (sg.t !== 'arc') continue;
    for (const r of [W.RR - W.HWH - 0.6, W.RR + W.HWH + 0.6]) {
      const n = Math.ceil(r * Math.PI / 2 / 2.5);
      for (let i = 0; i < n; i++) {
        const a = sg.a0 + ((i + 0.5) / n) * Math.PI / 2, x = sg.cx + Math.cos(a) * r, z = sg.cz + Math.sin(a) * r;
        P.box(x, 0.5, z, r * Math.PI / 2 / n + 0.05, 1.0, 0.9, '#b9b4a8', Math.atan2(-Math.cos(a), -Math.sin(a)));
      }
      const m = Math.ceil(r * Math.PI / 2 / 0.6);
      for (let i = 0; i <= m; i++) { const a = sg.a0 + (i / m) * Math.PI / 2; const c = W.addCircle(sg.cx + Math.cos(a) * r, sg.cz + Math.sin(a) * r, 0.55, 'barrier'); c.h = 1.0; }
    }
  }
  addSign(-100, 6, -O - 1.5, 's', 'RING HWY', '#1f6f45', '#ffffff', 6, 1.6, 'FAST · NO COVER');
  addSign(O + 1.5, 6, 0, 'w', 'RING HWY', '#1f6f45', '#ffffff', 6, 1.6, 'FAST · NO COVER');
  void F;
}
W.forestN = 150; W.forestE = -175;

function buildForest() {
  const F = W.FOREST, C = W.FOREST_C, H = W.HWY;
  GB.forest.rect(F.minX, F.minZ, F.maxX, F.maxZ, 0.012, 10);
  const west = W.rp(5), south = W.rp(2);
  const paths = [
    [[west, -150], [95, -160], [C.x, C.z]],
    [[125, south], [130, -135], [C.x, C.z]],
    [[W.forestN, -H + W.HWH], [W.forestN, F.minZ], [W.forestN + 2, -215], [C.x, C.z]],
    [[H - W.HWH, W.forestE], [F.maxX, W.forestE], [205, -178], [C.x, C.z]],
  ];
  for (const p of paths) for (let i = 0; i < p.length - 1; i++) {
    const [ax, az] = p[i], [bx, bz] = p[i + 1];
    W.trails.push([ax, az, bx, bz]);
    GB.dirt.strip(ax, az, bx, bz, 2.6, 0.03, 4);
    GB.dirt.rect(bx - 2.6, bz - 2.6, bx + 2.6, bz + 2.6, 0.031, 4);
  }
  W.forestExits = [{ x: west, z: -150, out: [west - 6, -150] }, { x: 125, z: south, out: [125, south + 6] }, { x: W.forestN, z: F.minZ, out: [W.forestN, F.minZ - 6] }, { x: F.maxX, z: W.forestE, out: [F.maxX + 6, W.forestE] }];
  GB.dirt.rect(C.x - 12, C.z - 12, C.x + 12, C.z + 12, 0.03, 4);
  addBuilding(C.x + 6, C.z - 6, 7, 6, 4, 'cabin');
  addSign(C.x + 6, 3.2, C.z - 2.95, 's', 'RANGER STATION', '#3b2a1a', '#e9d8a6', 4.6, 1.1);
  W.places.forest = { id: 'forest', name: 'Forest Park', x: C.x, z: C.z };
  for (let x = F.minX + 2; x < F.maxX - 1; x += 4.3) for (let z = F.minZ + 2; z < F.maxZ - 1; z += 4.3) {
    const tx = x + (rnd() - 0.5) * 2.6, tz = z + (rnd() - 0.5) * 2.6;
    if (dist(tx, tz, C.x, C.z) < 14) continue;
    let near = false;
    for (const t of W.trails) if (segPointDist(tx, tz, t[0], t[1], t[2], t[3]) < 3.8) { near = true; break; }
    if (near) continue;
    W.addTree(tx, tz, 'pine');
  }
}

function buildOutskirts() {
  const H = W.HWY, B = W.BOUND, SH = W.SHORE, G0 = W.HALF;
  const ok = (x, z) => {
    if (inRect(x, z, { minX: W.FOREST.minX - 2, maxX: W.FOREST.maxX + 2, minZ: W.FOREST.minZ - 2, maxZ: W.FOREST.maxZ + 2 })) return false;
    if (Math.abs(x) < G0 + 12 && Math.abs(z) < G0 + 12) return false;
    if (W.ringDist(x, z) < W.HWH + 4) return false;
    if (z > H + W.HWH) return false;
    for (const t of W.trails) if (segPointDist(x, z, t[0], t[1], t[2], t[3]) < 4) return false;
    for (const e of W.edges) { if (e.hwy) continue; const a = W.nodes[e.a], b = W.nodes[e.b]; if (segPointDist(x, z, a.x, a.z, b.x, b.z) < 10) return false; }
    return Math.abs(x) < B - 2 && Math.abs(z) < B - 2;
  };
  let houses = 0;
  for (let k = 0; k < 3000 && houses < 26; k++) {
    const x = (rnd() * 2 - 1) * (H - W.HWH - 20), z = (rnd() * 2 - 1) * (H - W.HWH - 20);
    if (Math.abs(x) < G0 + 25 && Math.abs(z) < G0 + 25) continue;
    if (!ok(x, z) || !ok(x + 6, z + 6) || !ok(x - 6, z - 6)) continue;
    if (W.buildings.some((b) => dist(x, z, (b.minX + b.maxX) / 2, (b.minZ + b.maxZ) / 2) < 25)) continue;
    const w = 7 + rnd() * 4, d = 7 + rnd() * 3;
    addBuilding(x, z, w, d, 4 + rnd() * 3, pick(['stucco', 'brick', 'cabin']));
    houses++;
  }
  let n = 0;
  for (let k = 0; k < 12000 && n < 1100; k++) {
    const x = (rnd() * 2 - 1) * B, z = (rnd() * 2 - 1) * B;
    if (ok(x, z) && !W.buildings.some((b) => x > b.minX - 2 && x < b.maxX + 2 && z > b.minZ - 2 && z < b.maxZ + 2)) { W.addTree(x, z, rnd() < 0.5 ? 'pine' : 'round'); n++; }
  }
  // boundary fences
  for (const [axis, c] of [['x', -B], ['z', -B], ['z', B]]) {
    for (let s = -B; s < H + 12; s += 4) {
      if (axis === 'x') P.box(s + 2, 0.9, c, 4, 1.8, 0.15, '#6b6f73'); else P.box(c, 0.9, s + 2, 0.15, 1.8, 4, '#6b6f73');
    }
  }
  W.addCollider(-B - 60, -B - 60, B + 60, -B, 3, 'bound', true);
  W.addCollider(-B - 60, -B - 60, -B, SH + 100, 3, 'bound', true);
  W.addCollider(B, -B - 60, B + 60, SH + 100, 3, 'bound', true);
  // the beach: sand between the highway and the harbor, with umbrellas and palms
  GB.sand.rect(-B, H + W.HWH + 0.6, B, SH + 1.5, 0.02, 8);
  for (let k = 0; k < 26; k++) {
    const x = -B + 20 + rnd() * (2 * B - 40), z = H + 15 + rnd() * (SH - H - 20);
    if (Math.abs(x) < 10 || Math.abs(x - 45) < 12) continue;
    if (rnd() < 0.45) W.addTree(x, z, 'round');
    else { const col = pick(['#e63946', '#ffb703', '#219ebc', '#ffffff']); P.box(x, 1.2, z, 0.12, 2.4, 0.12, '#dddddd'); P.box(x, 2.45, z, 3, 0.2, 3, col); P.box(x + 1.4, 0.12, z + 0.6, 1.6, 0.1, 0.8, pick(['#ff6b6b', '#4dabf7', '#ffd43b'])); }
  }
  P.box(-60, 1.6, SH - 6, 2.4, 0.3, 2.4, '#e9d8a6'); for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) P.box(-60 + dx, 0.8, SH - 6 + dz, 0.2, 1.6, 0.2, '#e9d8a6');
  P.box(-60, 2.6, SH - 6, 2, 1.6, 2, '#e63946');
  // harbor water: colliders everywhere except the pier and the helicopter dock
  W.addCollider(-B - 60, SH, -4, SH + 160, 1, 'water', true);
  W.addCollider(4, SH, 37, SH + 160, 1, 'water', true);
  W.addCollider(53, SH, B + 60, SH + 160, 1, 'water', true);
  W.addCollider(-4, SH + 23, 4, SH + 160, 1, 'water', true);
  W.addCollider(37, SH + 12, 53, SH + 160, 1, 'water', true);
  const water = new THREE.Mesh(new THREE.PlaneGeometry(2 * B + 200, 200), new THREE.MeshLambertMaterial({ color: 0x2f7ea3 }));
  water.rotation.x = -Math.PI / 2; water.position.set(0, -0.15, SH + 100); S.add(water);
  W.water = water;
  GB.white.rect(-B, SH + 0.5, B, SH + 1.6, 0.025, 4);
  // Pier 9 and the getaway boat
  for (let z = SH - 1; z < SH + 23; z += 1.2) P.box(0, 0.25, z + 0.6, 8, 0.25, 1.1, '#8b6a45');
  for (const x of [-3.8, 3.8]) for (let z = SH; z < SH + 23; z += 5) P.box(x, 0.2, z, 0.5, 1.4, 0.5, '#5b4630');
  P.box(0, 0.6, SH + 29.5, 4.4, 1.2, 10, '#f1f1ee'); P.box(0, 1.6, SH + 30.5, 3, 1.2, 4, '#1d3557'); P.box(0, 0.4, SH + 29.5, 4.6, 0.25, 10.2, '#c8282d');
  addSign(0, 1.2, SH + 23.7, 'n', 'PIER 9', '#1d3557', '#ffffff', 3.4, 0.9);
  W.places.pier = { id: 'pier', name: 'Pier 9', x: 0, z: SH + 19 };
  // helicopter dock on the beach: a wooden deck out over the water
  for (let z = SH - 3; z < SH + 12; z += 1.25) P.box(45, 0.22, z + 0.6, 16, 0.25, 1.15, '#9b7650');
  for (const x of [37.6, 52.4]) for (let z = SH - 2; z < SH + 12; z += 4) P.box(x, 0.2, z, 0.5, 1.6, 0.5, '#5b4630');
  helipad(45, SH + 5, 'tour', 0);
  addSign(45, 2.2, SH - 3.4, 'n', 'SKYLINE TOURS', '#0b6e99', '#ffffff', 6, 1.2, 'HELICOPTER DOCK');
  P.box(45, 1, SH - 3.5, 6.2, 2, 0.2, '#0b6e99');
  W.places.beach = { id: 'beach', name: 'Skyline Tours dock', x: 45, z: SH - 6 };
}

W.addTree = function (x, z, type) {
  const t = { x, z, type, s: 0.8 + rnd() * 0.5 };
  t.col = W.addCircle(x, z, 0.45, 'tree'); t.col.destructible = { kind: 'tree', ref: t };
  W.trees.push(t);
};
const ZERO_M = new THREE.Matrix4().makeScale(0, 0, 0);
W.hideTree = function (t) {
  const m = W.treeMeshes; if (!m || t.ti == null) return;
  m.trunks.setMatrixAt(t.ti, ZERO_M); m.trunks.instanceMatrix.needsUpdate = true;
  t.cm.setMatrixAt(t.ci, ZERO_M); t.cm.instanceMatrix.needsUpdate = true;
};
function buildLamps() {
  const n = W.lampSpots.length, pole = new THREE.BoxGeometry(0.18, 5.5, 0.18); pole.translate(0, 2.75, 0);
  const arm = new THREE.BoxGeometry(1.6, 0.14, 0.2); arm.translate(-0.8, 5.45, 0);
  const head = new THREE.BoxGeometry(0.5, 0.2, 0.4); head.translate(-1.5, 5.3, 0);
  const poles = new THREE.InstancedMesh(pole, lam('#3a3d42'), n), arms = new THREE.InstancedMesh(arm, lam('#3a3d42'), n), heads = new THREE.InstancedMesh(head, new THREE.MeshBasicMaterial({ color: 0xfff1b8 }), n);
  const d = new THREE.Object3D();
  W.lampSpots.forEach((l, i) => {
    d.position.set(l.x, 0, l.z); d.rotation.set(0, l.sx > 0 ? 0 : Math.PI, 0); d.updateMatrix();
    poles.setMatrixAt(i, d.matrix); arms.setMatrixAt(i, d.matrix); heads.setMatrixAt(i, d.matrix);
    l.i = i; l.col = W.addCircle(l.x, l.z, 0.25, 'lamp'); l.col.h = 5.5; l.col.destructible = { kind: 'lamp', ref: l };
  });
  for (const m of [poles, arms]) { m.castShadow = true; S.add(m); }
  S.add(heads);
  W.lampMeshes = [poles, arms, heads];
}
W.hideLamp = function (l) { for (const m of W.lampMeshes) { m.setMatrixAt(l.i, ZERO_M); m.instanceMatrix.needsUpdate = true; } };
function buildTrees() {
  const d = new THREE.Object3D(), col = new THREE.Color();
  const total = W.trees.length;
  const trunkG = new THREE.CylinderGeometry(0.2, 0.3, 2.4, 6); trunkG.translate(0, 1.2, 0);
  const trunks = new THREE.InstancedMesh(trunkG, lam(0x6b4a2f), total);
  const pines = W.trees.filter((t) => t.type === 'pine'), rounds = W.trees.filter((t) => t.type !== 'pine');
  const pineG = new THREE.ConeGeometry(1.9, 5, 7); pineG.translate(0, 4.6, 0);
  const roundG = new THREE.IcosahedronGeometry(2, 0); roundG.translate(0, 3.9, 0);
  const pm = new THREE.InstancedMesh(pineG, new THREE.MeshLambertMaterial({ color: 0xffffff }), Math.max(1, pines.length));
  const rm = new THREE.InstancedMesh(roundG, new THREE.MeshLambertMaterial({ color: 0xffffff }), Math.max(1, rounds.length));
  W.treeMeshes = { trunks };
  W.trees.forEach((t, i) => { t.ti = i; d.position.set(t.x, 0, t.z); d.rotation.set(0, rnd() * TAU, 0); d.scale.setScalar(t.s); d.updateMatrix(); trunks.setMatrixAt(i, d.matrix); });
  pines.forEach((t, i) => { t.ci = i; t.cm = pm; d.position.set(t.x, 0, t.z); d.rotation.set(0, rnd() * TAU, 0); d.scale.set(t.s, t.s * (0.9 + rnd() * 0.3), t.s); d.updateMatrix(); pm.setMatrixAt(i, d.matrix); pm.setColorAt(i, col.set(pick(['#2f5d34', '#28512d', '#356b3a', '#3d6e33']))); });
  rounds.forEach((t, i) => { t.ci = i; t.cm = rm; d.position.set(t.x, 0, t.z); d.rotation.set(rnd(), rnd() * TAU, 0); d.scale.setScalar(t.s); d.updateMatrix(); rm.setMatrixAt(i, d.matrix); rm.setColorAt(i, col.set(pick(['#4f8a3a', '#5e9a3f', '#477f36', '#6aa64a']))); });
  for (const m of [trunks, pm, rm]) { m.castShadow = true; m.receiveShadow = true; S.add(m); }
}

function placeATMs() {
  const cands = [];
  for (const b of W.blocks) {
    if (['park', 'gas', 'chop', 'parking', 'bank', 'hospital', 'police', 'hideout'].includes(b.type)) continue;
    for (const f of ['n', 's', 'e', 'w']) for (const t of [-9, 9]) {
      const [nx, nz] = FACE_N[f];
      const x = b.cx + nx * 15.75 + (nz !== 0 ? t : 0), z = b.cz + nz * 15.75 + (nx !== 0 ? t : 0);
      cands.push({ x, z, f, nx, nz });
    }
  }
  for (let i = cands.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [cands[i], cands[j]] = [cands[j], cands[i]]; }
  let k = 0;
  for (const c of cands) {
    if (k >= 18) break;
    if (W.robs.some((r) => dist(r.x, r.z, c.x, c.z) < (r.kind === 'atm' ? 48 : 7))) continue;
    if (W.places.shops.some((s) => dist(s.x, s.z, c.x, c.z) < 7)) continue;
    const vert = c.f === 'e' || c.f === 'w';
    P.box(c.x, 0.9, c.z, vert ? 0.55 : 0.95, 1.8, vert ? 0.95 : 0.55, '#2d4a6b');
    P.box(c.x + c.nx * 0.29, 1.25, c.z + c.nz * 0.29, vert ? 0.04 : 0.6, 0.4, vert ? 0.6 : 0.04, '#7fe3ff');
    W.addCollider(c.x - 0.45, c.z - 0.45, c.x + 0.45, c.z + 0.45, 1.8, 'atm', true);
    makeRob('atm' + k, 'atm', 'ATM', c.x + c.nx * 1.3, c.z + c.nz * 1.3, { hold: 2.5, cash: [90, 230], base: 1, cool: 150 });
    k++;
  }
}

/* loose street props (bins, newspaper boxes, cones, alley crates); physics.js makes them knockable */
function placeProps() {
  W.propSpots = [];
  const kinds = ['bin', 'bin', 'news', 'cone', 'bin'];
  const avoid = (x, z) => W.robs.some((r) => dist(r.x, r.z, x, z) < 3.5) || W.places.shops.some((s) => dist(s.x, s.z, x, z) < 3.5) || dist(W.places.hideout.x, W.places.hideout.z, x, z) < 6;
  for (const b of W.blocks) for (let k = 0; k < 2; k++) {
    const side = Math.floor(rnd() * 4), t = (rnd() * 2 - 1) * 12, [nx, nz] = [[0, -1], [1, 0], [0, 1], [-1, 0]][side];
    const x = b.cx + nx * 16.3 + (nz !== 0 ? t : 0), z = b.cz + nz * 16.3 + (nx !== 0 ? t : 0);
    if (!avoid(x, z)) W.propSpots.push({ x, z, kind: kinds[Math.floor(rnd() * kinds.length)], rot: rnd() * TAU });
  }
  for (const a of W.alleys) for (let k = 0; k < 2; k++) W.propSpots.push({ x: a.minX + 1.2 + rnd() * (a.maxX - a.minX - 2.4), z: a.minZ + 1.2 + rnd() * (a.maxZ - a.minZ - 2.4), kind: 'crate', rot: rnd() * TAU });
}

/* ---------------- minimap base ---------------- */
function buildMinimap() {
  const k = 2, o = W.MAPH, SZ = 2 * o * k;
  const c = document.createElement('canvas'); c.width = c.height = SZ;
  const g = c.getContext('2d');
  const X = (x) => (x + o) * k, Z = (z) => (z + o) * k;
  g.fillStyle = '#41583a'; g.fillRect(0, 0, SZ, SZ);
  g.fillStyle = '#d9c58f'; g.fillRect(0, Z(W.HWY + W.HWH + 0.6), SZ, (W.SHORE - W.HWY - W.HWH - 0.6) * k);
  g.fillStyle = '#2c6f93'; g.fillRect(0, Z(W.SHORE), SZ, SZ);
  const F = W.FOREST; g.fillStyle = '#24391f'; g.fillRect(X(F.minX), Z(F.minZ), (F.maxX - F.minX) * k, (F.maxZ - F.minZ) * k);
  g.strokeStyle = '#8f744d'; g.lineWidth = 4; for (const t of W.trails) { g.beginPath(); g.moveTo(X(t[0]), Z(t[1])); g.lineTo(X(t[2]), Z(t[3])); g.stroke(); }
  for (const b of W.blocks) {
    g.fillStyle = '#8d8a83'; g.fillRect(X(b.cx - 19), Z(b.cz - 19), 38 * k, 38 * k);
    g.fillStyle = b.type === 'park' ? '#5b8c45' : '#77736b'; g.fillRect(X(b.cx - 15.5), Z(b.cz - 15.5), 31 * k, 31 * k);
  }
  g.fillStyle = '#34363b';
  for (const bd of W.buildings) g.fillRect(X(bd.minX), Z(bd.minZ), (bd.maxX - bd.minX) * k, (bd.maxZ - bd.minZ) * k);
  for (const a of W.alleys) { g.fillStyle = a.dead ? '#a0522d' : '#b98a4e'; g.fillRect(X(a.minX), Z(a.minZ), (a.maxX - a.minX) * k, (a.maxZ - a.minZ) * k); }
  for (const e of W.edges) {
    if (e.hwy) continue;
    const a = W.nodes[e.a], b = W.nodes[e.b];
    g.strokeStyle = '#c9c6bd'; g.lineWidth = 12 * k;
    g.lineCap = 'square'; g.beginPath(); g.moveTo(X(a.x), Z(a.z)); g.lineTo(X(b.x), Z(b.z)); g.stroke();
  }
  // the Ring Highway: straights and smooth curves
  g.strokeStyle = '#d9c27a'; g.lineWidth = 2 * W.HWH * k; g.lineJoin = 'round'; g.beginPath();
  W.ringSegs().forEach((sg, i) => {
    if (sg.t === 'line') { if (i === 0) g.moveTo(X(sg.ax), Z(sg.az)); g.lineTo(X(sg.ax + sg.dx * sg.len), Z(sg.az + sg.dz * sg.len)); }
    else g.arc(X(sg.cx), Z(sg.cz), W.RR * k, sg.a0, sg.a0 + Math.PI / 2);
  });
  g.closePath(); g.stroke();
  g.fillStyle = '#8b6a45'; g.fillRect(X(-4), Z(W.SHORE), 8 * k, 23 * k); g.fillRect(X(37), Z(W.SHORE - 3), 16 * k, 15 * k);
  W.minimap = c; W.mmScale = k; W.mmOff = o;
}

/* ---------------- main build ---------------- */
W.build = function (scene, seed) {
  rnd = mulberry32(seed || 7);
  S = scene; P = new PropBatch(); TEX = makeTextures();
  const mk = (t) => new GroundBatch(new THREE.MeshLambertMaterial({ map: t }));
  GB = { sand: mk(TEX.sand), grass: mk(TEX.grass), forest: mk(TEX.forest), dirt: mk(TEX.dirt), asphalt: mk(TEX.asphalt), alley: mk(TEX.alley), sidewalk: mk(TEX.sidewalk), plaza: mk(TEX.plaza), road: mk(TEX.road), hwy: mk(TEX.hwy), white: new GroundBatch(TEX.white) };
  FAC = {
    brick: { tex: facadeTex('#9c4a36', '#2c3440', '#e3d4bd', 0.18, 'brick'), roof: 0x5a4a44, trim: '#e3d4bd' },
    concrete: { tex: facadeTex('#a8a39a', '#33465a', '#d7d2c8', 0.12), roof: 0x6d6a66, trim: '#cfcac0' },
    glass: { tex: facadeTex('#4d6f86', '#2a4a63', '#c8d6df', 0.15, 'glass'), roof: 0x4b5560, trim: '#c8d6df' },
    stucco: { tex: facadeTex('#e3c99f', '#3a4a52', '#fff4df', 0.15), roof: 0x8a6e55, trim: '#fff4df' },
    dark: { tex: facadeTex('#3c3f46', '#202630', '#6f7680', 0.35), roof: 0x2e3036, trim: '#6f7680' },
    bank: { tex: facadeTex('#e2dccb', '#2e3a44', '#f6f1e4', 0.1), roof: 0x9a958a, trim: '#f6f1e4' },
    hospital: { tex: facadeTex('#eef0ee', '#7fb4cf', '#ffffff', 0.05, 'glass'), roof: 0xb8bcbf, trim: '#ffffff' },
    police: { tex: facadeTex('#5b6f8a', '#1f2a38', '#d9e1ea', 0.2), roof: 0x3c4655, trim: '#d9e1ea' },
    garage: { tex: facadeTex('#7a5a46', '#2b2f33', '#c9b49a', 0.1, 'brick'), roof: 0x4a3a30, trim: '#c9b49a' },
    metal: { tex: facadeTex('#7f8a8f', '#3a4248', '#a3adb2', 0.05), roof: 0x5f676b, trim: '#a3adb2' },
    cabin: { tex: facadeTex('#7a5232', '#2b2016', '#a77a4f', 0.3, 'brick'), roof: 0x4a2f1c, trim: '#a77a4f' },
  };
  const gw = 2 * W.BOUND + 200, gz0 = -W.BOUND - 100, gz1 = W.HWY + W.HWH + 0.7;
  const gtex = TEX.grass.clone(); gtex.needsUpdate = true; gtex.repeat.set(gw / 10, (gz1 - gz0) / 10);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(gw, gz1 - gz0), new THREE.MeshLambertMaterial({ map: gtex }));
  ground.rotation.x = -Math.PI / 2; ground.position.z = (gz0 + gz1) / 2; ground.receiveShadow = true; S.add(ground);

  buildGraph();
  for (let j = 0; j < W.N; j++) {
    W.blockGrid.push([]);
    for (let i = 0; i < W.N; i++) {
      const type = BLOCKS[j][i];
      if (type === 'F') { W.blockGrid[j].push(null); continue; }
      const b = { i, j, cx: W.bc(i), cz: W.bc(j), type };
      W.blocks.push(b); W.blockGrid[j].push(b);
    }
  }
  for (const b of W.blocks) {
    blockGround(b);
    const t = b.type;
    if (t === 'city') cityBlock(b);
    else if (t === 'downtown') cityBlock(b, 1.35);
    else if (t === 'park') parkBlock(b);
    else if (t === 'alleyNS') alleyBlock(b, 'n', false);
    else if (t === 'alleyEW') alleyBlock(b, 'w', false);
    else if (t.startsWith('dead')) alleyBlock(b, t[4].toLowerCase(), true);
    else if (STORES[t]) { b.storeQ = STORES[t].q; cityBlock(b); storeLot(b, t); }
    else specialBlock(b);
  }
  buildRoads();
  buildHighwayEdges();
  buildForest();
  buildOutskirts();
  placeATMs();
  buildLamps();
  placeProps();
  buildTrees();
  for (const k in GB) GB[k].build(S);
  P.build(S);
  buildMinimap();
  rnd = Math.random;
};
