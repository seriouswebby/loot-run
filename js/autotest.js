'use strict';
/* Headless self-test: open index.html?autotest — steps the simulation with scripted input and reports PASS/FAIL. */

function runDiag() {
  const el = $('autotest'); el.hidden = false; const P = G.player, lines = [];
  startGame(null); G.god = true;
  P.x = 0; P.z = 25; G.crumbs = [];
  Heat.add(5, 5, 'diag');
  for (let s = 0; s < 24; s += 2) {
    for (let i = 0; i < 120; i++) { G.interact = computeInteract(); step(STEP); }
    const cops = G.npcs.filter((n) => n.kind === 'cop' && !n.dead);
    const pcs = G.cars.filter((c) => c.police && !c.dead);
    lines.push(`t=${s + 2} heat=${Heat.level} seenT=${Heat.seenT.toFixed(1)} evade=${Heat.evade.toFixed(1)}/${Heat.need.toFixed(1)} zone=${G.playerZone}`);
    lines.push('  cops: ' + cops.map((c) => `${c.ai.mode}${c.ai.sees ? '*' : ''}@${dist(c.x, c.z, P.x, P.z).toFixed(0)}${c.ai.nav ? 'n' : ''}`).join(' '));
    lines.push('  cars: ' + pcs.map((c) => `${c.ai ? c.ai.mode : 'none'}@${dist(c.x, c.z, P.x, P.z).toFixed(0)} v${c.v.toFixed(0)} node${c.ai && c.ai.node}`).join(' '));
  }
  el.textContent = lines.join('\n'); document.title = 'DIAG DONE';
}

function runAutotest() {
  if (new URLSearchParams(location.search).has('diag')) return runDiag();
  const out = [], el = $('autotest'); el.hidden = false;
  const P = G.player;
  const steps = (sec) => { const n = Math.round(sec / STEP); for (let i = 0; i < n; i++) { G.interact = computeInteract(); step(STEP); } };
  const ONLY = new URLSearchParams(location.search).get('only'), onlyRe = ONLY ? new RegExp(ONLY) : null;
  const T = (name, fn) => {
    if (onlyRe && !onlyRe.test(name)) return;
    try { const r = fn(); out.push((r === true ? 'PASS ' : r === 'SKIP' ? 'SKIP ' : 'FAIL ') + name + (typeof r === 'string' && r !== 'SKIP' ? ' — ' + r : '')); }
    catch (e) { out.push('FAIL ' + name + ' — EXC ' + e.message + ' ' + ((e.stack || '').split('\n')[1] || '').trim()); }
  };
  const tp = (x, z) => { if (P.inCar) G.exitCar(true); P.x = x; P.z = z; P.kx = P.kz = 0; P.vx = P.vz = 0; zoneT = 0; G.crumbs = []; G.interact = computeInteract(); };
  const hold = (sec) => { Input.keys.KeyE = true; steps(sec); Input.keys.KeyE = false; steps(STEP * 2); };
  const reset = () => { Phys.clearRagdolls(); if (P.inCar) G.exitCar(true); if (P.inHeli) G.exitHeli(true); for (const c of G.cars) if (!c.persistent && !c.mission) c.remove(); G.cars = G.cars.filter((c) => !c.dead); Weather.set('clear', true); Ordnance.c4.length = 0; Heat.clear(); clearPolice(); G.respawning = false; P.down = false; P.handsUp = 0; P.hp = 100; Story.active = null; G.inputOverride = null; for (const k in Input.keys) Input.keys[k] = false; G.crimeCd = {}; };
  startGame(null); G.camMode = 'iso';
  G.S.cash = 500;

  T('world built', () => {
    const a = W.alleys[0], ac = W.zoneAt((a.minX + a.maxX) / 2, (a.minZ + a.maxZ) / 2);
    const ok = W.N === 8 && W.blocks.length >= 55 && W.nodes.length > 80 && W.robs.length >= 25 && W.cams.length >= 12 && W.alarms.length >= 11 && W.alleys.length >= 20
      && W.places.shops.length === 3 && W.places.helipads.length === 2
      && W.zoneAt(W.FOREST_C.x, W.FOREST_C.z) === 'forest' && W.zoneAt(0, -W.HWY) === 'highway' && ac === 'alley' && W.zoneAt(-25, -5) === 'street' && W.zoneAt(60, W.SHORE - 6) === 'beach';
    return ok || `blocks ${W.blocks.length} nodes ${W.nodes.length} robs ${W.robs.length} cams ${W.cams.length} alarms ${W.alarms.length} alleys ${W.alleys.length} shops ${W.places.shops.length} pads ${W.places.helipads.length} alleyZone ${ac}`;
  });
  T('player cannot walk through a building', () => {
    reset(); const b = W.blocks.find((k) => k.type === 'city');
    tp(b.cx, b.cz - 18); G.inputOverride = { mx: 0, mz: 1 }; steps(3); G.inputOverride = null;
    return P.z <= b.cz - 15.4 || 'z ' + P.z.toFixed(2) + ' wall ' + (b.cz - 15.1);
  });
  T('loud store robbery pays and raises heat', () => {
    reset(); const r = W.places.quick, c0 = G.S.cash; tp(r.x, r.z);
    hold(G.robHoldTime(r) + 0.3);
    return (G.S.cash > c0 && Heat.level >= 2) || `cash ${c0}->${G.S.cash} heat ${Heat.level} hurt ${(G.hurtLog || []).join(' ')} hp ${P.hp}`;
  });
  T('police respond to heat', () => {
    steps(12);
    const cops = G.npcs.filter((n) => n.kind === 'cop').length, cars = G.cars.filter((c) => c.police && c.siren).length;
    return (cops + cars > 0) || `cops ${cops} cars ${cars} heat ${Heat.level} escapes ${G.S.stats.escapes} busts ${G.S.stats.busts} hurt ${(G.hurtLog || []).join(' ')}`;
  });
  T('cut alarm + loop camera = silent robbery', () => {
    reset(); G.S.tools.cutters = true; G.S.tools.laptop = true;
    const r = W.places.electro, al = r.sec.alarm;
    tp(al.x, al.z); hold(2.6);
    if (!(al.cutT > 0)) return 'alarm not cut; prompt=' + (G.interact.e && (G.interact.e.label || G.interact.e.disabled));
    const cam = r.sec.cams[0];
    tp(cam.x + Math.sin(cam.base) * 4.5, cam.z + Math.cos(cam.base) * 4.5); hold(2.2);
    if (!(cam.loopT > 0)) return 'cam not looped; prompt=' + (G.interact.e && (G.interact.e.label || G.interact.e.disabled));
    Heat.clear(); r.cd = 0; const c0 = G.S.cash; tp(r.x, r.z); hold(G.robHoldTime(r) + 0.3);
    return (G.S.cash > c0 && Heat.level === 0) || `cash ${c0}->${G.S.cash} heat ${Heat.level}`;
  });
  T('cameras witness crimes', () => {
    reset(); const cam = W.cams.find((c) => c.loopT <= 0 && c.deadT <= 0);
    const x = cam.x + Math.sin(cam.yaw) * 6, z = cam.z + Math.cos(cam.yaw) * 6;
    const w = witness(x, z, 0);
    return w === 'Caught on camera' || 'witness=' + w;
  });
  T('busted by an adjacent cop', () => {
    reset(); const q = W.places.quick; tp(q.x, q.z + 1); G.S.cash = 1000;
    Heat.add(1, 5, 'test'); const c = spawnCop(P.x + 1.0, P.z, 'chase');
    let busted = false; for (let i = 0; i < 600 && !busted; i++) { G.interact = computeInteract(); step(STEP); if (G.respawning) busted = true; }
    steps(0.5);
    const pd = dist(P.x, P.z, W.places.police.x, W.places.police.z);
    return (busted && Heat.level === 0 && pd < 4 && G.S.cash === 750) || `busted ${busted} heat ${Heat.level} pd ${pd.toFixed(1)} cash ${G.S.cash} cop ${c.dead}`;
  });
  T('knockout respawns at hospital', () => {
    reset(); tp(0, 20); G.S.armor = 0; G.hurtPlayer(500, P.x + 1, P.z, 0, null); const ko = G.respawning; steps(0.5);
    const hd = dist(P.x, P.z, W.places.hospital.x, W.places.hospital.z);
    return (ko && hd < 4 && P.hp === 100 && !P.down) || `ko ${ko} hd ${hd.toFixed(1)} hp ${P.hp}`;
  });
  T('shop sells every item', () => {
    reset(); G.S.cash = 60000;
    for (let pass = 0; pass < 4; pass++) for (const it of SHOP) if (G.canBuy(it.id).ok) G.buy(it.id);
    const missing = SHOP.filter((it) => !(it.ammo && !it.weapon) && !G.owns(it.id)).map((it) => it.id);
    return !missing.length || 'missing ' + missing.join(',');
  });
  T('guns fire and use ammo', () => {
    reset(); tp(0, 25);
    for (const w of ['pistol', 'shotgun', 'smg']) {
      G.equip(w); const k = WEAPONS[w].ammo, a0 = G.S.ammo[k]; P.cd = 0; Bullets.clear(); G.attack(0);
      if (!(G.S.ammo[k] === a0 - 1 && Bullets.list.length >= 1)) return w + ' ammo ' + a0 + '->' + G.S.ammo[k] + ' bullets ' + Bullets.list.length;
      steps(0.3);
    }
    return true;
  });
  T('bat hurts a pedestrian', () => {
    reset(); tp(0, 25); G.equip('bat'); const p = spawnPed(P.x, P.z + 1.4, W.nearestBlock(P.x, P.z), 1, 1);
    P.cd = 0; G.attack(0); return p.hp < p.maxHp || 'ped hp ' + p.hp;
  });
  T('mugging drops cash', () => {
    reset(); tp(0, 25); P.facing = 0; const p = spawnPed(P.x, P.z + 1.2, W.nearestBlock(P.x, P.z), 1, 1); p.cash = 50;
    const c0 = G.S.cash; G.mug(p); steps(0.1); tp(p.x, p.z); steps(0.2);
    return G.S.cash > c0 || 'cash ' + c0 + '->' + G.S.cash;
  });
  T('drive a car on the highway', () => {
    reset(); tp(0, -W.HWY - 3); const car = new Car('sedan', 0, -W.HWY + 7.5, Math.PI / 2); G.enterCar(car);
    const x0 = car.x; Input.keys.KeyW = true; steps(2.5); Input.keys.KeyW = false;
    const moved = car.x - x0; G.exitCar(); return (moved > 15 && !P.inCar) || 'moved ' + moved.toFixed(1);
  });
  T('car cannot drive through a building', () => {
    reset(); const b = W.blocks.find((k) => k.type === 'city' && k.j === 2) || W.blocks.find((k) => k.type === 'city');
    const car = new Car('sports', b.cx, b.cz - 23, 0); tp(b.cx + 3, b.cz - 23); G.enterCar(car);
    Input.keys.KeyW = true; steps(3); Input.keys.KeyW = false;
    const z = car.z; G.exitCar(); return z < b.cz - 16 || 'car z ' + z.toFixed(1) + ' block edge ' + (b.cz - 15.1);
  });
  T('highway roadblock spawns with spikes at heat 3', () => {
    reset(); tp(-170, -W.HWY - 3); const car = new Car('sedan', -170, -W.HWY + 7.5, Math.PI / 2); G.enterCar(car); car.v = 25; car.vx = 25;
    Heat.add(3, 5, 'test'); G.playerZone = 'highway';
    const ok = Roadblocks.spawnAhead();
    const r = ok && Roadblocks.list.length === 1 && Spikes.list.some((s) => !s.byPlayer) && Roadblocks.list[0].cars.length === 5;
    const rb = Roadblocks.list[0];
    const ahead = rb && rb.x > car.x;
    return (r && ahead) || `ok ${ok} rbs ${Roadblocks.list.length} spikes ${Spikes.list.length} ahead ${ahead}`;
  });
  T('spike strip pops tires', () => {
    reset(); tp(-100, -W.HWY - 3); const car = new Car('sedan', -100, -W.HWY + 7.5, Math.PI / 2); G.enterCar(car);
    Spikes.add(-88, -W.HWY + 7.5, Math.PI / 2, 6, 30, false);
    Input.keys.KeyW = true; steps(2); Input.keys.KeyW = false;
    const popped = car.popped; G.exitCar(); return popped || 'not popped, car x ' + car.x.toFixed(1);
  });
  T('player spike strip lies across the road', () => {
    reset(); tp(-60, -W.HWY - 3); const car = new Car('sedan', -60, -W.HWY + 7.5, Math.PI / 2); G.enterCar(car); G.S.spikes = 1; G.useGadget();
    const s = Spikes.list[Spikes.list.length - 1]; const along = [Math.cos(s.ang), -Math.sin(s.ang)];
    const dot = Math.abs(along[0] * Math.sin(car.h) + along[1] * Math.cos(car.h)); G.exitCar();
    return (s.byPlayer && dot < 0.05 && s.x < car.x) || 'dot ' + dot.toFixed(2) + ' behind ' + (s.x < car.x);
  });
  T('alley: cops cover the exits', () => {
    reset(); Heat.add(2, 5, 'test'); const a = W.alleys.find((k) => !k.dead);
    const before = G.npcs.filter((n) => n.kind === 'cop').length;
    G.playerZone = 'street'; tp((a.minX + a.maxX) / 2, (a.minZ + a.maxZ) / 2); steps(0.3);
    const after = G.npcs.filter((n) => n.kind === 'cop').length;
    return (G.playerZone === 'alley' && after > before) || `zone ${G.playerZone} cops ${before}->${after}`;
  });
  T('lose heat hiding in Forest Park', () => {
    reset(); Heat.add(2, 5, 'test'); tp(W.FOREST_C.x - 4, W.FOREST_C.z + 8);
    for (let i = 0; i < 900 && Heat.level > 0; i++) { G.interact = computeInteract(); step(STEP); }
    return Heat.level === 0 || 'heat ' + Heat.level + ' evade ' + Heat.evade.toFixed(1) + '/' + Heat.need.toFixed(1);
  });
  T('medkit, smoke and spikes items', () => {
    reset(); tp(0, 25); P.hp = 30; G.S.medkit = 1; G.useMedkit(); if (P.hp !== 90) return 'hp ' + P.hp;
    G.S.smoke = 1; G.useGadget(); if (!Smoke.clouds.length) return 'no smoke';
    return true;
  });
  T('chop shop buys a stolen car', () => {
    reset(); const ch = W.places.chop; tp(ch.x + 3, ch.z); const car = new Car('sports', ch.x, ch.z, 0, { parked: true }); car.locked = true;
    G.S.tools.lockpick = true; G.enterCar(car); const c0 = G.S.cash; const ok = G.sellCar();
    return (ok && G.S.cash > c0 && !P.inCar && car.dead) || `ok ${ok} cash ${c0}->${G.S.cash}`;
  });
  // every story mission end-to-end
  const satisfy = (s) => {
    const a = Story.active;
    switch (s.t) {
      case 'goto': { const p = W.places[s.at]; tp(p.x, p.z); break; }
      case 'rob': { const r = W.places[s.target]; r.cd = 0; G.S.tools.drill = true; tp(r.x, r.z); hold(G.robHoldTime(r) + 0.3); break; }
      case 'robKind': { const r = W.robs.find((k) => k.kind === s.kind && k.cd <= 0); tp(r.x, r.z); hold(G.robHoldTime(r) + 0.3); break; }
      case 'buy': G.buy(s.item); break;
      case 'steal': {
        let car = s.missionCar ? a.car : null;
        if (!car) { car = new Car('sedan', P.x + 3, P.z, 0, { parked: true }); car.locked = true; }
        tp(car.x + 2.5, car.z); G.enterCar(car); break;
      }
      case 'loseHeat': Heat.clear(); break;
      case 'sell': {
        Heat.clear();
        if (!P.inCar) { const car = new Car('sedan', P.x + 3, P.z, 0); G.enterCar(car); }
        const ch = W.places.chop; P.inCar.x = ch.x; P.inCar.z = ch.z; G.sellCar(); break;
      }
      case 'cutAlarm': G.cutAlarm(W.places[s.target].sec.alarm); break;
      case 'loopCams': for (const c of W.places[s.target].sec.cams) G.loopCam(c); break;
      default: break;
    }
  };
  MISSIONS.forEach((m, i) => T('story mission ' + (i + 1) + ': ' + m.title, () => {
    reset(); G.S.storyDone = i; G.S.cash = 60000; G.S.tools = {}; tp(W.places.hideout.x, W.places.hideout.z);
    G.god = true; Story.begin();
    let guard = 0, last = '';
    while (Story.active && guard++ < 30) { const s = Story.step(); if (!s) break; last = s.t; satisfy(s); steps(0.3); }
    G.god = false;
    return G.S.storyDone === i + 1 || 'stuck at step ' + (Story.active ? Story.active.i + ' (' + Story.step().t + ')' : 'after ' + last + ' (job failed)') + ' done ' + G.S.storyDone + ' toast: ' + ($('toasts').firstChild || {}).textContent;
  }));
  T('3rd person: A/D strafe without turning the camera', () => {
    reset(); tp(0, 25); G.camMode = 'chase'; CAM.yaw = 0; CAM.wasInCar = false; updateCamera(0.016);
    const x0 = P.x, z0 = P.z;
    Input.keys.KeyD = true; steps(0.5); Input.keys.KeyD = false;
    const dx = P.x - x0, dz = P.z - z0, yaw = CAM.yaw;
    Input.keys.KeyA = true; steps(0.5); Input.keys.KeyA = false;
    const back = P.x - x0;
    G.camMode = 'iso';
    // yaw 0 looks toward +z, so screen-right is -x
    return (dx < -1.5 && Math.abs(dz) < 0.3 && yaw === 0 && Math.abs(back) < 0.3) || `strafe dx ${dx.toFixed(2)} dz ${dz.toFixed(2)} yaw ${yaw} after A ${back.toFixed(2)}`;
  });
  T('3rd person: mouse turns the camera and aims the gun', () => {
    reset(); tp(0, 25); G.camMode = 'chase'; G.state = 'play'; CAM.yaw = 0; CAM.pitch = 0.3;
    Input.locked = true; Input.dx = 200; Input.dy = 40; frameInput(); Input.dx = Input.dy = 0; Input.locked = false;
    const yaw = CAM.yaw, pitch = CAM.pitch;
    G.S.weapons.pistol = true; G.S.ammo.pistol = 5; G.equip('pistol'); P.cd = 0; Bullets.clear();
    G.attackQ = { ang: CAM.yaw }; steps(STEP);
    const b = Bullets.list[0], bang = b ? Math.atan2(b.vx, b.vz) : NaN;
    G.camMode = 'iso';
    return (Math.abs(yaw + 0.52) < 0.01 && pitch > 0.39 && b && Math.abs(angDiff(bang, yaw)) < 0.1) || `yaw ${yaw.toFixed(3)} pitch ${pitch.toFixed(2)} bullet ${bang}`;
  });
  T('3rd person: driving glance springs back behind the car', () => {
    reset(); tp(0, -W.HWY - 3); const car = new Car('sedan', 0, -W.HWY + 7.5, Math.PI / 2); G.enterCar(car);
    G.camMode = 'chase'; G.state = 'play'; CAM.wasInCar = false; updateCamera(0.016);
    Input.locked = true; Input.dx = 400; frameInput(); Input.dx = 0; Input.locked = false;
    const glance = CAM.carLook;
    for (let i = 0; i < 180; i++) updateCamera(1 / 60);
    const settled = CAM.carLook; G.exitCar(); G.camMode = 'iso';
    return (glance < -1 && Math.abs(settled) < 0.15) || `glance ${glance.toFixed(2)} settled ${settled.toFixed(2)}`;
  });
  T('cops take ~3x longer to drag you out of a car', () => {
    reset(); G.noSpawn = true; const q = { x: W.rp(3) + 2.5, z: W.rp(4) + 19 }; tp(q.x, q.z + 6); const car = new Car('sedan', P.x, P.z, 0); G.enterCar(car);
    Heat.add(1, 5, 'test'); const cop0 = spawnCop(car.x + 2.2, car.z, 'chase'); const tr = [];
    let t = 0; while (!G.respawning && t < 30) { G.interact = computeInteract(); step(STEP); t += STEP; if (Math.round(t * 60) % 60 === 0) tr.push(`t${t.toFixed(0)} d${dist(cop0.x, cop0.z, car.x, car.z).toFixed(1)} v${car.v.toFixed(1)} g${Heat.grabV.toFixed(2)} h${Heat.level} ${cop0.ai.mode}${cop0.down ? 'DOWN' : ''}${cop0.dead ? 'DEAD' : ''}`); }
    const tCar = t; G.cuffTrace = tr.slice(0, 8).join(' | '); steps(0.5); reset();
    tp(q.x, q.z + 6); Heat.add(1, 5, 'test'); spawnCop(P.x + 1, P.z, 'chase');
    t = 0; while (!G.respawning && t < 30) { G.interact = computeInteract(); step(STEP); t += STEP; }
    const tFoot = t; steps(0.5); G.noSpawn = false;
    return (tCar > 2.5 * tFoot && tCar < 30) || `car ${tCar.toFixed(1)}s foot ${tFoot.toFixed(1)}s :: ${G.cuffTrace}`;
  });
  T('police helicopter joins at heat 3, a second at heat 5', () => {
    reset(); tp(0, 25); G.god = true; Heat.add(3, 5, 'test'); steps(2);
    const one = Choppers.active().length; let saw = false;
    for (let i = 0; i < 900; i++) { G.interact = computeInteract(); step(STEP); if (Choppers.active().some((h) => h.ai.sees)) saw = true; }
    Heat.add(5, 5, 'test'); steps(10); const two = Choppers.active().length; G.god = false;
    return (one === 1 && saw && two === 2) || `at heat3 ${one} saw ${saw} at heat5 ${two}`;
  });
  T('forest canopy hides you from the chopper', () => {
    reset(); tp(0, 25); Heat.add(3, 5, 'test'); const h = Choppers.spawnAI();
    let street = 0; G.playerZone = 'street'; h.x = P.x; h.z = P.z; h.spotX = P.x; h.spotZ = P.z;
    for (let i = 0; i < 200; i++) if (heliSees(h, P.x, P.z)) street++;
    const tr = W.trees.find((k) => k.type === 'pine' && k.x > W.FOREST.minX + 10 && k.z < W.FOREST.maxZ - 10 && !W.onTrail(k.x + 1.3, k.z));
    tp(tr.x + 1.3, tr.z); G.playerZone = 'forest'; h.x = P.x; h.z = P.z; h.spotX = P.x; h.spotZ = P.z;
    let forest = 0; for (let i = 0; i < 400; i++) if (heliSees(h, P.x, P.z)) forest++;
    h.spotX = P.x + 8; let forestOff = 0; for (let i = 0; i < 200; i++) if (heliSees(h, P.x, P.z)) forestOff++;
    return (street === 200 && forest / 400 < 0.45 && forestOff === 0) || `street ${street}/200 forest ${forest}/400 spotlight-off ${forestOff}`;
  });
  T('thunderstorm grounds police choppers', () => {
    reset(); Weather.set('storm', true); Heat.add(5, 5, 'test');
    const want = Choppers.want(); Weather.set('clear', true); const clearWant = Choppers.want();
    return (want === 0 && clearWant === 2) || `storm ${want} clear ${clearWant}`;
  });
  T('fog and rain shrink police sight', () => {
    Weather.set('fog', true); Weather.apply(); const fog = Weather.sight();
    Weather.set('rain', true); Weather.apply(); const rain = Weather.sight(); const grip = Weather.grip();
    Weather.set('clear', true); Weather.apply();
    return (fog < 0.6 && rain < 0.9 && grip < 0.8 && Weather.sight() === 1) || `fog ${fog} rain ${rain} grip ${grip}`;
  });
  T('weather cycles on its own', () => {
    reset(); G.state = 'play'; const before = Weather.cur; let changed = false;
    for (let i = 0; i < 12 && !changed; i++) { Weather.timer = 0.01; Weather.update(0.02, 0, 0, 0); if (Weather.cur !== before) changed = true; }
    for (let i = 0; i < 60; i++) Weather.update(0.5, 0, 0, 0);
    Weather.set('clear', true);
    return changed || 'stayed ' + before;
  });
  T('steal and fly the tour helicopter, then land and get out', () => {
    reset(); const pad = W.places.helipads.find((p) => p.kind === 'tour'); if (!pad.heli || pad.heli.dead || pad.heli.pilot) pad.heli = new Chopper('tour', pad.x, pad.z, pad.yaw, { pad });
    const h = pad.heli; tp(pad.x + 4, pad.z); G.interact = computeInteract();
    const label = G.interact.f && G.interact.f.label; if (G.interact.f) G.interact.f.run();
    if (P.inHeli !== h) return 'did not board: ' + label;
    Input.keys.Space = true; steps(4); Input.keys.Space = false; const alt = h.y; zoneT = 0; steps(0.3); const zone = G.playerZone;
    Input.keys.KeyS = true; steps(1.6); Input.keys.KeyS = false; const moved = dist(h.x, h.z, pad.x, pad.z);
    Input.keys.ShiftLeft = true; steps(7); Input.keys.ShiftLeft = false;
    const out = G.exitHeli();
    return (alt > 15 && zone === 'air' && moved > 8 && out && !P.inHeli) || `alt ${alt.toFixed(1)} zone ${zone} moved ${moved.toFixed(1)} exited ${out} y ${h.y.toFixed(1)} roof ${roofAt(h.x, h.z, 1.5)}`;
  });
  T('rocket launcher shoots down a police helicopter', () => {
    reset(); tp(0, 25); G.god = true; Heat.add(3, 5, 'test'); const h = Choppers.spawnAI(); h.x = P.x + 12; h.z = P.z; h.y = 22;
    G.S.weapons.rpg = true; G.S.ammo.rockets = 3; G.equip('rpg'); G.heliAim = h; P.cd = 0;
    G.attack(Math.atan2(h.x - P.x, h.z - P.z)); G.heliAim = null; steps(4); G.god = false;
    return ((h.falling > 0 || h.dead) && Heat.level >= 4) || `heli hp ${h.hp} falling ${h.falling} heat ${Heat.level}`;
  });
  T('grenade blast cracks an ATM', () => {
    reset(); const atm = W.robs.find((r) => r.kind === 'atm' && r.cd <= 0); tp(atm.x, atm.z); G.god = true;
    G.aimX = atm.x + 0.5; G.aimZ = atm.z; G.S.grenade = 1; const c0 = G.S.cash; G.throwGrenade(); steps(2.5); G.god = false;
    return (G.S.cash > c0 && atm.cd > 0) || `cash ${c0}->${G.S.cash}`;
  });
  T('C4 sticks to a car and blows it up', () => {
    reset(); tp(0, 25); const car = new Car('sedan', P.x + 1.8, P.z, 0, { parked: true }); P.facing = Math.PI / 2;
    G.S.c4 = 1; G.useC4(); const stuck = Ordnance.c4.length === 1 && Ordnance.c4[0].car === car;
    car.x += 10; steps(0.1); G.god = true; G.useC4(); steps(0.2); G.god = false;
    return (stuck && (car.burning > 0 || car.wreck || car.hp < car.maxHp * 0.5)) || `stuck ${stuck} car hp ${car.hp}`;
  });
  T('GPS routes along roads to the objective', () => {
    const a = W.places.hideout, b = W.places.chop, path = GPS.route(a.x, a.z, b.x, b.z);
    let len = 0; for (let i = 1; i < path.length; i++) len += dist(path[i - 1][0], path[i - 1][1], path[i][0], path[i][1]);
    const inner = path.slice(1, -1).every(([x, z]) => W.nodeMap.has(x + ',' + z));
    return (path.length > 3 && inner && len < 1.6 * dist(a.x, a.z, b.x, b.z)) || `points ${path.length} inner ${inner} len ${len.toFixed(0)}`;
  });
  T('handbrake slides the car and leaves skid marks', () => {
    reset(); tp(0, -W.HWY - 3); const car = new Car('sports', 0, -W.HWY + 7.5, Math.PI / 2); G.enterCar(car); car.v = 28; car.vx = 28;
    const i0 = Skids.i; let maxSlip = 0;
    Input.keys.Space = true; Input.keys.KeyD = true;
    for (let i = 0; i < 40; i++) { step(STEP); maxSlip = Math.max(maxSlip, G.slip); }
    Input.keys.Space = false; Input.keys.KeyD = false; G.exitCar();
    return (maxSlip > 0.5 && Skids.i !== i0) || `slip ${maxSlip.toFixed(2)} skids ${Skids.i - i0}`;
  });
  T('every vehicle type drives', () => {
    const bad = [];
    for (const type of ['supercar', 'hatch', 'suv', 'muscle', 'truck', 'pickup', 'motorbike', 'bicycle', 'bmx']) {
      reset(); tp(-150, -W.HWY - 3); const car = new Car(type, -150, -W.HWY + 7.5, Math.PI / 2); G.enterCar(car);
      Input.keys.KeyW = true; steps(2); Input.keys.KeyW = false; const moved = car.x + 150; G.exitCar(); car.remove();
      if (!(moved > 8)) bad.push(type + ' ' + moved.toFixed(1));
    }
    return !bad.length || bad.join(', ');
  });
  T('riders show on bikes and get thrown off in a hard crash', () => {
    reset(); const b = W.blocks.find((k) => k.type === 'city');
    const bike = new Car('motorbike', b.cx, b.cz - 26, 0); tp(b.cx + 1.5, b.cz - 26); G.enterCar(bike);
    const visible = P.rig.root.visible;
    bike.v = 30; bike.vx = 0; bike.vz = 30; G.god = true;
    for (let i = 0; i < 60 && P.inCar; i++) step(STEP);
    const thrown = !P.inCar; G.god = false;
    return (visible && thrown) || `rider visible ${visible} thrown ${thrown}`;
  });
  T('bike into a car at speed: rider flies over the bars as a ragdoll, then gets up', () => {
    reset(); G.noSpawn = true; const z = -W.HWY + 7.5;
    for (const c of G.cars.slice()) if (Math.abs(c.z - z) < 30 && Math.abs(c.x - 25) < 60) c.remove();
    const car = new Car('sedan', 25, z, 0, { parked: true }), bike = new Car('motorbike', 0, z, Math.PI / 2);
    tp(0, z + 2); G.enterCar(bike); bike.v = 30; bike.vx = 30; G.god = true;
    let thrownAt = -1, limp = false, top = 0, far = 0;
    for (let i = 0; i < 420; i++) {
      step(STEP);
      if (thrownAt < 0 && !P.inCar) { thrownAt = P.x; limp = !!P.ragdoll && !!P.tumble; }
      if (P.ragdoll && P.ragdoll.parts) top = Math.max(top, P.ragdoll.parts.torso.b.getPosition().y);
      far = Math.max(far, P.x);
      if (thrownAt >= 0 && !P.tumble && i > 60) break;
    }
    const up = !P.ragdoll && !P.tumble && !P.down && Math.abs(P.rig.torso.position.y - 1.27) < 0.01;
    G.god = false; car.remove(); bike.remove(); G.noSpawn = false;
    if (!Phys.ready) return (thrownAt >= 0) || 'no physics: not thrown';
    // the far side of the sedan is at x ≈ 26: the rider should land beyond it
    return (thrownAt >= 0 && limp && top > 1.8 && far > 28 && up) || `thrown at ${thrownAt.toFixed(1)} limp ${limp} peak ${top.toFixed(2)} furthest x ${far.toFixed(1)} up ${up} ragdoll ${!!P.ragdoll} tumble ${JSON.stringify(P.tumble)} down ${P.down}`;
  });
  T('bike into a wall: thrown, no tunneling, and bikes do not mow down trees', () => {
    reset(); const b = W.blocks.find((k) => k.type === 'city');
    const bike = new Car('motorbike', b.cx, b.cz - 26, 0); tp(b.cx + 1.5, b.cz - 26); G.enterCar(bike);
    bike.v = 40; bike.vz = 40; G.god = true; let inside = false;
    for (let i = 0; i < 300; i++) { step(STEP); if (P.z > b.cz - 15.1 + 0.5) inside = true; if (!P.inCar && !P.tumble && i > 30) break; }
    const thrown = !P.inCar; G.god = false; bike.remove();
    // a tree in the way of a fast motorbike stays standing
    const t = W.trees.find((q) => q.col && !q.col.removed);
    if (!t) return 'no tree';
    reset(); G.noSpawn = true; const mb = new Car('motorbike', t.x, t.z - 8, 0); tp(t.x + 2, t.z - 8); G.enterCar(mb); mb.v = 30; mb.vz = 30; G.god = true;
    const felled = () => W.trees.filter((q) => q.col && q.col.removed).length, before = felled();
    steps(1); const standing = !t.col.removed && felled() === before; G.god = false; if (P.inCar) G.exitCar(true); mb.remove(); G.noSpawn = false;
    return (thrown && !inside && standing) || `thrown ${thrown} went into the building ${inside} (z ${P.z.toFixed(1)} wall ${(b.cz - 15).toFixed(1)}) tree standing ${standing}`;
  });
  T('running over a cop counts as knocking them out', () => {
    reset(); tp(0, -W.HWY - 3); Heat.add(2, 5, 'test');
    const car = new Car('sedan', 0, -W.HWY + 7.5, Math.PI / 2); G.enterCar(car); car.v = 25; car.vx = 25;
    const cop = spawnCop(9, -W.HWY + 7.5, 'chase'); cop.hp = 20; G.god = true;
    for (let i = 0; i < 60; i++) step(STEP);
    G.god = false;
    return (cop.down && Heat.level >= 3) || `cop down ${cop.down} heat ${Heat.level}`;
  });
  T('rampage: small crimes keep pushing heat past 2', () => {
    reset(); tp(0, 25); Heat.add(2, 5, 'test'); spawnCop(P.x + 8, P.z, 'chase');
    const crime = (t) => { G.crimeCd = {}; G.crime(t, P.x, P.z, {}); };
    crime('assault'); crime('mug'); const afterTwo = Heat.level;
    crime('gunfire'); const afterThree = Heat.level;
    for (let i = 0; i < 6; i++) crime(['assault', 'mug', 'carjack'][i % 3]);
    const top = Heat.level;
    return (afterTwo === 2 && afterThree === 3 && top === 4) || `after 2: ${afterTwo}, after 3: ${afterThree}, after 9: ${top}`;
  });
  T('player stands upright after leaving any vehicle', () => {
    const bad = [];
    const frame = () => { step(STEP); P.animate(STEP); if (P.inCar && P.inCar.T.bike) poseRider(P, P.inCar, STEP); };
    const upright = () => {
      const rg = P.rig, r = (v) => Math.abs(v) < 0.05;
      return r(rg.root.rotation.x) && r(rg.root.rotation.z) && r(rg.body.rotation.x) && r(rg.body.rotation.y) && r(rg.body.rotation.z) && r(rg.body.position.y) && r(rg.body.position.z) && r(rg.root.position.y);
    };
    for (const type of ['sedan', 'supercar', 'truck', 'motorbike', 'bicycle', 'bmx', 'heli']) {
      reset(); tp(0, -W.HWY - 6);
      let veh;
      if (type === 'heli') { veh = new Chopper('tour', 0, -W.HWY - 6, Math.PI / 2); G.enterHeli(veh); Input.keys.Space = true; for (let i = 0; i < 120; i++) frame(); Input.keys.Space = false; Input.keys.KeyD = true; for (let i = 0; i < 60; i++) frame(); Input.keys.KeyD = false; Input.keys.ShiftLeft = true; for (let i = 0; i < 400; i++) frame(); Input.keys.ShiftLeft = false; G.exitHeli(); }
      else { veh = new Car(type, 0, -W.HWY + 7.5, Math.PI / 2); tp(0, -W.HWY - 5); G.enterCar(veh); Input.keys.KeyW = true; Input.keys.KeyD = true; for (let i = 0; i < 90; i++) frame(); Input.keys.KeyW = false; for (let i = 0; i < 60; i++) frame(); Input.keys.KeyD = false; G.remount = null; for (let i = 0; i < 400 && P.tumble; i++) frame(); G.remount = null; G.exitCar(); }
      for (const c of G.cars) if (c !== veh && !c.persistent) c.remove(); G.cars = G.cars.filter((c) => !c.dead);
      Input.keys.KeyW = true; for (let i = 0; i < 60; i++) frame(); Input.keys.KeyW = false;
      if (!upright()) { const rg = P.rig; bad.push(`${type}: root ${rg.root.rotation.x.toFixed(2)},${rg.root.rotation.z.toFixed(2)} body ${rg.body.rotation.x.toFixed(2)},${rg.body.rotation.y.toFixed(2)},${rg.body.rotation.z.toFixed(2)} pos ${rg.body.position.y.toFixed(2)},${rg.body.position.z.toFixed(2)} y ${rg.root.position.y.toFixed(2)} [P.y ${P.y.toFixed(2)} inCar ${!!P.inCar} ragdoll ${!!P.ragdoll} tumble ${!!P.tumble} jumping ${P.jumping} vault ${!!P.vault} hurt ${(G.hurtLog || []).join(',')}]`); }
      if (veh.remove) veh.remove();
    }
    return !bad.length || bad.join(' | ');
  });
  T('nitro: built into fast cars, kit adds it to any car', () => {
    const run = (type, shift, kit) => {
      reset(); G.S.tools.nitro = kit; G.nitro = 1; tp(-235, -W.HWY - 3);
      const car = new Car(type, -235, -W.HWY + 7.5, Math.PI / 2); G.enterCar(car);
      Input.keys.KeyW = true; Input.keys.ShiftLeft = shift; steps(2.5); Input.keys.KeyW = false; Input.keys.ShiftLeft = false;
      const d = car.x + 235; G.exitCar(); car.remove(); return d;
    };
    const sportsPlain = run('sports', false, false), sportsNitro = run('sports', true, false);
    const sedanNoKit = run('sedan', true, false), sedanPlain = run('sedan', false, false), sedanKit = run('sedan', true, true);
    G.S.tools.nitro = false;
    return (sportsNitro > sportsPlain * 1.2 && Math.abs(sedanNoKit - sedanPlain) < 3 && sedanKit > sedanPlain * 1.2) || `sports ${sportsPlain.toFixed(0)}→${sportsNitro.toFixed(0)} sedan no kit ${sedanNoKit.toFixed(0)} plain ${sedanPlain.toFixed(0)} kit ${sedanKit.toFixed(0)}`;
  });
  T('six-lane highway: wider and much faster than city streets', () => {
    const drive = (x, z, h) => {
      reset(); tp(x, z); const car = new Car('sports', x, z, h); G.enterCar(car);
      Input.keys.KeyW = true; steps(4); Input.keys.KeyW = false; const v = car.v; G.exitCar(); car.remove(); return v;
    };
    const hwyV = drive(-235, -W.HWY + 7.5, Math.PI / 2);
    const cityV = drive(W.rp(4) - 2.5, W.rp(1) + 8, 0);
    const wide = W.onHighway(0, -W.HWY + 14) && !W.onHighway(0, -W.HWY + 17);
    return (wide && hwyV > cityV * 1.3 && hwyV * 3.6 > 170) || `highway ${(hwyV * 3.6).toFixed(0)} km/h city ${(cityV * 3.6).toFixed(0)} km/h wide ${wide}`;
  });
  T('longer ring highway with sweeping curves', () => {
    const k = W.HWY - W.RR, a = -Math.PI / 4, mid = [k + Math.cos(a) * W.RR, -k + Math.sin(a) * W.RR];
    const onCurve = W.onHighway(mid[0], mid[1]) && W.zoneAt(mid[0], mid[1]) === 'highway', oldCorner = W.onHighway(W.HWY, -W.HWY);
    let worst = 0; for (let s = 5; s < W.RLEN; s += 37) { const p = W.ringPoint(s); worst = Math.max(worst, Math.abs(W.ringParam(p.x, p.z) - s)); }
    return (onCurve && !oldCorner && W.RLEN > 2600 && worst < 1) || `curve ${onCurve} oldCorner ${oldCorner} length ${W.RLEN && W.RLEN.toFixed(0)} param err ${worst.toFixed(2)}`;
  });
  T('you can drive through a highway curve without stopping', () => {
    reset(); G.noSpawn = true; const k = W.HWY - W.RR, start = W.ringPoint(2 * k - 60);
    tp(start.x, start.z + 6); const car = new Car('sports', start.x, start.z + 7.5, Math.PI / 2); G.enterCar(car); car.v = 30; car.vx = 30;
    let minV = 99, steerSum = 0;
    for (let i = 0; i < 360; i++) {
      const s = W.ringParam(car.x, car.z), ahead = W.ringPoint(s + 18), want = Math.atan2(ahead.x - ahead.tz * 7.5 - car.x, ahead.z + ahead.tx * 7.5 - car.z);
      Input.keys.KeyW = true; const d = angDiff(car.h, want); Input.keys.KeyA = d > 0.05; Input.keys.KeyD = d < -0.05; steerSum += Math.abs(d);
      step(STEP); if (i > 30) minV = Math.min(minV, car.v);
    }
    for (const kk of ['KeyW', 'KeyA', 'KeyD']) Input.keys[kk] = false;
    const ok = W.onHighway(car.x, car.z) && car.z > -W.HWY + 60 && minV > 20;
    G.noSpawn = false; G.exitCar(); return ok || `ended at ${car.x.toFixed(0)},${car.z.toFixed(0)} on hwy ${W.onHighway(car.x, car.z)} min speed ${(minV * 3.6).toFixed(0)} km/h`;
  });
  T('no tunneling: full-speed crashes into barriers and walls stay on this side', () => {
    const bad = [], H = W.HWY, k = H - W.RR;
    // the bug only shows when impact lands in a narrow window, so try every phase within one physics step
    const ram = (type, x0, z0, h, v, check, label) => {
      let fails = 0;
      for (let o = 0; o < 12; o++) {
        const x = x0 - Math.sin(h) * o * v * STEP / 12, z = z0 - Math.cos(h) * o * v * STEP / 12;
        reset(); tp(x, z); const car = new Car(type, x, z, h); G.enterCar(car); car.v = v; car.vx = Math.sin(h) * v; car.vz = Math.cos(h) * v;
        let ok = true; for (let i = 0; i < 70; i++) { step(STEP); if (!check(car)) ok = false; }
        if (!ok) fails++;
        if (P.inCar) G.exitCar(true); car.remove();
      }
      if (fails) bad.push(label + ' went through ' + fails + '/12 times');
    };
    // straight outer barrier on the north side, head-on at 88 m/s (317 km/h)
    ram('supercar', -150, -H, Math.PI, 88, (c) => c.z > -H - W.HWH - 0.6, 'supercar → north barrier');
    ram('motorbike', -150, -H, Math.PI, 70, (c) => c.z > -H - W.HWH - 0.6, 'motorbike → north barrier');
    ram('hatch', -150, -H, 0, 80, (c) => c.z < -H + W.HWH + 0.6, 'hatch → inner barrier');
    // curved outer barrier on the NE corner, diagonally outward
    const cx = k, cz = -k, a = -Math.PI / 4, px = cx + Math.cos(a) * W.RR, pz = cz + Math.sin(a) * W.RR;
    ram('supercar', px, pz, Math.atan2(Math.cos(a), Math.sin(a)), 88, (c) => Math.hypot(c.x - cx, c.z - cz) < W.RR + W.HWH + 0.6, 'supercar → curved barrier');
    // a city block wall
    const b = W.blocks.find((q) => q.type === 'city');
    ram('supercar', b.cx, b.cz - 30, 0, 88, (c) => c.z < b.cz - 15.1, 'supercar → building');
    // a pedestrian flung by a crash
    reset(); tp(-150, -H + 12); P.kx = 0; P.kz = -75; P.y = 0.05; P.yv = 4; let flungOk = true;
    for (let i = 0; i < 60; i++) { step(STEP); if (P.z < -H - W.HWH - 0.6) flungOk = false; }
    if (!flungOk) bad.push('flung player went through the barrier, z ' + P.z.toFixed(1));
    return !bad.length || bad.join(' | ');
  });
  T('Space: jump on open ground', () => {
    reset(); tp(-150, -W.HWY + 7.5); let top = 0;
    G.jumpQ = true; for (let i = 0; i < 70; i++) { step(STEP); top = Math.max(top, P.y); }
    return (top > 1.1 && P.y === 0 && !P.jumping) || `peak ${top.toFixed(2)} y ${P.y} jumping ${P.jumping}`;
  });
  T('Space: vault the highway barrier (cops cannot)', () => {
    reset(); const bz = -W.HWY - W.HWH - 0.6; tp(-150, bz - 1.6); P.facing = 0;
    G.inputOverride = { mx: 0, mz: 1 }; steps(0.1); G.jumpQ = true; steps(1.2); G.inputOverride = null;
    const over = P.z > bz + 0.5;
    const c = spawnCop(-150, bz - 1.6, 'walk'); c.vx = 0; c.vz = 4; for (let i = 0; i < 60; i++) { c.vx = 0; c.vz = 4; c.physics(STEP); }
    return (over && c.z < bz) || `player z ${P.z.toFixed(1)} barrier ${bz.toFixed(1)} cop z ${c.z.toFixed(1)}`;
  });
  T('Space: jump clears the barrier too', () => {
    reset(); const bz = -W.HWY - W.HWH - 0.6; tp(-150, bz - 2.6); P.facing = 0;
    G.inputOverride = { mx: 0, mz: 1 }; G.jumpQ = true; const trace = [];
    for (let i = 0; i < 72; i++) { step(STEP); if (i % 6 === 0) trace.push(P.z.toFixed(2) + '/' + P.y.toFixed(2)); }
    G.inputOverride = null;
    return P.z > bz + 0.5 || `z ${P.z.toFixed(1)} barrier ${bz.toFixed(1)} trace ${trace.join(' ')}`;
  });
  T('Space: mantle over the chop shop fence', () => {
    reset(); const ch = W.places.chop, fx = ch.x - 15.2; tp(fx - 1.5, ch.z); P.facing = Math.PI / 2;
    G.inputOverride = { mx: 1, mz: 0 }; steps(0.1); G.jumpQ = true; const wasMantle = () => P.vault && P.vault.mantle; steps(0.05); const m = wasMantle(); steps(1.2); G.inputOverride = null;
    return (m && P.x > fx + 0.5) || `mantle ${m} x ${P.x.toFixed(1)} fence ${fx.toFixed(1)}`;
  });
  T('Space: vault over a parked car, but not through a building', () => {
    reset(); tp(0, 25); const car = new Car('sedan', 0, 27.5, Math.PI / 2, { parked: true }); P.facing = 0;
    G.inputOverride = { mx: 0, mz: 1 }; steps(0.05); G.jumpQ = true; steps(1); G.inputOverride = null;
    const overCar = P.z > 29; car.remove();
    const b = W.blocks.find((k) => k.type === 'city'); tp(b.cx, b.cz - 15.1 - P.r - 0.05); P.facing = 0;
    G.inputOverride = { mx: 0, mz: 1 }; G.jumpQ = true; steps(1); G.inputOverride = null;
    return (overCar && P.z < b.cz - 15) || `over car ${overCar} building z ${P.z.toFixed(1)} vs ${(b.cz - 15.1).toFixed(1)}`;
  });
  T('a car crash only hits you once', () => {
    reset(); G.noSpawn = true; tp(0, 25); P.hp = 100; G.S.armor = 0;
    const car = new Car('sedan', 0, 14, 0); car.driver = 'ai'; car.ai = null; car.v = 18; car.vz = 18;
    for (let i = 0; i < 40; i++) { car.v = 18; car.vz = 18; step(STEP); }
    const lost = 100 - P.hp; car.remove(); G.noSpawn = false; steps(0.5);
    return (lost > 20 && lost < 45) || 'damage taken ' + lost.toFixed(0);
  });
  T('police cruisers pull up instead of running you over', () => {
    reset(); G.noSpawn = true; tp(W.rp(3) + 2.5, W.rp(4) + 25); Heat.add(2, 5, 'test'); P.hp = 100; G.S.armor = 0;
    const car = new Car('police', P.x, P.z - 60, 0); car.driver = 'ai'; car.ai = { mode: 'pursuit', stuckT: 0, revT: 0 }; car.siren = true; car.v = 30; car.vz = 30;
    let carDmg = 0; G.hurtLog = []; const log0 = 0;
    for (let i = 0; i < 240; i++) step(STEP);
    for (const h of (G.hurtLog || []).slice(log0)) if (h.startsWith('world')) carDmg++;
    const d = dist(car.x, car.z, P.x, P.z); car.remove(); G.noSpawn = false;
    return (carDmg === 0 && d > 3) || `run over ${carDmg} times, cruiser stopped ${d.toFixed(1)} m away`;
  });
  T('BMX: Space hops instead of braking', () => {
    reset(); G.noSpawn = true; tp(-150, -W.HWY + 7.5); const bmx = new Car('bmx', -150, -W.HWY + 7.5, Math.PI / 2); G.enterCar(bmx); bmx.v = 11; bmx.vx = 11;
    G.hopQ = true; Input.keys.Space = true; Input.keys.KeyW = true; let top = 0;
    for (let i = 0; i < 50; i++) { step(STEP); top = Math.max(top, bmx.y); }
    Input.keys.Space = false; Input.keys.KeyW = false; const v = bmx.v;
    G.exitCar(); bmx.remove(); G.noSpawn = false;
    return (top > 1.1 && v > 9) || `hop ${top.toFixed(2)} speed ${v.toFixed(1)} (handbrake would slow it)`;
  });
  T('BMX: hop the highway barrier', () => {
    reset(); G.noSpawn = true; const bz = -W.HWY - W.HWH - 0.6; tp(-150, bz - 6);
    const bmx = new Car('bmx', -150, bz - 6, 0); G.enterCar(bmx); bmx.v = 11; bmx.vz = 11; Input.keys.KeyW = true;
    const tr = [];
    for (let i = 0; i < 90; i++) { if (bz - bmx.z < 3.2 && bmx.y === 0 && bmx.z < bz) G.hopQ = true; step(STEP); if (i % 5 === 0) tr.push((bmx.z - bz).toFixed(2) + '/' + bmx.y.toFixed(2) + '/' + bmx.v.toFixed(1)); }
    Input.keys.KeyW = false; const z = bmx.z; G.exitCar(); bmx.remove(); G.noSpawn = false;
    return z > bz + 1 || `bmx z ${z.toFixed(1)} barrier ${bz.toFixed(1)} trace ${tr.join(' ')}`;
  });
  T('cars are a bit faster on streets, grass and in the forest', () => {
    const top = (x, z, h) => { reset(); G.noSpawn = true; tp(x, z); const car = new Car('sedan', x, z, h); G.enterCar(car); Input.keys.KeyW = true; steps(5); Input.keys.KeyW = false; const v = car.v; G.exitCar(); car.remove(); G.noSpawn = false; return v; };
    const street = top(W.rp(3) + 2.5, W.rp(1) + 8, 0);
    const grass = top(-W.HALF - 60, -40, 0);
    const T0 = CAR_TYPES.sedan.maxV;
    return (street > T0 * 1.1 && grass > T0 * 0.9) || `sedan base ${T0} street ${street.toFixed(1)} grass ${grass.toFixed(1)}`;
  });
  T('top speed holds at the cap (no creeping past it)', () => {
    const bad = [];
    for (const type of ['supercar', 'motorbike', 'sports']) {
      reset(); G.noSpawn = true; tp(-235, -W.HWY + 7.5); const car = new Car(type, -235, -W.HWY + 7.5, Math.PI / 2); G.enterCar(car);
      Input.keys.KeyW = true; let vmax = 0; for (let i = 0; i < 480; i++) { step(STEP); vmax = Math.max(vmax, car.v); } Input.keys.KeyW = false;
      const cap = Math.min(88, CAR_TYPES[type].maxV * W.ZONES.highway.car);
      if (vmax > cap + 0.5) bad.push(`${type} ${vmax.toFixed(1)} > ${cap.toFixed(1)}`);
      G.exitCar(); car.remove(); G.noSpawn = false;
    }
    return !bad.length || bad.join(', ');
  });
  T('pedal bikes and BMXs are quicker', () => {
    const run = (type) => { reset(); G.noSpawn = true; tp(W.rp(3) + 2.5, W.rp(1) + 8); const b = new Car(type, W.rp(3) + 2.5, W.rp(1) + 8, 0); G.enterCar(b); Input.keys.KeyW = true; steps(3); Input.keys.KeyW = false; const v = b.v; G.exitCar(); b.remove(); G.noSpawn = false; return v * 3.6; };
    const bike = run('bicycle'), bmx = run('bmx');
    return (bike > 60 && bmx > 55) || `pedal bike ${bike.toFixed(0)} km/h, BMX ${bmx.toFixed(0)} km/h`;
  });
  T('pedal bikes and BMXs: fall over, hop back on, vanish if left', () => {
    const bad = [];
    for (const type of ['bicycle', 'bmx']) {
      reset(); G.noSpawn = true; tp(0, 25); const b = new Car(type, 1.5, 25, 0); G.enterCar(b); G.god = true;
      b.damage(9999, 0, 0, null); steps(0.4);
      const thrown = !P.inCar && b.fallen && !b.wreck && b.burning <= 0;
      steps(5);
      const back = P.inCar === b && !b.fallen;
      // knocked over with nobody on it: no explosion, and it despawns after its timer
      G.exitCar(); const left = b.leftT;
      explosion(b.x + 1, b.z, 7, 120, null); steps(1);
      const survived = !b.wreck && !b.dead && b.burning <= 0 && b.fallen;
      b.leftT = 0.5; steps(1);
      if (!(thrown && back && left > 100 && survived && b.dead)) bad.push(`${type}: thrown ${thrown} back on ${back} timer ${left && left.toFixed(0)} survived blast ${survived} despawned ${b.dead}`);
      G.god = false; if (P.inCar) G.exitCar(true); if (!b.dead) b.remove(); G.noSpawn = false;
    }
    reset(); tp(0, 25); const mb = new Car('motorbike', 1.5, 25, 0); mb.damage(9999, 0, 0, null); steps(7.5);
    if (!mb.wreck) bad.push('motorbike should still burn and explode'); mb.remove();
    return !bad.length || bad.join(' | ');
  });
  T('land a helicopter on a roof, get out, walk, get back in', () => {
    reset(); G.noSpawn = true; G.god = true;
    const b = W.buildings.filter((k) => k.h > 15 && k.maxX - k.minX > 12 && k.maxZ - k.minZ > 12).sort((p, q) => q.h - p.h)[0];
    const cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2;
    const h = new Chopper('tour', cx, cz, 0, { y: b.h + 8 }); h.rotor = 1; G.enterHeli(h);
    Input.keys.ShiftLeft = true; steps(4); Input.keys.ShiftLeft = false;
    const landedOnRoof = Math.abs(h.y - b.h) < 0.6;
    const out = G.exitHeli(); zoneT = 0; steps(0.3);
    const onRoof = Math.abs(P.y - b.h) < 0.6 && G.playerZone === 'rooftop';
    // cops in the street can't see you up here
    const cop = spawnCop(b.minX - 6, cz, 'chase'); Heat.add(2, 5, 'test'); const seen = copSees(cop, P.x, P.z, dist(cop.x, cop.z, P.x, P.z));
    G.inputOverride = { mx: 0.3, mz: 0 }; steps(0.5); G.inputOverride = null; const stillUp = Math.abs(P.y - b.h) < 0.6;
    G.interact = computeInteract(); const lbl = G.interact.f && G.interact.f.label; if (G.interact.f) G.interact.f.run();
    const backIn = P.inHeli === h;
    G.god = false; if (P.inHeli) G.exitHeli(true); h.remove(); G.noSpawn = false;
    return (landedOnRoof && out && onRoof && !seen && stillUp && backIn) || `landed ${landedOnRoof} (heli y ${h.y.toFixed(1)} roof ${b.h.toFixed(1)}) out ${out} onRoof ${onRoof} (y ${P.y.toFixed(1)} zone ${G.playerZone}) seen ${seen} stillUp ${stillUp} backIn ${backIn} (${lbl})`;
  });
  T('walking off a tall roof hurts', () => {
    reset(); G.noSpawn = true; G.S.armor = 0; P.hp = 100;
    const b = W.buildings.filter((k) => k.h > 15).sort((p, q) => q.h - p.h)[0], cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2, blk = W.nearestBlock(cx, cz);
    tp(cx, cz); P.y = b.h;
    G.inputOverride = { mx: Math.sign(cx - blk.cx) || 1, mz: 0 }; let hurt = false;
    for (let i = 0; i < 360; i++) { step(STEP); if (P.hp < 100 || G.respawning) hurt = true; }
    G.inputOverride = null; steps(1); G.noSpawn = false;
    return (hurt && P.y < 1) || `hp ${P.hp} y ${P.y.toFixed(1)} roof ${b.h.toFixed(1)}`;
  });
  T('getting out on a roof edge never drops you off it', () => {
    reset(); G.noSpawn = true; G.S.armor = 0; P.hp = 100; G.S.parachute = 0;
    const b = W.buildings.filter((k) => k.h > 15 && k.maxX - k.minX > 10).sort((p, q) => q.h - p.h)[1];
    // perch the chopper with its centre just past the roof's east edge
    const h = new Chopper('tour', b.maxX + 1.2, (b.minZ + b.maxZ) / 2, 0, { y: b.h }); h.rotor = 0; G.enterHeli(h); steps(0.2);
    const landed = G.heliLanded(h), out = G.exitHeli(); steps(2);
    const ok = out && Math.abs(P.y - b.h) < 0.6 && P.hp === 100 && !G.respawning;
    if (P.inHeli) G.exitHeli(true); h.remove(); G.noSpawn = false;
    return ok || `landed ${landed} out ${out} y ${P.y.toFixed(1)} roof ${b.h.toFixed(1)} hp ${P.hp}`;
  });
  T('parachute: bail out of a flying chopper and land safely', () => {
    reset(); G.noSpawn = true; G.S.armor = 0; P.hp = 100; G.S.cash = 5000; G.S.parachute = 0;
    const bought = G.buy('parachute');
    const h = new Chopper('tour', -150, -W.HWY - 40, 0, { y: 45 }); h.rotor = 1; G.enterHeli(h); steps(0.2);
    const bailed = G.exitHeli() && !P.inHeli;
    steps(0.6); G.jumpQ = true; steps(0.1); const open = !!P.chute;
    for (let i = 0; i < 60 * 30 && (P.chute || P.y > 0.5); i++) step(STEP);
    const safe = P.y - W.floorAt(P.x, P.z, P.y) < 0.1 && P.hp === 100 && !P.chute && !G.respawning;
    steps(5); const crashed = h.dead;
    // and without one you can't bail out
    reset(); G.S.parachute = 0; const h2 = new Chopper('tour', -150, -W.HWY - 40, 0, { y: 30 }); h2.rotor = 1; G.enterHeli(h2); steps(0.1);
    const blocked = !G.exitHeli() && P.inHeli === h2; G.exitHeli(true); h2.remove(); G.noSpawn = false;
    return (bought && bailed && open && safe && crashed && blocked) || `bought ${bought} bailed ${bailed} open ${open} safe ${safe} (hp ${P.hp} y ${P.y.toFixed(1)} floor ${W.floorAt(P.x, P.z, P.y)} chute ${P.chute}) chopper crashed ${crashed} no-chute blocked ${blocked}`;
  });
  T('jump off a tall building and glide down with the parachute', () => {
    reset(); G.noSpawn = true; G.S.armor = 0; P.hp = 100; G.S.parachute = 1;
    const b = W.buildings.filter((k) => k.h > 25).sort((p, q) => q.h - p.h)[0], cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2, blk = W.nearestBlock(cx, cz), dir = Math.sign(cx - blk.cx) || 1;
    tp(cx, cz); P.y = b.h; P.facing = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    G.inputOverride = { mx: dir, mz: 0 }; let opened = false, startX = 0, hurt = false;
    for (let i = 0; i < 60 * 40 && !(opened && P.y < 0.5 && !P.chute); i++) {
      step(STEP);
      if (!opened && P.y < b.h - 4) { G.jumpQ = true; startX = P.x; opened = true; G.inputOverride = null; }
      if (P.hp < 100 || G.respawning) hurt = true;
    }
    const glided = Math.abs(P.x - startX); G.noSpawn = false;
    return (opened && !hurt && glided > 20) || `opened ${opened} hurt ${hurt} glided ${glided.toFixed(1)} m y ${P.y.toFixed(1)}`;
  });
  T('physics: Box3D engine loaded', () => (Phys.ready ? true : new URLSearchParams(location.search).has('nophys') ? 'SKIP' : 'Box3D did not load'));
  T('ragdoll: knocked-out pedestrian goes limp, settles, then gets up', () => {
    if (!Phys.ready) return 'SKIP';
    reset(); G.noSpawn = true; tp(W.rp(3) + 2.5, W.rp(4) + 25);
    const p = spawnPed(P.x + 3, P.z, W.nearestBlock(P.x, P.z), 1, 1); p.kx = 9; p.yv = 5; p.hurt(999, P.x, P.z, 4, null);
    const limp = !!p.ragdoll && Phys.ragdolls.includes(p);
    steps(3);
    const r = p.ragdoll, t = r.parts.torso.b.getPosition(), h = r.parts.head.b.getPosition();
    const settled = isFinite(t.x + t.y + t.z + h.y) && t.y < 1 && Math.abs(p.x - t.x) < 0.01 && dist(p.x, p.z, P.x + 3, P.z) > 1;
    const bodiesDown = Phys.ragdollBodies;
    p.downT = 0; steps(0.2); p.animate(STEP);
    const up = !p.ragdoll && !p.down && Phys.ragdollBodies === bodiesDown - 6 && Math.abs(p.rig.torso.position.y - 1.27) < 0.01 && p.rig.root.visible && Math.abs(p.rig.root.position.x - p.x) < 0.5;
    const outside = !W.collideCircle({ x: p.x, z: p.z }, p.r);
    p.remove(); G.noSpawn = false;
    return (limp && settled && up && outside) || `limp ${limp} settled ${settled} (torso y ${t.y.toFixed(2)}) up ${up} [ragdoll ${!!p.ragdoll} down ${p.down} torsoY ${p.rig.torso.position.y.toFixed(2)} rootDx ${(p.rig.root.position.x - p.x).toFixed(2)} visible ${p.rig.root.visible}] outside ${outside} ragdoll bodies ${bodiesDown}->${Phys.ragdollBodies}`;
  });
  T('ragdolls are capped at 8 at a time', () => {
    if (!Phys.ready) return 'SKIP';
    reset(); G.noSpawn = true; tp(0, 25); const peds = [];
    for (let i = 0; i < 12; i++) { const p = spawnPed(P.x + (i % 4) * 2 - 3, P.z + Math.floor(i / 4) * 2 + 2, W.nearestBlock(P.x, P.z), 1, 1); p.hurt(999, P.x, P.z, 2, null); peds.push(p); }
    steps(0.5); const n = Phys.ragdolls.length;
    for (const p of peds) p.remove(); G.noSpawn = false;
    return (n <= 8 && Phys.ragdolls.length === 0) || `ragdolls ${n}, left after cleanup ${Phys.ragdolls.length}`;
  });
  T('player ragdolls when knocked out and stands up after respawn', () => {
    if (!Phys.ready) return 'SKIP';
    reset(); tp(0, 25); G.S.armor = 0; P.kx = 6; G.hurtPlayer(500, P.x - 1, P.z, 4, null);
    const limp = !!P.ragdoll; steps(0.6);
    return (limp && !P.ragdoll && !P.down && Math.abs(P.rig.torso.position.y - 1.27) < 0.01) || `limp ${limp} ragdoll after ${!!P.ragdoll} down ${P.down}`;
  });
  T('knocked out under a parachute: you respawn without it, character fully reset', () => {
    reset(); tp(0, 25); G.S.armor = 0; P.y = 30; P.yv = -2; P.chute = true; steps(0.3);
    const gliding = P.chute && P.y > 20;
    G.hurtPlayer(500, P.x - 1, P.z, 4, null); const dropped = !P.chute;
    for (let i = 0; i < 600 && (G.respawning || P.down); i++) step(STEP);
    steps(0.5);
    const upright = Math.abs(P.rig.torso.position.y - 1.27) < 0.01 && Math.abs(P.rig.body.rotation.x) < 0.01 && P.rig.root.visible && G.stamina === 100;
    return (gliding && dropped && !P.chute && !P.down && P.y === 0 && !P.jumping && upright) || `gliding ${gliding} chute dropped ${dropped} chute after ${P.chute} down ${P.down} y ${P.y.toFixed(2)} jumping ${P.jumping} upright ${upright}`;
  });
  T('a car sends a street bin flying', () => {
    if (!Phys.ready) return 'SKIP';
    reset(); G.noSpawn = true; const x = W.rp(3) + 2.5, z = W.rp(4) + 10;
    const prop = { kind: 'bin', x, y: 0.5, z: z + 12, q: new THREE.Quaternion(), body: null, mesh: Phys.propMesh('bin') }; Phys.props.push(prop);
    tp(x, z); const car = new Car('sedan', x, z, 0); G.enterCar(car); car.v = 18; car.vz = 18; Input.keys.KeyW = true;
    steps(2); Input.keys.KeyW = false;
    const moved = dist(prop.x, prop.z, x, z + 12);
    G.exitCar(); car.remove(); Phys.kill(prop.body); G.scene.remove(prop.mesh); Phys.props.splice(Phys.props.indexOf(prop), 1); G.noSpawn = false;
    return moved > 2 || 'bin moved ' + moved.toFixed(2);
  });
  T('explosions throw props and ragdolls', () => {
    if (!Phys.ready) return 'SKIP';
    reset(); G.noSpawn = true; tp(0, 25);
    const prop = { kind: 'crate', x: 3, y: 0.45, z: 25, q: new THREE.Quaternion(), body: null, mesh: Phys.propMesh('crate') }; Phys.props.push(prop); steps(0.6);
    explosion(1, 25, 7, 0, null); let top = 0; for (let i = 0; i < 40; i++) { step(STEP); top = Math.max(top, prop.y); }
    Phys.kill(prop.body); G.scene.remove(prop.mesh); Phys.props.splice(Phys.props.indexOf(prop), 1); G.noSpawn = false;
    return top > 1.2 || 'crate peak height ' + top.toFixed(2);
  });
  T('vehicle damage: crashes dent the car and crack the glass', () => {
    reset(); G.noSpawn = true; const b = W.blocks.find((k) => k.type === 'city');
    const car = new Car('sedan', b.cx, b.cz - 26, 0); tp(b.cx + 2, b.cz - 26); G.enterCar(car); car.v = 22; car.vz = 22; Input.keys.KeyW = true;
    steps(1.2); Input.keys.KeyW = false;
    let moved = 0; for (const d of car.dentable) { const a = d.m.geometry.attributes.position.array; for (let i = 0; i < a.length; i++) moved = Math.max(moved, Math.abs(a[i] - d.orig[i])); }
    const glass = car.glassMats.length && car.glassMats[0].color.getHexString() !== '22303c';
    const bumperOff = car.bumpers.some((x) => !x.on);
    G.exitCar(); car.remove(); G.noSpawn = false;
    return (moved > 0.05 && car.hp < car.maxHp && bumperOff) || `dent ${moved.toFixed(3)} hp ${car.hp.toFixed(0)}/${car.maxHp} glass changed ${glass} front bumper off ${bumperOff}`;
  });
  T('vehicle damage: a wrecked car is slower; Rusty repairs it', () => {
    const run = (dmg) => { reset(); G.noSpawn = true; tp(-235, -W.HWY - 3); const car = new Car('sedan', -235, -W.HWY + 7.5, Math.PI / 2); G.enterCar(car); car.hp = car.maxHp * dmg; Input.keys.KeyW = true; steps(5); Input.keys.KeyW = false; const v = car.v; G.exitCar(); car.remove(); G.noSpawn = false; return v; };
    const healthy = run(1), wrecked = run(0.25);
    reset(); const ch = W.places.chop; tp(ch.x + 3, ch.z); const car = new Car('sedan', ch.x, ch.z, 0); G.enterCar(car);
    car.damage(60, car.x + 3, car.z); G.S.cash = 5000; const hp0 = car.hp; G.interact = computeInteract();
    const offered = !!G.interact.r; if (offered) G.interact.r.run();
    let dent = 0; for (const d of car.dentable) { const a = d.m.geometry.attributes.position.array; for (let i = 0; i < a.length; i++) dent = Math.max(dent, Math.abs(a[i] - d.orig[i])); }
    const fixed = car.hp === car.maxHp && dent === 0 && G.S.cash < 5000; G.exitCar(); car.remove();
    return (wrecked < healthy * 0.85 && offered && fixed) || `healthy ${healthy.toFixed(1)} wrecked ${wrecked.toFixed(1)} repair offered ${offered} fixed ${fixed} (hp ${hp0.toFixed(0)}→${car.hp.toFixed(0)}, dent ${dent.toFixed(3)})`;
  });
  T('smash: a fast car snaps a tree, a slow one stops', () => {
    reset(); G.noSpawn = true; const x = -150, z = -W.HWY + 7.5;
    W.addTree(x + 25, z, 'round'); const t1 = W.trees[W.trees.length - 1];
    tp(x, z); const car = new Car('sedan', x, z, Math.PI / 2); G.enterCar(car); car.v = 20; car.vx = 20; Input.keys.KeyW = true; steps(2); Input.keys.KeyW = false;
    const snapped = t1.col.removed && car.x > x + 27 && car.v > 6; G.exitCar(); car.remove();
    W.addTree(x + 12, z + 5, 'pine'); const t2 = W.trees[W.trees.length - 1];
    tp(x, z + 5); const slow = new Car('sedan', x, z + 5, Math.PI / 2); G.enterCar(slow); slow.v = 5; slow.vx = 5; steps(3);
    const stood = !t2.col.removed && slow.x < x + 12; G.exitCar(); slow.remove(); W.removeCollider(t2.col); G.noSpawn = false;
    return (snapped && stood) || `fast: tree down ${t1.col.removed} car x ${car.x.toFixed(1)} v ${car.v.toFixed(1)} | slow: tree standing ${!t2.col.removed}`;
  });
  T('smash: street poles go down and gas pumps explode', () => {
    reset(); G.noSpawn = true;
    const l = W.lampSpots.find((k) => !k.col.removed); tp(l.x - 10 * Math.SQRT1_2, l.z - 10 * Math.SQRT1_2);
    const car = new Car('sports', P.x, P.z, Math.PI / 4); G.enterCar(car); car.v = 14; car.vx = 14 * Math.SQRT1_2; car.vz = 14 * Math.SQRT1_2; steps(1.5);
    const pole = l.col.removed; G.exitCar(); car.remove();
    const pump = W.colliders.find((c) => c.destructible && c.destructible.kind === 'pump' && !c.removed);
    tp(pump.destructible.x, pump.destructible.z - 9); const c2 = new Car('sedan', P.x, P.z, 0); G.enterCar(c2); G.god = true; c2.v = 12; c2.vz = 12; steps(1.5); G.god = false;
    const boom = pump.removed && !pump.destructible.ref.visible && c2.hp < c2.maxHp;
    if (P.inCar) G.exitCar(true); c2.remove(); G.noSpawn = false;
    return (pole && boom) || `pole down ${pole} pump exploded ${boom}`;
  });
  T('smash: explosions flatten nearby trees', () => {
    reset(); W.addTree(-150, -W.HWY + 20, 'pine'); const t = W.trees[W.trees.length - 1];
    explosion(-148, -W.HWY + 20, 7, 50, null); return t.col.removed || 'tree survived';
  });
  T('sprint is faster, burns stamina and recovers when you stop', () => {
    reset(); G.noSpawn = true; tp(-150, -W.HWY + 7.5); G.stamina = 100; G.winded = false;
    G.inputOverride = { mx: 1, mz: 0 }; Input.keys.ShiftLeft = true; steps(0.5);
    const fast = Math.hypot(P.vx, P.vz); steps(7);
    const tired = G.stamina, slowed = Math.hypot(P.vx, P.vz), wasWinded = G.winded;
    Input.keys.ShiftLeft = false; G.inputOverride = null; steps(4);
    const back = G.stamina; G.noSpawn = false;
    return (fast > 9 && wasWinded && tired < 30 && slowed < 5.5 && back > 80) || `sprint ${fast.toFixed(1)} m/s, stamina after 7.5 s ${tired.toFixed(0)}, speed then ${slowed.toFixed(1)}, after resting ${back.toFixed(0)}`;
  });
  T('save and load', () => {
    G.S.cash = 4321; G.S.storyDone = 3; G.save();
    let ok = false; try { localStorage.setItem('lr.t', '1'); ok = localStorage.getItem('lr.t') === '1'; } catch (e) { ok = false; }
    if (!ok) return 'SKIP';
    const s = G.loadSave(); return (s && s.cash === 4321 && s.storyDone === 3) || 'loaded ' + JSON.stringify(s && s.cash);
  });
  T('heat 5 on foot for 20 s', () => {
    reset(); tp(0, 25); G.god = true; Heat.add(5, 5, 'test'); steps(20); G.god = false;
    const cops = G.npcs.filter((n) => n.kind === 'cop').length, cars = G.cars.filter((c) => c.police && c.siren).length;
    return (cops > 0 && cars > 0) || `cops ${cops} cars ${cars} heat ${Heat.level}`;
  });
  T('heat 4 on the highway: roadblock appears ahead', () => {
    reset(); G.noSpawn = true; tp(-235, -W.HWY - 3); const car = new Car('sedan', -235, -W.HWY + 7.5, Math.PI / 2); G.enterCar(car); G.god = true;
    Heat.add(4, 5, 'test'); Input.keys.KeyW = true; let seen = false, minV = 99;
    for (let i = 0; i < 480; i++) { step(STEP); if (Roadblocks.list.length) seen = true; if (i > 120) minV = Math.min(minV, Math.abs(car.v)); }
    Input.keys.KeyW = false; G.god = false; G.noSpawn = false;
    return seen || `no roadblock appeared (zone ${G.playerZone}, slowest ${minV.toFixed(1)} m/s)`;
  });
  T('city keeps running for 30 s', () => {
    reset(); tp(W.places.hideout.x, W.places.hideout.z + 2); steps(30);
    const peds = G.npcs.filter((n) => n.kind === 'ped').length, cars = G.cars.length;
    return (peds > 10 && cars > 8) || `peds ${peds} cars ${cars}`;
  });

  el.textContent = out.join('\n');
  document.title = out.some((l) => l.startsWith('FAIL')) ? 'AUTOTEST FAIL' : 'AUTOTEST PASS';
  renderer.render(G.scene, updateCamera(0.016));
  // audio: render a busy mix offline and check it is audible, finite and not clipping
  try {
    const off = new OfflineAudioContext(2, 44100 * 3, 44100);
    Sfx.init(off);
    Sfx.shot('pistol', 5, 0); Sfx.shot('shotgun', -10, 3); Sfx.explode(20, 10); Sfx.cash(); Sfx.punch(1, 1); Sfx.crash(0.8, 3, 0); Sfx.sting('heat'); Sfx.thunder();
    for (let i = 0; i < 30; i++) Sfx.update(0.05, { playing: true, lx: 0, lz: 0, rx: 1, rz: 0, sirens: [{ x: 30, z: 5 }, { x: -20, z: 8 }], heat: 4, zone: 'street', rain: 1, slip: 0.6, engine: { speed: 20, throttle: 1, boost: false }, heli: { x: 10, z: -15 } });
    off.startRendering().then((buf) => {
      let peak = 0, sum = 0, bad = false; const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) { const v = d[i]; if (!isFinite(v)) bad = true; peak = Math.max(peak, Math.abs(v)); sum += v * v; }
      const rms = Math.sqrt(sum / d.length);
      const line = (!bad && rms > 0.005 && peak <= 1.0) ? 'PASS audio mix renders (rms ' + rms.toFixed(3) + ', peak ' + peak.toFixed(2) + ')' : 'FAIL audio mix — rms ' + rms + ' peak ' + peak + ' nan ' + bad;
      el.textContent += '\n' + line;
      if (line.startsWith('FAIL')) document.title = 'AUTOTEST FAIL';
    }, (e) => { el.textContent += '\nFAIL audio render rejected ' + e; document.title = 'AUTOTEST FAIL'; });
  } catch (e) { el.textContent += '\nFAIL audio — EXC ' + e.message; document.title = 'AUTOTEST FAIL'; }
}
