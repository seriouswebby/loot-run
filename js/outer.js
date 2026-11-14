'use strict';
/* The county: everything outside the old city fence — country roads, farms and woods, with land set aside for the
   airport, the lake, the river and the rail line. It is built after the city, from its own random stream, so the
   city itself comes out exactly the same as before. Coordinates: x east, z south; the sea is to the south. */

W.OUT = W.BOUND + 900;                         // half-size of the world: fences at x = ±OUT and z = -OUT
W.LAND = { minX: -W.OUT, maxX: W.OUT, minZ: -W.OUT, maxZ: W.SHORE };
(() => {
  const x0 = -W.OUT - 10, x1 = W.OUT + 10, z0 = -W.OUT - 10, z1 = W.SHORE + 160, span = Math.max(x1 - x0, z1 - z0);
  W.VIEW = { cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, span }; // the square the big map and the minimap bake cover
})();
W.inCounty = (x, z) => Math.abs(x) > W.BOUND + 0.5 || z < -W.BOUND - 0.5;

/* country roads, as polylines; shared points become junctions in the road graph */
(() => {
  const H = W.HWY, B = W.BOUND, E = W.OUT - 45, R = { x: B + 120, z: 0 };
  W.ROUNDABOUT = R;
  W.COUNTY_ROADS = [
    { name: 'Airport Road', pts: [[-H, 0], [-B - 60, 0], [-560, -25], [-700, -25], [-820, 0], [-E, 0]] },
    { name: 'Lakeside Drive', pts: [[-100, -H], [-100, -B - 60], [-60, -560], [-40, -700], [-90, -900], [-100, -1050], [-100, -E]] },
    { name: 'East Road', pts: [[H, 0], [R.x, R.z], [700, 18], [850, 18], [1000, 0], [E, 0]] },
    { name: 'County Line', pts: [[-E, 0], [-E, -E], [-820, -E], [-100, -E], [R.x, -E], [E, -E], [E, -460], [E, 0]] },
    { name: 'Pine Ridge Road', pts: [[-820, 0], [-820, -560], [-820, -E]] },
    { name: 'Ridge Road', pts: [[-820, -560], [-560, -560], [-60, -560]] },
    { name: 'Mill Road', pts: [[R.x, -E], [R.x, -460], [R.x, R.z]] },
    { name: 'Orchard Road', pts: [[R.x, -460], [780, -460], [1050, -460], [E, -460]] },
    { name: 'Harbor Lane', pts: [[R.x, R.z], [R.x, 180], [R.x + 40, 300]] },
    { name: 'Coast Road', pts: [[E, 0], [E, 300]] },
  ];
  // land kept clear for things built on top of the county later
  W.RESERVE = [
    { kind: 'airport', minX: -W.OUT + 25, maxX: -B - 70, minZ: 40, maxZ: W.SHORE - 25 },
    { kind: 'lake', cx: -330, cz: -820, r: 140 },
    { kind: 'river', minX: 880, maxX: 960, minZ: -W.OUT, maxZ: W.SHORE },
  ];
})();
W.inReserve = function (x, z, pad) {
  pad = pad || 0;
  for (const r of W.RESERVE) {
    if (r.r) { if (dist(x, z, r.cx, r.cz) < r.r + pad) return r; }
    else if (x > r.minX - pad && x < r.maxX + pad && z > r.minZ - pad && z < r.maxZ + pad) return r;
  }
  return null;
};
W.countyEdges = []; W.fields = [];
W.nearCountyRoad = function (x, z, d) {
  for (const e of W.countyEdges) if (segPointDist(x, z, e.ax, e.az, e.bx, e.bz) < d) return true;
  return false;
};

function buildCounty() {
  const saved = rnd; rnd = mulberry32(9001); // the county's own random stream
  const OP = new PropBatch();
  countyRoads();
  // the old outskirts get cut through by the new roads: clear any trees standing in the way
  for (const t of W.trees) if (t.col && !t.col.removed && W.nearCountyRoad(t.x, t.z, 8)) { W.removeCollider(t.col); W.hideTree(t); }
  const free = (x, z, pad) => W.inCounty(x, z) && Math.abs(x) < W.OUT - 6 && z > -W.OUT + 6 && z < W.HWY - 30
    && !W.inReserve(x, z, pad || 0) && !W.nearCountyRoad(x, z, 12 + (pad || 0))
    && !W.buildings.some((b) => x > b.minX - 4 - (pad || 0) && x < b.maxX + 4 + (pad || 0) && z > b.minZ - 4 - (pad || 0) && z < b.maxZ + 4 + (pad || 0));
  countyFarms(OP, free);
  const trees = countyWoods(free);
  countyTreeMeshes(trees);
  OP.build(S);
  W.benchSpots = [['county', W.ROUNDABOUT.x + 40, W.ROUNDABOUT.z - 6.5], ['woods', -500, -520]];
  rnd = saved;
}

/* roads: graph nodes every ~40 m (police and traffic need them close together), asphalt strips and bend pads */
function countyRoads() {
  const junction = new Set();
  const key = (p) => p[0] + ',' + p[1];
  const seen = new Map();
  for (const r of W.COUNTY_ROADS) for (const p of r.pts) seen.set(key(p), (seen.get(key(p)) || 0) + 1);
  for (const r of W.COUNTY_ROADS) for (let i = 0; i < r.pts.length; i++) if (seen.get(key(r.pts[i])) > 1 || i === 0 || i === r.pts.length - 1) junction.add(key(r.pts[i]));
  const node = (x, z, j) => {
    const ring = W.nodeMap.get(x + ',' + z); if (ring != null) return ring; // joins an existing (Ring Highway) node
    return W.addNode(+x.toFixed(2), +z.toFixed(2), false, j ? 6 : 0);
  };
  for (const r of W.COUNTY_ROADS) {
    let prev = node(r.pts[0][0], r.pts[0][1], true);
    for (let i = 1; i < r.pts.length; i++) {
      const [ax, az] = r.pts[i - 1], [bx, bz] = r.pts[i], L = dist(ax, az, bx, bz), n = Math.max(1, Math.round(L / 40));
      for (let k = 1; k <= n; k++) {
        const x = ax + (bx - ax) * k / n, z = az + (bz - az) * k / n;
        const id = k === n ? node(bx, bz, junction.has(key(r.pts[i]))) : node(x, z, false);
        W.addEdge(prev, id); prev = id;
      }
    }
  }
  // draw every county edge (and remember them for zone / clearance checks)
  for (const e of W.edges) {
    const a = W.nodes[e.a], b = W.nodes[e.b];
    if (e.hwy || !(W.inCounty(a.x, a.z) || W.inCounty(b.x, b.z) || a.hwy || b.hwy)) continue;
    if (!W.inCounty(a.x, a.z) && !W.inCounty(b.x, b.z) && !(a.hwy || b.hwy)) continue;
    const L = dist(a.x, a.z, b.x, b.z), dx = (b.x - a.x) / L, dz = (b.z - a.z) / L;
    const ax = a.x + dx * a.half, az = a.z + dz * a.half, bx = b.x - dx * b.half, bz = b.z - dz * b.half;
    GB.road.strip(ax, az, bx, bz, 6, 0.04, 6);
    W.countyEdges.push({ ax: a.x, az: a.z, bx: b.x, bz: b.z, e });
  }
  // round pads where county roads bend or meet, so corners don't leave notches
  for (const n of W.nodes) {
    if (n.hwy || !W.inCounty(n.x, n.z) || n.adj.length < 2) continue;
    if (n.half > 0) { GB.asphalt.rect(n.x - n.half, n.z - n.half, n.x + n.half, n.z + n.half, 0.045, 12); continue; }
    const [p, q] = n.adj.map((i) => W.nodes[i]), a1 = Math.atan2(p.z - n.z, p.x - n.x), a2 = Math.atan2(q.z - n.z, q.x - n.x);
    if (Math.abs(Math.abs(angDiff(a1, a2)) - Math.PI) < 0.02) continue; // straight through
    const N = 12;
    for (let i = 0; i < N; i++) {
      const t1 = (i / N) * TAU, t2 = ((i + 1) / N) * TAU, c = [n.x, n.z];
      GB.road.quad([c, [n.x + Math.cos(t1) * 6, n.z + Math.sin(t1) * 6], [n.x + Math.cos(t2) * 6, n.z + Math.sin(t2) * 6], c], [[0.5, 0.2], [0, 0.2], [1, 0.2], [0.5, 0.2]], 0.042);
    }
  }
}

/* farms: fenced fields of crops and a farmhouse with a red barn */
function countyFarms(OP, free) {
  let farms = 0;
  for (let k = 0; k < 800 && farms < 28; k++) {
    const x = (rnd() * 2 - 1) * (W.OUT - 80), z = -W.OUT + 80 + rnd() * (W.OUT + W.HWY - 140);
    const fw = 50 + rnd() * 40, fd = 40 + rnd() * 30;
    if (!free(x, z, 0) || !free(x - fw / 2, z - fd / 2, 0) || !free(x + fw / 2, z + fd / 2, 0) || !free(x + fw / 2, z - fd / 2, 0) || !free(x - fw / 2, z + fd / 2, 0)) continue;
    if (!W.nearCountyRoad(x, z, 120)) continue;
    // the field: rows of crops on dirt, a wooden fence round it
    GB.dirt.rect(x - fw / 2, z - fd / 2, x + fw / 2, z + fd / 2, 0.03, 6);
    const crop = pick(['#7aa63a', '#c9b44a', '#5e8f2f', '#a8c25a']);
    W.fields.push({ x0: x - fw / 2, z0: z - fd / 2, x1: x + fw / 2, z1: z + fd / 2, crop });
    for (let r = -fd / 2 + 3; r < fd / 2 - 2; r += 3) OP.box(x, 0.35, z + r, fw - 6, 0.7, 1.1, crop);
    for (const s of [-1, 1]) { OP.box(x, 0.6, z + s * fd / 2, fw, 0.12, 0.12, '#8b6a45'); OP.box(x + s * fw / 2, 0.6, z, 0.12, 0.12, fd, '#8b6a45'); }
    for (let t = -fw / 2; t <= fw / 2; t += 5) for (const s of [-1, 1]) OP.box(x + t, 0.5, z + s * fd / 2, 0.18, 1, 0.18, '#6b4f33');
    for (let t = -fd / 2; t <= fd / 2; t += 5) for (const s of [-1, 1]) OP.box(x + s * fw / 2, 0.5, z + t, 0.18, 1, 0.18, '#6b4f33');
    // farmhouse and barn beside the field
    const hx = x + fw / 2 + 14, hz = z - fd / 2 + 8;
    if (free(hx, hz, 8) && free(hx, hz + 20, 10) && free(hx + 9, hz + 26, 4)) {
      addBuilding(hx, hz, 9, 8, 5.5, pick(['stucco', 'cabin', 'brick']));
      addBuilding(hx, hz + 20, 12, 14, 8, 'cabin', { color: '#a4302a' });
      OP.box(hx, 8.6, hz + 20, 12.4, 1.2, 14.4, '#5a4636');
      OP.box(hx + 9, 3, hz + 26, 3, 6, 3, '#9aa3a8'); OP.box(hx + 9, 6.4, hz + 26, 3.4, 0.8, 3.4, '#7d868b'); // silo
      W.addCollider(hx + 7.5, hz + 24.5, hx + 10.5, hz + 27.5, 6, 'building');
    }
    farms++;
  }
}

/* woods: clumps of pines and broadleaf trees, plus loose trees across the fields */
function countyWoods(free) {
  const out = [];
  const add = (x, z, type) => {
    const t = { x, z, type, s: 0.8 + rnd() * 0.6 };
    t.col = W.addCircle(x, z, 0.45, 'tree'); t.col.destructible = { kind: 'tree', ref: t };
    W.trees.push(t); out.push(t);
  };
  for (let c = 0; c < 120; c++) {
    const cx = (rnd() * 2 - 1) * (W.OUT - 40), cz = -W.OUT + 40 + rnd() * (W.OUT + W.HWY - 60);
    if (!W.inCounty(cx, cz)) continue;
    const r = 25 + rnd() * 45, n = Math.floor(r * r * 0.025), pine = rnd() < 0.6;
    for (let i = 0; i < n; i++) {
      const a = rnd() * TAU, d = Math.sqrt(rnd()) * r, x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
      if (free(x, z, 0)) add(x, z, rnd() < (pine ? 0.85 : 0.2) ? 'pine' : 'round');
    }
  }
  for (let k = 0; k < 4000; k++) {
    const x = (rnd() * 2 - 1) * W.OUT, z = -W.OUT + rnd() * (W.OUT + W.HWY);
    if (rnd() < 0.5 && free(x, z, 0)) add(x, z, rnd() < 0.5 ? 'pine' : 'round');
  }
  return out;
}

/* county trees go in 200 m tiles, each its own instanced mesh, so tiles off-screen are culled */
function countyTreeMeshes(trees) {
  const TILE = 200, tiles = new Map(), d = new THREE.Object3D(), col = new THREE.Color();
  for (const t of trees) { const k = Math.floor(t.x / TILE) + ',' + Math.floor(t.z / TILE); if (!tiles.has(k)) tiles.set(k, []); tiles.get(k).push(t); }
  const trunkG = new THREE.CylinderGeometry(0.2, 0.3, 2.4, 6); trunkG.translate(0, 1.2, 0);
  const pineG = new THREE.ConeGeometry(1.9, 5, 7); pineG.translate(0, 4.6, 0);
  const roundG = new THREE.IcosahedronGeometry(2, 0); roundG.translate(0, 3.9, 0);
  const trunkM = lam(0x6b4a2f), crownM = new THREE.MeshLambertMaterial({ color: 0xffffff });
  for (const list of tiles.values()) {
    const pines = list.filter((t) => t.type === 'pine'), rounds = list.filter((t) => t.type !== 'pine');
    const tm = new THREE.InstancedMesh(trunkG, trunkM, list.length);
    const pm = new THREE.InstancedMesh(pineG, crownM, Math.max(1, pines.length)), rm = new THREE.InstancedMesh(roundG, crownM, Math.max(1, rounds.length));
    pm.count = pines.length; rm.count = rounds.length;
    list.forEach((t, i) => { t.ti = i; t.tm = tm; d.position.set(t.x, 0, t.z); d.rotation.set(0, rnd() * TAU, 0); d.scale.setScalar(t.s); d.updateMatrix(); tm.setMatrixAt(i, d.matrix); });
    pines.forEach((t, i) => { t.ci = i; t.cm = pm; d.position.set(t.x, 0, t.z); d.rotation.set(0, rnd() * TAU, 0); d.scale.set(t.s, t.s * (0.9 + rnd() * 0.3), t.s); d.updateMatrix(); pm.setMatrixAt(i, d.matrix); pm.setColorAt(i, col.set(pick(['#2f5d34', '#28512d', '#356b3a', '#3d6e33']))); });
    rounds.forEach((t, i) => { t.ci = i; t.cm = rm; d.position.set(t.x, 0, t.z); d.rotation.set(rnd(), rnd() * TAU, 0); d.scale.setScalar(t.s); d.updateMatrix(); rm.setMatrixAt(i, d.matrix); rm.setColorAt(i, col.set(pick(['#4f8a3a', '#5e9a3f', '#477f36', '#6aa64a']))); });
    for (const m of [tm, pm, rm]) {
      if (!m.count) continue;
      // instanced meshes are culled by the geometry's bounds, which know nothing about the instances: give each tile real bounds
      let x0 = 1e9, z0 = 1e9, x1 = -1e9, z1 = -1e9; for (const t of list) { x0 = Math.min(x0, t.x); z0 = Math.min(z0, t.z); x1 = Math.max(x1, t.x); z1 = Math.max(z1, t.z); }
      m.geometry = m.geometry.clone(); m.geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3((x0 + x1) / 2, 4, (z0 + z1) / 2), Math.hypot(x1 - x0, z1 - z0) / 2 + 8);
      m.frustumCulled = true; // three.js turns culling off for instanced meshes; these tiles have real bounds
      m.castShadow = true; m.receiveShadow = true; S.add(m);
    }
  }
}
