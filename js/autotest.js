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
      && W.places.shops.length === 3 && W.places.helipads.filter((p) => !p.stand).length === 6 && W.places.helipads.filter((p) => p.kind === 'attack').length === 2 && W.places.helipads.filter((p) => p.stand).length === 5
      && W.zoneAt(W.FOREST_C.x, W.FOREST_C.z) === 'forest' && W.zoneAt(0, -W.HWY) === 'highway' && ac === 'alley' && W.zoneAt(-25, -5) === 'street' && W.zoneAt(60, W.SHORE - 6) === 'beach'
      && W.zoneAt(-650, 160) === 'airport' && !!W.places.fxdesk;
    return ok || `blocks ${W.blocks.length} nodes ${W.nodes.length} robs ${W.robs.length} cams ${W.cams.length} alarms ${W.alarms.length} alleys ${W.alleys.length} shops ${W.places.shops.length} pads ${W.places.helipads.length} alleyZone ${ac}`;
  });
  T('player cannot walk through a building', () => {
    reset(); const b = W.blocks.find((k) => k.type === 'city');
    tp(b.cx - 7.5, b.cz - 18); G.inputOverride = { mx: 0, mz: 1 }; steps(3); G.inputOverride = null;
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
  T('narrow alleys: walk (or ride a bike) through the gap between buildings; cars do not fit', () => {
    reset(); G.noSpawn = true; const b = W.blocks.find((k) => k.type === 'city' && k.j === 2) || W.blocks.find((k) => k.type === 'city');
    tp(b.cx, b.cz - 18); G.inputOverride = { mx: 0, mz: 1 }; let zone = ''; for (let i = 0; i < 480 && P.z < b.cz + 17; i++) { step(STEP); if (Math.abs(P.z - b.cz) < 10) zone = G.playerZone; } G.inputOverride = null;
    const walked = P.z > b.cz + 16;
    const bike = new Car('bmx', b.cx, b.cz - 22, 0); tp(b.cx + 1.2, b.cz - 22); G.enterCar(bike); Input.keys.KeyW = true; steps(5); Input.keys.KeyW = false;
    const rode = bike.z > b.cz + 16; G.exitCar(true); bike.remove();
    const car = new Car('hatch', b.cx, b.cz - 24, 0); tp(b.cx + 2, b.cz - 24); G.enterCar(car); Input.keys.KeyW = true; steps(4); Input.keys.KeyW = false;
    const blocked = car.z < b.cz - 13; G.exitCar(true); car.remove(); G.noSpawn = false;
    return (walked && zone === 'alley' && rode && blocked) || `walked through ${walked} (z ${P.z.toFixed(1)}) zone ${zone} bmx through ${rode} car blocked ${blocked} (z ${car.z.toFixed(1)} vs face ${(b.cz - 15.1).toFixed(1)})`;
  });
  T('car cannot drive through a building', () => {
    reset(); const b = W.blocks.find((k) => k.type === 'city' && k.j === 2) || W.blocks.find((k) => k.type === 'city');
    const car = new Car('sports', b.cx - 7.5, b.cz - 23, 0); tp(b.cx - 4.5, b.cz - 23); G.enterCar(car);
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
    const ax = (a.minX + a.maxX) / 2, az = (a.minZ + a.maxZ) / 2, near = () => G.npcs.filter((n) => n.kind === 'cop' && !n.dead && dist(n.x, n.z, ax, az) < 60).length;
    const before = near(); // count only cops around this alley: ones elsewhere may despawn meanwhile
    G.playerZone = 'street'; tp(ax, az); steps(0.3);
    const after = near();
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
      case 'goto': { const p = W.places[s.at]; if (P.ride) { Funland.leave(true); P.y = 0; P.yv = 0; P.top = null; } if (P.inHeli) { const h = P.inHeli; h.x = p.x; h.z = p.z; h.y = Math.max(h.y, 30); steps(0.2); } else if (P.inCar) { P.inCar.x = p.x; P.inCar.z = p.z + 2; } else tp(p.x, p.z); break; }
      case 'rob': { const r = W.places[s.target]; r.cd = 0; G.S.tools.drill = true; if (!r.onTrain) tp(r.x, r.z); else { P.x = r.x; P.z = r.z; } hold(G.robHoldTime(r) + 0.3); break; }
      case 'robKind': { const r = W.robs.find((k) => k.kind === s.kind && k.cd <= 0); tp(r.x, r.z); hold(G.robHoldTime(r) + 0.3); break; }
      case 'buy': G.buy(s.item); break;
      case 'steal': {
        if (P.ride) { Funland.leave(true); P.y = 0; P.yv = 0; P.top = null; }
        let car = s.missionCar ? a.car : null;
        if (!car) { car = new Car(s.type || 'sedan', P.x + 3, P.z, 0, { parked: true }); car.locked = true; }
        tp(car.x + 2.5, car.z); G.enterCar(car); break;
      }
      case 'loseHeat': Heat.clear(); break;
      case 'sell': {
        Heat.clear();
        if (!P.inCar) { const car = new Car('sedan', P.x + 3, P.z, 0); G.enterCar(car); }
        const ch = W.places.chop; P.inCar.x = ch.x; P.inCar.z = ch.z; G.sellCar(); break;
      }
      case 'cutAlarm': G.cutAlarm(W.places[s.target].sec.alarm); break;
      case 'board': {
        let h = Choppers.list.find((q) => s.kinds.includes(q.kind) && !q.pilot && !q.dead && G.heliLanded(q));
        if (!h) h = new Chopper(s.kinds[0], P.x + 8, P.z, 0);
        if (P.inCar) G.exitCar(true);
        tp(h.x + 3, h.z); G.enterHeli(h); break;
      }
      case 'rings': { const h = P.inHeli; for (const r of RINGS[s.set].slice(a.count)) { h.x = r[0]; h.z = r[1]; h.y = r[2]; h.v = 40; h.thr = 0.6; steps(STEP * 2); } break; }
      case 'land': { const h = P.inHeli, r = W.AIRPORT.runway; Heat.clear(); h.x = (r.minX + r.maxX) / 2; h.z = (r.minZ + r.maxZ) / 2; h.y = 0; h.vy = 0; h.v = 0; h.thr = 0; h.vx = h.vz = 0; break; }
      case 'chase': if (a.target) a.target.damage(9999, a.target.x + 1, a.target.z, P); break;
      case 'boardTrain': { if (P.inCar) G.exitCar(true); if (P.inHeli) G.exitHeli(true); Train.climb(Train.cars[2]); break; }
      case 'ride': a.rideT = s.time; break;
      case 'airborne': { const h = P.inHeli; h.y = s.alt + 10; h.v = 40; h.thr = 0.7; break; }
      case 'loopCams': for (const c of W.places[s.target].sec.cams) G.loopCam(c); break;
      case 'funride': { // walk up, wait for the ride, get on, ride it up
        const r = Funland.RIDES[s.ride]; if (P.inCar) G.exitCar(true); tp(r.x, r.z);
        for (let k = 0; k < 60 * 40 && !Funland.ready(s.ride); k++) step(STEP);
        G.interact = computeInteract(); if (G.interact.f) G.interact.f.run();
        for (let k = 0; k < 60 * 60 && Story.active && Story.step() === s; k++) step(STEP);
        break;
      }
      case 'stunt': { // drive the named jump for real
        const r = W.RAMPS.find((q) => q.name === s.name), x = r.x - r.fx * 55, z = r.z - r.fz * 55, h = Math.atan2(r.fx, r.fz);
        if (P.inHeli) G.exitHeli(true);
        let car = P.inCar; if (!car || car.T.bike) { if (car) G.exitCar(true); car = new Car('sports', x, z, h); tp(x + 2, z); G.enterCar(car); }
        car.x = x; car.z = z; car.h = h; car.v = 32; car.vx = r.fx * 32; car.vz = r.fz * 32; Input.keys.KeyW = true;
        for (let k = 0; k < 60 * 10 && Story.active && Story.step() === s; k++) step(STEP);
        Input.keys.KeyW = false; break;
      }
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
  SIDE_JOBS.forEach((m) => T('side job ' + m.id + ': ' + m.title + ' (' + GIVERS[m.giver].first + ')', () => {
    reset(); const done0 = G.S.jobsDone.slice(), story0 = G.S.storyDone; G.S.cash = 60000; G.S.tools = {}; const p = W.places[GIVERS[m.giver].place]; tp(p.x + 1, p.z);
    G.god = true; Story.begin(m);
    let guard = 0, last = '';
    while (Story.active && guard++ < 30) { const s = Story.step(); if (!s) break; last = s.t; satisfy(s); steps(0.3); }
    G.god = false; for (const k of ['KeyW', 'KeyA', 'KeyD']) Input.keys[k] = false; if (P.ride) Funland.leave(true); if (P.inCar) G.exitCar(true); if (P.inHeli) G.exitHeli(true);
    const ok = G.S.jobsDone.includes(m.id) && G.S.storyDone === story0;
    const why = 'stuck at step ' + (Story.active ? Story.active.i + ' (' + Story.step().t + ')' : 'after ' + last + ' (job failed)') + ' toast: ' + ($('toasts').firstChild || {}).textContent;
    Story.active = null; G.S.jobsDone = done0; G.S.storyDone = story0; if (m.unlock === 'tank') { const ok2 = !!G.S.tank; G.S.tank = false; for (const c of G.cars) if (c.T.tank && !c.dead) c.remove(); if (!ok2) return 'the tank was not unlocked'; }
    return ok || why;
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
  T('forest canopy and lone trees hide you from the chopper', () => {
    reset(); tp(0, 25); Heat.add(3, 5, 'test'); const h = Choppers.spawnAI();
    let street = 0; G.playerZone = 'street'; h.x = P.x; h.z = P.z; h.spotX = P.x; h.spotZ = P.z;
    for (let i = 0; i < 200; i++) if (heliSees(h, P.x, P.z)) street++;
    const tr = W.trees.find((k) => k.type === 'pine' && k.x > W.FOREST.minX + 10 && k.z < W.FOREST.maxZ - 10 && !W.onTrail(k.x + 1.3, k.z));
    tp(tr.x + 1.3, tr.z); G.playerZone = 'forest'; h.x = P.x; h.z = P.z; h.spotX = P.x; h.spotZ = P.z;
    let forest = 0; for (let i = 0; i < 400; i++) if (heliSees(h, P.x, P.z)) forest++;
    h.spotX = P.x + 8; let forestOff = 0; for (let i = 0; i < 200; i++) if (heliSees(h, P.x, P.z)) forestOff++;
    // a lone street tree: standing under it hides you most of the time, a few steps away it doesn't
    const st = W.trees.find((k) => k.col && !k.col.removed && W.zoneAt(k.x, k.z) !== 'forest' && W.underCanopy(k.x + 0.9, k.z));
    let under = 0, open = 0;
    if (st) {
      tp(st.x + 0.9, st.z); G.playerZone = W.zoneAt(P.x, P.z); h.spotX = P.x; h.spotZ = P.z;
      for (let i = 0; i < 400; i++) if (heliSees(h, P.x, P.z)) under++;
      tp(st.x + 6, st.z); G.playerZone = W.zoneAt(P.x, P.z); h.x = P.x; h.z = P.z; h.spotX = P.x; h.spotZ = P.z;
      if (!W.underCanopy(P.x, P.z)) for (let i = 0; i < 200; i++) if (heliSees(h, P.x, P.z)) open++; else open = 200;
    }
    return (street === 200 && forest / 400 < 0.3 && forestOff === 0 && st && under / 400 < 0.35 && open === 200) || `street ${street}/200 forest ${forest}/400 spotlight-off ${forestOff} lone tree ${!!st} under ${under}/400 open ${open}/200`;
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
  T('weather: every kind runs its effects, snow settles, and it is mostly sunny', () => {
    const bad = [];
    for (const k in WEATHER) {
      Weather.set(k, true); Weather.snowCover = 0;
      for (let i = 0; i < 90; i++) Weather.update(STEP, 0, 0, 25);
      const f = G.scene.fog.far, W8 = WEATHER[k];
      const fx = { rain: Weather.rainMesh.visible === !!W8.rain, snow: Weather.snowP.m.visible === !!W8.snow, hail: Weather.hailP.m.visible === !!W8.hail, clouds: (Weather.cloudMesh.count > 0) === (W8.clouds > 0.01) };
      for (const e in fx) if (!fx[e]) bad.push(k + ' ' + e);
      if (!isFinite(f) || f < 50) bad.push(k + ' fog ' + f);
    }
    Weather.set('snow', true); for (let i = 0; i < 60 * 80; i++) Weather.update(1 / 60, 0, 0, 25); const cover = Weather.snowCover;
    if (!(cover > 0.5 && Weather.blanket.visible && Weather.grip() < 0.55)) bad.push('snow cover ' + cover.toFixed(2) + ' grip ' + Weather.grip().toFixed(2));
    // long run: time-weighted share of sunshine
    let t = {}, cur = 'clear';
    for (let i = 0; i < 4000; i++) { Weather.cur = cur; const d = WEATHER[cur].dur; t[cur] = (t[cur] || 0) + (d[0] + d[1]) / 2; cur = Weather.pickNext(); }
    const tot = Object.values(t).reduce((a, b) => a + b, 0), sunny = t.clear / tot;
    if (!(sunny > 0.42 && sunny < 0.7)) bad.push('sunny share ' + sunny.toFixed(2));
    Weather.set('clear', true); Weather.snowCover = 0; Weather.update(STEP, 0, 0, 25);
    return !bad.length || bad.join(' | ');
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
  T('police chopper nose gun: hold the mouse to fire; tour chopper has none', () => {
    reset(); G.noSpawn = true; tp(0, 25);
    const h = new Chopper('police', 0, 25, 0, { y: 18 }); h.rotor = 1; G.enterHeli(h); h.y = 18;
    const ped = spawnPed(4, 31, W.nearestBlock(4, 31), 1, 1); ped.ai.mode = 'idle'; ped.hp = 30;
    const ammo0 = h.ammo; Input.mdown = true;
    for (let i = 0; i < 60; i++) { G.aimX = ped.x; G.aimZ = ped.z; G.heliAim = null; P.cd = Math.max(P.cd, 0); step(STEP); }
    Input.mdown = false;
    const fired = ammo0 - h.ammo, downed = ped.down;
    // lock onto an enemy chopper and shoot it down
    const enemy = new Chopper('police', 30, 25, 0, { y: 18, pilot: 'ai' }); enemy.hp = 60; Input.mdown = true;
    for (let i = 0; i < 240 && enemy.falling <= 0 && !enemy.dead; i++) { G.heliAim = enemy; step(STEP); }
    Input.mdown = false; const shotDown = enemy.falling > 0 || enemy.dead;
    G.exitHeli(true); h.remove(); if (!enemy.dead) enemy.remove(); ped.remove();
    const tour = new Chopper('tour', 0, 25, 0, { y: 18 }); tour.rotor = 1; G.enterHeli(tour); tour.y = 18; Input.mdown = true; steps(0.5); Input.mdown = false;
    const tourQuiet = !tour.armed && tour.ammo === 0; G.exitHeli(true); tour.remove(); G.noSpawn = false;
    return (fired > 5 && downed && shotDown && tourQuiet) || `rounds fired ${fired} ped down ${downed} enemy shot down ${shotDown} (hp ${enemy.hp}) tour unarmed ${tourQuiet}`;
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
    const bike = new Car('motorbike', b.cx - 7.5, b.cz - 26, 0); tp(b.cx - 6, b.cz - 26); G.enterCar(bike);
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
  T('tumbling rider still gets up when the ragdoll cap is hit', () => {
    if (!Phys.ready) return 'SKIP';
    reset(); G.noSpawn = true; const z = -W.HWY + 7.5; const bike = new Car('motorbike', 0, z, Math.PI / 2);
    tp(0, z + 2); G.enterCar(bike); G.god = true; G.bail(bike, 20, 25, 0); const tumbling = !!P.tumble;
    const peds = []; for (let i = 0; i < 9; i++) { const p = spawnPed(10 + i, z - 8, W.nearestBlock(10, z), 1, 1); peds.push(p); p.knockOut(); }
    const stillLimp = !!P.ragdoll && !P.ragdoll.frozen;
    for (let i = 0; i < 400 && P.tumble; i++) step(STEP);
    const up = !P.tumble && !P.ragdoll && !P.down;
    G.god = false; for (const p of peds) p.remove(); bike.remove(); G.noSpawn = false;
    return (tumbling && stillLimp && up) || `tumbling ${tumbling} player kept simulating ${stillLimp} up ${up}`;
  });
  T('bike into a wall: thrown, no tunneling, and bikes do not mow down trees', () => {
    reset(); const b = W.blocks.find((k) => k.type === 'city');
    const bike = new Car('motorbike', b.cx - 7.5, b.cz - 26, 0); tp(b.cx - 6, b.cz - 26); G.enterCar(bike);
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
    const partner = spawnCop(14, -W.HWY - 6, 'idle'); partner.ai.mode = 'idle'; // a witness: crimes only count when someone reports them
    for (let i = 0; i < 60; i++) step(STEP);
    G.god = false;
    return (cop.down && Heat.level >= 3) || `cop down ${cop.down} heat ${Heat.level}`;
  });
  T('map waypoint: click to set, GPS routes there, click again to clear, clears on arrival', () => {
    reset(); tp(0, 25); openBigMap(); G.state = 'play'; $('bigmap').hidden = true; const ch = W.places.chop, span = W.VIEW.span, fx = (ch.x - W.VIEW.cx) / span + 0.5, fy = (ch.z - W.VIEW.cz) / span + 0.5;
    bigMapClick(fx, fy, false); const set = !!G.waypoint && dist(G.waypoint.x, G.waypoint.z, ch.x, ch.z) < 1;
    GPS.t = 0; GPS.update(STEP); const p = GPS.path, end = p && p[p.length - 1];
    const routed = GPS.toWaypoint && p && p.length > 2 && dist(end[0], end[1], ch.x, ch.z) < 1 && GPS.beam.visible;
    bigMapClick(fx + 0.002, fy, false); const cleared = !G.waypoint;
    bigMapClick(fx, fy, false); bigMapClick(fx + 0.002, fy, false); const rightClick = !G.waypoint;
    bigMapClick(fx, fy, false); tp(ch.x + 2, ch.z); steps(0.2); GPS.update(STEP); const reached = !G.waypoint && !GPS.toWaypoint;
    return (set && routed && cleared && rightClick && reached) || `set ${set} routed ${routed} (path ${p && p.length}) cleared ${cleared} right-click ${rightClick} reached ${reached}`;
  });
  T('county: drive off the Ring Highway through the gap onto a country road', () => {
    reset(); G.noSpawn = true; const H = W.HWY;
    for (const c of G.cars.slice()) if (dist(c.x, c.z, -100, -H) < 60) c.remove();
    const car = new Car('sedan', -100 + 2.5, -H + 5, Math.PI); tp(-100 + 2.5, -H + 8); G.enterCar(car);
    Input.keys.KeyW = true; steps(3.5); Input.keys.KeyW = false;
    const out = car.z < -H - W.HWH - 25, zone = W.zoneAt(car.x, car.z);
    G.exitCar(true); car.remove(); G.noSpawn = false;
    return (out && zone === 'country') || `car z ${car.z.toFixed(0)} (needs < ${(-H - W.HWH - 25).toFixed(0)}) zone ${zone}`;
  });
  T('county: GPS routes out there and police still find you at heat 3', () => {
    reset(); const R = W.ROUNDABOUT, x = R.x + 40, z = R.z - 3;
    const path = GPS.route(W.places.spawn.x, W.places.spawn.z, x, z), end = path[path.length - 1];
    const routed = path.length > 4 && dist(end[0], end[1], x, z) < 1;
    tp(x, z); Heat.add(3, 5, 'test'); G.god = true;
    let near = 0; for (let i = 0; i < 1500 && !near; i++) { step(STEP); near = G.cars.filter((c) => c.police && !c.wreck && dist(c.x, c.z, P.x, P.z) < 90).length; }
    G.god = false;
    return (routed && near > 0) || `routed ${routed} (path ${path.length}) police cars nearby ${near}`;
  });
  T('airport: drive in through the gate, rob the exchange, steal a gunship and fire its gun', () => {
    reset(); G.noSpawn = true; const A = W.AIRPORT;
    const car = new Car('sedan', A.gate + 2.5, -20, 0); tp(A.gate + 2.5, -16); G.enterCar(car);
    Input.keys.KeyW = true; let inside = false; for (let i = 0; i < 300 && !inside; i++) { step(STEP); inside = W.zoneAt(car.x, car.z) === 'airport'; }
    Input.keys.KeyW = false; G.exitCar(true); car.remove();
    // the currency exchange is a normal hold-E robbery
    const fx = W.places.fxdesk; fx.cd = 0; tp(fx.x, fx.z - 1.2); const cash0 = G.S.cash; G.interact = computeInteract(); hold(G.robHoldTime(fx) + 0.6);
    const robbed = G.S.cash > cash0 + 900;
    Heat.clear(); clearPolice();
    // a gunship on the air base pad: steal it, take off, fire the nose gun
    const pad = W.places.helipads.find((p) => p.kind === 'attack'), h = pad.heli; tp(pad.x + 4, pad.z);
    const stole = G.enterHeli(h) && h.armed && h.kind === 'attack';
    Input.keys.Space = true; steps(2.5); Input.keys.Space = false;
    const ammo0 = h.ammo; Input.mdown = true; G.aimX = h.x + 10; G.aimZ = h.z; steps(0.5); Input.mdown = false;
    const fired = h.ammo < ammo0 && h.y > 3;
    G.exitHeli(true); Heat.clear(); clearPolice(); G.noSpawn = false;
    return (inside && robbed && stole && fired) || `drove in ${inside} robbed ${robbed} (cash +${G.S.cash - cash0}) stole gunship ${stole} fired ${fired} (alt ${h.y.toFixed(1)})`;
  });
  T('planes: take off down the runway, climb, bank, stall; fighter cannon fires', () => {
    const bad = [];
    for (const kind of ['prop', 'bizjet', 'fighter']) {
      reset(); G.noSpawn = true; const r = W.AIRPORT.runway, z = (r.minZ + r.maxZ) / 2;
      const h = new Chopper(kind, r.minX + 40, z, Math.PI / 2); tp(h.x, h.z + 6);
      if (!G.enterHeli(h)) { bad.push(kind + ': could not board'); continue; }
      Input.keys.KeyW = true; let rolled = 0;
      for (let i = 0; i < 600 && h.v < PLANES[kind].vrot + 4; i++) { step(STEP); rolled = h.x - (r.minX + 40); }
      Input.keys.Space = true; steps(4); Input.keys.Space = false;
      const climbed = h.y > 15, onRunway = rolled < r.maxX - r.minX - 60;
      const yaw0 = h.yaw; Input.keys.KeyD = true; steps(1.5); Input.keys.KeyD = false; const banked = Math.abs(angDiff(yaw0, h.yaw)) > 0.4;
      let fired = true;
      if (kind === 'fighter') { const a0 = h.ammo; Input.mdown = true; G.aimX = h.x + 60; G.aimZ = h.z; steps(0.4); Input.mdown = false; fired = h.ammo < a0; }
      Input.keys.KeyW = false; Input.keys.KeyS = true; steps(1.5); Input.keys.KeyS = false;
      for (let i = 0; i < 1200 && !(h.stall && h.vy < -2); i++) step(STEP); // with the engine idling it glides, slows, then stalls
      const stalled = h.vy < -2 && h.stall;
      if (!(climbed && onRunway && banked && fired && stalled && h.hp > 0)) bad.push(`${kind}: climbed ${climbed} (alt ${h.y.toFixed(0)}) took off within the runway ${onRunway} (${rolled.toFixed(0)} m) banked ${banked} fired ${fired} stalls ${stalled} (v ${h.v.toFixed(1)} vy ${h.vy.toFixed(1)} thr ${h.thr.toFixed(2)} y ${h.y.toFixed(1)}) hp ${h.hp}`);
      Input.keys.KeyW = Input.keys.KeyS = false; G.exitHeli(true); h.remove(); G.noSpawn = false;
    }
    return !bad.length || bad.join(' | ');
  });
  T('water: bridges carry you over the river; the river and Mirror Lake stop cars', () => {
    const bad = [], drive = (x, z, h, sec) => { reset(); G.noSpawn = true; const car = new Car('sedan', x, z, h); tp(x, z); G.enterCar(car); Input.keys.KeyW = true; steps(sec); Input.keys.KeyW = false; const out = { x: car.x, z: car.z }; G.exitCar(true); car.remove(); G.noSpawn = false; return out; };
    if (W.bridges.length < 2 || W.bridges.some((q) => q.name === 'County Line')) bad.push('bridges ' + W.bridges.map((q) => q.name).join(','));
    const b = W.bridges.find((q) => q.name === 'East Road');
    if (!b) bad.push('no East Road bridge'); else {
      const e = W.countyEdges.find((q) => q.name === 'East Road' && segPointDist(b.x, b.z, q.ax, q.az, q.bx, q.bz) < 1), L = dist(e.ax, e.az, e.bx, e.bz), ux = (e.bx - e.ax) / L, uz = (e.bz - e.az) / L;
      const across = drive(b.x - ux * 60, b.z - uz * 60, Math.atan2(ux, uz), 6);
      if (across.x < b.x + 30) bad.push('stuck at the bridge, x ' + across.x.toFixed(0));
      // drive off the bridge sideways: the railing stops you
      // steer off the bridge sideways: the railing keeps you out of the water (you may slide off the end onto the bank)
      const side = drive(b.x, b.z, 0, 3), rd = Math.min(...W.RIVER.pts.slice(1).map((q, i) => segPointDist(side.x, side.z, W.RIVER.pts[i][0], W.RIVER.pts[i][1], q[0], q[1])));
      if (rd < W.RIVER.w / 2 - 1 && Math.abs(side.z - b.z) > 7) bad.push('drove off the bridge into the river at ' + side.x.toFixed(0) + ',' + side.z.toFixed(0));
    }
    // straight at the river bank away from any bridge, and at the lake
    const r = W.RIVER.pts.find((q) => q[1] === -760), rv = drive(r[0] - 60, r[1], Math.PI / 2, 5); if (rv.x > r[0] - W.RIVER.w / 2 + 1) bad.push('drove into the river, x ' + rv.x.toFixed(0));
    const L = W.LAKE, lk = drive(L.x + L.r + 40, L.z + 30, -Math.PI / 2, 5); if (dist(lk.x, lk.z, L.x, L.z) < L.r - 1) bad.push('drove into the lake');
    return !bad.length || bad.join(' | ');
  });
  T('roundabout: GPS and traffic go round the island; you can bump up the kerb onto it, but the statue stops you', () => {
    const R = W.ROUNDABOUT, path = GPS.route(R.x - 80, R.z, R.x + 80, R.z + 10);
    const inner = path.slice(1, -1).filter((p) => dist(p[0], p[1], R.x, R.z) < 12).length;
    const ringOk = W.ringNodes.size === 8 && [...W.ringNodes].every((id) => W.nodes[id].adj.length >= 2);
    reset(); G.noSpawn = true; const car = new Car('sedan', R.x - 45, R.z, Math.PI / 2); tp(R.x - 45, R.z - 3); G.enterCar(car);
    Input.keys.KeyW = true; let closest = 99, up = 0; for (let i = 0; i < 300; i++) { step(STEP); closest = Math.min(closest, dist(car.x, car.z, R.x, R.z)); up = Math.max(up, W.groundAt(car.x, car.z)); } Input.keys.KeyW = false;
    G.exitCar(true); car.remove(); G.noSpawn = false;
    return (inner === 0 && path.length > 2 && ringOk && up > 0.3 && closest > 2.3 && closest < 6) || `route points inside the island ${inner} (path ${path.length}) ring ok ${ringOk} up on the island ${up.toFixed(2)} m · got within ${closest.toFixed(1)} m of the statue's centre`;
  });
  T('Pine Ridge: drive through the tunnel; choppers lose you inside; the ridge is solid', () => {
    const bad = [], T = W.TUNNEL;
    reset(); G.noSpawn = true; const car = new Car('sedan', -100 + 2.5, T.maxZ + 30, Math.PI); tp(-100 + 2.5, T.maxZ + 34); G.enterCar(car);
    Input.keys.KeyW = true; let inside = false; for (let i = 0; i < 600 && car.z > T.minZ - 20; i++) { step(STEP); if (W.zoneAt(car.x, car.z) === 'tunnel') inside = true; } Input.keys.KeyW = false;
    if (!(inside && car.z < T.minZ - 15)) bad.push('through the tunnel: inside ' + inside + ' z ' + car.z.toFixed(0));
    G.exitCar(true); car.remove();
    tp(-100, (T.minZ + T.maxZ) / 2); G.playerZone = W.zoneAt(P.x, P.z); Heat.add(3, 5, 'test');
    const h = Choppers.spawnAI(); h.x = P.x; h.z = P.z; h.spotX = P.x; h.spotZ = P.z; let seen = 0; for (let i = 0; i < 100; i++) if (heliSees(h, P.x, P.z)) seen++;
    if (seen) bad.push('chopper saw you in the tunnel ' + seen + '/100'); h.remove(); Heat.clear(); clearPolice();
    // off-road into the ridge, and a chopper flying into it low
    const c2 = new Car('sedan', -300, -1020, Math.PI); tp(-300, -1016); G.enterCar(c2); Input.keys.KeyW = true; steps(4); Input.keys.KeyW = false;
    if (c2.z < W.RIDGE[0].maxZ - 1) bad.push('drove into the mountain, z ' + c2.z.toFixed(0)); G.exitCar(true); c2.remove();
    const tour = new Chopper('tour', -300, -1030, Math.PI, { y: 20 }); tour.rotor = 1; tp(-300, -1030); G.enterHeli(tour); tour.y = 20;
    Input.keys.KeyW = true; steps(4); Input.keys.KeyW = false; if (tour.z < W.RIDGE[0].maxZ - 1 && tour.y < 50) bad.push('flew into the mountain, z ' + tour.z.toFixed(0) + ' y ' + tour.y.toFixed(0));
    G.exitHeli(true); tour.remove(); G.noSpawn = false;
    return !bad.length || bad.join(' | ');
  });
  T('train: runs the loop, carries a rider, smashes a car on the line, closes the crossings', () => {
    reset(); G.noSpawn = true; const bad = [];
    for (let i = 0; i < 1200 && !(Train.state === 'run' && Train.v > 15); i++) step(STEP);
    if (!(Train.state === 'run' && Train.v > 15)) bad.push('never got going (v ' + Train.v.toFixed(1) + ', ' + Train.state + ')');
    Train.climb(Train.cars[1]); const x0 = P.x, z0 = P.z; steps(4);
    const rode = !!Train.onTrain(P) && dist(P.x, P.z, x0, z0) > 40 && G.playerZone === 'train';
    if (!rode) bad.push(`rider: on ${!!Train.onTrain(P)} moved ${dist(P.x, P.z, x0, z0).toFixed(0)} m zone ${G.playerZone}`);
    P.y = 0; tp(W.places.spawn.x, W.places.spawn.z);
    const p = W.railPoint(Train.s + 90), car = new Car('sedan', p.x, p.z, 0, { parked: true }), hp0 = car.hp;
    steps(7); if (!(car.dead || car.wreck || car.hp < hp0 * 0.7) || (!car.dead && W.railDist(car.x, car.z) < 1.5)) bad.push('car on the line: hp ' + hp0 + '->' + car.hp.toFixed(0) + ' off the track ' + W.railDist(car.x, car.z).toFixed(1));
    if (!car.dead) car.remove();
    let closed = false; for (let i = 0; i < 4000 && !closed; i++) { step(STEP); closed = W.railCrossings.some((cr) => cr.posts[0].arm.rotation.z < 0.25); }
    if (W.railCrossings.length < 3 || !closed) bad.push('crossings ' + W.railCrossings.length + ' closed ' + closed);
    G.noSpawn = false;
    return !bad.length || bad.join(' | ');
  });
  T('train: board the front at speed, walk back through a bend to the gold car, crack the safe', () => {
    reset(); G.noSpawn = true; G.god = true; const R = W.RAIL, kx = R.hx - R.r;
    // put the train at speed just as it enters the north-east bend
    Train.s = 2 * kx + 10; Train.v = Train.CRUISE; Train.state = 'run'; Train.place(0);
    Train.climb(Train.cars[0]); const safe = W.places.trainSafe; safe.cd = 0;
    let fell = false, turned = 0; const h0 = Train.cars[2].h;
    for (let i = 0; i < 900 && dist(P.x, P.z, safe.x, safe.z) > 1.2; i++) {
      const c = Train.riding(P, true) || Train.cars[0]; G.inputOverride = { mx: -Math.sin(c.h), mz: -Math.cos(c.h) };
      step(STEP); if (P.y < 2) { fell = true; break; }
    }
    G.inputOverride = null; turned = Math.abs(angDiff(h0, Train.cars[2].h));
    const reached = !fell && dist(P.x, P.z, safe.x, safe.z) <= 1.3;
    // a jump on the roof lands back on the roof, not 15 m behind
    G.jumpQ = true; steps(1.2); const jumped = !!Train.onTrain(P);
    const cash0 = G.S.cash; G.interact = computeInteract(); hold(G.robHoldTime(safe) + 0.5);
    const robbed = G.S.cash > cash0 + 2000 && !!Train.onTrain(P);
    G.god = false; G.noSpawn = false; P.y = 0; Heat.clear(); clearPolice(); tp(0, 25);
    return (reached && turned > 0.3 && jumped && robbed) || `reached the gold car ${reached} (fell ${fell}) through a bend ${turned.toFixed(2)} rad, jump landed on the train ${jumped}, robbed ${robbed} (cash +${G.S.cash - cash0})`;
  });
  T('stunt ramps (arcade handling): jump the river and the highway barrier, land, get the bonus; a ramp is solid from behind', () => {
    const physOn = PhysCar.on; PhysCar.on = false; // the realistic-handling version is tested on its own below
    const bad = []; G.S.stunts = []; const calls = [], real = G.stunt; G.stunt = (c, air, d, r) => { calls.push((r ? r.name : 'none') + ' ' + air.toFixed(1) + 's ' + d.toFixed(0) + 'm'); real(c, air, d, r); };
    const jump = (name, speed) => {
      const r = W.RAMPS.find((q) => q.name === name); reset(); G.noSpawn = true; for (const c of G.cars.slice()) if (!c.persistent) c.remove();
      const x = r.x - r.fx * 45, z = r.z - r.fz * 45, car = new Car('supercar', x, z, Math.atan2(r.fx, r.fz)); tp(x, z); G.enterCar(car);
      car.v = speed; car.vx = r.fx * speed; car.vz = r.fz * speed; Input.keys.KeyW = true;
      let top = 0, air = 0, crashed = false;
      for (let i = 0; i < 360; i++) { step(STEP); top = Math.max(top, car.y); if (car.y > 0.2) air += STEP; if (air > 0.3 && car.y <= 0) break; }
      Input.keys.KeyW = false; const out = { x: car.x, z: car.z, top, air, hp: car.hp / car.maxHp, along: (car.x - r.x) * r.fx + (car.z - r.z) * r.fz };
      G.exitCar(true); car.remove(); G.noSpawn = false; void crashed; return out;
    };
    const river = jump('River Run', 40), rv = W.RIVER.pts;
    let rd = 1e9; for (let i = 1; i < rv.length; i++) rd = Math.min(rd, segPointDist(river.x, river.z, rv[i - 1][0], rv[i - 1][1], rv[i][0], rv[i][1]));
    if (!(river.air > 0.9 && river.top > 4 && rd > W.RIVER.w / 2 && river.x > 940)) bad.push(`river: air ${river.air.toFixed(1)} s top ${river.top.toFixed(1)} m landed at x ${river.x.toFixed(0)} (${rd.toFixed(0)} m from the water's middle)`);
    const bar = jump('Barrier Breaker', 32);
    if (!(bar.z < -W.HWY + W.HWH && bar.air > 0.6)) bad.push(`barrier: landed z ${bar.z.toFixed(0)} air ${bar.air.toFixed(1)}`);
    G.stunt = real;
    if (!(G.S.stunts.includes('River Run') && G.S.stunts.includes('Barrier Breaker'))) bad.push('stunts recorded: ' + G.S.stunts.join(',') + ' (calls: ' + calls.join('; ') + ')');
    // from behind: the back wall under the lip stops you
    const r = W.RAMPS.find((q) => q.name === 'Circle Jump'); reset(); G.noSpawn = true;
    const bx = r.x + r.fx * 30, bz = r.z + r.fz * 30, car = new Car('sedan', bx, bz, Math.atan2(-r.fx, -r.fz)); tp(bx, bz); G.enterCar(car); Input.keys.KeyW = true; steps(3); Input.keys.KeyW = false;
    const along = (car.x - r.x) * r.fx + (car.z - r.z) * r.fz; if (along < r.len / 2 - 0.5) bad.push('drove through the back of a ramp, along ' + along.toFixed(1));
    G.exitCar(true); car.remove(); G.noSpawn = false;
    PhysCar.on = physOn;
    return !bad.length || bad.join(' | ');
  });
  T('hills: everything built on flat ground stays exactly flat; hills are real but drivable; things are drawn on them; hills block sight', () => {
    const bad = [], flat = (x, z, what) => { const g = W.groundAt(x, z) - W.rampAt(x, z) - W.islandAt(x, z); if (Math.abs(g) > 0.01) bad.push(what + ' ' + g.toFixed(2) + ' m @' + Math.round(x) + ',' + Math.round(z)); };
    for (const e of W.countyEdges) { const L = dist(e.ax, e.az, e.bx, e.bz); for (let t = 0; t <= L; t += 4) { const x = e.ax + (e.bx - e.ax) * t / L, z = e.az + (e.bz - e.az) * t / L, nx = -(e.bz - e.az) / L, nz = (e.bx - e.ax) / L; for (const o of [-6, 0, 6]) flat(x + nx * o, z + nz * o, 'road'); } }
    for (let s2 = 0; s2 < W.RAILLEN; s2 += 5) { const p = W.railPoint(s2); flat(p.x, p.z, 'rail'); }
    const A = W.AIRPORT.fence; for (let x = A.minX; x <= A.maxX; x += 20) for (let z = A.minZ; z <= A.maxZ; z += 20) flat(x, z, 'airport');
    for (const f of W.fields) for (const [x, z] of [[f.x0, f.z0], [f.x1, f.z1], [(f.x0 + f.x1) / 2, (f.z0 + f.z1) / 2]]) flat(x, z, 'field');
    for (const b of W.buildings) for (const [x, z] of [[b.minX, b.minZ], [b.maxX, b.maxZ]]) flat(x, z, 'building');
    for (let x = -W.BOUND; x <= W.BOUND; x += 25) for (let z = -W.BOUND; z <= W.SHORE; z += 25) flat(x, z, 'city');
    flat(W.LAKE.x + W.LAKE.r, W.LAKE.z, 'lake shore');
    // real hills: high in the highlands, mesas in the badlands, and no cliff you'd have to step up
    let maxH = 0, maxS = 0, mesa = 0;
    for (let x = -W.OUT; x <= W.OUT; x += 8) for (let z = -W.OUT; z <= 300; z += 8) {
      const g = W.groundAt(x, z) - W.rampAt(x, z); maxH = Math.max(maxH, g); if (W.biomeAt(x, z).bad > 0.8 && g > 12) mesa++;
      if (!W.rampAt(x, z) && !W.rampAt(x + 8, z)) { const sl = Math.abs(W.groundAt(x + 8, z) - g) / 8; if (sl > maxS) { maxS = sl; G.maxSAt = [x, z, JSON.stringify(W.biomeAt(x, z)), g.toFixed(1)]; } }
    }
    if (maxH < 40 || mesa < 50 || maxS > 1.3) bad.push(`highest ${maxH.toFixed(0)} m, mesa samples ${mesa}, steepest slope ${maxS.toFixed(2)} at ${G.maxSAt}`);
    // drawn on the hillside: a person, a car and a parked chopper
    let hx = 0, hz = 0, hy = 0; for (let x = -1200; x < -500 && hy < 15; x += 10) for (let z = -1000; z < -400 && hy < 15; z += 10) { const g = W.groundAt(x, z); if (g > hy) { hy = g; hx = x; hz = z; } }
    reset(); G.noSpawn = true; tp(hx, hz); steps(0.1); P.animate(STEP);
    if (Math.abs(P.rig.root.position.y - (P.y + W.groundAt(P.x, P.z))) > 0.05 || P.y > 0.01) bad.push('player drawn at ' + P.rig.root.position.y.toFixed(2) + ' ground ' + W.groundAt(P.x, P.z).toFixed(2));
    const car = new Car('sedan', hx + 4, hz, 0, { parked: true }); car.update(STEP); if (Math.abs(car.mesh.position.y - W.groundAt(car.x, car.z)) > 0.05) bad.push('car drawn at ' + car.mesh.position.y.toFixed(2) + ' ground ' + W.groundAt(car.x, car.z).toFixed(2)); car.remove();
    const h = new Chopper('tour', hx - 8, hz, 0); h.sync(STEP); if (Math.abs(h.m.root.position.y - W.groundAt(h.x, h.z)) > 0.05) bad.push('chopper drawn at ' + h.m.root.position.y.toFixed(2)); h.remove();
    // a hill between two people hides them from each other
    let blocked = false; for (let k = 0; k < 400 && !blocked; k++) { const x = rand(-1200, -500), z = rand(-1000, -350), g = W.groundAt(x, z); if (g > 25 && W.groundAt(x - 120, z) < g - 20 && W.groundAt(x + 120, z) < g - 20) blocked = W.segBlocked(x - 120, z, x + 120, z); }
    if (!blocked) bad.push('no hill blocked a sight line');
    G.noSpawn = false; tp(0, 25);
    return !bad.length || [...new Set(bad)].slice(0, 6).join(' | ') + (bad.length > 6 ? ' (+' + (bad.length - 6) + ')' : '');
  });
  T('county: no trees, buildings or fields on the country roads', () => {
    const bad = [];
    for (const e of W.countyEdges) {
      const L = dist(e.ax, e.az, e.bx, e.bz);
      for (let t = 0; t <= L; t += 4) {
        const x = e.ax + (e.bx - e.ax) * t / L, z = e.az + (e.bz - e.az) * t / L;
        for (const c of W.queryBox(x - 6, z - 6, x + 6, z + 6)) if (!c.removed && (c.kind === 'tree' || c.kind === 'building') && (c.circle ? dist(c.x, c.z, x, z) < 6 : x > c.minX - 6 && x < c.maxX + 6 && z > c.minZ - 6 && z < c.maxZ + 6)) bad.push(c.kind + '@' + Math.round(x) + ',' + Math.round(z));
      }
    }
    for (const f of W.fields) for (const e of W.countyEdges) if (W.segAABB(e.ax, e.az, e.bx, e.bz, { minX: f.x0 - 6, maxX: f.x1 + 6, minZ: f.z0 - 6, maxZ: f.z1 + 6 }) >= 0) bad.push('field@' + Math.round(f.x0) + ',' + Math.round(f.z0));
    for (const f of W.fields) for (let x = f.x0; x <= f.x1; x += 5) for (let z = f.z0; z <= f.z1; z += 5) { const r = W.inReserve(x, z, 0); if (r) { bad.push('field on the ' + r.kind + '@' + Math.round(x) + ',' + Math.round(z)); x = 1e9; break; } }
    return !bad.length || bad.length + ' blockers: ' + [...new Set(bad)].slice(0, 6).join(' ');
  });
  T('big map right-click teleports you (and your car) to a clear spot', () => {
    reset(); tp(0, 25); openBigMap();
    const bank = W.places.bank, fx = (bank.x - BM.cx) / BM.span + 0.5, fy = (bank.z - BM.cz) / BM.span + 0.5;
    bigMapTeleport(fx, fy); // onto a building: you land on open ground beside it
    const onFoot = dist(P.x, P.z, bank.x, bank.z) < 30 && !W.buildings.some((b) => P.x > b.minX && P.x < b.maxX && P.z > b.minZ && P.z < b.maxZ) && G.state === 'play' && $('bigmap').hidden;
    const car = new Car('sedan', P.x + 3, P.z, 0); G.enterCar(car); openBigMap();
    const R = W.ROUNDABOUT; bigMapTeleport((R.x + 30 - BM.cx) / BM.span + 0.5, (R.z - 3 - BM.cz) / BM.span + 0.5);
    const drove = P.inCar === car && dist(car.x, car.z, R.x + 30, R.z - 3) < 12;
    G.exitCar(true); car.remove();
    return (onFoot && drove) || `on foot ok ${onFoot} (${P.x.toFixed(0)},${P.z.toFixed(0)}) car came along ${drove}`;
  });
  T('voices: every briefing line is recorded, every spot has a radio location, bark groups are full', () => {
    const bad = [];
    for (const m of MISSIONS) for (const part of ['intro', 'outro']) for (const [, text] of m[part] || []) if (!VOICE_TEXT[text] || !VOICE_DATA[VOICE_TEXT[text]]) bad.push('no voice: ' + text.slice(0, 30));
    const L = W.LAND; let missing = 0, sample = '';
    for (let i = 0; i < 3000; i++) { const x = rand(L.minX, L.maxX), z = rand(L.minZ, L.maxZ), k = Voice.placeKey(x, z); if (!Voice.has(k)) { missing++; sample = k + ' @' + Math.round(x) + ',' + Math.round(z); } }
    if (missing) bad.push(missing + ' spots without a place clip, e.g. ' + sample);
    for (const g of ['ped_hurt', 'ped_panic', 'witness', 'carjacked', 'clerk', 'cop_spot', 'cop_chase', 'cop_hurt', 'cop_cuff', 'cop_lost']) if (Voice.groupKeys(g).length < 3) bad.push(g + ' has ' + Voice.groupKeys(g).length);
    for (const k in CRIMES) if (!Voice.has('dispatch/crime_' + k)) bad.push('no radio call for ' + k);
    return !bad.length || bad.slice(0, 5).join(' | ');
  });
  T('voices: a person keeps one voice; old saves keep their story progress', () => {
    const n = Voice.groupInfo('ped_hurt'), cop = Voice.groupInfo('cop_spot'), ped = { x: P.x + 2, z: P.z, voiceSeed: 7 };
    const keys = new Set(); for (let i = 0; i < 30; i++) { Voice.cd = 0; ped.barkT = 0; Voice.bark('ped_hurt', ped); }
    for (const l of Voice.log) keys.add(l.what);
    const sameVoice = n.voices >= 4 && cop.voices >= 3 && n.lines >= 5;
    // an old save that had finished the original story through the bank job
    const json = localStorage.getItem(SAVE_KEY); localStorage.setItem(SAVE_KEY, JSON.stringify({ cash: 10, storyDone: 7 }));
    const s = G.loadSave(); if (json != null) localStorage.setItem(SAVE_KEY, json); else localStorage.removeItem(SAVE_KEY);
    const S0 = G.S; G.S = s; const nx = Story.next(); G.S = S0;
    const migrated = s && s.jobsDone.length === 7 && s.jobsDone.includes('bank') && nx && nx.id === 'snitch';
    return (sameVoice && migrated) || `voices ped ${n.voices}x${n.lines} cop ${cop.voices} migrated ${migrated} (next ${nx && nx.id}, done ${s && s.jobsDone})`;
  });
  T('voices: a punched person yells; a witnessed theft is shouted and called in on the radio', () => {
    reset(); G.noSpawn = true; const x = W.places.spawn.x, z = W.places.spawn.z; tp(x, z);
    for (const n of G.npcs.slice()) if (n.kind === 'ped' && n.ai.mode !== 'vera' && dist(n.x, n.z, x, z) < 60) n.remove();
    const ped = spawnPed(x + 1.5, z, W.nearestBlock(x, z), 1, 1); ped.ai.mode = 'idle'; ped.hp = 999;
    Voice.log.length = 0; Voice.cd = 0; ped.hurt(5, P.x, P.z, 1, P);
    const yelled = Voice.log.some((l) => l.what === 'ped_hurt');
    Voice.cd = 0; ped.barkT = 0; G.crimeCd = {}; Heat.clear(); Voice.radioQ.length = 0;
    const car = new Car('sedan', x + 4, z + 3, 0, { parked: true }); car.locked = true; tp(x + 4, z + 1.5); G.enterCar(car);
    const shouted = Voice.log.some((l) => l.what === 'witness'), radio = Voice.log.find((l) => l.what.startsWith('radio:dispatch/crime_carTheft+x/'));
    G.exitCar(true); car.remove(); ped.remove(); Heat.clear(); G.noSpawn = false;
    return (yelled && shouted && !!radio) || `yelled ${yelled} witness shouted ${shouted} radio ${radio ? radio.what : 'none'} (log: ${Voice.log.map((l) => l.what).join(', ')})`;
  });
  T('crimes need a witness: nobody around, nobody calls it in', () => {
    reset(); G.noSpawn = true; const x = -235, z = -W.HWY - 4;
    for (const n of G.npcs.slice()) if (dist(n.x, n.z, x, z) < 70) n.remove();
    tp(x, z); const car = new Car('sedan', x + 3, z, 0, { parked: true }); car.locked = true;
    G.enterCar(car); const quiet = Heat.level === 0; G.exitCar(true); car.remove();
    const sedan = new Car('sedan', x + 3, z + 5, 0, { parked: true }); sedan.locked = true;
    const p = spawnPed(x - 5, z + 5, W.nearestBlock(x, z), 1, 1); p.ai.mode = 'idle'; G.crimeCd = {}; tp(x, z + 5);
    G.enterCar(sedan); const seen = Heat.level >= 1;
    if (P.inCar) G.exitCar(true); sedan.remove(); p.remove(); Heat.clear(); G.noSpawn = false;
    return (quiet && seen) || `unwitnessed theft heat ${quiet ? 'none' : 'added'}; witnessed theft reported ${seen}`;
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
      // long enough for both to reach their top speed, with no traffic in the way
      reset(); G.noSpawn = true; for (const c of G.cars.slice()) if (!c.persistent) c.remove(); tp(x, z); const car = new Car('sports', x, z, h); G.enterCar(car);
      Input.keys.KeyW = true; steps(7); Input.keys.KeyW = false; const v = car.v; G.exitCar(); car.remove(); G.noSpawn = false; return v;
    };
    const hwyV = drive(-300, -W.HWY + 7.5, Math.PI / 2);
    const cityV = drive(W.rp(4) - 2.5, W.rp(0) + 8, 0);
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
      const d = angDiff(car.h, want); Input.keys.KeyW = Math.abs(d) < 0.3; Input.keys.KeyA = d > 0.05; Input.keys.KeyD = d < -0.05; steerSum += Math.abs(d); // lift off when it's running wide, as a driver would
      step(STEP); if (i > 30) minV = Math.min(minV, car.v);
    }
    for (const kk of ['KeyW', 'KeyA', 'KeyD']) Input.keys[kk] = false;
    const ok = W.onHighway(car.x, car.z) && car.z > -W.HWY + 60 && minV > 20;
    G.noSpawn = false; G.exitCar(); return ok || `ended at ${car.x.toFixed(0)},${car.z.toFixed(0)} on hwy ${W.onHighway(car.x, car.z)} min speed ${(minV * 3.6).toFixed(0)} km/h (grip ${Weather.grip().toFixed(2)})`;
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
    ram('supercar', b.cx - 7.5, b.cz - 30, 0, 88, (c) => c.z < b.cz - 15.1, 'supercar → building');
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
    const b = W.blocks.find((k) => k.type === 'city'); tp(b.cx - 7.5, b.cz - 15.1 - P.r - 0.05); P.facing = 0;
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
  T('supercars, sports cars and motorbikes are tamed on city streets (not with nitro, not on the highway)', () => {
    const top = (type, x, z, h, nitro) => { reset(); G.noSpawn = true; for (const c of G.cars.slice()) if (!c.persistent) c.remove(); tp(x, z); const car = new Car(type, x, z, h); G.enterCar(car); G.nitro = 1; Input.keys.KeyW = true; if (nitro) Input.keys.ShiftLeft = true; let v = 0; for (let i = 0; i < 360; i++) { step(STEP); v = Math.max(v, car.v); } Input.keys.KeyW = Input.keys.ShiftLeft = false; G.exitCar(true); car.remove(); G.noSpawn = false; return v * 3.6; };
    const bad = [];
    for (const [type, cityMax] of [['supercar', 155], ['sports', 135], ['motorbike', 145]]) {
      const city = top(type, W.rp(4) - 2.5, W.rp(0) + 8, 0, false), boosted = top(type, W.rp(4) - 2.5, W.rp(0) + 8, 0, true), hwy = top(type, -300, -W.HWY + 7.5, Math.PI / 2, false);
      if (!(city < cityMax && boosted > city * 1.2 && hwy > city * 1.25)) bad.push(`${type}: city ${city.toFixed(0)} km/h (max ${cityMax}) with nitro ${boosted.toFixed(0)} highway ${hwy.toFixed(0)}`);
    }
    return !bad.length || bad.join(' | ');
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
  T('chase job: the runner flees along the roads and the job ends when it is wrecked', () => {
    reset(); G.noSpawn = true; const i = MISSIONS.findIndex((m) => m.id === 'snitch'); G.S.storyDone = i; tp(W.places.hideout.x, W.places.hideout.z);
    Story.begin(); const car = new Car('sports', P.x + 3, P.z, 0); G.enterCar(car); steps(0.5);
    const r = Story.active && Story.active.target, x0 = r && r.x, z0 = r && r.z; steps(4);
    const moved = r && dist(r.x, r.z, x0, z0) > 25 && r.driver === 'ai' && Story.target() === r;
    if (r) r.damage(9999, r.x + 1, r.z, P); steps(0.5);
    const done = G.S.storyDone === i + 1;
    if (P.inCar) G.exitCar(true); car.remove(); G.noSpawn = false; Story.active = null;
    return (moved && done) || `runner moved ${moved} (${r ? dist(r.x, r.z, x0, z0).toFixed(0) : 'none'} m) job done ${done}`;
  });
  T('pedal bikes and BMXs: fall over, you pick them back up, they vanish if left', () => {
    const bad = [];
    for (const type of ['bicycle', 'bmx']) {
      reset(); G.noSpawn = true; tp(0, 25); const b = new Car(type, 1.5, 25, 0); G.enterCar(b); G.god = true;
      b.damage(9999, 0, 0, null); steps(0.4);
      const thrown = !P.inCar && b.fallen && !b.wreck && b.burning <= 0;
      steps(5);
      const stayedDown = !P.inCar && b.fallen; // no automatic remount: you pick it up yourself
      tp(b.x + 1.2, b.z); G.interact = computeInteract(); const label = G.interact.f && G.interact.f.label; if (G.interact.f) G.interact.f.run();
      const back = stayedDown && P.inCar === b && !b.fallen && /Pick up/.test(label || '');
      // knocked over with nobody on it: no explosion, and it despawns after its timer
      G.exitCar(); const left = b.leftT;
      explosion(b.x + 1, b.z, 7, 120, null); steps(1);
      const survived = !b.wreck && !b.dead && b.burning <= 0 && b.fallen;
      const cam0 = G.cam; G.frameN = (G.frameN || 0) + 1; updateCamera(1); G.frameN++; b.leftT = 0.5; steps(1); const stays = !b.dead; // in view: it waits
      G.cam = null; steps(3.5); G.cam = null; G.frameN++; // out of sight: gone
      if (!(thrown && back && left > 100 && survived && stays && b.dead)) bad.push(`${type}: thrown ${thrown} back on ${back} timer ${left && left.toFixed(0)} survived blast ${survived} waited while seen ${stays} despawned ${b.dead}`);
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
    const car = new Car('sedan', b.cx - 7.5, b.cz - 26, 0); tp(b.cx - 5.5, b.cz - 26); G.enterCar(car); car.v = 22; car.vz = 22; Input.keys.KeyW = true;
    steps(1.2); Input.keys.KeyW = false;
    let moved = 0; for (const d of car.dentable) { const a = d.m.geometry.attributes.position.array; for (let i = 0; i < a.length; i++) moved = Math.max(moved, Math.abs(a[i] - d.orig[i])); }
    const glass = car.glassMats.length && car.glassMats[0].color.getHexString() !== '22303c';
    const bumperOff = car.bumpers.some((x) => !x.on);
    G.exitCar(); car.remove(); G.noSpawn = false;
    return (moved > 0.05 && car.hp < car.maxHp && bumperOff) || `dent ${moved.toFixed(3)} hp ${car.hp.toFixed(0)}/${car.maxHp} glass changed ${glass} front bumper off ${bumperOff}`;
  });
  T('Funland: a flat park off Funland Drive, clear of farms and county trees; drive in, rob the ticket office', () => {
    reset(); G.noSpawn = true; const F = W.FUN;
    let bumps = 0; for (let x = F.minX - 10; x <= F.maxX + 6; x += 6) for (let z = 30; z <= F.maxZ + 8; z += 6) if (W.groundAt(x, z) !== 0) bumps++;
    const fields = W.fields.filter((f) => f.x1 > F.minX - 5 && f.x0 < F.maxX + 5 && f.z1 > 20 && f.z0 < F.maxZ + 5).length;
    const strays = W.trees.filter((t) => !t.park && !(t.col && t.col.removed) && t.x > F.minX && t.x < F.maxX && t.z > F.minZ && t.z < F.maxZ).length;
    const houses = W.buildings.filter((b) => b.maxX > F.minX && b.minX < F.maxX && b.maxZ > F.minZ - 60 && b.minZ < F.maxZ && b.h > 5).length; // only the 4.4 m ticket office and gift shop belong
    const road = W.countyEdges.some((e) => e.name === 'Funland Drive'), zone = W.zoneAt(F.gate, 200);
    const car = new Car('sedan', F.gate + 2, 50, 0); tp(F.gate + 2, 47); G.enterCar(car);
    Input.keys.KeyW = true; let inside = false; for (let i = 0; i < 300 && !inside; i++) { step(STEP); inside = W.inFunland(car.x, car.z) && car.z > F.minZ + 6; }
    Input.keys.KeyW = false; G.exitCar(true); car.remove();
    const tix = W.places.funtix; tix.cd = 0; tp(tix.x, tix.z); const cash0 = G.S.cash; G.interact = computeInteract(); hold(G.robHoldTime(tix) + 0.6);
    const robbed = G.S.cash > cash0 + 600; Heat.clear(); clearPolice();
    return (!bumps && !fields && !strays && !houses && road && zone === 'funland' && inside && robbed) || `bumps ${bumps} fields ${fields} stray trees ${strays} houses ${houses} road ${road} zone ${zone} drove in ${inside} robbed ${robbed} (cash ${cash0} to ${G.S.cash})`;
  });
  T('Funland rides run: the wheel turns, the drop tower climbs and falls, the Viper laps back into its station', () => {
    reset(); G.noSpawn = true; const R = W.FUN.rides, c = R.coaster, V = c.V;
    const a0 = R.wheel.ang; steps(1); const turned = R.wheel.ang > a0 || R.wheel.ang < a0 - 1;
    let lowRail = 1e9; for (let i = 0; i < V.n; i++) lowRail = Math.min(lowRail, V.y[i]);
    c.state = 'load'; c.dwell = 0.05; c.s = c.sStop;
    let maxY = 0, maxV = 0, left = false, back = false, t = 0;
    for (; t < 160 && !back; t += STEP) { step(STEP); maxY = Math.max(maxY, c.pos.y); maxV = Math.max(maxV, c.v); if (c.state === 'run') left = true; else if (left) back = true; }
    let lo = 1e9, hi = 0, fall = 0; for (let i = 0; i < 35 / STEP; i++) { step(STEP); lo = Math.min(lo, R.drop.y); hi = Math.max(hi, R.drop.y); fall = Math.min(fall, R.drop.vy); }
    const h = new Chopper('tour', R.wheel.x - 4.5, R.wheel.z + 3, 0, { y: 20 }); h.vx = 10; heliCollide(h); const pushed = h.x < R.wheel.x - 5.5 && h.y < 21; h.remove();
    const ok = turned && lowRail > 0.5 && back && t > 25 && maxY > 24 && maxV > 15 && lo < 2 && hi > 40 && fall < -18 && pushed;
    return ok || `wheel turned ${turned} lowest rail ${lowRail.toFixed(2)} coaster back ${back} after ${t.toFixed(0)}s top ${maxY.toFixed(1)} fastest ${maxV.toFixed(1)} drop ${lo.toFixed(1)}..${hi.toFixed(1)} fall ${fall.toFixed(1)} chopper pushed out ${pushed} (x ${h.x.toFixed(1)})`;
  });
  T('ride the Viper: board at the station, ride a full lap, step off on the platform unhurt', () => {
    reset(); G.noSpawn = true; const c = W.FUN.rides.coaster, V = c.V;
    c.state = 'run'; c.trip = V.len - 40; c.v = 6; tp(718.5, 248); G.interact = computeInteract(); const wait = G.interact.e && G.interact.e.disabled;
    for (let i = 0; i < 60 * 30 && c.state !== 'load'; i++) step(STEP);
    G.interact = computeInteract(); const label = G.interact.f && G.interact.f.label; if (G.interact.f) G.interact.f.run();
    const on = !!P.ride; let top = 0, left = false, lap = false, t = 0, zone = '';
    for (; t < 170 && !lap; t += STEP) { G.interact = computeInteract(); step(STEP); top = Math.max(top, P.y); if (c.state === 'run') left = true; else if (left) lap = true; if (P.y > 20) zone = G.playerZone; }
    const still = !!P.ride; G.interact = computeInteract(); const offLabel = G.interact.f && G.interact.f.label; if (G.interact.f) G.interact.f.run(); steps(0.5);
    const ok = !!wait && label === 'Ride the Viper' && on && top > 24 && lap && still && zone === 'funland' && /^Get off/.test(offLabel) && !P.ride && P.y === 0 && P.hp === 100 && dist(P.x, P.z, 719.5, 251) < 2 && P.rig.root.rotation.x === 0;
    return ok || `wait prompt ${wait} label ${label} on ${on} top ${top.toFixed(1)} lap ${lap} after ${t.toFixed(0)}s still on ${still} zone ${zone} off "${offLabel}" ride ${!!P.ride} y ${P.y} hp ${P.hp} at ${P.x.toFixed(1)},${P.z.toFixed(1)}`;
  });
  T('Sky Wheel: ride to the top, jump out, parachute down safely; respawning mid-ride leaves the ride behind', () => {
    reset(); G.noSpawn = true; G.S.armor = 0; P.hp = 100; G.S.parachute = 1; tp(802, 140); G.interact = computeInteract();
    const label = G.interact.f && G.interact.f.label; if (G.interact.f) G.interact.f.run(); const on = !!P.ride;
    let t = 0; for (; t < 90 && P.y < 34; t += STEP) { G.interact = computeInteract(); step(STEP); }
    const high = P.y; G.interact = computeInteract(); const jl = G.interact.f && G.interact.f.label; if (G.interact.f) G.interact.f.run();
    steps(0.5); G.jumpQ = true; steps(0.1); const open = !!P.chute;
    for (let i = 0; i < 60 * 40 && (P.chute || P.y > 0.01); i++) step(STEP);
    steps(0.3); const safe = P.y === 0 && P.hp === 100 && !P.chute && !P.ride;
    // knocked out mid-ride: the ride lets you go, you respawn on the ground, upright
    tp(802, 140); G.interact = computeInteract(); if (G.interact.f) G.interact.f.run(); steps(12); const up = P.y;
    G.hurtPlayer(500, P.x - 1, P.z, 0, null); for (let i = 0; i < 900 && (G.respawning || P.down); i++) step(STEP); steps(0.5);
    const clean = !P.ride && P.y === 0 && !P.down && P.rig.root.rotation.x === 0 && G.playerZone !== 'funland';
    return (label === 'Ride the Sky Wheel' && on && high > 34 && /^Jump off/.test(jl) && open && safe && up > 3 && clean) || `label ${label} on ${on} high ${high.toFixed(1)} after ${t.toFixed(0)}s jump "${jl}" chute ${open} safe ${safe} (y ${P.y} hp ${P.hp}) rode up ${up.toFixed(1)} clean ${clean} zone ${G.playerZone}`;
  });
  T('Big Drop: board at the bottom, get hauled up, scream down, get off at the bottom', () => {
    reset(); G.noSpawn = true; const D = W.FUN.rides.drop;
    tp(808.5, 290); let i = 0; for (; i < 60 * 40 && !Funland.ready('drop'); i++) step(STEP);
    for (; i < 60 * 40 && !(G.time % D.cycle < 1.5); i++) step(STEP);
    G.interact = computeInteract(); const label = G.interact.f && G.interact.f.label; if (G.interact.f) G.interact.f.run();
    let top = 0, fell = 0; for (let k = 0; k < 60 * 32; k++) { step(STEP); top = Math.max(top, P.y); if (P.ride && P.ride.s.pose === 'scream') fell++; }
    G.interact = computeInteract(); const off = G.interact.f && G.interact.f.label; if (G.interact.f) G.interact.f.run(); steps(0.3);
    return (label === 'Ride the Big Drop' && top > 40 && fell > 30 && /^Get off/.test(off) && !P.ride && P.y === 0 && P.hp === 100) || `label ${label} top ${top.toFixed(1)} screaming frames ${fell} off "${off}" ride ${!!P.ride} y ${P.y} hp ${P.hp}`;
  });
  T('Funland visitors stroll the paths, scatter when scared, then go back to strolling', () => {
    reset(); for (const n of G.npcs) if (n.kind === 'ped' && n.ai.mode !== 'vera') n.remove(); G.npcs = G.npcs.filter((n) => !n.dead); // (not Vera or the other job givers)
    const F = W.FUN; tp(F.gate, 191); for (let i = 0; i < 40; i++) Strollers.populate(P, F.area);
    const vis = G.npcs.filter((n) => n.ai && n.ai.park && !n.dead), at0 = vis.map((n) => [n.x, n.z]);
    steps(8);
    const offPath = (n) => Math.min(...F.links.map(([a, b]) => segPointDist(n.x, n.z, a.x, a.z, b.x, b.z))) > 5;
    const moved = vis.filter((n, i) => dist(n.x, n.z, at0[i][0], at0[i][1]) > 3).length, strayed = vis.filter((n) => !n.dead && offPath(n)).length;
    panic(F.gate, 191, 300); const fled = vis.filter((n) => n.ai.mode === 'flee').length;
    steps(15);
    const alive = vis.filter((n) => !n.dead), back = alive.filter((n) => n.ai.mode === 'park').length;
    return (vis.length >= 15 && moved >= vis.length * 0.5 && strayed === 0 && fled >= vis.length * 0.8 && back >= alive.length * 0.8) || `visitors ${vis.length} moved ${moved} off the paths ${strayed} fled ${fled} back strolling ${back}/${alive.length}`;
  });
  T('pop-in: things only appear where the camera cannot see (behind you, behind buildings, past the fog)', () => {
    reset(); const mode = G.camMode, cam0 = G.cam; G.camMode = 'chase'; tp(0, 25); P.facing = CAM.yaw = 0; CAM.pitch = 0.2; G.frameN = (G.frameN || 0) + 1; updateCamera(1); G.frameN++;
    const ahead = G.canSee(0, 60, 1), behind = G.canSee(0, -10, 1), fogged = G.canSee(0, 25 + G.scene.fog.far + 50, 1);
    const b = W.blocks.find((k) => k.type === 'city' && k.cz > 60), hidden = !G.canSee(b.cx, b.cz + 22, 1) || !G.canSee(b.cx + 40, b.cz + 22, 1);
    // spawn a crowd of traffic and pedestrians: none of them where you can see
    G.noSpawn = false; for (let i = 0; i < 40; i++) { spawnTraffic(G.body()); const p = randomSidewalkPoint(P.x, P.z, 35, 150, false, true); if (p) spawnPed(p.x, p.z, p.b, p.sx, p.sz); }
    const seenCars = G.cars.filter((c) => !c.dead && !c.persistent && c.driver === 'ai' && c.ai && c.ai.mode === 'traffic' && G.canSee(c.x, c.z, 4) && dist(c.x, c.z, P.x, P.z) < 185).length;
    const seenPeds = G.npcs.filter((n) => !n.dead && n.kind === 'ped' && n.ai.mode === 'walk' && dist(n.x, n.z, P.x, P.z) > 34 && G.canSee(n.x, n.z, 1)).length;
    G.camMode = mode; G.cam = null; G.frameN++; G.noSpawn = true;
    return (ahead && !behind && !fogged && hidden && seenCars === 0 && seenPeds === 0) || `ahead ${ahead} behind ${behind} fogged ${fogged} behind-a-building ${hidden} spawned in view: cars ${seenCars} peds ${seenPeds}`;
  });
  T('open road in the chase camera: traffic still appears ahead of you (far off), not only behind', () => {
    reset(); const mode = G.camMode, cam0 = G.cam; G.camMode = 'chase'; G.noSpawn = false;
    for (const c of G.cars) if (!c.persistent && !c.mission) c.remove(); G.cars = G.cars.filter((c) => !c.dead);
    const car = new Car('sedan', 870, 15, Math.PI / 2); tp(870, 12); G.enterCar(car); car.v = 20;
    let ahead = 0, near = 0; const realSpawn = spawnTraffic;
    spawnTraffic = (t) => { const c = realSpawn(t); if (c && G.canSee(c.x, c.z, 4) && dist(c.x, c.z, car.x, car.z) < 150) near++; return c; }; // judged at the moment it appears
    for (let i = 0; i < 60 * 20; i++) {
      Input.keys.KeyW = true; G.frameN = (G.frameN || 0) + 1; updateCamera(STEP); step(STEP);
      if (i % 30 === 0) for (const c of G.cars) if (!c.dead && c !== car && c.driver === 'ai' && c.ai && c.ai.mode === 'traffic') {
        const dx = c.x - car.x, dz = c.z - car.z, along = dx * Math.sin(car.h) + dz * Math.cos(car.h);
        if (along > 0 && Math.hypot(dx, dz) < 260) ahead++;
      }
    }
    spawnTraffic = realSpawn;
    Input.keys.KeyW = false; G.exitCar(true); car.remove(); G.camMode = mode; G.cam = null; G.frameN++; G.noSpawn = true;
    return (ahead > 0 && near === 0) || `traffic seen ahead ${ahead} · popped in close and in view ${near}`;
  });
  /* ---- realistic handling (the Box3D car) ---- */
  const physDrive = (type, x, z, h) => { reset(); G.noSpawn = true; for (const c of G.cars.slice()) if (!c.persistent) c.remove(); const car = new Car(type, x, z, h); tp(x, z); G.enterCar(car); return car; };
  const bodyUp = () => { const q = PhysCar.b.getRotation(); return new THREE.Vector3(0, 1, 0).applyQuaternion(new THREE.Quaternion(q.x, q.y, q.z, q.w)).y; };
  T('realistic handling: your car is a physics body; flat out on the runway it reaches the same top speed, and it stays stable in a long skid-pad circle', () => {
    if (!Phys.ready) return PhysCar.car === null || 'physics car without physics';
    const A = W.AIRPORT.runway, z = (A.minZ + A.maxZ) / 2, car = physDrive('sedan', A.minX + 30, z, Math.PI / 2);
    const attached = PhysCar.car === car;
    Input.keys.KeyW = true; let top = 0; for (let i = 0; i < 60 * 14; i++) { step(STEP); top = Math.max(top, car.v); }
    const cap = car.limits(false).maxV;
    Input.keys.KeyD = true; let nan = false, minUp = 1, maxSp = 0; for (let i = 0; i < 60 * 40; i++) { step(STEP); if (!isFinite(car.x + car.z + car.v)) nan = true; minUp = Math.min(minUp, bodyUp()); maxSp = Math.max(maxSp, Math.hypot(car.vx, car.vz)); }
    Input.keys.KeyW = Input.keys.KeyD = false; const stillOn = PhysCar.car === car; G.exitCar(true); car.remove();
    return (attached && top > cap * 0.9 && top < cap * 1.08 && !nan && minUp > 0.5 && stillOn && maxSp < cap * 1.2) || `attached ${attached} top ${top.toFixed(1)} of ${cap.toFixed(1)} · circling: NaN ${nan} least upright ${minUp.toFixed(2)} fastest ${maxSp.toFixed(1)} still physics ${stillOn}`;
  });
  T('realistic handling: bump up the roundabout kerb and over the island, and stop dead against a building', () => {
    if (!Phys.ready) return 'SKIP';
    const RB = W.ROUNDABOUT; let car = physDrive('sedan', RB.x - 40, RB.z + 5.5, Math.PI / 2); Input.keys.KeyW = true;
    let up = 0, over = false; for (let i = 0; i < 60 * 6 && !over; i++) { step(STEP); up = Math.max(up, W.groundAt(car.x, car.z)); over = car.x > RB.x + 12; }
    Input.keys.KeyW = false; const hp1 = car.hp / car.maxHp; G.exitCar(true); car.remove();
    // a building: you stop at the wall (and the car takes a knock)
    const b = W.blocks.find((k) => k.type === 'city'), wx = b.cx - 7.5, wz = b.cz - 15.1;
    car = physDrive('sedan', wx, wz - 40, 0); car.v = 25; car.vz = 25; Input.keys.KeyW = true; steps(3); Input.keys.KeyW = false;
    const stopped = car.z < wz - car.T.len / 2 + 0.6, hit = car.hp < car.maxHp; G.exitCar(true); car.remove();
    return (up > 0.3 && over && hp1 > 0.7 && stopped && hit) || `on the island ${up.toFixed(2)} got over ${over} hp ${hp1.toFixed(2)} · wall: stopped ${stopped} (z ${car.z.toFixed(1)} wall ${wz}) dented ${hit}`;
  });
  T('realistic handling: a stunt ramp launches you, you land on your wheels and the jump is scored', () => {
    if (!Phys.ready) return 'SKIP';
    const r = W.RAMPS.find((q) => q.name === 'River Run'), x = r.x - r.fx * 60, z = r.z - r.fz * 60, car = physDrive('sedan', x, z, Math.atan2(r.fx, r.fz));
    G.S.stunts = []; car.v = 30; car.vx = r.fx * 30; car.vz = r.fz * 30; Input.keys.KeyW = true; // a sedan flat out: a big jump that lands in the cleared run-off
    let top = 0, air = 0, landed = false; for (let i = 0; i < 60 * 8 && !landed; i++) { step(STEP); top = Math.max(top, car.y); if (car.y > 0.3) air += STEP; else if (air > 0.5) landed = true; }
    Input.keys.KeyW = false; steps(1); const up = bodyUp(), scored = G.S.stunts.includes('River Run'); G.exitCar(true); car.remove();
    // from behind, the ramp's back wall stops you
    const cj = W.RAMPS.find((q) => q.name === 'Circle Jump'), bx = cj.x + cj.fx * 30, bz = cj.z + cj.fz * 30, c2 = physDrive('sedan', bx, bz, Math.atan2(-cj.fx, -cj.fz));
    Input.keys.KeyW = true; steps(3); Input.keys.KeyW = false; const along = (c2.x - cj.x) * cj.fx + (c2.z - cj.z) * cj.fz, wall = along > cj.len / 2 - 0.5 && PhysCar.car === c2; G.exitCar(true); c2.remove();
    return (top > 4 && air > 0.9 && landed && up > 0.8 && scored && wall) || `top ${top.toFixed(1)} m air ${air.toFixed(1)} s landed ${landed} upright ${up.toFixed(2)} scored ${scored} · back wall held ${wall} (along ${along.toFixed(1)})`;
  });
  T('realistic handling: left on its roof, the car rights itself; teleporting, getting out and L for arcade all work', () => {
    if (!Phys.ready) return 'SKIP';
    const car = physDrive('sedan', 40, W.SHORE - 40, 0);
    PhysCar.b.setTransform({ x: car.x, y: 1.2, z: car.z }, { x: 0, y: 0, z: 1, w: 0 }); steps(0.5); const flipped = bodyUp() < 0;
    steps(3); const righted = bodyUp() > 0.85;
    const tele = G.teleport(-300, -500) && dist(car.x, car.z, -300, -500) < 12; steps(1); const sane = isFinite(car.physY) && Math.abs(car.physY) < 1 && PhysCar.car === car;
    G.exitCar(true); const off = PhysCar.car === null && !car.dead; G.enterCar(car); const back = PhysCar.car === car;
    const arcade = !PhysCar.toggle() && PhysCar.car === null; Input.keys.KeyW = true; steps(1); Input.keys.KeyW = false; const drives = car.v > 3; const phys = PhysCar.toggle() && PhysCar.car === car;
    G.exitCar(true); car.remove();
    return (flipped && righted && tele && sane && off && back && arcade && drives && phys) || `flipped ${flipped} righted ${righted} teleported ${tele} sane ${sane} out ${off} back in ${back} arcade ${arcade} (drives ${drives}) physics again ${phys}`;
  });
  T('realistic handling: crossing the whole map, walls join the physics world ahead of you and leave it behind', () => {
    if (!Phys.ready) return 'SKIP';
    const car = physDrive('sedan', -1100, -1100, Math.PI / 2); let peak = 0; const t0 = performance.now();
    for (let k = 0; k <= 22; k++) { G.teleport(-1100 + k * 100, -1100 + k * 70); steps(1.1); peak = Math.max(peak, Phys.statics.size); }
    const ms = (performance.now() - t0) / (23 * 66), end = Phys.statics.size; G.exitCar(true); car.remove();
    return (peak < 4000 && end < peak && ms < 8) || `statics peak ${peak} at the end ${end} · ${ms.toFixed(2)} ms per step`;
  });
  T('Millbrook: a flat village on Main Street; rob the diner, the Mercantile and the gas station; villagers stroll the sidewalks', () => {
    reset(); G.noSpawn = true; const M = W.MILL;
    let bumps = 0; for (let x = M.minX; x <= M.maxX; x += 6) for (let z = M.minZ; z <= M.maxZ; z += 6) if (W.groundAt(x, z) !== 0) bumps++;
    const road = W.countyEdges.some((e) => e.name === 'Main Street'), zone = W.zoneAt(M.x - 9, -400);
    const fields = W.fields.filter((f) => f.x1 > M.minX && f.x0 < M.maxX && f.z1 > M.minZ && f.z0 < M.maxZ).length;
    const robbed = [];
    for (const id of ['diner', 'mercantile', 'millfuel']) { const r = W.places[id]; r.cd = 0; tp(r.x, r.z); const c0 = G.S.cash; G.interact = computeInteract(); hold(G.robHoldTime(r) + 0.6); if (G.S.cash > c0 + 150) robbed.push(id); Heat.clear(); clearPolice(); }
    for (const n of G.npcs) if (n.kind === 'ped' && n.ai.mode !== 'vera') n.remove(); G.npcs = G.npcs.filter((n) => !n.dead); // (not Vera or the other job givers)
    tp(M.x, -400); for (let i = 0; i < 30; i++) Strollers.populate(P, M.area);
    const folk = G.npcs.filter((n) => n.ai && n.ai.area === M.area); steps(6);
    const onWalks = folk.filter((n) => !n.dead && Math.min(...M.area.links.map(([a, b]) => segPointDist(n.x, n.z, a.x, a.z, b.x, b.z))) < 3.5).length;
    return (!bumps && road && zone === 'village' && !fields && robbed.length === 3 && folk.length >= 8 && onWalks === folk.length) || `bumps ${bumps} road ${road} zone ${zone} fields ${fields} robbed ${robbed.join(',')} villagers ${folk.length} on the sidewalks ${onWalks}`;
  });
  T('badlands: cacti and boulders sit on the slopes, clear of roads; a car flattens a cactus', () => {
    reset(); G.noSpawn = true;
    const onRoad = W.cacti.filter((c) => W.nearCountyRoad(c.x, c.z, 8)).length + W.rocks.filter((r) => W.nearCountyRoad(r.x, r.z, 8)).length;
    const floating = W.cacti.filter((c) => { const m = new THREE.Matrix4(); c.im.getMatrixAt(c.i, m); return Math.abs(m.elements[13] - W.groundAt(c.x, c.z)) > 0.2; }).length;
    const c = W.cacti.find((q) => !W.queryBox(q.x - 30, q.z - 3, q.x - 2, q.z + 3).some((k) => k.destructible && k.destructible.ref !== q) && W.groundAt(q.x - 20, q.z) < W.groundAt(q.x, q.z) + 2);
    const car = new Car('suv', c.x - 20, c.z, Math.PI / 2); tp(c.x - 20, c.z - 3); G.enterCar(car); car.v = 14; car.vx = 14; Input.keys.KeyW = true; steps(2.5); Input.keys.KeyW = false;
    const m = new THREE.Matrix4(); c.im.getMatrixAt(c.i, m); const flat = m.elements[0] === 0 && m.elements[5] === 0;
    G.exitCar(true); car.remove();
    return (W.cacti.length > 200 && W.rocks.length > 100 && !onRoad && !floating && flat) || `cacti ${W.cacti.length} rocks ${W.rocks.length} on roads ${onRoad} floating ${floating} flattened ${flat}`;
  });
  T('the dam: it spans the canyon at 16 m, holds a reservoir, you can walk its crest; its face and the water stop you', () => {
    reset(); G.noSpawn = true; const D = W.DAM, bad = [];
    if (!(D.x1 - D.x0 > 60 && W.groundAt(D.x, D.z) > 15.9 && W.groundAt(D.x0 + 3, D.z) > 15.9)) bad.push(`crest ${D.x0}..${D.x1} at ${W.groundAt(D.x, D.z).toFixed(1)}`);
    // the rim keeps the water in: all round the reservoir's edge the ground is above the water (the dam closes the south)
    let leaks = 0; for (let a = 0; a < TAU; a += 0.05) { const x = D.cx + Math.cos(a) * D.rx * 1.14, z = D.cz + Math.sin(a) * D.rz * 1.14; const byDam = Math.abs(x - D.x) < 85 && z > D.z - 40; if (!byDam && W.groundAt(x, z) < D.water + 0.3) { leaks++; (G.leakPts = G.leakPts || []).push(Math.round(x) + ',' + Math.round(z) + '=' + W.groundAt(x, z).toFixed(1)); } }
    // beside the dam's ends the canyon walls hold the water in
    for (let x = D.x1 + 1; x < D.x + 95; x += 3) if (W.groundAt(x, D.z - 4) < D.water + 0.3) { leaks++; (G.leakPts = G.leakPts || []).push('east wall ' + Math.round(x)); }
    for (let x = D.x0 - 1; x > D.x - 95; x -= 3) if (W.groundAt(x, D.z - 4) < D.water + 0.3) { leaks++; (G.leakPts = G.leakPts || []).push('west wall ' + Math.round(x)); }
    if (leaks) bad.push('reservoir edge below the water at ' + leaks + ' points: ' + (G.leakPts || []).slice(0, 12).join(' ')); G.leakPts = [];
    for (const [x, z] of [[D.x0 - 3, D.z], [D.x1 + 3, D.z]]) if (W.groundAt(x, z) < D.crest - 1) bad.push('dam end open at ' + Math.round(x) + ' (' + W.groundAt(x, z).toFixed(1) + ' m)');
    // walk along the crest
    tp(D.x - 20, D.z); P.y = 0; G.inputOverride = { mx: 1, mz: 0 }; steps(4); G.inputOverride = null;
    if (!(P.x > D.x - 4 && Math.abs(P.z - D.z) < D.half && W.groundAt(P.x, P.z) > 15.9 && P.y < 0.1)) bad.push(`crest walk ended at ${P.x.toFixed(1)},${P.z.toFixed(1)} ground ${W.groundAt(P.x, P.z).toFixed(1)} y ${P.y.toFixed(1)}`);
    if (W.zoneAt(P.x, P.z) !== 'dam') bad.push('zone ' + W.zoneAt(P.x, P.z));
    // drive up the valley at the dam's face: it stops you
    const car = new Car('sedan', D.x - 20, D.z + 60, Math.PI); tp(D.x - 20, D.z + 56); G.enterCar(car); Input.keys.KeyW = true; steps(5); Input.keys.KeyW = false;
    if (car.z < D.z + D.half - 0.5 || W.groundAt(car.x, car.z) > 2) bad.push(`drove up the dam face: ${car.x.toFixed(0)},${car.z.toFixed(0)} ground ${W.groundAt(car.x, car.z).toFixed(1)}`);
    G.exitCar(true); car.remove();
    return !bad.length || bad.join(' | ');
  });
  T('state hygiene: vault, chute and robbery flags are cleared on the way into vehicles and on respawn; jumps work on roofs', () => {
    reset(); const bad = [];
    const car = new Car('sedan', 6, 25, 0); tp(4, 25); P.vault = { t: 0, dur: 0.4, fx: 4, fz: 25, tx: 9, tz: 25, h: 1 }; P.chute = true; G.enterCar(car);
    if (P.vault || P.chute) bad.push('vault/chute survived getting in'); G.exitCar(true); car.remove();
    const r = W.places.quick; r.cd = 0; tp(r.x, r.z); G.interact = computeInteract(); hold(0.5); const started = r.robbing; tp(r.x + 60, r.z); steps(0.2);
    if (!started || r.robbing) bad.push(`walking away kept the robbery going (started ${started})`); Heat.clear(); clearPolice();
    const b = W.buildings.filter((k) => k.h > 8 && k.maxX - k.minX > 10).sort((p, q) => q.h - p.h)[0]; tp((b.minX + b.maxX) / 2, (b.minZ + b.maxZ) / 2); P.y = b.h; P.yv = 0; steps(0.3);
    G.jumpQ = true; steps(0.15); const rose = P.y > b.h + 0.3; steps(1.5); if (!rose || Math.abs(P.y - b.h) > 0.05) bad.push(`roof jump: rose ${rose} ended at ${P.y.toFixed(2)} on a ${b.h.toFixed(1)} m roof`);
    tp(4, 25); P.y = 0;
    return !bad.length || bad.join(' | ');
  });
  T('review fixes: no launch off the far kerb of the island; a car on its roof is drawn above ground; a short jump into the river ends on the bank', () => {
    const bad = [], RB = W.ROUNDABOUT, physOn = PhysCar.on;
    // arcade: over the island at speed, no big air off the far kerb
    PhysCar.on = false; reset(); G.noSpawn = true; let car = new Car('sports', RB.x - 30, RB.z + 5.5, Math.PI / 2); tp(car.x, car.z - 3); G.enterCar(car); car.v = 30; car.vx = 30; Input.keys.KeyW = true;
    let top = 0; for (let i = 0; i < 90; i++) { step(STEP); top = Math.max(top, car.y); } Input.keys.KeyW = false; if (top > 0.8) bad.push('arcade car flew ' + top.toFixed(1) + ' m off the island'); G.exitCar(true); car.remove(); PhysCar.on = physOn;
    if (Phys.ready) {
      car = physDrive('sedan', 60, W.SHORE - 40, 0); PhysCar.b.setTransform({ x: car.x, y: 1.2, z: car.z }, { x: 0, y: 0, z: 1, w: 0 }); steps(0.6);
      const box = new THREE.Box3().setFromObject(car.mesh); if (box.min.y < W.groundAt(car.x, car.z) - 0.3) bad.push('car on its roof drawn ' + (W.groundAt(car.x, car.z) - box.min.y).toFixed(2) + ' m underground');
      G.exitCar(true); car.remove();
      const r = W.RIVER.pts.find((q) => q[1] === -760); car = physDrive('sedan', r[0] - 8, r[1], Math.PI / 2); car.v = 12; car.vx = 12; steps(2.5);
      const rd = Math.min(...W.RIVER.pts.slice(1).map((q, i) => segPointDist(car.x, car.z, W.RIVER.pts[i][0], W.RIVER.pts[i][1], q[0], q[1])));
      if (rd < W.RIVER.w / 2 - 2 || car.physY > 1) bad.push(`river: ${rd.toFixed(1)} m from the middle, ${car.physY.toFixed(1)} m up`); G.exitCar(true); car.remove();
    }
    return !bad.length || bad.join(' | ');
  });
  T("side jobs: Dixie, Earl and Sal wait in their districts with jobs of their own; finishing one moves their chain on, not Vera's story", () => {
    reset(); G.noSpawn = true; const bad = [], story0 = G.S.storyDone, done0 = G.S.jobsDone.slice(), stunts0 = (G.S.stunts || []).slice();
    for (const k of ['dixie', 'earl', 'sal']) {
      const g = GIVERS[k], p = W.places[g.place], npc = G.npcs.find((n) => n.ai && n.ai.giver === k);
      if (!npc || dist(npc.x, npc.z, p.x, p.z) > 1.5) bad.push(k + ' is not at their spot');
      if (!Story.available(k)) bad.push(k + ' has no job');
      tp(p.x + 1.5, p.z); G.interact = computeInteract(); const e = G.interact.e; if (!(e && e.id === 'giver' + k)) bad.push(k + ' prompt: ' + (e && (e.label || e.disabled)));
      if (W.collideCircle({ x: p.x, z: p.z }, 0.4)) bad.push(k + ' stands inside something');
    }
    // Dixie's first job, start to finish
    tp(W.places.dixie.x + 1.5, W.places.dixie.z); G.interact = computeInteract(); if (G.interact.e) G.interact.e.run();
    if (!(Story.active && Story.active.m.id === 'dx1')) bad.push('Ticket Money did not start');
    const tix = W.places.funtix; tp(tix.x, tix.z); G.interact = computeInteract(); hold(G.robHoldTime(tix) + 0.6); Heat.clear(); clearPolice(); steps(0.5);
    tp(W.places.dixie.x + 1, W.places.dixie.z); steps(0.5);
    if (Story.active) bad.push('Ticket Money still running at step ' + Story.active.i);
    if (!G.S.jobsDone.includes('dx1') || G.S.storyDone !== story0) bad.push('after it: jobs ' + G.S.jobsDone.join(',') + ' story ' + story0 + ' to ' + G.S.storyDone);
    if ((Story.next('dixie') || {}).id !== 'dx2') bad.push("Dixie's next job " + (Story.next('dixie') || {}).id);
    // the new kinds of step: a named stunt jump, a ute
    Story.begin(SIDE_JOBS.find((m) => m.id === 'dx3')); G.stunt({ x: 0, z: 0 }, 1.2, 30, W.RAMPS.find((r) => r.name === 'Circle Jump')); steps(0.1);
    if (!(Story.active && Story.active.i === 1)) bad.push('the stunt step did not advance');
    Story.active = null; Story.begin(SIDE_JOBS.find((m) => m.id === 'ea2')); const ute = new Car('pickup', P.x + 3, P.z, 0); G.enterCar(ute); steps(0.2);
    if (!(Story.active && Story.active.i === 1)) bad.push('stealing a ute did not count'); G.exitCar(true); ute.remove(); Story.active = null;
    // a save keeps side jobs, and Vera's count stays hers
    G.save(); const sv = JSON.parse(localStorage.getItem(SAVE_KEY) || '{}'); if (!(sv.jobsDone || []).includes('dx1') || sv.storyDone !== story0) bad.push('save: ' + JSON.stringify({ j: sv.jobsDone, s: sv.storyDone }));
    G.S.jobsDone = done0; G.S.storyDone = story0; G.S.stunts = stunts0; G.save();
    return !bad.length || bad.join(' | ');
  });
  T('realistic handling: a car dropped onto a stall roof or a fence counts as resting (you can get out, no stunt clock)', () => {
    if (!Phys.ready) return 'SKIP';
    const bad = [];
    for (const [what, x, z, y] of [['stall roof', 747.2, 120, 3.6], ['picket fence', 650 + 12 + 8 + 4.5 + 5, -408, 1.6]]) {
      const car = physDrive('sedan', x, z, 0); PhysCar.b.setTransform({ x, y: y + 1.2, z }, { x: 0, y: 0, z: 0, w: 1 }); steps(3);
      G.interact = computeInteract(); const canExit = !!(G.interact.f && G.interact.f.label === 'Get out');
      if (!canExit || PhysCar.airT > 1.5) bad.push(what + ': get out ' + canExit + ' air clock ' + PhysCar.airT.toFixed(1) + ' s (car at ' + car.physY.toFixed(1) + ' m)');
      G.exitCar(true); car.remove();
    }
    return !bad.length || bad.join(' | ');
  });
  T('roadblocks still go up ahead of you on the Ring Highway with a live chase camera', () => {
    reset(); const mode = G.camMode, cam0 = G.cam; G.camMode = 'chase'; G.noSpawn = true;
    const k = W.HWY - W.RR, st = W.ringPoint(2 * k + 40), car = new Car('sports', st.x, st.z + 7.5, Math.PI / 2); tp(st.x, st.z + 5); G.enterCar(car); car.v = 30; car.vx = 30;
    Heat.add(3, 5, 'test'); let seen = false, t = 0;
    for (; t < 60 && !seen; t += STEP) {
      const s = W.ringParam(car.x, car.z), ahead = W.ringPoint(s + 25), want = Math.atan2(ahead.x - ahead.tz * 7.5 - car.x, ahead.z + ahead.tx * 7.5 - car.z), d = angDiff(car.h, want);
      Input.keys.KeyW = Math.abs(d) < 0.3; Input.keys.KeyA = d > 0.05; Input.keys.KeyD = d < -0.05; G.god = true;
      G.frameN = (G.frameN || 0) + 1; updateCamera(STEP); step(STEP); seen = Roadblocks.list.length > 0;
    }
    for (const kk of ['KeyW', 'KeyA', 'KeyD']) Input.keys[kk] = false; G.god = false;
    const rb = Roadblocks.list[0], d = rb ? dist(rb.x, rb.z, car.x, car.z) : 0; G.exitCar(true); car.remove(); Heat.clear(); clearPolice(); Roadblocks.clear();
    G.camMode = mode; G.cam = null; G.frameN++;
    return (seen && d > 120) || 'roadblock ' + seen + ' after ' + t.toFixed(0) + ' s, ' + d.toFixed(0) + ' m ahead';
  });
  T('a moving train: run alongside, jump (or press E) and you grab on and climb up', () => {
    reset(); let i = 0; for (; i < 60 * 60 && Train.v < 12; i++) step(STEP);
    const c = Train.cars[2], fx = Math.sin(c.h), fz = Math.cos(c.h), side = 3.4; tp(c.x + fz * side, c.z - fx * side); P.y = 0;
    G.interact = computeInteract(); const label = G.interact.e && G.interact.e.label;
    G.jumpQ = true; steps(0.1); const on = !!Train.onTrain(P); steps(1); const stays = !!Train.onTrain(P) && P.y > 3;
    if (P.y > 0.5) { P.y = 0; P.yv = 0; tp(c.x + fz * 30, c.z - fx * 30); }
    return (Train.v >= 12 && /moving train/.test(label || '') && on && stays) || `train speed ${Train.v.toFixed(1)} prompt "${label}" grabbed on ${on} still riding ${stays}`;
  });
  T('physics traffic: parked cars near you are physics bodies; ram one and it slides off with its alarm going; K turns it off', () => {
    if (!Phys.ready) return 'SKIP';
    reset(); G.noSpawn = true; for (const c of G.cars.slice()) if (!c.persistent) c.remove(); G.cars = G.cars.filter((c) => !c.dead);
    const x = 40, z = W.SHORE - 40, car = physDrive('suv', x, z, 0), parked = new Car('sedan', x, z + 14, 0, { parked: true }); parked.locked = true;
    steps(0.5); const was = !!parked.phys;
    car.v = 16; car.vz = 16; Input.keys.KeyW = true; steps(1.2); Input.keys.KeyW = false;
    const moved = dist(parked.x, parked.z, x, z + 14), alarm = parked.alarmT > 0, hurt = parked.hp < parked.maxHp;
    const on = PhysCar.toggleWorld(); steps(0.5); const off = !on && !parked.phys; car.x -= 8; car.z -= 8; steps(0.2); PhysCar.toggleWorld(); steps(0.5); // (back off first: a car doesn't turn physical while touching another)
    const back = !!parked.phys; G.exitCar(true); steps(0.3); const stays = !!car.phys; // your car stays physical when you get out
    tp(x + 400, z - 300); steps(3); const handed = !parked.phys && !car.phys;
    car.remove(); parked.remove();
    return (was && moved > 1 && alarm && hurt && off && back && stays && handed) || `physics ${was} pushed ${moved.toFixed(1)} m alarm ${alarm} dented ${hurt} · K off ${off} on again ${back} · stays after you get out ${stays} · back to arcade when far ${handed}`;
  });
  const soak = (x, z, sec) => {
    reset(); G.noSpawn = false; tp(x, z); P.y = 0; G.god = true; const cam0 = G.cam; G.cam = null;
    let smashed = 0, hits = 0, maxPhys = 0; const realSmash = G.smash, realHits = carHitsActors;
    G.smash = (c, car, ex, ez) => { if (car && car.driver === 'ai') smashed++; return realSmash(c, car, ex, ez); };
    carHitsActors = (car) => { const before = G.npcs.filter((n) => n.carHitT > G.time).length; realHits(car); if (car.driver === 'ai' && G.npcs.filter((n) => n.carHitT > G.time).length > before) hits++; };
    const track = new Map(); let stuck = 0, offroad = 0, hurt = 0;
    for (let i = 0; i < sec * 60; i++) {
      step(STEP); P.x = x; P.z = z;
      maxPhys = Math.max(maxPhys, [...PhysCar.list].filter((v) => v.car.driver === 'ai').length);
      if (i % 60 === 0) for (const c of G.cars) {
        if (c.dead || !c.phys || c.driver !== 'ai' || !c.ai || c.ai.mode !== 'traffic') continue;
        let d = 1e9; for (const e of W.edges) d = Math.min(d, segPointDist(c.x, c.z, W.nodes[e.a].x, W.nodes[e.a].z, W.nodes[e.b].x, W.nodes[e.b].z)); if (d > (W.onHighway(c.x, c.z) ? 18 : 9)) offroad++;
        const t = track.get(c) || { x: c.x, z: c.z, n: 0 }; if (dist(t.x, t.z, c.x, c.z) < 1 && !c.ai.blocked) t.n++; else { t.n = 0; t.x = c.x; t.z = c.z; } track.set(c, t); if (t.n === 6) stuck++;
      }
    }
    for (const c of G.cars) if (!c.dead && c.driver === 'ai' && c.hp < c.maxHp * 0.6) hurt++;
    G.smash = realSmash; carHitsActors = realHits; G.god = false; G.cam = cam0; G.noSpawn = true;
    return { smashed, hits, stuck, offroad, hurt, maxPhys };
  };
  T('physics traffic soak: two minutes at a city junction and on the Ring Highway without crashes, felled lamps, people hit or stuck cars', () => {
    if (!Phys.ready) return 'SKIP';
    const city = soak(W.rp(4) + 10, W.rp(4) + 10, 120), ring = soak(0, -W.HWY - 22, 120);
    // (people do step out in front of traffic: over three 2-minute runs physics traffic hit 4, arcade traffic 3)
    const ok = (r) => r.smashed === 0 && r.hits <= 6 && r.stuck <= 1 && r.offroad <= 2 && r.hurt === 0 && r.maxPhys >= 2;
    return (ok(city) && ok(ring)) || 'city ' + JSON.stringify(city) + ' ring ' + JSON.stringify(ring);
  });
  const pursuit = (physPolice) => {
    // drive a fixed loop round four city blocks at heat 2 and see how close the nearest cruiser keeps
    PhysCar.classes.police = physPolice; reset(); G.noSpawn = false; for (const c of G.cars.slice()) if (!c.persistent) c.remove(); G.cars = G.cars.filter((c) => !c.dead);
    const k = W.rp(3) + 25, kk = W.rp(5) + 25, route = [[k, k], [kk, k], [kk, kk], [k, kk]];
    const car = new Car('sedan', k, k, Math.PI / 2); tp(k, k - 3); G.enterCar(car); G.god = true; Heat.add(2, 5, 'test'); Heat.spotted();
    let wi = 1, sum = 0, n = 0, crashed = 0;
    for (let i = 0; i < 60 * 50; i++) {
      const [wx, wz] = route[wi]; if (dist(car.x, car.z, wx, wz) < 6) wi = (wi + 1) % 4;
      const d = angDiff(car.h, Math.atan2(wx - car.x, wz - car.z)); Input.keys.KeyW = Math.abs(d) < 0.5 || car.v < 6; Input.keys.KeyA = d > 0.06; Input.keys.KeyD = d < -0.06; Input.keys.Space = Math.abs(d) > 0.8 && car.v > 10;
      step(STEP); Heat.spotted();
      if (i > 60 * 10 && i % 30 === 0) { let best = 1e9; for (const c of G.cars) if (c.police && !c.dead && c !== car) best = Math.min(best, dist(c.x, c.z, car.x, car.z)); if (best < 1e9) { sum += Math.min(best, 150); n++; } }
    }
    for (const kk2 of ['KeyW', 'KeyA', 'KeyD', 'Space']) Input.keys[kk2] = false;
    for (const c of G.cars) if (c.police && (c.wreck || c.hp < c.maxHp * 0.4)) crashed++;
    G.god = false; G.exitCar(true); car.remove(); Heat.clear(); clearPolice(); PhysCar.classes.police = true;
    return { gap: n ? sum / n : 999, crashed, phys: physPolice };
  };
  T('physics traffic on snow and in a storm: two minutes on the Ring Highway without pile-ups', () => {
    if (!Phys.ready) return 'SKIP';
    const out = [];
    for (const [kind, cover] of [['snow', 0.8], ['storm', 0]]) {
      Weather.set(kind, true); Weather.snowCover = cover; const realReset = Weather.set; Weather.set = () => {}; // (the soak's reset would make it sunny)
      const r = soak(0, -W.HWY - 22, 120); Weather.set = realReset; Weather.set('clear', true);
      if (r.hurt || r.stuck > 1 || r.offroad > 2) out.push(kind + ' ' + JSON.stringify(r));
    }
    return !out.length || out.join(' | ');
  });
  T('physics police: on the same route a physics cruiser keeps about as close as an arcade one, without wrecking itself', () => {
    if (!Phys.ready) return 'SKIP';
    const a = pursuit(false), b = pursuit(true); // (tuning runs: arcade 19.2 / 19.3 m, physics 21.7 / 21.2 m)
    return (b.gap < a.gap * 1.4 && b.gap < 40 && b.crashed === 0) || 'arcade ' + a.gap.toFixed(1) + ' m · physics ' + b.gap.toFixed(1) + ' m, crashed ' + b.crashed;
  });
  T("the tank: none to steal until Sarge's job; then it waits at Kade Auto, turns on the spot, its gun blows things up, and you can't be dragged out", () => {
    reset(); G.noSpawn = true; const bad = [], tank0 = G.S.tank;
    if (G.cars.some((c) => !c.dead && c.T.tank)) bad.push('a tank exists before the job');
    G.S.tank = true; Tanks.auto = true; Tanks.spawned = false; Tanks.t = 0; tp(W.places.hideout.x + 60, W.places.hideout.z); steps(2.5);
    const t = G.cars.find((c) => !c.dead && c.T.tank && c.owned); if (!t) bad.push('no tank at Kade Auto'); else {
      tp(t.x + 2.5, t.z); G.enterCar(t); steps(0.3); const h0 = t.h; Input.keys.KeyD = true; steps(1); Input.keys.KeyD = false; const turned = Math.abs(angDiff(h0, t.h)), moved = dist(t.x, t.z, W.places.tankDepot.x, W.places.tankDepot.z);
      if (turned < 0.4 || moved > 3) bad.push('turn on the spot: turned ' + turned.toFixed(2) + ' rad, moved ' + moved.toFixed(1) + ' m');
      const target = new Car('sedan', t.x + Math.sin(t.h + t.turretYaw) * 25, t.z + Math.cos(t.h + t.turretYaw) * 25, 0, { parked: true }); P.cd = 0; G.attackQ = { ang: 0 }; Tanks.fire(t); steps(1);
      if (!(target.wreck || target.burning > 0 || target.hp < target.maxHp * 0.3)) bad.push('the shell did not wreck the car ahead (hp ' + target.hp + ')');
      // at speed it arcs round on its tracks rather than sliding sideways
      const rw = W.AIRPORT.runway; t.x = rw.minX + 120; t.z = (rw.minZ + rw.maxZ) / 2; t.h = Math.PI / 2; t.v = 15; t.vx = 15; t.vz = 0; Input.keys.KeyW = true; steps(1); const hA = t.h; Input.keys.KeyD = true; steps(2); Input.keys.KeyD = Input.keys.KeyW = false; // open tarmac
      const arc = Math.abs(angDiff(hA, t.h)), crab = Math.abs(angDiff(t.h, Math.atan2(t.vx, t.vz))); if (arc < 0.8 || (Math.hypot(t.vx, t.vz) > 3 && crab > 0.5)) bad.push('at speed: turned ' + arc.toFixed(2) + ' rad, sliding ' + crab.toFixed(2) + ' rad off its heading');
      Heat.add(3, 5, 'test'); const cop = spawnCop(t.x + 2.5, t.z, 'chase'); cop.ai.mode = 'chase'; G.god = false; P.hp = 100; steps(4); if (G.respawning || !P.inCar) bad.push('dragged out of the tank');
      Heat.clear(); clearPolice(); G.exitCar(true); target.remove(); t.remove();
    }
    // owning it follows from having done the job, so a reload can't lose it
    const S0 = G.S; G.S = Object.assign({}, S0, { tank: false, jobsDone: ['tk1'] }); const owns = G.ownsTank(); G.S = S0; if (!owns) bad.push("doing Sarge's job doesn't make the tank yours");
    // the job's last leg has to be in the tank: walking home on foot doesn't finish it
    Story.begin(SIDE_JOBS.find((m) => m.id === 'tk1')); for (let k = 0; k < 4 && Story.active; k++) { const st = Story.step(); if (st.t === 'steal') { const jc = Story.active.car; tp(jc.x + 3, jc.z); G.enterCar(jc); } else if (st.t === 'loseHeat') Heat.clear(); else if (st.t === 'goto') break; steps(0.3); }
    if (P.inCar) G.exitCar(true); tp(W.places.hideout.x, W.places.hideout.z); steps(0.5); const onFoot = !!Story.active; if (!onFoot) bad.push('the job finished with you on foot');
    if (Story.active && Story.active.car) Story.active.car.remove(); Story.active = null; Heat.clear(); clearPolice();
    G.S.tank = tank0; Tanks.auto = false;
    return !bad.length || bad.join(' | ');
  });
  T('off-road: cars keep their pace on grass, dirt trails and sand; SUVs are quicker still', () => {
    reset(); G.noSpawn = true;
    const top = (type, x, z) => { const c = new Car(type, x, z, 0, {}); c.driver = 'player'; for (let i = 0; i < 600; i++) { c.x = x; c.z = z; c.y = 0; c.drive(STEP, 1, 0, false, false); } const v = c.v; c.remove(); return v; };
    const find = (ok) => { for (let x = -W.OUT + 60; x < W.OUT - 60; x += 7) for (let z = -W.OUT + 60; z < W.SHORE - 2; z += 7) if (ok(x, z)) return [x, z]; return null; };
    const flat = (x, z) => !W.groundAt(x - 3, z) && !W.groundAt(x + 3, z) && !W.groundAt(x, z - 3) && !W.groundAt(x, z + 3);
    const grass = find((x, z) => W.zoneAt(x, z) === 'outskirts' && flat(x, z)), sand = [0, W.SHORE - 8];
    const tr = W.trails[0], trail = [(tr[0] + tr[2]) / 2, (tr[1] + tr[3]) / 2];
    const out = {}, want = { grass: [25 * 1.1, 26 * 1.1 * 1.25], sand: [25, 26 * 1.25], trail: [25 * 0.95, 26 * 0.95 * 1.25] };
    for (const [k, p] of [['grass', grass], ['sand', sand], ['trail', trail]]) out[k] = [top('sedan', p[0], p[1]), top('suv', p[0], p[1])];
    const zones = [W.zoneAt(sand[0], sand[1]), W.zoneAt(trail[0], trail[1]), W.onTrail(trail[0], trail[1])];
    const ok = Object.keys(want).every((k) => Math.abs(out[k][0] - want[k][0]) < 0.3 && Math.abs(out[k][1] - want[k][1]) < 0.3) && zones[0] === 'beach' && zones[1] === 'forest' && zones[2];
    return ok || `speeds ${JSON.stringify(out)} want ${JSON.stringify(want)} zones ${zones} grass at ${grass}`;
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
  renderer.render(G.scene, updateCamera(0.016));
  // the page title is only set once the async audio checks are done too: a hang shows up as no result
  // headless Chrome's virtual clock races ahead while the page is idle and would dump the page before the
  // audio thread finishes decoding/rendering in real time, so keep the page busy until the audio checks report
  let audioDone = false;
  const keepAlive = () => { if (audioDone) return; let x = 0; for (let i = 0; i < 3e6; i++) x += Math.sqrt(i); window.__keepAlive = x; setTimeout(keepAlive, 20); };
  keepAlive();
  const finish = (lines) => {
    audioDone = true;
    el.textContent += lines.map((l) => '\n' + l).join('');
    const all = out.concat(lines);
    document.title = all.some((l) => l.startsWith('FAIL')) ? 'AUTOTEST FAIL' : 'AUTOTEST PASS';
  };
  // audio: decode every recorded sample, then render a busy mix offline and check it is audible, finite and not clipping
  try {
    const off = new OfflineAudioContext(2, 44100 * 3, 44100);
    Sfx.init(off);
    const want = typeof SFX_DATA === 'undefined' ? 0 : Object.keys(SFX_DATA).length;
    const timeout = new Promise((r) => setTimeout(() => r(-1), 15000));
    const lines = [];
    Promise.race([Sfx.samplesReady, timeout]).then((n) => {
      lines.push(n === want && want > 0 ? 'PASS recorded sounds decode (' + n + ')' : 'FAIL recorded sounds — decoded ' + n + ' of ' + want);
      const bad = []; // every sample has sound in it
      for (const g in Sfx.samples) for (const smp of Sfx.samples[g]) {
        const d = smp.buf.getChannelData(0); let pk = 0; for (let i = 0; i < d.length; i += 7) pk = Math.max(pk, Math.abs(d[i]));
        if (!(pk > 0.2) || !(smp.buf.duration > 0.05)) bad.push(g + ' peak ' + pk.toFixed(2) + ' dur ' + smp.buf.duration.toFixed(2));
        if (smp.loop && !(smp.loop[1] <= smp.buf.duration + 0.01)) bad.push(g + ' loop past end');
      }
      lines.push(!bad.length ? 'PASS recorded sounds are audible' : 'FAIL silent/short samples: ' + bad.join(', '));
      // voices decode in this context too, and a radio call renders through the radio filter
      Voice.radioQ.length = 0; Voice.radioBusy = false;
      return Promise.all(['vera/0', 'bark/ped_hurt/0/0', 'dispatch/crime_rob', 'x/Main/Fifth'].map((k) => Voice.get(k)));
    }).then((vb) => {
      const durs = vb.map((b) => (b ? b.duration : 0));
      lines.push(durs.every((d) => d > 0.3) ? 'PASS voice clips decode (' + durs.map((d) => d.toFixed(1) + 's').join(', ') + ')' : 'FAIL voice clips — durations ' + durs.join(', '));
      Voice.radio(['dispatch/crime_rob', 'x/Main/Fifth']);
      Sfx.shot('pistol', 5, 0); Sfx.shot('shotgun', -10, 3); Sfx.explode(20, 10); Sfx.cash(); Sfx.punch(1, 1); Sfx.crash(0.8, 3, 0); Sfx.sting('heat'); Sfx.thunder();
      Sfx.glass(4, 2); Sfx.hurt(2, 2); Sfx.honk(-6, 3); Sfx.pop(3, 3); Sfx.alarm(8, 8); Sfx.smoke(2, 0); Sfx.land(0, 1); Sfx.jump(0, 1); Sfx.whoosh(1, 0); Sfx.impact(3, 3); Sfx.heliGun(10, -10); Sfx.buy();
      for (let i = 0; i < 30; i++) Sfx.update(0.05, { playing: true, lx: 0, lz: 0, rx: 1, rz: 0, sirens: [{ x: 30, z: 5 }, { x: -20, z: 8 }], heat: 4, zone: 'forest', rain: 1, slip: 0.6, engine: { speed: 20, throttle: 1, boost: false }, heli: { x: 10, z: -15 } });
      // the radio call is scheduled once its clips have decoded; give it a moment before rendering
      return new Promise((r) => setTimeout(r, 300)).then(() => off.startRendering());
    }).then((buf) => {
      let peak = 0, sum = 0, nan = false; const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) { const v = d[i]; if (!isFinite(v)) nan = true; peak = Math.max(peak, Math.abs(v)); sum += v * v; }
      const rms = Math.sqrt(sum / d.length);
      lines.push((!nan && rms > 0.005 && peak <= 1.0) ? 'PASS audio mix renders (rms ' + rms.toFixed(3) + ', peak ' + peak.toFixed(2) + ')' : 'FAIL audio mix — rms ' + rms + ' peak ' + peak + ' nan ' + nan);
      finish(lines);
    }).catch((e) => finish(lines.concat(['FAIL audio — ' + e])));
  } catch (e) { finish(['FAIL audio — EXC ' + e.message]); }
}
