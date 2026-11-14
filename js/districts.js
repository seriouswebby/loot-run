'use strict';
/* Districts out in the county, each on flat ground of its own. Funland is a theme park south of East Road:
   a big wheel, a roller coaster (the Viper), a drop tower, a carousel, bumper cars and stalls, with a ticket
   office to rob and visitors wandering its paths. Land for Millbrook village and the dam is set aside here too,
   before the county's farms and woods are placed, so the county only reshuffles once. */

W.FUN = { minX: 620, maxX: 850, minZ: 80, maxZ: 320, gate: 735 };
W.RESERVE.push(
  { kind: 'funland', minX: 606, maxX: 864, minZ: 24, maxZ: 336 },
  { kind: 'millbrook', minX: 535, maxX: 770, minZ: -452, maxZ: -330 },
  { kind: 'dam', minX: 800, maxX: 1070, minZ: -1240, maxZ: -1010 },
);
W.inFunland = (x, z) => { const f = W.FUN; return x > f.minX && x < f.maxX && z > f.minZ && z < f.maxZ; };
W.MILL = { minX: 540, maxX: 765, minZ: -452, maxZ: -333, x: 650 }; // Millbrook village; x = Main Street
W.inMillbrook = (x, z) => { const m = W.MILL; return x > m.minX && x < m.maxX && z > m.minZ && z < m.maxZ; };
W.districtLabels = [];
W.tallProps = []; // tall open structures (the big wheel, the drop tower) that aircraft have to fly round

function buildDistricts() {
  const saved = rnd; rnd = mulberry32(31337); // the districts' own random stream
  const trees = [];
  buildFunland(trees);
  buildMillbrook(trees);
  rnd = saved;
  return trees;
}

/* ---------------- Funland ---------------- */
const FUN_STALLS = [['HOT DOGS', '#e63946'], ['CANDY FLOSS', '#ff5d8f'], ['POPCORN', '#f4a300'], ['ICE CREAM', '#2fa8d8'], ['HOOK-A-DUCK', '#06a77d'], ['RING TOSS', '#7209b7'],
  ['SODA', '#3a86ff'], ['PRIZES', '#fb5607'], ['TACOS', '#d1495b'], ['BALLOONS', '#ef476f'], ['DONUTS', '#9c6644'], ['LEMONADE', '#e9b100'], ['COIN TOSS', '#2a9d8f']];
// the Viper's track: x, rail height, z — the station runs south along x = 712, then the lift hill climbs west
const VIPER = [[712, 0.9, 228], [712, 0.9, 246], [712, 0.9, 264], [709, 1.8, 282], [698, 4, 296], [682, 9, 302], [666, 16.5, 302], [652, 24, 301],
  [641, 26.5, 296], [636, 24, 286], [634, 13, 272], [634, 3.5, 258], [635, 12, 244], [637, 4, 230], [643, 8, 216], [656, 11, 210], [671, 8, 210],
  [686, 6, 212], [700, 4, 214], [709, 2.2, 219]];

function buildFunland(trees) {
  const F = W.FUN, gx = F.gate, FP = new PropBatch(), R = {};
  W.FLAT.push({ minX: F.minX - 14, maxX: F.maxX + 10, minZ: 26, maxZ: F.maxZ + 12, pad: 8 });
  // lawns, paths and the car park
  GB.grass.rect(F.minX, F.minZ, F.maxX, F.maxZ, 0.02, 10);
  const pave = (x0, z0, x1, z1) => GB.plaza.rect(x0, z0, x1, z1, 0.04, 8);
  pave(gx - 32, F.minZ, gx + 32, 112); pave(gx - 7, 112, gx + 7, F.maxZ); pave(F.minX, 184, F.maxX - 4, 198);
  pave(694, 137, gx - 7, 143); pave(gx + 7, 137, 802, 143); pave(722, 243, gx - 7, 249); pave(gx + 7, 287, 808, 293);
  GB.asphalt.rect(745, 30, 806, 74, 0.035, 12);
  for (let x = 749; x < 803; x += 4) for (const [z, h] of [[35, 0], [69, Math.PI]]) { GB.white.rect(x - 0.08, z - 2.6, x + 0.08, z + 2.6, 0.05, 1); if (rnd() < 0.45) W.curbSpots.push({ x: x + 2, z, h }); }
  // the path network visitors wander (and the boarding spots for the rides)
  const N = { gate: [gx, 86], wheelJ: [gx, 140], hub: [gx, 191], viperJ: [gx, 246], dropJ: [gx, 290], back: [gx, 316], carousel: [698, 140], wheel: [797, 140],
    west: [F.minX + 6, 191], east: [F.maxX - 8, 191], viper: [723, 246], drop: [804, 290], plazaW: [gx - 14, 104], plazaE: [gx + 14, 104] };
  const L = [['gate', 'wheelJ'], ['wheelJ', 'hub'], ['hub', 'viperJ'], ['viperJ', 'dropJ'], ['dropJ', 'back'], ['wheelJ', 'carousel'], ['wheelJ', 'wheel'], ['hub', 'west'], ['hub', 'east'],
    ['viperJ', 'viper'], ['dropJ', 'drop'], ['gate', 'plazaW'], ['gate', 'plazaE']];
  F.nodes = {}; for (const k in N) F.nodes[k] = { k, x: N[k][0], z: N[k][1], links: [] };
  for (const [a, b] of L) { F.nodes[a].links.push(F.nodes[b]); F.nodes[b].links.push(F.nodes[a]); }
  F.links = L.map(([a, b]) => [F.nodes[a], F.nodes[b]]);
  for (const k of ['gate', 'hub', 'plazaW', 'plazaE']) F.nodes[k].w = 3;
  F.area = Strollers.add({ name: 'funland', cx: (F.minX + F.maxX) / 2, cz: (F.minZ + F.maxZ) / 2, R: 140, cap: 22, nodes: F.nodes, links: F.links });
  W.districtLabels.push({ x: gx, z: F.minZ - 40, text: 'FUNLAND', col: '#ff8fb8' });

  // fence round the park: candy-striped rails, with the main gate north, a back gate south and a side gate west
  const fence = (x0, z0, x1, z1) => {
    const len = dist(x0, z0, x1, z1), n = Math.max(1, Math.ceil(len / 4));
    for (let i = 0; i <= n; i++) FP.box(x0 + (x1 - x0) * i / n, 1.1, z0 + (z1 - z0) * i / n, 0.2, 2.2, 0.2, '#f1faee');
    for (const [y, c] of [[2.05, '#e63946'], [1.2, '#f1faee'], [0.4, '#e63946']]) FP.box((x0 + x1) / 2, y, (z0 + z1) / 2, Math.max(0.09, Math.abs(x1 - x0)), 0.14, Math.max(0.09, Math.abs(z1 - z0)), c);
    W.addCollider(Math.min(x0, x1) - 0.15, Math.min(z0, z1) - 0.15, Math.max(x0, x1) + 0.15, Math.max(z0, z1) + 0.15, 2.2, 'fence', true);
  };
  fence(F.minX, F.minZ, gx - 13.5, F.minZ); fence(gx + 13.5, F.minZ, F.maxX, F.minZ);
  fence(F.minX, F.maxZ, gx - 8, F.maxZ); fence(gx + 8, F.maxZ, F.maxX, F.maxZ);
  fence(F.minX, F.minZ, F.minX, 184); fence(F.minX, 198, F.minX, F.maxZ); fence(F.maxX, F.minZ, F.maxX, F.maxZ);
  // the gate arch
  for (const s of [-1, 1]) {
    const x = gx + s * 12.6; FP.box(x, 4.6, F.minZ, 1.6, 9.2, 1.6, '#ffbe0b'); FP.box(x, 9.6, F.minZ, 2.2, 0.8, 2.2, '#e63946'); FP.box(x, 10.4, F.minZ, 0.9, 0.9, 0.9, '#3a86ff');
    W.addCollider(x - 0.8, F.minZ - 0.8, x + 0.8, F.minZ + 0.8, 9.2, 'pillar');
  }
  FP.box(gx, 8.4, F.minZ, 23.6, 2.6, 0.5, '#3a0ca3');
  addSign(gx, 8.4, F.minZ - 0.3, 'n', 'FUNLAND', '#3a0ca3', '#ffd60a', 21, 2.3, 'RIDES · GAMES · TREATS');
  addSign(gx, 8.4, F.minZ + 0.3, 's', 'FUNLAND', '#3a0ca3', '#ffd60a', 21, 2.3, 'COME BACK SOON!');
  for (const [x, z] of [[gx - 8, F.maxZ], [gx + 8, F.maxZ], [F.minX, 184], [F.minX, 198]]) FP.box(x, 1.8, z, 0.8, 3.6, 0.8, '#ffbe0b');

  // the ticket office (robbable) and the gift shop either side of the way in
  addBuilding(713, 94, 10, 8, 4.4, 'stucco', { color: '#fdf0d5' });
  for (let i = 0; i < 5; i++) FP.box(708.9 + i * 2, 4.7, 94, 2, 0.5, 8.4, i % 2 ? '#ffffff' : '#e63946');
  FP.box(718.06, 1.7, 94, 0.12, 1.4, 3.2, '#a9d6e5'); FP.box(718.9, 3.1, 94, 1.8, 0.18, 6, '#e63946');
  addSign(718.08, 3.85, 94, 'e', 'TICKETS', '#e63946', '#ffffff', 5.5, 1.1);
  const tix = makeRob('funtix', 'store', 'Funland Ticket Office', 720.2, 94, { hold: 5, cash: [700, 1300], base: 1, cool: 200 });
  addAlarm(tix, 711, 89.9, 'n'); addCam(tix, 718.1, 90.6, 'e', 0.4, 14); addCam(tix, 718.1, 97.4, 'e', -0.4, 14);
  addBuilding(757, 94, 10, 8, 4.4, 'stucco', { color: '#caf0f8' });
  for (let i = 0; i < 5; i++) FP.box(752.9 + i * 2, 4.7, 94, 2, 0.5, 8.4, i % 2 ? '#ffffff' : '#3a86ff');
  FP.box(751.94, 1.7, 94, 0.12, 1.6, 4, '#a9d6e5'); addSign(751.92, 3.85, 94, 'w', 'GIFTS', '#3a86ff', '#ffffff', 5, 1.1);
  W.places.funland = { id: 'funland', name: 'Funland', x: gx, z: F.minZ - 6 };

  // stalls along the avenues: a counter, a striped awning and a sign
  let si = 0;
  const stall = (x, z, face) => {
    const [txt, col] = FUN_STALLS[si++ % FUN_STALLS.length], [nx, nz] = FACE_N[face], along = nx !== 0 ? 'z' : 'x';
    const w = along === 'z' ? 3.6 : 5, d = along === 'z' ? 5 : 3.6;
    FP.box(x, 1.3, z, w, 2.6, d, '#fefae0'); FP.box(x + nx * (along === 'z' ? 1.85 : 0), 1, z + nz * (along === 'x' ? 1.85 : 0), along === 'z' ? 0.2 : 5, 0.15, along === 'z' ? 5 : 0.2, col);
    for (let k = 0; k < 5; k++) {
      const o = -2 + k, c = k % 2 ? '#ffffff' : col;
      if (along === 'z') FP.box(x + nx * 2.2, 2.85, z + o, 1.4, 0.14, 1, c); else FP.box(x + o, 2.85, z + nz * 2.2, 1, 0.14, 1.4, c);
    }
    FP.box(x, 2.75, z, w + 0.1, 0.3, d + 0.1, col);
    addSign(x + nx * (along === 'z' ? 1.82 : 0), 3.55, z + nz * (along === 'x' ? 1.82 : 0), face, txt, col, '#ffffff', 4.4, 0.9);
    W.addCollider(x - w / 2, z - d / 2, x + w / 2, z + d / 2, 2.6, 'building');
  };
  for (const z of [120, 160, 302]) stall(722.8, z, 'e');
  for (const z of [120, 160, 215, 265, 305]) stall(747.2, z, 'w');
  for (const x of [652, 674, 696, 762, 782]) stall(x, 178.2, 's');
  for (const x of [762, 822, 840]) stall(x, 203.8, 'n');

  // lamps and benches along the paths
  for (let z = 104; z < F.maxZ - 4; z += 18) for (const s of [-1, 1]) {
    if ((z > 180 && z < 202) || [140, 246, 290].some((q) => Math.abs(z - q) < 5)) continue; // keep the crossings clear
    const x = gx + s * 7.6; FP.box(x, 2.2, z, 0.16, 4.4, 0.16, '#343a40'); FP.box(x, 4.45, z, 0.6, 0.25, 0.6, '#ffe8a3');
    W.addCollider(x - 0.15, z - 0.15, x + 0.15, z + 0.15, 4.4, 'pillar', true);
    if ((z / 18) % 2 < 1) { FP.box(x + s * 0.4, 0.45, z + 6, 0.6, 0.12, 2, '#9c6644'); FP.box(x + s * 0.7, 0.75, z + 6, 0.12, 0.5, 2, '#9c6644'); }
  }

  // ---- the carousel: a striped canopy and painted horses going round ----
  const CX = 684, CZ = 140;
  const base = new THREE.Mesh(new THREE.CylinderGeometry(9.4, 9.7, 0.6, 28), lam(0xd9c8a9)); base.position.set(CX, 0.3, CZ); base.receiveShadow = true; S.add(base);
  const cb = new PropBatch();
  cb.box(0, 3.3, 0, 1.8, 6.6, 1.8, '#ffd60a');
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU, r = i % 2 ? 6.6 : 4.4, x = Math.cos(a) * r, z = Math.sin(a) * r, y = i % 2 ? 1.6 : 1.9, col = ['#ffffff', '#3d2b1f', '#a47148', '#ffafcc'][i % 4];
    cb.box(x, 3.4, z, 0.1, 6.2, 0.1, '#d4af37');
    cb.box(x, y, z, 0.45, 0.6, 1.5, col, -a);
    const hx = x - Math.sin(a) * 0.75, hz = z + Math.cos(a) * 0.75; cb.box(hx, y + 0.5, hz, 0.32, 0.75, 0.45, col, -a);
    for (const o of [-0.5, 0.5]) cb.box(x - Math.sin(a) * o, y - 0.55, z + Math.cos(a) * o, 0.14, 0.6, 0.14, col, -a);
  }
  for (let i = 0; i < 28; i++) { const a = (i / 28) * TAU; cb.box(Math.cos(a) * 9.5, 6.4, Math.sin(a) * 9.5, 0.2, 0.8, 2.2, i % 2 ? '#ffffff' : '#e63946', -a); }
  const car = cb.build(S); car.position.set(CX, 0.6, CZ);
  const stripes = document.createElement('canvas'); stripes.width = 64; stripes.height = 4; const sg = stripes.getContext('2d');
  for (let i = 0; i < 8; i++) { sg.fillStyle = i % 2 ? '#ffffff' : '#e63946'; sg.fillRect(i * 8, 0, 8, 4); }
  const canopy = new THREE.Mesh(new THREE.ConeGeometry(10.2, 3.4, 32, 1, true), new THREE.MeshLambertMaterial({ map: new THREE.CanvasTexture(stripes), side: THREE.DoubleSide }));
  canopy.position.set(CX, 8.5, CZ); canopy.castShadow = true; S.add(canopy);
  const top = new THREE.Mesh(new THREE.SphereGeometry(0.6, 8, 6), lam(0xffd60a)); top.position.set(CX, 10.4, CZ); S.add(top);
  const cc = W.addCircle(CX, CZ, 9.8, 'fountain'); cc.h = 7; cc.noLos = true;
  addSign(CX + 9.9, 2.6, CZ - 5, 'e', 'CAROUSEL', '#ffd60a', '#7209b7', 6, 1.1);
  R.carousel = { mesh: car, canopy };

  // ---- the Sky Wheel: 16 gondolas on a 19 m wheel that turns slowly over the park ----
  const WX = 808, WY = 24, WZ = 140, WR = 19;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    FP.beam(WX + sx * 3.4, 0, WZ + sz * 12.5, WX + sx * 2, WY, WZ, 0.9, '#dee2e6');
    W.addCollider(WX + sx * 3.4 - 0.6, WZ + sz * 12.5 - 0.6, WX + sx * 3.4 + 0.6, WZ + sz * 12.5 + 0.6, 24, 'pillar', true);
  }
  FP.box(WX, WY, WZ, 5, 0.9, 0.9, '#adb5bd');
  FP.box(WX, 0.8, WZ, 6, 1.6, 8, '#adb5bd'); FP.box(WX - 4.2, 0.4, WZ, 2.4, 0.8, 4, '#868e96'); // boarding deck and step
  W.addCollider(WX - 2.6, WZ - 21, WX + 2.6, WZ + 21, WY + WR + 1, 'pillar', true);
  W.tallProps.push({ minX: WX - 3, maxX: WX + 3, minZ: WZ - 21, maxZ: WZ + 21, h: WY + WR + 1 });
  const wb = new PropBatch(), rimN = 40;
  for (const x of [-1.4, 1.4]) {
    for (let i = 0; i < rimN; i++) { const a0 = (i / rimN) * TAU, a1 = ((i + 1) / rimN) * TAU; wb.beam(x, -WR * Math.cos(a0), -WR * Math.sin(a0), x, -WR * Math.cos(a1), -WR * Math.sin(a1), 0.4, '#ff5d8f'); }
    for (let i = 0; i < 16; i++) { const a = (i / 16) * TAU; wb.beam(x, 0, 0, x, -WR * Math.cos(a), -WR * Math.sin(a), 0.2, '#f8f9fa'); wb.beam(x, 0, 0, x, -WR * 0.55 * Math.cos(a + 0.2), -WR * 0.55 * Math.sin(a + 0.2), 0.14, '#ffd60a'); }
  }
  for (let i = 0; i < 16; i++) { const a = (i / 16) * TAU; wb.beam(-1.5, -WR * Math.cos(a), -WR * Math.sin(a), 1.5, -WR * Math.cos(a), -WR * Math.sin(a), 0.25, '#f8f9fa'); }
  wb.box(0, 0, 0, 3.6, 1.8, 1.8, '#3a0ca3');
  const wheel = wb.build(S); wheel.position.set(WX, WY, WZ);
  const gb = new PropBatch();
  // an open-sided gondola: a tub, four corner posts and a roof, so you can see who's riding
  gb.box(0, -0.15, 0, 2, 0.8, 2.2, '#ffffff'); for (const sx of [-1, 1]) for (const sz of [-1, 1]) gb.box(sx * 0.94, 0.75, sz * 1.04, 0.1, 1.0, 0.1, '#ffffff');
  gb.box(0, 1.35, 0, 2.3, 0.2, 2.5, '#ffffff'); gb.box(0, 1.85, 0, 0.12, 0.9, 0.12, '#adb5bd');
  const gm = gb.build(S); S.remove(gm);
  const gond = new THREE.InstancedMesh(gm.geometry, gm.material, 16); gond.castShadow = true; gond.frustumCulled = false; S.add(gond);
  const gcols = ['#ff5d8f', '#ffd60a', '#3a86ff', '#06d6a0'];
  for (let i = 0; i < 16; i++) gond.setColorAt(i, new THREE.Color(gcols[i % 4]));
  addSign(WX - 5.6, 3.6, WZ, 'w', 'SKY WHEEL', '#ff5d8f', '#ffffff', 6, 1.1);
  R.wheel = { mesh: wheel, gond, x: WX, y: WY, z: WZ, r: WR, ang: 0, n: 16 };

  // ---- the Big Drop: seats ride up a 52 m tower, hang there, then fall ----
  const DX = 815, DZ = 290, DH = 52;
  FP.box(DX, DH / 2, DZ, 3, DH, 3, '#e63946');
  for (let y = 4; y < DH - 2; y += 6) FP.box(DX, y, DZ, 3.1, 0.6, 3.1, '#f8f9fa');
  FP.box(DX, DH + 0.6, DZ, 5.2, 1.2, 5.2, '#3a0ca3'); FP.box(DX, DH + 1.8, DZ, 0.3, 1.6, 0.3, '#f8f9fa');
  FP.box(DX, 0.2, DZ, 11, 0.4, 11, '#adb5bd');
  W.addCollider(DX - 1.6, DZ - 1.6, DX + 1.6, DZ + 1.6, DH + 1, 'pillar');
  W.tallProps.push({ minX: DX - 2.6, maxX: DX + 2.6, minZ: DZ - 2.6, maxZ: DZ + 2.6, h: DH + 2 });
  const db = new PropBatch();
  db.box(0, 0, 0, 4.4, 1.2, 4.4, '#ffd60a');
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU, ox = Math.sin(a), oz = Math.cos(a);
    db.box(ox * 2.7, -0.2, oz * 2.7, 0.9, 1.6, 0.25, '#3a0ca3', a); db.box(ox * 3.1, -0.85, oz * 3.1, 0.9, 0.2, 0.8, '#3a0ca3', a);
    db.box(ox * 3.2, 0.1, oz * 3.2, 0.7, 0.2, 0.5, '#ffd60a', a);
  }
  const ring = db.build(S); ring.position.set(DX, 1.4, DZ);
  addSign(DX - 5.6, 2.2, DZ, 'w', 'BIG DROP', '#e63946', '#ffffff', 5.5, 1.1);
  R.drop = { mesh: ring, x: DX, z: DZ, h: DH, y: 1.4, cycle: 34 };

  // ---- bumper cars under a big purple roof ----
  GB.asphalt.rect(772, 224, 804, 248, 0.045, 6);
  FP.box(788, 5.6, 236, 34, 0.4, 26, '#7209b7'); FP.box(788, 6.1, 236, 30, 0.6, 22, '#9d4edd');
  for (const [x, z] of [[771, 223], [805, 223], [771, 249], [805, 249], [788, 223], [788, 249]]) { FP.box(x, 2.8, z, 0.4, 5.6, 0.4, '#ffd60a'); W.addCollider(x - 0.3, z - 0.3, x + 0.3, z + 0.3, 5.6, 'pillar', true); }
  for (let i = 0; i < 9; i++) {
    const x = 776 + rnd() * 24, z = 227 + rnd() * 18, h = rnd() * TAU, c = pick(['#e63946', '#3a86ff', '#06d6a0', '#ffd60a', '#ff5d8f']);
    FP.box(x, 0.45, z, 1.3, 0.5, 1.8, c, h); FP.box(x, 0.3, z, 1.6, 0.25, 2.1, '#343a40', h); FP.box(x, 2.9, z, 0.06, 4.6, 0.06, '#adb5bd');
  }
  addSign(788, 4.6, 222.7, 'n', 'BUMPER CARS', '#7209b7', '#ffd60a', 9, 1.3);

  // ---- the Viper: a steel coaster with a lift hill, a big drop and camelback hills ----
  buildViper(R, FP);

  // trees on the lawns, clear of the paths, rides and stalls
  const onPath = (x, z) => (Math.abs(x - gx) < 10 && z > 100) || (z > 181 && z < 201) || (z < 115 && Math.abs(x - gx) < 36) || F.links.some(([a, b]) => segPointDist(x, z, a.x, a.z, b.x, b.z) < 6);
  for (let k = 0, n = 0; k < 600 && n < 70; k++) {
    const x = F.minX + 5 + rnd() * (F.maxX - F.minX - 10), z = F.minZ + 5 + rnd() * (F.maxZ - F.minZ - 10);
    if (onPath(x, z) || dist(x, z, CX, CZ) < 13 || W.queryBox(x - 3, z - 3, x + 3, z + 3).length || W.viperNear(x, z, 6)) continue;
    if ((x > 768 && x < 808 && z > 220 && z < 252) || (x > 700 && x < 770 && z < 102) || (x > 796 && x < 820 && z > 115 && z < 165)) continue;
    const t = { x, z, type: rnd() < 0.25 ? 'pine' : 'round', s: 0.75 + rnd() * 0.4, park: true };
    t.col = W.addCircle(x, z, 0.45, 'tree'); t.col.destructible = { kind: 'tree', ref: t };
    W.trees.push(t); trees.push(t); n++;
  }
  const mesh = FP.build(S); mesh.geometry.computeBoundingSphere(); mesh.frustumCulled = true;
  F.rides = R;
}

/* the coaster: a closed spline sampled every half metre; rails and spine as tubes, ties instanced, supports batched */
function buildViper(R, FP) {
  const curve = new THREE.CatmullRomCurve3(VIPER.map(([x, y, z]) => new THREE.Vector3(x, y, z)), true, 'centripetal');
  const len = curve.getLength(), n = Math.ceil(len / 0.5), pts = curve.getSpacedPoints(n);
  const V = { len, n, ds: len / n, x: new Float32Array(n + 1), y: new Float32Array(n + 1), z: new Float32Array(n + 1) };
  pts.forEach((p, i) => { V.x[i] = p.x; V.y[i] = p.y; V.z[i] = p.z; });
  const frame = (i) => { const a = (i - 1 + n) % n, b = (i + 1) % n; let tx = V.x[b] - V.x[a], ty = V.y[b] - V.y[a], tz = V.z[b] - V.z[a]; const l = Math.hypot(tx, ty, tz) || 1; tx /= l; ty /= l; tz /= l; const h = Math.hypot(tx, tz) || 1; return { tx, ty, tz, lx: tz / h, lz: -tx / h }; };
  // rails either side, a fat spine underneath
  const rail = (side, drop) => { const p = []; for (let i = 0; i < n; i += 2) { const f = frame(i); p.push(new THREE.Vector3(V.x[i] + f.lx * side, V.y[i] - drop, V.z[i] + f.lz * side)); } return new THREE.CatmullRomCurve3(p, true); };
  const tube = (c, r, col) => { const m = new THREE.Mesh(new THREE.TubeGeometry(c, n, r, 6, true), lam(col)); m.castShadow = true; S.add(m); return m; };
  tube(rail(0.55, 0), 0.09, 0x2bd66b); tube(rail(-0.55, 0), 0.09, 0x2bd66b); tube(rail(0, 0.42), 0.2, 0x1b7f45);
  const ties = [], d = new THREE.Object3D(); d.rotation.order = 'YXZ';
  for (let i = 0; i < n; i += 3) ties.push(i);
  const tm = new THREE.InstancedMesh(new THREE.BoxGeometry(1.4, 0.12, 0.22), lam(0x495057), ties.length);
  ties.forEach((i, k) => { const f = frame(i); d.position.set(V.x[i], V.y[i] - 0.14, V.z[i]); d.rotation.set(-Math.asin(f.ty), Math.atan2(f.tx, f.tz), 0); d.updateMatrix(); tm.setMatrixAt(k, d.matrix); });
  tm.castShadow = true; tm.frustumCulled = false; S.add(tm);
  // supports: a column every 4 m, braced when tall; where the track runs low it's a barrier you have to go round
  for (let i = 0; i < n; i += 8) {
    const x = V.x[i], y = V.y[i], z = V.z[i], f = frame(i);
    if (y < 2.8) { W.addCollider(x - 1, z - 1, x + 1, z + 1, y + 0.4, 'rail', true); FP.box(x, (y - 0.5) / 2, z, 0.4, Math.max(0.1, y - 0.5), 0.4, '#e9ecef'); continue; }
    FP.box(x, (y - 0.6) / 2, z, 0.45, y - 0.6, 0.45, '#f8f9fa');
    W.addCollider(x - 0.3, z - 0.3, x + 0.3, z + 0.3, y, 'pillar', true);
    if (y > 12) for (const s of [-1, 1]) {
      const fx = x + f.lx * s * 3.2, fz = z + f.lz * s * 3.2;
      FP.beam(fx, 0, fz, x, y * 0.6, z, 0.25, '#dee2e6'); W.addCollider(fx - 0.25, fz - 0.25, fx + 0.25, fz + 0.25, 2.5, 'pillar', true);
    }
  }
  for (let i = 4; i < n; i += 8) if (V.y[i] < 2.8) W.addCollider(V.x[i] - 1, V.z[i] - 1, V.x[i] + 1, V.z[i] + 1, V.y[i] + 0.4, 'rail', true);
  // the station: a platform on the east side under a canopy
  FP.box(717, 0.15, 246, 6, 0.3, 40, '#adb5bd'); FP.box(715.5, 4.6, 246, 9, 0.3, 42, '#1b4332');
  for (const z of [227, 246, 265]) { FP.box(719.6, 2.3, z, 0.35, 4.6, 0.35, '#1b4332'); W.addCollider(719.4, z - 0.2, 719.8, z + 0.2, 4.6, 'pillar', true); }
  addSign(720.1, 5.5, 246, 'e', 'THE VIPER', '#1b4332', '#80ffdb', 9, 1.6, 'HOLD ON TIGHT');
  // the train: three cars, the first with a snake's head
  const cb = new PropBatch();
  cb.box(0, 0.42, 0, 1.6, 0.55, 2.3, '#2bd66b'); cb.box(0, 0.95, -0.85, 1.5, 0.6, 0.18, '#1b4332'); cb.box(0, 0.75, 0.5, 1.5, 0.2, 0.9, '#1b4332');
  cb.box(0.81, 0.6, 0, 0.06, 0.2, 2.3, '#ffd60a'); cb.box(-0.81, 0.6, 0, 0.06, 0.2, 2.3, '#ffd60a');
  const cm = cb.build(S); S.remove(cm);
  const cars = new THREE.InstancedMesh(cm.geometry, cm.material, 3); cars.castShadow = true; cars.frustumCulled = false; S.add(cars);
  const hb = new PropBatch(); hb.box(0, 0.7, 1.45, 1.2, 0.6, 0.9, '#2bd66b'); hb.box(0, 0.62, 2.05, 0.9, 0.35, 0.5, '#1b7f45'); hb.box(0.35, 0.98, 1.6, 0.18, 0.18, 0.18, '#ffd60a'); hb.box(-0.35, 0.98, 1.6, 0.18, 0.18, 0.18, '#ffd60a');
  const head = hb.build(S);
  // where it stops, where the chain lift lets go, and how much speed friction takes off on the way round
  let stop = 0, bd = 1e9, topI = 0; for (let i = 0; i < n; i++) { const q = dist(V.x[i], V.z[i], 712, 252); if (q < bd) { bd = q; stop = i; } if (i < n / 2 && V.y[i] > V.y[topI]) topI = i; }
  const sStop = stop * V.ds, sTop = topI * V.ds, sBrake = (sStop - 32 + len) % len, g = 9.81;
  const run = (sBrake - sTop + len) % len, E0 = 0.5 * 3.6 * 3.6 + g * V.y[topI], yB = V.y[Math.round(sBrake / V.ds) % n];
  const k = Math.max(0, (E0 - 0.5 * 9 * 9 - g * yB) / run);
  R.coaster = { V, cars, head, s: sStop, v: 0, state: 'load', dwell: 6, sStop, sTop, sBrake, E0, k, gap: 2.7, frame };
  W.viperNear = (x, z, r) => { for (let i = 0; i < n; i += 4) if (Math.abs(V.x[i] - x) < r && Math.abs(V.z[i] - z) < r) return true; return false; };
}

/* the rides move in the simulation step, so tests and the game see the same thing */
const Funland = {
  vAt(s) { const c = W.FUN.rides.coaster, V = c.V, f = (((s % V.len) + V.len) % V.len) / V.ds, i = Math.floor(f) % V.n, j = (i + 1) % V.n, t = f - Math.floor(f); return { x: V.x[i] + (V.x[j] - V.x[i]) * t, y: V.y[i] + (V.y[j] - V.y[i]) * t, z: V.z[i] + (V.z[j] - V.z[i]) * t, i }; },
  update(dt) {
    const R = W.FUN.rides; if (!R) return;
    // carousel and wheel turn steadily
    R.carousel.mesh.rotation.y -= dt * 0.55; R.carousel.canopy.rotation.y -= dt * 0.55;
    const w = R.wheel; w.ang = (w.ang + dt * 0.075) % TAU; w.mesh.rotation.x = w.ang;
    const m4 = this.m4 || (this.m4 = new THREE.Matrix4());
    for (let i = 0; i < w.n; i++) { const p = this.gondola(i); m4.makeTranslation(p.x, p.y, p.z); w.gond.setMatrixAt(i, m4); }
    w.gond.instanceMatrix.needsUpdate = true;
    // drop tower: load, a slow climb, a wait at the top, the fall, the brakes
    const D = R.drop, t = G.time % D.cycle, top = D.h - 6;
    let y = 1.4;
    if (t > 6 && t <= 22) y = 1.4 + (top - 1.4) * sstep(6, 22, t);
    else if (t > 22 && t <= 25) y = top;
    else if (t > 25 && t <= 27.4) y = top - 0.5 * 9.81 * (t - 25) ** 2;
    else if (t > 27.4 && t <= 30) { const y0 = top - 0.5 * 9.81 * 2.4 ** 2, k = (t - 27.4) / 2.6; y = 1.4 + (y0 - 1.4) * (1 - k) * (1 - k); }
    D.vy = (y - D.y) / Math.max(dt, 1e-4); D.y = y; D.mesh.position.y = y; D.loading = t <= 6 || t > 30;
    this.coaster(dt);
    this.carry();
  },
  /* ---- riding: walk up to a ride's boarding spot, F to get on, F to get off (or jump off mid-ride) ---- */
  RIDES: {
    viper: { name: 'the Viper', x: 718.5, z: 248, r: 3.4, ex: 719.5, ez: 251 },
    wheel: { name: 'the Sky Wheel', x: 802, z: 140, r: 4, ex: 800.5, ez: 140 },
    drop: { name: 'the Big Drop', x: 808.5, z: 290, r: 3.5, ex: 807.5, ez: 290 },
  },
  ready(kind) {
    const R = W.FUN.rides;
    if (kind === 'viper') return R.coaster.state === 'load' && R.coaster.dwell > 0.8;
    if (kind === 'drop') { const t = G.time % R.drop.cycle; return t < 5.2 || t > 30.5; }
    return true;
  },
  prompt(P) {
    if (!W.FUN.rides || !W.inFunland(P.x, P.z) || P.y > 0.5) return null;
    for (const k in this.RIDES) {
      const r = this.RIDES[k]; if (dist(P.x, P.z, r.x, r.z) > r.r) continue;
      if (!this.ready(k)) return { e: { id: 'ride', disabled: k === 'viper' ? 'The Viper is out on the track. Wait for it to pull in.' : 'Wait for the seats to come back down.' } };
      return { f: { label: 'Ride ' + r.name, run: () => this.board(k) } };
    }
    return null;
  },
  board(kind) {
    const P = G.player, R = W.FUN.rides; if (P.inCar || P.inHeli || P.ride || !this.ready(kind)) return false;
    let seat = 0;
    if (kind === 'wheel') { let lo = 1e9; for (let i = 0; i < R.wheel.n; i++) { const y = this.gondola(i).y; if (y < lo) { lo = y; seat = i; } } }
    if (kind === 'drop') { let best = -2; for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU, d = (Math.sin(a) * (P.x - R.drop.x) + Math.cos(a) * (P.z - R.drop.z)); if (d > best) { best = d; seat = i; } } }
    if (kind === 'viper') R.coaster.dwell = Math.max(R.coaster.dwell, 2);
    P.ride = { kind, seat }; P.vx = P.vz = P.kx = P.kz = 0; P.yv = 0; P.jumping = false; P.chute = false; P.vault = null; P.top = null; P.tumble = null;
    this.carry(); Sfx.whoosh(P.x, P.z);
    G.toast('Riding ' + this.RIDES[kind].name + '. F to get off (or jump off mid-ride).', 'good');
    return true;
  },
  /* where the rider sits right now, which way they face, how fast they're moving, and whether the ride is at rest */
  seat() {
    const P = G.player, r = P.ride, R = W.FUN.rides;
    if (r.kind === 'viper') {
      const c = R.coaster, p = c.pos, sp = Math.hypot(p.vx, p.vy, p.vz) || 1;
      return { x: p.x, y: Math.max(0, p.y - 0.05), z: p.z, facing: p.yaw, pitch: -Math.asin(clamp(p.vy / sp, -1, 1)) * (c.v > 0.1 ? 1 : 0), vx: p.vx, vy: p.vy, vz: p.vz, rest: c.state === 'load', pose: c.v > 9 ? 'scream' : 'sit' };
    }
    if (r.kind === 'wheel') { const g = this.gondola(r.seat); return { x: g.x, y: g.y - 0.55, z: g.z, facing: -Math.PI / 2, pitch: 0, vx: 0, vy: 0, vz: 0, rest: g.y < 4, pose: 'stand' }; }
    const D = R.drop, a = (r.seat / 8) * TAU;
    return { x: D.x + Math.sin(a) * 3, y: Math.max(0, D.y - 1.65), z: D.z + Math.cos(a) * 3, facing: a, pitch: 0, vx: 0, vy: D.vy, vz: 0, rest: D.loading, pose: D.vy < -4 ? 'scream' : 'sit' };
  },
  carry() {
    const P = G.player; if (!P.ride) return;
    if (P.down || G.respawning) { this.leave(true); return; }
    const s = this.seat(); P.x = s.x; P.z = s.z; P.y = s.y; P.facing = s.facing; P.vx = P.vz = P.kx = P.kz = 0; P.yv = 0; P.ride.s = s;
  },
  leaveLabel() { const P = G.player, s = this.seat(); return s.rest ? 'Get off ' + this.RIDES[P.ride.kind].name : 'Jump off ' + this.RIDES[P.ride.kind].name + (s.y > 8 ? (G.S.parachute > 0 ? ' (then SPACE: parachute)' : ' (long way down!)') : ''); },
  leave(knocked) {
    const P = G.player, r = P.ride; if (!r) return;
    const s = this.seat(), e = this.RIDES[r.kind]; P.ride = null; P.rig.root.rotation.x = 0;
    if (s.rest) { P.x = e.ex; P.z = e.ez; P.y = 0; P.yv = 0; P.top = null; P.jumping = false; W.collideCircle(P, P.r); return; }
    // off mid-ride: you carry the ride's speed and fall (the parachute works if you have one)
    P.x = s.x; P.z = s.z; P.y = s.y; P.kx = s.vx; P.kz = s.vz; P.yv = s.vy + (knocked ? 0 : 2.5); P.top = P.y; P.jumping = !knocked;
    if (!knocked) { Sfx.jump(P.x, P.z); if (P.y > 8) G.toast(G.S.parachute > 0 ? 'You jumped! Press SPACE to open your parachute.' : "You jumped — and you've no parachute!", 'warn'); }
  },
  gondola(i) { const w = W.FUN.rides.wheel, a = w.ang + (i / w.n) * TAU; return { x: w.x, y: w.y - w.r * Math.cos(a) - 2.1, z: w.z - w.r * Math.sin(a) }; },
  coaster(dt) {
    const c = W.FUN.rides.coaster, V = c.V, g = 9.81;
    if (c.state === 'load') { c.v = 0; c.trip = 0; c.dwell -= dt; if (c.dwell <= 0) c.state = 'run'; }
    else {
      // trip = metres since leaving the station: the chain pulls it to the top of the lift, gravity does the rest, brakes bring it home
      const chain = (c.sTop - c.sStop + V.len) % V.len, toStop = V.len - c.trip, p = this.vAt(c.s);
      let v;
      if (c.trip < chain) v = Math.min(3.6, c.v + 1.5 * dt);
      else v = Math.sqrt(Math.max(2.25, 2 * (c.E0 - c.k * (c.trip - chain) - g * p.y)));
      if (toStop < 32) v = Math.min(v, c.v, Math.max(0.6, Math.sqrt(2 * 1.6 * toStop)));
      c.v = v; c.trip += v * dt; c.s = (c.sStop + c.trip) % V.len;
      if (c.trip >= V.len - 0.05) { c.s = c.sStop; c.v = 0; c.state = 'load'; c.dwell = 7; }
    }
    // place the three cars along the track
    const d = this.d || (this.d = new THREE.Object3D()); d.rotation.order = 'YXZ';
    for (let k = 0; k < 3; k++) {
      const s = c.s - k * c.gap, p = this.vAt(s), q = this.vAt(s + 0.6), b = this.vAt(s - 0.6), tx = q.x - b.x, ty = q.y - b.y, tz = q.z - b.z, l = Math.hypot(tx, ty, tz) || 1;
      d.position.set(p.x, p.y, p.z); d.rotation.set(-Math.asin(ty / l), Math.atan2(tx, tz), 0); d.updateMatrix(); c.cars.setMatrixAt(k, d.matrix);
      if (k === 0) { c.head.position.copy(d.position); c.head.rotation.copy(d.rotation); c.pos = { x: p.x, y: p.y, z: p.z, yaw: Math.atan2(tx, tz), vx: tx / l * c.v, vy: ty / l * c.v, vz: tz / l * c.v }; }
    }
    c.cars.instanceMatrix.needsUpdate = true;
  },
};

/* People strolling a district's paths (Funland's avenues, Millbrook's sidewalks): spawned out of sight when you're
   near, wandering from node to node, stopping now and then; after a scare they head back to the nearest path. */
const Strollers = {
  areas: [],
  add(A) { A.list = Object.values(A.nodes); this.areas.push(A); return A; },
  populate(t, only) {
    let made = null;
    for (const A of this.areas) {
      if ((only && A !== only) || !A.links.length || dist(t.x, t.z, A.cx, A.cz) > A.R + 280) continue;
      let n = 0; for (const p of G.npcs) if (!p.dead && p.ai && p.ai.area === A) n++;
      if (n >= A.cap) continue;
      for (let k = 0; k < 8; k++) {
        const [a, b] = pick(A.links), u = rand(0.1, 0.9), x = a.x + (b.x - a.x) * u, z = a.z + (b.z - a.z) * u, d = dist(x, z, t.x, t.z);
        if (d < 18 || (G.canSee(x, z, 1) && d < 150)) continue; // they walk in from somewhere you aren't looking (or far off)
        const p = spawnPed(x, z, W.nearestBlock(x, z), 1, 1);
        Object.assign(p.ai, { mode: 'park', park: true, area: A, node: a, prev: b, waitT: rand(0, 2), speed: rand(1.1, 1.6), tx: a.x, tz: a.z }); // first along this path to its end
        made = p; break;
      }
    }
    return made;
  },
  keep(p, t) { const A = p.ai.area; return !!A && dist(t.x, t.z, A.cx, A.cz) < A.R + 320; },
  nextTarget(p) {
    const a = p.ai, at = a.node; if (!at) return this.resume(p);
    const opts = at.links.length > 1 ? at.links.filter((l) => l !== a.prev) : at.links, nb = pick(opts);
    a.prev = at; a.node = nb;
    const horiz = Math.abs(nb.z - at.z) < 1, j = rand(-1, 1) * Math.min(nb.w || 1.6, at.w || 1.6);
    a.tx = nb.x + (horiz ? 0 : j); a.tz = nb.z + (horiz ? j : 0);
    if (chance(0.45)) a.waitT = rand(1, 6);
  },
  resume(p) {
    const a = p.ai, list = (a.area && a.area.list) || []; let best = null, bd = 1e9;
    for (const nd of list) { const d = dist(p.x, p.z, nd.x, nd.z); if (d < bd) { bd = d; best = nd; } }
    if (!best) { a.park = false; a.mode = 'walk'; a.block = W.nearestBlock(p.x, p.z); pedTarget(p); return; }
    if (bd > 25) { a.lost = true; a.mode = 'park'; a.node = best; a.tx = p.x; a.tz = p.z; a.waitT = 999; return; } // too far to find the way back
    a.mode = 'park'; a.node = best; a.prev = null; a.tx = best.x; a.tz = best.z; a.waitT = 0;
  },
};

/* ---------------- Millbrook: a farm village on Orchard Road ----------------
   Main Street runs south off Orchard Road: Dot's Diner, the Mercantile and a gas station to rob, a post office, a
   white church with a steeple, houses behind picket fences, a water tower, grain silos and a red barn. */
function buildMillbrook(trees) {
  const M = W.MILL, mx = M.x, FP = new PropBatch(), wf = mx - 12, ef = mx + 12; // west and east building fronts
  W.FLAT.push({ minX: M.minX - 5, maxX: M.maxX + 5, minZ: M.minZ - 12, maxZ: M.maxZ + 5, pad: 8 });
  GB.sidewalk.rect(wf, M.minZ, mx - 6, -347, 0.05, 6); GB.sidewalk.rect(mx + 6, M.minZ, ef, -347, 0.05, 6);
  GB.plaza.rect(mx - 22, -347, mx + 22, M.maxZ, 0.05, 8);
  const sign = (x, y, z, face, text, bg, fg, w, h, sub) => { const [nx, nz] = FACE_N[face]; FP.box(x - nx * 0.1, y, z - nz * 0.1, nx ? 0.2 : w + 0.4, h + 0.3, nz ? 0.2 : w + 0.4, bg); addSign(x + nx * 0.02, y, z + nz * 0.02, face, text, bg, fg, w, h, sub); };
  // --- west side, fronts on x = wf, facing east ---
  addBuilding(wf - 9, -432, 18, 12, 4.6, 'stucco', { color: '#eef4f2' }); // Dot's Diner
  FP.box(wf + 0.05, 3.5, -432, 0.1, 0.45, 12, '#d62828'); FP.box(wf + 0.05, 1.9, -432, 0.1, 1.3, 9, '#a9d6e5'); FP.box(wf + 0.06, 1.2, -427.8, 0.12, 2.3, 1.2, '#7a2f1f');
  sign(wf + 0.1, 5.5, -432, 'e', "DOT'S DINER", '#d62828', '#fff8e7', 9, 1.5, 'EATS · PIE · COFFEE');
  const diner = makeRob('diner', 'store', "Dot's Diner", wf + 2, -429, { hold: 4, cash: [260, 520], base: 0, cool: 160 });
  addAlarm(diner, wf - 9, -438.05, 'n'); addCam(diner, wf + 0.1, -437, 'e', 0.35, 13);
  addBuilding(wf - 10, -405, 20, 16, 6.5, 'brick'); // the Mercantile
  FP.box(wf + 0.9, 3.3, -405, 1.8, 0.18, 12, '#2a6f4f'); FP.box(wf + 0.05, 1.7, -405, 0.1, 1.6, 10, '#a9d6e5');
  sign(wf + 0.1, 5.2, -405, 'e', 'MERCANTILE', '#2a6f4f', '#fdf0d5', 11, 1.4, 'MILLBROOK GENERAL STORE · EST. 1891');
  const merc = makeRob('mercantile', 'store', 'Millbrook Mercantile', wf + 2, -402, { hold: 4.5, cash: [380, 700], base: 1, cool: 180 });
  addAlarm(merc, wf - 10, -413.05, 'n'); addCam(merc, wf + 0.1, -412, 'e', 0.3, 13); addCam(merc, wf + 0.1, -398, 'e', -0.3, 13);
  addBuilding(wf - 9, -380, 18, 12, 5, 'stucco'); // post office
  sign(wf + 0.1, 3.8, -380, 'e', 'POST OFFICE', '#1d3557', '#ffffff', 7, 1.1); FP.box(wf + 2.5, 4, -373, 0.12, 8, 0.12, '#cfd4d9'); FP.box(wf + 2.5, 7.3, -372.2, 0.05, 1, 1.5, '#c1121f');
  addBuilding(wf - 12, -358, 18, 14, 8, 'stucco', { color: '#f4f1ea' }); // the church, its steeple at the front
  const sx = wf - 4.5;
  FP.box(sx, 11, -358, 4, 6, 4, '#f4f1ea'); FP.box(sx, 14.4, -358, 4.4, 0.8, 4.4, '#8d99ae'); FP.box(sx, 16.5, -358, 2.6, 3.4, 2.6, '#f4f1ea');
  for (let i = 0; i < 4; i++) FP.box(sx, 18.6 + i * 1.3, -358, 2.2 - i * 0.5, 1.3, 2.2 - i * 0.5, '#5c677d'); FP.box(sx, 24.4, -358, 0.15, 1.6, 0.15, '#d4af37'); FP.box(sx, 24.6, -358, 0.15, 0.15, 0.8, '#d4af37');
  FP.box(wf - 2.95, 2, -358, 0.1, 4, 2.4, '#6b4226');
  W.tallProps.push({ minX: sx - 2.5, maxX: sx + 2.5, minZ: -360.5, maxZ: -355.5, h: 25 });
  // --- east side, fronts on x = ef, facing west ---
  // the gas station on the corner: a canopy over two pumps (they explode), the shop behind
  GB.asphalt.rect(ef, M.minZ, ef + 46, -428, 0.04, 12);
  FP.box(ef + 15, 5.2, -442, 24, 0.5, 16, '#e8e8e8'); FP.box(ef + 15, 5.55, -442, 24.2, 0.25, 16.2, '#bc4749');
  for (const [dx, dz] of [[5, -448], [25, -448], [5, -436], [25, -436]]) { FP.box(ef + dx, 2.5, dz, 0.5, 5, 0.5, '#cfcfcf'); W.addCircle(ef + dx, dz, 0.4, 'pillar'); }
  for (const dx of [10, 20]) {
    const pm = new THREE.Mesh(new THREE.BoxGeometry(1, 1.6, 0.8), lam('#bc4749')); pm.position.set(ef + dx, 0.8, -442); pm.castShadow = true; S.add(pm);
    const c = W.addCollider(ef + dx - 0.5, -442.4, ef + dx + 0.5, -441.6, 1.6, 'prop', true); c.destructible = { kind: 'pump', ref: pm, x: ef + dx, z: -442 };
  }
  addBuilding(ef + 38, -440, 12, 12, 4.5, 'stucco', { color: '#d9d2c3' });
  sign(ef + 31.9, 3.9, -440, 'w', 'MILLBROOK FUEL', '#bc4749', '#ffffff', 7, 1.2); FP.box(ef + 31.95, 1.7, -440, 0.1, 1.5, 6, '#a9d6e5');
  const fuel = makeRob('millfuel', 'store', 'Millbrook Fuel', ef + 30, -438, { hold: 3.5, cash: [220, 420], base: 0, cool: 150 });
  addAlarm(fuel, ef + 38, -446.05, 'n'); addCam(fuel, ef + 31.9, -445, 'w', -0.3, 13);
  // houses behind white picket fences
  const house = (x, z, face, style, col) => {
    const [nx, nz] = FACE_N[face], w = nx ? 9 : 10, d = nx ? 10 : 9;
    addBuilding(x, z, w, d, 5, style, col ? { color: col } : undefined);
    FP.box(x + nx * (w / 2 + 1.2), 2.6, z + nz * (d / 2 + 1.2), nx ? 2.4 : w, 0.2, nz ? 2.4 : d, '#6b4226'); // porch roof
    for (const s of [-1, 1]) FP.box(x + nx * (w / 2 + 2.3) + (nx ? 0 : s * (w / 2 - 0.3)), 1.3, z + nz * (d / 2 + 2.3) + (nz ? 0 : s * (d / 2 - 0.3)), 0.2, 2.6, 0.2, '#f1faee');
    const fx = x + nx * (w / 2 + 5), fz = z + nz * (d / 2 + 5), half = (nx ? d : w) / 2 + 2;
    for (const s of [-1, 1]) {
      const a0 = s * 1.4, a1 = s * half, x0 = nx ? fx : x + a0, x1 = nx ? fx : x + a1, z0 = nx ? z + a0 : fz, z1 = nx ? z + a1 : fz;
      FP.box((x0 + x1) / 2, 0.45, (z0 + z1) / 2, Math.max(0.1, Math.abs(x1 - x0)), 0.9, Math.max(0.1, Math.abs(z1 - z0)), '#f1faee');
      W.addCollider(Math.min(x0, x1) - 0.1, Math.min(z0, z1) - 0.1, Math.max(x0, x1) + 0.1, Math.max(z0, z1) + 0.1, 0.9, 'fence', true);
    }
  };
  house(ef + 8, -408, 'w', 'cabin'); house(ef + 8, -384, 'w', 'stucco', '#e9d8a6'); house(ef + 30, -398, 'w', 'brick');
  house(585, -385, 's', 'stucco', '#cde7d8'); house(605, -360, 'e', 'cabin'); house(565, -362, 's', 'stucco');
  // the water tower (MILLBROOK on the tank)
  const tx = 712, tz = -372;
  for (const [ax, az] of [[-4, -4], [4, -4], [-4, 4], [4, 4]]) { FP.beam(tx + ax, 0, tz + az, tx + ax * 0.6, 18, tz + az * 0.6, 0.5, '#8d99ae'); W.addCollider(tx + ax - 0.4, tz + az - 0.4, tx + ax + 0.4, tz + az + 0.4, 18, 'pillar', true); }
  const tank = new THREE.Mesh(new THREE.CylinderGeometry(5, 5, 7, 20), lam(0xb8c0c8)); tank.position.set(tx, 21.5, tz); tank.castShadow = true; S.add(tank);
  const tcap = new THREE.Mesh(new THREE.ConeGeometry(5.3, 2.4, 20), lam(0x8d99ae)); tcap.position.set(tx, 26.2, tz); S.add(tcap);
  addSign(tx - 5.05, 21.5, tz, 'w', 'MILLBROOK', '#b8c0c8', '#1d3557', 7, 1.6);
  W.tallProps.push({ minX: tx - 5.5, maxX: tx + 5.5, minZ: tz - 5.5, maxZ: tz + 5.5, h: 28 });
  // grain silos and a red barn on the farm side
  for (const x of [583, 594]) {
    const si = new THREE.Mesh(new THREE.CylinderGeometry(4, 4, 15, 18), lam(0xc9ced3)); si.position.set(x, 7.5, -440); si.castShadow = true; S.add(si);
    const sc = new THREE.Mesh(new THREE.ConeGeometry(4.2, 2.5, 18), lam(0x9aa3a8)); sc.position.set(x, 16.2, -440); S.add(sc);
    W.addCircle(x, -440, 4, 'column').h = 15;
  }
  W.tallProps.push({ minX: 578, maxX: 599, minZ: -445, maxZ: -435, h: 17 });
  addBuilding(565, -412, 16, 20, 9, 'cabin', { color: '#a4302a' }); FP.box(565, 9.6, -412, 16.4, 1.2, 20.4, '#5a4636'); FP.box(573.1, 3.5, -412, 0.1, 6, 6, '#f1faee');
  // lamps and trees along Main Street, benches by the square, a gazebo in it
  for (let z = M.minZ + 8; z < -350; z += 20) for (const s of [-1, 1]) { const x = mx + s * 6.6; FP.box(x, 2.2, z, 0.16, 4.4, 0.16, '#343a40'); FP.box(x, 4.45, z, 0.6, 0.25, 0.6, '#ffe8a3'); W.addCollider(x - 0.15, z - 0.15, x + 0.15, z + 0.15, 4.4, 'pillar', true); }
  for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU; FP.box(mx + Math.cos(a) * 3, 1.4, -340 + Math.sin(a) * 3, 0.2, 2.8, 0.2, '#f1faee'); }
  for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU; FP.box(mx + Math.cos(a) * 2.2, 3, -340 + Math.sin(a) * 2.2, 2.6, 0.25, 1.2, '#2a6f4f', -a + Math.PI / 2); }
  FP.box(mx, 3.4, -340, 1.2, 0.8, 1.2, '#2a6f4f'); W.addCircle(mx, -340, 3.2, 'column').h = 3;
  for (const s of [-1, 1]) FP.box(mx + s * 12, 0.45, -340, 0.6, 0.12, 2.2, '#9c6644');
  for (let k = 0, n = 0; k < 400 && n < 34; k++) {
    const x = M.minX + 4 + rnd() * (M.maxX - M.minX - 8), z = M.minZ + 4 + rnd() * (M.maxZ - M.minZ - 8);
    if (Math.abs(x - mx) < 15 || (z > -350) || W.queryBox(x - 4, z - 4, x + 4, z + 4).length || W.buildings.some((b) => x > b.minX - 4 && x < b.maxX + 4 && z > b.minZ - 4 && z < b.maxZ + 4)) continue;
    if (x > ef - 2 && x < ef + 48 && z < -426) continue; // the gas station forecourt
    const t = { x, z, type: rnd() < 0.3 ? 'pine' : 'round', s: 0.8 + rnd() * 0.4, park: true };
    t.col = W.addCircle(x, z, 0.45, 'tree'); t.col.destructible = { kind: 'tree', ref: t };
    W.trees.push(t); trees.push(t); n++;
  }
  // the sidewalks people stroll, crossing Main Street twice, and the square
  const nodes = {}, N = (k, x, z, w) => (nodes[k] = { k, x, z, links: [], w: w || 1.2 });
  for (const [s, x] of [['w', mx - 9], ['e', mx + 9]]) for (const z of [-448, -420, -392, -368, -349]) N(s + z, x, z);
  N('sqW', mx - 14, -340, 2); N('sqE', mx + 14, -340, 2); N('sqS', mx, -334.6, 1);
  const links = [], link = (a, b) => { nodes[a].links.push(nodes[b]); nodes[b].links.push(nodes[a]); links.push([nodes[a], nodes[b]]); };
  for (const s of ['w', 'e']) { link(s + -448, s + -420); link(s + -420, s + -392); link(s + -392, s + -368); link(s + -368, s + -349); }
  link('w-420', 'e-420'); link('w-368', 'e-368'); link('w-349', 'sqW'); link('e-349', 'sqE'); link('sqW', 'sqS'); link('sqS', 'sqE');
  M.area = Strollers.add({ name: 'millbrook', cx: mx, cz: (M.minZ + M.maxZ) / 2, R: 90, cap: 12, nodes, links });
  W.places.millbrook = { id: 'millbrook', name: 'Millbrook', x: mx, z: -470 };
  W.districtLabels.push({ x: mx, z: M.maxZ + 18, text: 'MILLBROOK', col: '#f1e3c4' });
  const mesh = FP.build(S); mesh.geometry.computeBoundingSphere(); mesh.frustumCulled = true;
}

/* ---------------- the badlands: saguaro cacti and red boulders across the mesas ----------------
   Placed once the hills exist (they sit on the slopes), from their own random stream. Cars flatten cacti. */
W.cacti = []; W.rocks = [];
function buildBadlands() {
  if (!W.biomeAt || !W.HILLS) return;
  const saved = rnd; rnd = mulberry32(777);
  for (let k = 0; k < 9000 && (W.cacti.length < 420 || W.rocks.length < 260); k++) {
    const x = 330 + rnd() * (W.OUT - 345), z = -W.OUT + 12 + rnd() * (W.OUT - 482);
    if (W.biomeAt(x, z).bad < 0.55 || W.inReserve(x, z, 4) || W.nearCountyRoad(x, z, 10) || W.queryBox(x - 2.5, z - 2.5, x + 2.5, z + 2.5).length) continue;
    if (W.RAMPS.some((r) => dist(x, z, r.x, r.z) < 40)) continue;
    if (rnd() < 0.6) { if (W.cacti.length < 420) W.cacti.push({ x, z, s: 0.7 + rnd() * 0.7, r: rnd() * TAU, v: rnd() < 0.5 ? 0 : 1 }); }
    else if (W.rocks.length < 260) W.rocks.push({ x, z, s: 0.5 + rnd() * 1.4, r: rnd() * TAU });
  }
  // two cactus shapes (one arm, two arms), and a lumpy boulder
  const shape = (arms) => {
    const b = new PropBatch(), g = '#3e7d3a', dk = '#356b32';
    b.box(0, 2.1, 0, 0.55, 4.2, 0.55, g); b.box(0, 4.25, 0, 0.42, 0.15, 0.42, dk);
    b.box(0.55, 1.7, 0, 0.6, 0.38, 0.38, g); b.box(0.75, 2.45, 0, 0.38, 1.5, 0.38, g);
    if (arms > 1) { b.box(-0.5, 2.4, 0, 0.5, 0.36, 0.36, g); b.box(-0.68, 3.0, 0, 0.36, 1.2, 0.36, g); }
    const m = b.build(S); S.remove(m); return m;
  };
  const d = new THREE.Object3D(), col = new THREE.Color(), bounds = (list) => { let x0 = 1e9, z0 = 1e9, x1 = -1e9, z1 = -1e9, y1 = 0; for (const t of list) { x0 = Math.min(x0, t.x); z0 = Math.min(z0, t.z); x1 = Math.max(x1, t.x); z1 = Math.max(z1, t.z); y1 = Math.max(y1, W.groundAt(t.x, t.z)); } return new THREE.Sphere(new THREE.Vector3((x0 + x1) / 2, y1 / 2, (z0 + z1) / 2), Math.hypot(x1 - x0, z1 - z0, y1) / 2 + 8); };
  for (const v of [0, 1]) {
    const list = W.cacti.filter((c) => c.v === v); if (!list.length) continue;
    const base = shape(v + 1), im = new THREE.InstancedMesh(base.geometry, base.material, list.length);
    list.forEach((c, i) => {
      d.position.set(c.x, W.groundAt(c.x, c.z) - 0.05, c.z); d.rotation.set(0, c.r, 0); d.scale.setScalar(c.s); d.updateMatrix(); im.setMatrixAt(i, d.matrix);
      c.im = im; c.i = i;
      const cl = W.addCircle(c.x, c.z, 0.35 * c.s, 'cactus'); cl.h = 4.2 * c.s; cl.destructible = { kind: 'cactus', ref: c, x: c.x, z: c.z };
    });
    im.geometry = im.geometry.clone(); im.geometry.boundingSphere = bounds(list); im.frustumCulled = true; im.castShadow = true; im.receiveShadow = true; S.add(im);
  }
  if (W.rocks.length) {
    const rg = new THREE.IcosahedronGeometry(1, 0), pa = rg.attributes.position, rr = mulberry32(31);
    const jit = new Map(); for (let i = 0; i < pa.count; i++) { const key = pa.getX(i).toFixed(3) + pa.getY(i).toFixed(3) + pa.getZ(i).toFixed(3); if (!jit.has(key)) jit.set(key, 0.8 + rr() * 0.4); const k = jit.get(key); pa.setXYZ(i, pa.getX(i) * k, pa.getY(i) * k * 0.7, pa.getZ(i) * k); }
    rg.computeVertexNormals();
    const im = new THREE.InstancedMesh(rg, new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true }), W.rocks.length);
    W.rocks.forEach((r, i) => {
      d.position.set(r.x, W.groundAt(r.x, r.z) + 0.25 * r.s, r.z); d.rotation.set(0, r.r, 0); d.scale.setScalar(r.s); d.updateMatrix(); im.setMatrixAt(i, d.matrix);
      im.setColorAt(i, col.set(pick(['#9c5b3c', '#a8673f', '#8a4f35', '#b07a52'])));
      W.addCircle(r.x, r.z, 0.85 * r.s, 'rock').h = 0.95 * r.s;
    });
    im.geometry.boundingSphere = bounds(W.rocks); im.frustumCulled = true; im.castShadow = true; im.receiveShadow = true; S.add(im);
  }
  rnd = saved;
}

/* ---------------- the Bay River Dam ----------------
   Built once the hills exist: the wall spans the canyon wherever the ground is below its crest, so its ends run into
   the canyon walls. The crest is ground (W.damAt): drive or walk along it between the parapets. The downstream face
   is solid; the spillway pours down the middle into the river. */
function buildDam() {
  const D = W.DAM; if (!D || !W.HILLS) return;
  let x0 = D.x, x1 = D.x; while (x0 > D.x - 160 && W.terrainAt(x0 - 1, D.z) < D.crest - 0.3) x0--; while (x1 < D.x + 160 && W.terrainAt(x1 + 1, D.z) < D.crest - 0.3) x1++;
  D.x0 = x0 - 1; D.x1 = x1 + 1;
  const FP = new PropBatch(), conc = '#bdb8ad', dark = '#a29d92';
  for (let x = D.x0; x < D.x1; x += 2) {
    const g = Math.min(W.terrainAt(x, D.z - 4), W.terrainAt(x + 2, D.z - 4), W.terrainAt(x, D.z + 4), W.terrainAt(x + 2, D.z + 4)) - 1.5, h = D.crest - g;
    if (h <= 0.2) continue;
    FP.box(x + 1, g + h / 2, D.z, 2.02, h, D.half * 2, x % 8 < 2 ? dark : conc);
    // a stepped buttress down the downstream face
    for (let s = 1; s <= 3; s++) { const top = D.crest - s * 4.5; if (top <= g) break; FP.box(x + 1, g + (top - g) / 2, D.z + D.half + s * 2 - 1, 2.02, top - g, 2, conc); }
  }
  for (const s of [-1, 1]) {
    FP.box((D.x0 + D.x1) / 2, D.crest + 0.55, D.z + s * (D.half - 0.2), D.x1 - D.x0, 1.1, 0.4, '#d6d2c8');
    W.addCollider(D.x0, D.z + s * (D.half - 0.2) - 0.25, D.x1, D.z + s * (D.half - 0.2) + 0.25, 1.1, 'fence');
  }
  for (let x = D.x0 + 6; x < D.x1 - 4; x += 16) for (const s of [-1, 1]) { FP.box(x, D.crest + 2.2, D.z + s * (D.half - 0.2), 0.16, 4.4, 0.16, '#5c677d'); FP.box(x, D.crest + 4.4, D.z + s * (D.half - 0.6), 0.5, 0.2, 0.9, '#ffe8a3'); }
  FP.box(D.x, D.crest + 3.5, D.z + 1.5, 6, 3.5, 3, '#8d99ae'); FP.box(D.x, D.crest + 5.4, D.z + 1.5, 6.6, 0.4, 3.6, '#5c677d'); // the gatehouse
  // the downstream face is a wall (the crest is reached from the canyon rims)
  W.addCollider(D.x0, D.z + D.half, D.x1, D.z + D.half + 6.5, D.crest + 1, 'building');
  // the spillway: a chute of churning white water from the crest down to the river
  const cv = document.createElement('canvas'); cv.width = 64; cv.height = 128; const g2 = cv.getContext('2d'), rr = mulberry32(17);
  g2.fillStyle = '#cfe8f2'; g2.fillRect(0, 0, 64, 128); for (let i = 0; i < 260; i++) { g2.fillStyle = rr() < 0.5 ? '#ffffff' : '#9fc9db'; g2.fillRect(rr() * 64, rr() * 128, 2 + rr() * 6, 4 + rr() * 14); }
  const tex = new THREE.CanvasTexture(cv); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(1, 3);
  const run = 18, chute = new THREE.Mesh(new THREE.PlaneGeometry(9, Math.hypot(run, D.crest)), new THREE.MeshBasicMaterial({ map: tex }));
  chute.position.set(D.x, D.crest / 2 + 0.3, D.z + D.half + run / 2); chute.rotation.x = -Math.PI / 2 + Math.atan2(D.crest, run); S.add(chute);
  for (const s of [-1, 1]) FP.box(D.x + s * 5, D.crest / 2, D.z + D.half + run / 2, 0.8, 2, Math.hypot(run, D.crest), conc);
  D.spill = { tex, x: D.x, z: D.z + D.half + run };
  // the reservoir: water at 14 m filling the basin up to the rim, which hides its edge
  const wm = new THREE.MeshLambertMaterial({ color: 0x3477a0 }); W.markWater(wm);
  const res = new THREE.Mesh(new THREE.CircleGeometry(1, 72), wm); res.rotation.x = -Math.PI / 2; res.scale.set(D.rx * 1.14, D.rz * 1.14, 1); res.position.set(D.cx, D.water, D.cz); res.receiveShadow = true; S.add(res);
  for (let x = D.cx - D.rx; x <= D.cx + D.rx; x += 18) for (let z = D.cz - D.rz; z <= D.cz + D.rz; z += 18) {
    const r = 13, ex = Math.abs(x - D.cx) + r, ez = Math.abs(z - D.cz) + r; // keep each circle inside the shoreline
    if ((ex / D.rx) ** 2 + (ez / D.rz) ** 2 < 1.12 || ((x - D.cx) / D.rx) ** 2 + ((z - D.cz) / D.rz) ** 2 < 0.9) W.addCircle(x, z, r, 'water').h = 0.6;
  }
  const mesh = FP.build(S); mesh.geometry.computeBoundingSphere(); mesh.frustumCulled = true;
  W.places.dam = { id: 'dam', name: 'Bay River Dam', x: D.x, z: D.z };
  W.districtLabels.push({ x: D.x, z: D.cz, text: 'RESERVOIR', col: '#bfe3f2' }, { x: D.x, z: D.z + 30, text: 'BAY RIVER DAM', col: '#e0ddd4' });
}
const Dam = {
  t: 0,
  update(dt) {
    const S2 = W.DAM && W.DAM.spill; if (!S2) return;
    S2.tex.offset.y -= dt * 1.6;
    const t = G.body(); if (dist(t.x, t.z, S2.x, S2.z) > 260) return;
    this.t -= dt; if (this.t > 0) return; this.t = 0.08;
    Puffs.add(S2.x + rand(-4, 4), 0.6, S2.z + rand(-1, 3), rand(-0.8, 0.8), rand(0.6, 1.4), rand(0.5, 1.8), 1.6, 3, 2.2, '#f2f8fb', 0.35, 0.4); // spray where it hits the river
  },
};

/* the park on the minimap: lawn, paths, the coaster's loop, the wheel */
W.drawDistrictsMap = function (g, X, Z, k) {
  const F = W.FUN; if (!F.rides) return;
  g.fillStyle = '#5c8f4a'; g.fillRect(X(F.minX), Z(F.minZ), (F.maxX - F.minX) * k, (F.maxZ - F.minZ) * k);
  g.fillStyle = '#6f6d68'; g.fillRect(X(745), Z(30), 61 * k, 44 * k);
  g.fillStyle = '#d8cdb5';
  const R = (x0, z0, x1, z1) => g.fillRect(X(x0), Z(z0), (x1 - x0) * k, (z1 - z0) * k);
  R(F.gate - 32, F.minZ, F.gate + 32, 112); R(F.gate - 7, 112, F.gate + 7, F.maxZ); R(F.minX, 184, F.maxX - 4, 198);
  R(694, 137, F.gate, 143); R(F.gate, 137, 802, 143); R(722, 243, F.gate, 249); R(F.gate, 287, 808, 293);
  const V = F.rides.coaster.V; g.strokeStyle = '#2bd66b'; g.lineWidth = Math.max(1.5, 2 * k); g.beginPath();
  for (let i = 0; i <= V.n; i += 4) { const j = i % V.n; i ? g.lineTo(X(V.x[j]), Z(V.z[j])) : g.moveTo(X(V.x[j]), Z(V.z[j])); } g.closePath(); g.stroke();
  g.fillStyle = '#e63946'; g.beginPath(); g.arc(X(684), Z(140), 9.7 * k, 0, TAU); g.fill();
  g.fillStyle = '#ff5d8f'; g.fillRect(X(805), Z(121), 6 * k, 38 * k); g.fillStyle = '#7209b7'; g.fillRect(X(771), Z(223), 34 * k, 26 * k);
  g.fillStyle = '#e63946'; g.fillRect(X(813), Z(288), 4 * k, 4 * k);
  g.strokeStyle = '#f1faee'; g.lineWidth = 1; g.strokeRect(X(F.minX), Z(F.minZ), (F.maxX - F.minX) * k, (F.maxZ - F.minZ) * k);
  // Millbrook: sidewalks, the square, the gas station forecourt, the water tower and silos
  const M = W.MILL, mx = M.x;
  g.fillStyle = '#b8b2a6'; R(mx - 12, M.minZ, mx - 6, -347); R(mx + 6, M.minZ, mx + 12, -347); g.fillStyle = '#d8cdb5'; R(mx - 22, -347, mx + 22, M.maxZ);
  g.fillStyle = '#6f6d68'; R(mx + 12, M.minZ, mx + 58, -428);
  g.fillStyle = '#b8c0c8'; g.beginPath(); g.arc(X(712), Z(-372), 5 * k, 0, TAU); g.fill();
  g.fillStyle = '#c9ced3'; for (const x of [583, 594]) { g.beginPath(); g.arc(X(x), Z(-440), 4 * k, 0, TAU); g.fill(); }
  // the reservoir and the dam
  const D = W.DAM;
  if (D && D.x1) { g.fillStyle = '#2c6f93'; g.beginPath(); g.ellipse(X(D.cx), Z(D.cz), D.rx * 1.05 * k, D.rz * 1.05 * k, 0, 0, TAU); g.fill(); g.fillStyle = '#d6d2c8'; R(D.x0, D.z - D.half, D.x1, D.z + D.half + 4); }
  // cacti and boulders out in the badlands
  g.fillStyle = '#4c7a3a'; for (const c of W.cacti) g.fillRect(X(c.x) - 1, Z(c.z) - 1, 2, 2);
  g.fillStyle = '#8a4f35'; for (const r of W.rocks) { g.beginPath(); g.arc(X(r.x), Z(r.z), Math.max(1, r.s * k), 0, TAU); g.fill(); }
};
