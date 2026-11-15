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
    { name: 'Airport Road', pts: [[-H, 0], [-B - 60, 0], [-560, -25], [-650, -25], [-700, -25], [-820, 0], [-E, 0]] },
    { name: 'Terminal Drive', pts: [[-650, -25], [-650, 66]] },
    { name: 'Lakeside Drive', pts: [[-100, -H], [-100, -B - 60], [-60, -560], [-40, -700], [-90, -900], [-100, -1050], [-100, -E]] },
    { name: 'East Road', pts: [[H, 0], [R.x, R.z], [700, 18], [850, 18], [1000, 0], [E, 0]] },
    { name: 'County Line', pts: [[-E, 0], [-E, -E], [-820, -E], [-100, -E], [R.x, -E], [E, -E], [E, -460], [E, 0]] },
    { name: 'Pine Ridge Road', pts: [[-820, 0], [-820, -560], [-820, -E]] },
    { name: 'Ridge Road', pts: [[-820, -560], [-560, -560], [-60, -560]] },
    { name: 'Mill Road', pts: [[R.x, -E], [R.x, -460], [R.x, R.z]] },
    { name: 'Orchard Road', pts: [[R.x, -460], [650, -460], [780, -460], [1050, -460], [E, -460]] },
    { name: 'Harbor Lane', pts: [[R.x, R.z], [R.x, 180], [R.x + 40, 300]] },
    { name: 'Coast Road', pts: [[E, 0], [E, 300]] },
    { name: 'Funland Drive', pts: [[700, 18], [735, 46], [735, 77]] },
    { name: 'Main Street', pts: [[650, -460], [650, -352]] },
  ];
  // land kept clear for things built on top of the county later
  W.RESERVE = [
    { kind: 'airport', minX: -W.OUT + 25, maxX: -B - 70, minZ: 40, maxZ: W.SHORE - 25 },
    { kind: 'lake', cx: -280, cz: -830, r: 150 },
    { kind: 'river', minX: 868, maxX: 972, minZ: -W.OUT - 60, maxZ: W.SHORE + 40 },
    { kind: 'mountain', minX: -640, maxX: 290, minZ: -1205, maxZ: -1050 },
    { kind: 'rail', fn: (x, z, pad) => W.railDist(x, z) < 9 + pad },
  ];
})();
W.inReserve = function (x, z, pad) {
  pad = pad || 0;
  for (const r of W.RESERVE) {
    if (r.fn) { if (r.fn(x, z, pad)) return r; }
    else if (r.r) { if (dist(x, z, r.cx, r.cz) < r.r + pad) return r; }
    else if (x > r.minX - pad && x < r.maxX + pad && z > r.minZ - pad && z < r.maxZ + pad) return r;
  }
  return null;
};
W.countyEdges = []; W.fields = []; W.dirtSpots = []; // where dirt bikes wait out in the county
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
  buildAirport(OP);
  buildWater(OP);
  buildMountain(OP);
  buildRail(OP);
  countyFarms(OP, free);
  const trees = countyWoods(free);
  trees.push(...buildDistricts());
  funlandCarPark();
  countyTreeMeshes(trees);
  OP.build(S);
  W.benchSpots = [['county', W.ROUNDABOUT.x + 40, W.ROUNDABOUT.z - 6.5], ['woods', -500, -520], ['airport', -650, 140], ['funland', 735, 150]];
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
  const edgeName = new Map();
  // the roundabout: a ring of nodes round an island; roads meeting there join the ring on their side
  const RB = W.ROUNDABOUT, RR = 15, ring = [];
  for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU; ring.push(W.addNode(+(RB.x + Math.cos(a) * RR).toFixed(2), +(RB.z + Math.sin(a) * RR).toFixed(2), false, 0)); }
  for (let i = 0; i < 8; i++) { W.addEdge(ring[i], ring[(i + 1) % 8]); edgeName.set(Math.min(ring[i], ring[(i + 1) % 8]) + ',' + Math.max(ring[i], ring[(i + 1) % 8]), 'roundabout'); }
  W.ringNodes = new Set(ring);
  const atRB = (p) => p[0] === RB.x && p[1] === RB.z;
  const ringFor = (ox, oz) => ring[(Math.round((Math.atan2(oz - RB.z, ox - RB.x) / TAU) * 8) + 8) % 8];
  for (const r of W.COUNTY_ROADS) {
    let prev = atRB(r.pts[0]) ? ringFor(r.pts[1][0], r.pts[1][1]) : node(r.pts[0][0], r.pts[0][1], true);
    for (let i = 1; i < r.pts.length; i++) {
      const [ax, az] = r.pts[i - 1], [bx, bz] = r.pts[i], L = dist(ax, az, bx, bz), n = Math.max(1, Math.round(L / 40));
      for (let k = 1; k <= n; k++) {
        const x = ax + (bx - ax) * k / n, z = az + (bz - az) * k / n;
        const id = k === n ? (atRB(r.pts[i]) ? ringFor(ax, az) : node(bx, bz, junction.has(key(r.pts[i])))) : node(x, z, false);
        W.addEdge(prev, id); edgeName.set(Math.min(prev, id) + ',' + Math.max(prev, id), r.name); prev = id;
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
    if (!(W.ringNodes.has(e.a) && W.ringNodes.has(e.b))) GB.road.strip(ax, az, bx, bz, 6, 0.04, 6);
    W.countyEdges.push({ ax: a.x, az: a.z, bx: b.x, bz: b.z, e, name: edgeName.get(Math.min(e.a, e.b) + ',' + Math.max(e.a, e.b)) });
  }
  // the roundabout: an asphalt ring, a kerbed grass island with a statue in the middle
  {
    const N = 40, ri = 9, ro = 21.5, P1 = (a, r) => [RB.x + Math.cos(a) * r, RB.z + Math.sin(a) * r];
    for (let i = 0; i < N; i++) { const a1 = (i / N) * TAU, a2 = ((i + 1) / N) * TAU; GB.asphalt.quad([P1(a1, ri), P1(a1, ro), P1(a2, ro), P1(a2, ri)], [[0, 0], [1, 0], [1, 1], [0, 1]], 0.043); }
    const isl = new THREE.Mesh(new THREE.CylinderGeometry(ri, ri, 0.35, 40), new THREE.MeshLambertMaterial({ color: 0x5d9a43 })); isl.position.set(RB.x, 0.17, RB.z); isl.receiveShadow = true; S.add(isl);
    const kerb = new THREE.Mesh(new THREE.TorusGeometry(ri, 0.3, 6, 40), new THREE.MeshLambertMaterial({ color: 0xd8d4c8 })); kerb.rotation.x = Math.PI / 2; kerb.position.set(RB.x, 0.2, RB.z); S.add(kerb);
    const st = new THREE.Group(); st.position.set(RB.x, 0.35, RB.z); S.add(st);
    const stone = (w, h, d, y, c) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), lam(c)); m.position.y = y; m.castShadow = true; st.add(m); };
    stone(3.2, 1.2, 3.2, 0.6, '#b8b2a4'); stone(2.2, 1.0, 2.2, 1.7, '#cfc9bb'); stone(0.9, 3.2, 0.9, 3.8, '#8f7a52'); stone(2.6, 0.4, 0.5, 5.2, '#8f7a52');
    W.ISLAND = { x: RB.x, z: RB.z, r: ri, h: 0.35 }; // a kerbed, raised island (part of the ground: you can mount the kerb)
    W.addCircle(RB.x, RB.z, 2.3, 'column').h = 6; // the statue
    W.places.roundabout = { id: 'roundabout', name: 'Founders Circle', x: RB.x, z: RB.z };
  }
  // round pads where county roads bend or meet, so corners don't leave notches
  for (const n of W.nodes) {
    if (n.hwy || !W.inCounty(n.x, n.z) || n.adj.length < 2 || W.ringNodes.has(n.id)) continue;
    if (n.half > 0) {
      GB.asphalt.rect(n.x - n.half, n.z - n.half, n.x + n.half, n.z + n.half, 0.045, 12);
      // a road meeting the junction at an angle sticks out past that square: fill out to the corners of every road's end
      const cs = [];
      for (const id of n.adj) { const m = W.nodes[id], L = dist(n.x, n.z, m.x, m.z) || 1, dx = (m.x - n.x) / L, dz = (m.z - n.z) / L, ex = n.x + dx * n.half, ez = n.z + dz * n.half; cs.push([ex - dz * 6, ez + dx * 6], [ex + dz * 6, ez - dx * 6]); }
      const ang = (p) => Math.atan2(p[1] - n.z, p[0] - n.x); cs.sort((p, q) => ang(p) - ang(q));
      for (let i = 0; i < cs.length; i++) {
        const p = cs[i], q = cs[(i + 1) % cs.length]; let gap = ang(q) - ang(p); if (gap <= 0) gap += TAU;
        if (gap < Math.PI) GB.road.quad([[n.x, n.z], p, q, [n.x, n.z]], [[0.5, 0.2], [0, 0.2], [1, 0.2], [0.5, 0.2]], 0.042);
      }
      continue;
    }
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
    // no road may cross the field (checking corners alone let roads run straight through the middle)
    const box = { minX: x - fw / 2 - 12, maxX: x + fw / 2 + 12, minZ: z - fd / 2 - 12, maxZ: z + fd / 2 + 12 };
    if (W.countyEdges.some((e) => W.segAABB(e.ax, e.az, e.bx, e.bz, box) >= 0 || (e.ax > box.minX && e.ax < box.maxX && e.az > box.minZ && e.az < box.maxZ))) continue;
    let reserved = false; // the railway, lake and river are thin or round: sample the whole field, not just its corners
    for (let gx = x - fw / 2; gx <= x + fw / 2 + 0.1 && !reserved; gx += 8) for (let gz = z - fd / 2; gz <= z + fd / 2 + 0.1 && !reserved; gz += 8) if (W.inReserve(gx, gz, 6)) reserved = true;
    if (reserved) continue;
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
      W.dirtSpots.push({ x: hx - 8, z: hz + 6, h: Math.PI / 2 }); // a dirt bike by the farmhouse
    }
    farms++;
  }
}

/* woods: clumps of pines and broadleaf trees, plus loose trees across the fields */
function countyWoods(free) {
  const out = [];
  const add = (x, z, type) => {
    if (W.biomeAt && W.biomeAt(x, z).bad > 0.45) return; // no trees out in the badlands
    if (W.biomeAt && W.biomeAt(x, z).high > 0.5) type = 'pine';
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
      m.userData.trees = list;
      // instanced meshes are culled by the geometry's bounds, which know nothing about the instances: give each tile real bounds
      let x0 = 1e9, z0 = 1e9, x1 = -1e9, z1 = -1e9; for (const t of list) { x0 = Math.min(x0, t.x); z0 = Math.min(z0, t.z); x1 = Math.max(x1, t.x); z1 = Math.max(z1, t.z); }
      m.geometry = m.geometry.clone(); m.geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3((x0 + x1) / 2, 4, (z0 + z1) / 2), Math.hypot(x1 - x0, z1 - z0) / 2 + 8);
      m.frustumCulled = true; // three.js turns culling off for instanced meshes; these tiles have real bounds
      m.castShadow = true; m.receiveShadow = true; S.add(m);
    }
  }
}

/* ---------------- the airport ----------------
   North gate off Airport Road → parking → terminal (with a currency exchange to rob) → apron with helipads →
   taxiways → a 710 m east-west runway along the coast. The military side to the west has hangars and gunships. */
W.AIRPORT = {
  fence: { minX: -1275, maxX: -476, minZ: 42, maxZ: 368 }, gate: -650,
  runway: { minX: -1250, maxX: -540, minZ: 277, maxZ: 323 },
  apron: { minX: -900, maxX: -500, minZ: 134, maxZ: 216 },
  milApron: { minX: -1268, maxX: -960, minZ: 150, maxZ: 238 },
  taxi: [{ minX: -572, maxX: -548, minZ: 214, maxZ: 279 }, { minX: -892, maxX: -868, minZ: 214, maxZ: 279 }, { minX: -1032, maxX: -1008, minZ: 236, maxZ: 279 }],
  lot: { minX: -760, maxX: -540, minZ: 50, maxZ: 86 },
};
W.inAirport = (x, z) => { const f = W.AIRPORT.fence; return x > f.minX && x < f.maxX && z > f.minZ && z < f.maxZ; };
function buildAirport(OP) {
  const A = W.AIRPORT, f = A.fence, r = A.runway;
  const pave = (q, y) => GB.asphalt.rect(q.minX, q.minZ, q.maxX, q.maxZ, y || 0.035, 12);
  // tarmac
  pave(A.lot); pave(A.apron); pave(A.milApron); for (const t of A.taxi) pave(t, 0.036);
  GB.asphalt.rect(r.minX, r.minZ, r.maxX, r.maxZ, 0.037, 12);
  GB.asphalt.rect(-560, 86, -540, 134, 0.035, 12); // service road from the lot round to the apron
  // runway paint: edge lines, dashed centre line, threshold bars and touchdown blocks at both ends
  const cz = (r.minZ + r.maxZ) / 2, wl = (x0, z0, x1, z1) => GB.white.rect(x0, z0, x1, z1, 0.05, 1);
  wl(r.minX, r.minZ + 1, r.maxX, r.minZ + 2); wl(r.minX, r.maxZ - 2, r.maxX, r.maxZ - 1);
  for (let x = r.minX + 70; x < r.maxX - 70; x += 50) wl(x, cz - 0.5, x + 30, cz + 0.5);
  for (const [x0, dir] of [[r.minX + 6, 1], [r.maxX - 6, -1]]) {
    for (let k = -3.5; k <= 3.5; k++) { const z = cz + k * 5; wl(Math.min(x0, x0 + dir * 30), z - 0.9, Math.max(x0, x0 + dir * 30), z + 0.9); }
    for (const s of [-1, 1]) for (let i = 0; i < 3; i++) { const x = x0 + dir * (90 + i * 60); wl(Math.min(x, x + dir * 22), cz + s * 9 - 1.2, Math.max(x, x + dir * 22), cz + s * 9 + 1.2); }
  }
  // taxiway centre lines (yellow) and edge lights along the runway
  for (const t of A.taxi) { const x = (t.minX + t.maxX) / 2; OP.box(x, 0.06, (t.minZ + t.maxZ) / 2, 0.5, 0.02, t.maxZ - t.minZ, '#f2c230'); }
  for (let x = r.minX; x <= r.maxX; x += 30) for (const z of [r.minZ - 1.5, r.maxZ + 1.5]) OP.box(x, 0.25, z, 0.35, 0.5, 0.35, x === r.minX || x >= r.maxX - 29 ? '#ff4040' : '#fff6c0');
  // fence, with the gate on Airport Road and a gap where the road comes in
  const post = (x, z) => OP.box(x, 1.2, z, 0.15, 2.4, 0.15, '#7a7f84');
  const fenceLine = (x0, z0, x1, z1) => {
    const L = dist(x0, z0, x1, z1), n = Math.ceil(L / 5);
    for (let i = 0; i <= n; i++) post(x0 + (x1 - x0) * i / n, z0 + (z1 - z0) * i / n);
    OP.box((x0 + x1) / 2, 2.3, (z0 + z1) / 2, Math.max(0.06, Math.abs(x1 - x0)), 0.08, Math.max(0.06, Math.abs(z1 - z0)), '#8d9297');
    OP.box((x0 + x1) / 2, 1.2, (z0 + z1) / 2, Math.max(0.03, Math.abs(x1 - x0)), 2.2, Math.max(0.03, Math.abs(z1 - z0)), '#b8bec4');
    W.addCollider(Math.min(x0, x1) - 0.15, Math.min(z0, z1) - 0.15, Math.max(x0, x1) + 0.15, Math.max(z0, z1) + 0.15, 2.4, 'fence', true);
  };
  fenceLine(f.minX, f.minZ, A.gate - 9, f.minZ); fenceLine(A.gate + 9, f.minZ, f.maxX, f.minZ);
  fenceLine(f.minX, f.maxZ, f.maxX, f.maxZ); fenceLine(f.minX, f.minZ, f.minX, f.maxZ); fenceLine(f.maxX, f.minZ, f.maxX, f.maxZ);
  OP.box(A.gate - 9, 1.6, f.minZ, 1.2, 3.2, 1.2, '#d9d4c7'); OP.box(A.gate + 9, 1.6, f.minZ, 1.2, 3.2, 1.2, '#d9d4c7');
  addSign(A.gate, 4.2, f.minZ - 0.7, 'n', 'CITY AIRPORT', '#1d3557', '#ffffff', 10, 1.8, 'TERMINAL · CARGO · AIR BASE');
  OP.box(A.gate, 4.2, f.minZ, 10.4, 2.1, 0.3, '#1d3557');
  // parking lot bays (cars park here like they do on city streets)
  for (let x = A.lot.minX + 8; x < A.lot.maxX - 8; x += 4) for (const [z, h] of [[A.lot.minZ + 5, 0], [A.lot.maxZ - 5, Math.PI]]) { GB.white.rect(x - 0.08, z - 2.6, x + 0.08, z + 2.6, 0.05, 1); if (Math.abs(x - A.gate) > 12 && rnd() < 0.5) W.curbSpots.push({ x: x + 2, z, h }); }
  // the terminal: a long glass hall with an entrance canopy and a currency exchange desk out front
  const T = addBuilding(-650, 110, 140, 34, 12, 'glass');
  OP.box(-650, 6.5, 90, 40, 0.5, 8, '#e8ecef'); for (const x of [-668, -632]) OP.box(x, 3.25, 87, 0.5, 6.5, 0.5, '#c9d1d6');
  addSign(-650, 9.2, 92.9, 'n', 'CITY AIRPORT', '#f1f3f5', '#1d3557', 18, 2.6, 'DEPARTURES · ARRIVALS');
  P.box(-610, 1.6, 92.95, 10, 2.4, 0.12, '#a9d6e5'); addSign(-610, 3.6, 92.85, 'n', 'SKYCASH EXCHANGE', '#0b3d2e', '#7cf7a8', 9, 1.4);
  const fx = makeRob('fxdesk', 'store', 'SkyCash Exchange', -610, 89.5, { hold: 5, cash: [1100, 1900], base: 1, cool: 220 });
  addAlarm(fx, -603.5, 92.8, 'n'); addCam(fx, -620, 92.6, 'n', 0.3, 15); addCam(fx, -600, 92.6, 'n', -0.3, 15);
  W.places.airport = { id: 'airport', name: 'City Airport', x: -650, z: 72 };
  void T;
  // control tower: a shaft with a glass cab and a roof
  addBuilding(-520, 110, 8, 8, 26, 'concrete');
  OP.box(-520, 28, 110, 12, 4, 12, '#8fc1d6'); OP.box(-520, 30.4, 110, 13, 0.8, 13, '#3c4655'); OP.box(-520, 31.6, 110, 0.3, 2.4, 0.3, '#cccccc');
  W.addCollider(-526, 104, -514, 116, 31, 'building');
  // windsock
  OP.box(-500, 4, 250, 0.2, 8, 0.2, '#dddddd'); OP.box(-500, 7.8, 251.5, 0.9, 0.9, 3, '#ff7b00');
  // civil helipads on the apron, military side to the west: hangars, gunship pads, a guard hut
  helipad(-525, 150, 'news', Math.PI); helipad(-525, 178, 'tour', Math.PI);
  for (const [x, w] of [[-1220, 56], [-1150, 56], [-1080, 56]]) {
    addBuilding(x, 125, w, 40, 14, 'metal');
    OP.box(x, 6, 145.15, w - 8, 11, 0.3, '#2b2f33'); OP.box(x, 13.2, 145.2, w - 6, 1.2, 0.4, '#5f676b');
  }
  addSign(-1150, 16, 145.4, 's', 'AIR BASE 7', '#2f3518', '#e9edc9', 12, 2.2, 'RESTRICTED AREA');
  helipad(-990, 175, 'attack', -Math.PI / 2); helipad(-990, 210, 'attack', -Math.PI / 2);
  W.places.tankBay = { id: 'tankBay', name: 'Hangar 2', x: -1150, z: 160, h: 0 }; // where Sarge's tank rolls out for his job
  W.places.sarge = { id: 'sarge', name: 'Sergeant Rook', x: -1118, z: 152, face: Math.PI / 2 };
  // aircraft stands: parked planes respawn here like choppers do on their pads
  const stand = (x, z, kind, yaw) => { W.places.helipads.push({ x, z, yaw, kind, stand: true }); for (const s of [-1, 1]) GB.white.rect(x + s * 9 - 0.2, z - 7, x + s * 9 + 0.2, z + 7, 0.05, 1); };
  stand(-600, 172, 'prop', 0); stand(-640, 172, 'prop', 0); stand(-720, 168, 'bizjet', 0);
  stand(-1200, 196, 'fighter', 0); stand(-1120, 196, 'fighter', 0);
  addBuilding(-950, 140, 6, 5, 3.2, 'concrete');
  // inner fence between the civil apron and the air base (with a gap on the taxiway)
  const mx = -930; for (let z = 150; z < 236; z += 5) post(mx, z);
  OP.box(mx, 1.2, 193, 0.03, 2.2, 86, '#b8bec4'); W.addCollider(mx - 0.15, 150, mx + 0.15, 236, 2.4, 'fence', true);
  W.zoneRects = (W.zoneRects || []).concat([{ zone: 'airport', ...f }]);
}

/* ---------------- Mirror Lake and the Bay River ----------------
   The lake is one round water collider with a sandy shore and a jetty. The river winds from the north fence down to
   the sea; it's a chain of water circles with gaps where roads cross it on bridges (railings keep you on the deck). */
W.LAKE = { x: -280, z: -830, r: 128 };
W.RIVER = { w: 34, pts: [[930, -1046], [945, -760], [902, -470], [940, -170], [912, 120], [928, W.SHORE + 40]] }; // from the dam to the sea
/* the Bay River Dam: a 16 m concrete wall across the canyon, holding back a reservoir at 14 m (js/districts.js) */
W.DAM = { x: 930, z: -1068, crest: 16, half: 4, water: 14, cx: 930, cz: -1138, rx: 105, rz: 58, x0: 0, x1: 0 };
W.bridges = [];
function buildWater(OP) {
  const waterMat = new THREE.MeshLambertMaterial({ color: 0x3b86ad }), L = W.LAKE; W.markWater(waterMat);
  const disc = (x, z, r, y, col) => { const m = new THREE.Mesh(new THREE.CircleGeometry(r, 64), col.isMaterial ? col : new THREE.MeshLambertMaterial({ color: col })); m.rotation.x = -Math.PI / 2; m.position.set(x, y, z); m.receiveShadow = true; S.add(m); return m; };
  // the lake: sand shore, water, a jetty with a rowboat
  disc(L.x, L.z, L.r + 9, 0.022, '#d8c690'); disc(L.x, L.z, L.r, 0.03, waterMat);
  W.addCircle(L.x, L.z, L.r - 1, 'water').h = 0.6;
  for (let k = 0; k < 14; k++) OP.box(L.x + L.r - 2 + k * 1.2 - 14, 0.3, L.z + 0.5, 1.1, 0.2, 3, '#8b6a45');
  for (const s of [-1, 1]) for (let k = 0; k < 4; k++) OP.box(L.x + L.r - 15 + k * 4, 0.2, L.z + 0.5 + s * 1.4, 0.35, 1.2, 0.35, '#5b4630');
  OP.box(L.x + L.r - 18, 0.25, L.z + 4.5, 1.6, 0.5, 4.2, '#c75a2a'); OP.box(L.x + L.r - 18, 0.52, L.z + 4.5, 1.2, 0.08, 3.6, '#e9d8a6');
  W.places.lake = { id: 'lake', name: 'Mirror Lake', x: L.x + L.r + 8, z: L.z };
  // the river: water strip + banks, sampled every few metres
  const R = W.RIVER, hw = R.w / 2, crossing = [];
  for (const e of W.countyEdges) for (let i = 1; i < R.pts.length; i++) {
    const [ax, az] = R.pts[i - 1], [bx, bz] = R.pts[i];
    const t = segSegT(ax, az, bx, bz, e.ax, e.az, e.bx, e.bz);
    if (t) crossing.push({ x: ax + (bx - ax) * t[0], z: az + (bz - az) * t[0], e });
  }
  for (let i = 1; i < R.pts.length; i++) {
    const [ax, az] = R.pts[i - 1], [bx, bz] = R.pts[i], len = dist(ax, az, bx, bz), dx = (bx - ax) / len, dz = (bz - az) / len;
    GB.dirt.strip(ax, az, bx, bz, hw + 5, 0.024, 6);
    const q = (x0, z0, x1, z1) => [[x0 - dz * hw, z0 + dx * hw], [x0 + dz * hw, z0 - dx * hw], [x1 + dz * hw, z1 - dx * hw], [x1 - dz * hw, z1 + dx * hw]];
    const g = new THREE.BufferGeometry(), p = q(ax - dx * hw, az - dz * hw, bx + dx * hw, bz + dz * hw);
    g.setAttribute('position', new THREE.Float32BufferAttribute([p[0][0], 0.032, p[0][1], p[1][0], 0.032, p[1][1], p[2][0], 0.032, p[2][1], p[3][0], 0.032, p[3][1]], 3));
    g.setIndex([0, 2, 1, 0, 3, 2]); g.computeVertexNormals();
    const m = new THREE.Mesh(g, waterMat); m.receiveShadow = true; S.add(m);
    // big circles down the middle, small ones near bridges so the water stops right at the deck
    const nearRoad = (x, z) => { let d = 1e9; if (!crossing.some((c) => dist(x, z, c.x, c.z) < hw + 40)) return d; for (const e of W.countyEdges) d = Math.min(d, segPointDist(x, z, e.ax, e.az, e.bx, e.bz)); return d; };
    for (let s = 0; s <= len; s += 3) {
      const x = ax + dx * s, z = az + dz * s;
      if (nearRoad(x, z) > hw + 7) { if (s % 6 === 0) W.addCircle(x, z, hw - 1, 'water').h = 0.6; continue; }
      for (let o = -hw + 3; o <= hw - 3; o += 4) { const px = x - dz * o, pz = z + dx * o; if (nearRoad(px, pz) > 10.5) W.addCircle(px, pz, 3, 'water').h = 0.6; }
    }
  }
  // bridges: a deck, railings you can't drive through, girders and piers in the water
  for (const c of crossing) {
    const e = c.e, L2 = dist(e.ax, e.az, e.bx, e.bz), dx = (e.bx - e.ax) / L2, dz = (e.bz - e.az) / L2, ang = Math.atan2(dx, dz), span = R.w + 12;
    OP.box(c.x, -0.12, c.z, 13, 0.3, span, '#8d8f93', ang); // deck sits just under the road surface
    for (const s of [-1, 1]) {
      const sx = c.x - dz * s * 6.6, sz = c.z + dx * s * 6.6;
      OP.box(sx, 0.55, sz, 0.35, 1.1, span, '#c8c4bb', ang); OP.box(sx, 1.15, sz, 0.5, 0.16, span, '#6f7378', ang);
      for (let k = -span / 2; k <= span / 2; k += 1.2) { const rc = W.addCircle(sx + dx * k, sz + dz * k, 0.4, 'barrier'); rc.h = 1.1; }
    }
    for (const k of [-R.w / 4, R.w / 4]) OP.box(c.x + dx * k, -0.6, c.z + dz * k, 9, 1.4, 2, '#9a9a96', ang);
    W.bridges.push({ x: c.x, z: c.z, name: e.name });
  }
}
/* where two segments cross: [t along the first, u along the second], or null */
function segSegT(ax, az, bx, bz, cx, cz, dx, dz) {
  const rx = bx - ax, rz = bz - az, sx = dx - cx, sz = dz - cz, den = rx * sz - rz * sx;
  if (Math.abs(den) < 1e-9) return null;
  const t = ((cx - ax) * sz - (cz - az) * sx) / den, u = ((cx - ax) * rz - (cz - az) * rx) / den;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? [t, u] : null;
}

/* ---------------- Pine Ridge and its tunnel ----------------
   A rocky ridge across the north county. Lakeside Drive goes through it in a lit tunnel: inside, police choppers
   can't see you. The ridge is solid to cars, people and aircraft below its crest. */
W.RIDGE = [{ minX: -620, maxX: -108, minZ: -1180, maxZ: -1078, h: 55 }, { minX: -92, maxX: 270, minZ: -1180, maxZ: -1078, h: 55 }];
W.TUNNEL = { minX: -108, maxX: -92, minZ: -1184, maxZ: -1074 };
W.inTunnel = (x, z) => { const t = W.TUNNEL; return x > t.minX && x < t.maxX && z > t.minZ && z < t.maxZ; };
function buildMountain(OP) {
  const T = W.TUNNEL, cx = -100, mats = [];
  // peaks: lumpy, flat-shaded rock with grass and a snowy top on the tallest
  const peak = (x, z, sx, sy, sz, col) => {
    const g = new THREE.IcosahedronGeometry(1, 2), p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const y = p.getY(i); if (y < -0.05) p.setY(i, -0.05); else { const k = 1 + (rnd() - 0.5) * 0.16; p.setXYZ(i, p.getX(i) * k, y * (1 + (rnd() - 0.5) * 0.14), p.getZ(i) * k); } }
    g.computeVertexNormals();
    const m = new THREE.MeshLambertMaterial({ color: col, flatShading: true }); mats.push(m);
    const mesh = new THREE.Mesh(g, m); mesh.scale.set(sx, sy, sz); mesh.position.set(x, 0, z); mesh.castShadow = true; mesh.receiveShadow = true; S.add(mesh);
    return mesh;
  };
  const xs = [-580, -500, -420, -330, -240, -160, -45, 40, 130, 220];
  xs.forEach((x, i) => {
    const tall = 34 + rnd() * 26 + (i === 4 || i === 7 ? 14 : 0);
    peak(x + rnd() * 20, -1130 + (rnd() - 0.5) * 20, 55 + rnd() * 30, tall, 48 + rnd() * 10, pick(['#7b7468', '#857d6f', '#6f6a60']));
    if (tall > 58) peak(x, -1130, 22, tall + 2, 20, '#f1f3f5'); // snow cap
    peak(x + 30, -1095 + rnd() * 6, 40, tall * 0.45, 30, '#5f7d48'); // grassy foothills
    peak(x - 20, -1165, 40, tall * 0.5, 28, '#5f7d48');
  });
  for (const r of W.RIDGE) W.addCollider(r.minX, r.minZ, r.maxX, r.maxZ, r.h, 'rock');
  // the tunnel: walls, ceiling, lights, portals
  const len = T.maxZ - T.minZ, mz = (T.minZ + T.maxZ) / 2;
  const wall = new THREE.MeshLambertMaterial({ color: 0x8a8781 });
  const box = (w, h, d, x, y, z, m) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); b.receiveShadow = true; S.add(b); return b; };
  box(1.2, 8, len, T.minX - 0.6, 4, mz, wall); box(1.2, 8, len, T.maxX + 0.6, 4, mz, wall); box(T.maxX - T.minX + 2.4, 1, len, cx, 8.5, mz, wall);
  const lampM = new THREE.MeshBasicMaterial({ color: 0xffe6a0 });
  for (let z = T.minZ + 6; z < T.maxZ - 4; z += 10) { box(0.5, 0.15, 2.2, T.minX + 1.2, 7.4, z, lampM); box(0.5, 0.15, 2.2, T.maxX - 1.2, 7.4, z, lampM); }
  for (const z of [T.minZ, T.maxZ]) {
    OP.box(cx, 9.6, z, T.maxX - T.minX + 8, 3.2, 2, '#b3aea4'); for (const s of [-1, 1]) OP.box(cx + s * (T.maxX - T.minX + 6) / 2, 4.5, z, 3, 9, 2, '#b3aea4');
  }
  addSign(cx, 9.6, T.maxZ + 1.05, 's', 'PINE RIDGE TUNNEL', '#1f6f45', '#ffffff', 11, 1.6);
  for (let k = 0; k < 2; k++) W.addCollider(k ? T.maxX : T.minX - 1.2, T.minZ, k ? T.maxX + 1.2 : T.minX, T.maxZ, 9, 'wall');
  W.ridgeMats = mats;
  W.zoneRects = (W.zoneRects || []).concat([{ zone: 'tunnel', ...T }]);
}

/* ---------------- the county railway ----------------
   A loop of track round the north county (a rounded rectangle), with level crossings where it meets roads and two
   stations. js/train.js runs the train on it. */
W.RAIL = { cx: 30, cz: -760, hx: 690, hz: 260, r: 90 };
W.railSegs = function () {
  if (W._rails) return W._rails;
  const R = W.RAIL, kx = R.hx - R.r, kz = R.hz - R.r, A = Math.PI * R.r / 2;
  W._rails = [
    { t: 'line', ax: R.cx - kx, az: R.cz - R.hz, dx: 1, dz: 0, len: 2 * kx }, { t: 'arc', cx: R.cx + kx, cz: R.cz - kz, a0: -Math.PI / 2, len: A },
    { t: 'line', ax: R.cx + R.hx, az: R.cz - kz, dx: 0, dz: 1, len: 2 * kz }, { t: 'arc', cx: R.cx + kx, cz: R.cz + kz, a0: 0, len: A },
    { t: 'line', ax: R.cx + kx, az: R.cz + R.hz, dx: -1, dz: 0, len: 2 * kx }, { t: 'arc', cx: R.cx - kx, cz: R.cz + kz, a0: Math.PI / 2, len: A },
    { t: 'line', ax: R.cx - R.hx, az: R.cz + kz, dx: 0, dz: -1, len: 2 * kz }, { t: 'arc', cx: R.cx - kx, cz: R.cz - kz, a0: Math.PI, len: A },
  ];
  W.RAILLEN = W._rails.reduce((t, g) => t + g.len, 0);
  return W._rails;
};
/* a point on the loop at distance s, with its direction of travel */
W.railPoint = function (s) {
  const segs = W.railSegs(), L = W.RAILLEN, R = W.RAIL.r; s = ((s % L) + L) % L;
  for (const g of segs) {
    if (s <= g.len) {
      if (g.t === 'line') return { x: g.ax + g.dx * s, z: g.az + g.dz * s, tx: g.dx, tz: g.dz };
      const a = g.a0 + s / R; return { x: g.cx + Math.cos(a) * R, z: g.cz + Math.sin(a) * R, tx: -Math.sin(a), tz: Math.cos(a) };
    }
    s -= g.len;
  }
  return W.railPoint(0);
};
/* distance from a point to the track (signed-distance of a rounded rectangle) */
W.railDist = function (x, z) {
  const R = W.RAIL, qx = Math.abs(x - R.cx) - (R.hx - R.r), qz = Math.abs(z - R.cz) - (R.hz - R.r);
  return Math.abs(Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0) - R.r);
};
W.railParam = function (x, z) { let best = 0, bd = 1e9; W.railSegs(); for (let s = 0; s < W.RAILLEN; s += 1) { const p = W.railPoint(s), d = dist(p.x, p.z, x, z); if (d < bd) { bd = d; best = s; } } return best; };
W.STATIONS = [{ name: 'Lakeside Station', x: -350, z: -500, side: [0, 1] }, { name: 'Mill Station', x: 720, z: -760, side: [1, 0] }];
W.railCrossings = [];
function buildRail(OP) {
  W.railSegs();
  const L = W.RAILLEN, pts = [];
  for (let s = 0; s <= L; s += 4) pts.push(W.railPoint(s));
  // ballast bed, sleepers and the two rails
  for (let i = 1; i < pts.length; i++) GB.dirt.strip(pts[i - 1].x, pts[i - 1].z, pts[i].x, pts[i].z, 2.6, 0.05, 4);
  for (let s = 0; s < L; s += 1.3) { const p = W.railPoint(s); OP.box(p.x, 0.08, p.z, 2.6, 0.12, 0.3, '#5a4632', Math.atan2(p.tx, p.tz)); }
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2, ang = Math.atan2(b.x - a.x, b.z - a.z), len = dist(a.x, a.z, b.x, b.z) + 0.05;
    for (const s of [-0.75, 0.75]) OP.box(mx + Math.cos(ang) * s, 0.2, mz - Math.sin(ang) * s, 0.12, 0.16, len, '#8d9297', ang);
  }
  // level crossings: where a county road meets the track
  for (const e of W.countyEdges) for (let i = 1; i < pts.length; i++) {
    const t = segSegT(pts[i - 1].x, pts[i - 1].z, pts[i].x, pts[i].z, e.ax, e.az, e.bx, e.bz); if (!t) continue;
    const a = pts[i - 1], b = pts[i], x = a.x + (b.x - a.x) * t[0], z = a.z + (b.z - a.z) * t[0];
    if (W.railCrossings.some((c) => dist(c.x, c.z, x, z) < 20)) continue;
    const tx = (b.x - a.x) / 4, tz = (b.z - a.z) / 4, rl = dist(e.ax, e.az, e.bx, e.bz), rx = (e.bx - e.ax) / rl, rz = (e.bz - e.az) / rl;
    OP.box(x, 0.06, z, 13, 0.1, 4.2, '#6b5a45', Math.atan2(rx, rz) + Math.PI / 2);
    const cr = { x, z, tx, tz, posts: [] };
    for (const sd of [-1, 1]) {
      // a post on each approach, its arm across the lane on that side
      const px = x - rx * sd * 6 + -rz * sd * 7.2, pz = z - rz * sd * 6 + rx * sd * 7.2;
      OP.box(px, 1.6, pz, 0.25, 3.2, 0.25, '#e8e8e8'); OP.box(px, 2.9, pz, 1.4, 0.3, 0.12, '#1b1b1e', Math.atan2(rx, rz) + Math.PI / 2);
      const light = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.32, 0.32), new THREE.MeshBasicMaterial({ color: 0x441111 })); light.position.set(px, 3.15, pz); S.add(light);
      const arm = new THREE.Group(); arm.position.set(px, 1.2, pz); arm.rotation.y = Math.atan2(rx * sd, rz * sd) + Math.PI / 2; S.add(arm);
      const bar = new THREE.Mesh(new THREE.BoxGeometry(6.5, 0.18, 0.18), lam('#f2f2f2')); bar.position.x = 3.2; arm.add(bar);
      for (let k = 0; k < 3; k++) { const st = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.2, 0.2), lam('#d62828')); st.position.x = 1 + k * 2; arm.add(st); }
      arm.rotation.z = Math.PI / 2 - 0.05;
      cr.posts.push({ light, arm });
    }
    W.railCrossings.push(cr);
  }
  // stations: a platform you can stand on, a shelter and a sign
  for (const st of W.STATIONS) {
    const [sx, sz] = st.side, cx = st.x + sx * 6, cz = st.z + sz * 6, along = sx ? [0, 1] : [1, 0], len = 70;
    addBuilding(cx, cz, along[0] ? len : 5, along[1] ? len : 5, 1.0, 'concrete', { color: '#b9b4a8' });
    const shx = st.x + sx * 8, shz = st.z + sz * 8;
    for (const o of [-6, 6]) OP.box(shx + along[0] * o, 2.4, shz + along[1] * o, 0.2, 2.8, 0.2, '#555b61');
    OP.box(shx, 3.9, shz, along[0] ? 15 : 3, 0.2, along[1] ? 15 : 3, '#2f6b4a');
    addSign(shx + sx * 1.2, 3.2, shz + sz * 1.2, sx ? 'w' : 'n', st.name.toUpperCase(), '#1d3557', '#ffffff', 7, 1.1);
    st.s = W.railParam(st.x, st.z);
    W.places['station' + W.STATIONS.indexOf(st)] = { id: 'station', name: st.name, x: cx, z: cz };
  }
}
