'use strict';
/* Game systems: state, heat, crimes + witnesses, security, robbing, shop, story missions, population. */

const G = {
  scene: null, player: null, npcs: [], cars: [], time: 0, crumbs: [], playerZone: 'street', curAlley: null,
  state: 'title', respawning: false, respawnT: 0, respawnTo: null, camMode: 'chase', shakeAmt: 0, nitro: 1,
  hold: { key: null, t: 0, dur: 1 }, interact: null, crimeCd: {}, toastQ: [], autotest: false, god: false,
  S: null,
};

function freshState() {
  return {
    cash: 150, weapons: { fists: true }, ammo: { pistol: 0, shells: 0, smg: 0, rockets: 0 }, tools: {},
    armor: 0, medkit: 1, smoke: 0, spikes: 0, grenade: 0, c4: 0, parachute: 0, storyDone: 0, jobsDone: [],
    stats: { robbed: 0, earned: 0, kos: 0, escapes: 0, maxHeat: 0, busts: 0 },
  };
}
const SAVE_KEY = 'lootrun.save.v1';
G.save = function () { if (typeof Story !== 'undefined') Story.sync(); try { localStorage.setItem(SAVE_KEY, JSON.stringify(G.S)); } catch (e) { /* storage blocked */ } };
G.loadSave = function () {
  try {
    const s = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
    if (s && typeof s.cash === 'number') {
      const f = freshState(); s.ammo = Object.assign(f.ammo, s.ammo); s.stats = Object.assign(f.stats, s.stats);
      // saves from before jobs had ids only counted them, in the original eight-job order
      if (!Array.isArray(s.jobsDone)) s.jobsDone = ['first', 'tools', 'atms', 'quiet', 'glimmer', 'truck', 'bank', 'boat'].slice(0, s.storyDone || 0);
      s.storyDone = s.jobsDone.length;
      return Object.assign(f, s);
    }
  } catch (e) { /* ignore */ }
  return null;
};

/* ---------------- shop catalogue ---------------- */
const SHOP = [
  { id: 'bat', cat: 'Weapons', name: 'Baseball Bat', price: 120, desc: 'Hits more than twice as hard as fists. Quiet.', weapon: 'bat' },
  { id: 'pistol', cat: 'Weapons', name: 'Pistol', price: 450, desc: 'Semi-auto sidearm. Comes with 36 rounds.', weapon: 'pistol', ammo: ['pistol', 36] },
  { id: 'shotgun', cat: 'Weapons', name: 'Shotgun', price: 1400, desc: 'Six pellets per shot. Comes with 16 shells.', weapon: 'shotgun', ammo: ['shells', 16] },
  { id: 'smg', cat: 'Weapons', name: 'SMG', price: 2600, desc: 'Hold the mouse button to spray. 120 rounds.', weapon: 'smg', ammo: ['smg', 120] },
  { id: 'ammo_pistol', cat: 'Ammo', name: 'Pistol rounds ×36', price: 80, needs: 'pistol', ammo: ['pistol', 36] },
  { id: 'ammo_shells', cat: 'Ammo', name: 'Shotgun shells ×16', price: 120, needs: 'shotgun', ammo: ['shells', 16] },
  { id: 'ammo_smg', cat: 'Ammo', name: 'SMG rounds ×120', price: 180, needs: 'smg', ammo: ['smg', 120] },
  { id: 'lockpick', cat: 'Heist gear', name: 'Lockpick', price: 250, desc: 'Open parked cars silently: no smashed glass, no car alarm.', tool: true },
  { id: 'cutters', cat: 'Heist gear', name: 'Wire Cutters', price: 300, desc: 'Cut a building\'s alarm box (hold E). The silent alarm stays silent.', tool: true },
  { id: 'laptop', cat: 'Heist gear', name: 'Laptop', price: 650, desc: 'Loop a security camera\'s feed from up to 9 m away (hold E).', tool: true },
  { id: 'drill', cat: 'Heist gear', name: 'Thermal Drill', price: 1500, desc: 'Cracks the bank vault. Robs stores twice as fast.', tool: true },
  { id: 'mask', cat: 'Heist gear', name: 'Ski Mask', price: 800, desc: 'Robberies give 1 less heat and you shake cops 25% faster.', tool: true },
  { id: 'scanner', cat: 'Heist gear', name: 'Police Scanner', price: 700, desc: 'Shows every cop and roadblock on your minimap.', tool: true },
  { id: 'nitro', cat: 'Heist gear', name: 'Nitro Kit', price: 900, desc: 'Adds nitro to every car: hold Shift while driving. Sports cars, supercars, muscle cars and motorbikes already have it.', tool: true },
  { id: 'armor', cat: 'Supplies', name: 'Body Armor', price: 500, desc: 'Soaks up 100 damage before your health.', armor: true },
  { id: 'medkit', cat: 'Supplies', name: 'Medkit', price: 150, desc: 'Press H to heal 60. Carry up to 3.', stack: ['medkit', 1, 3] },
  { id: 'smoke', cat: 'Supplies', name: 'Smoke Bombs ×2', price: 300, desc: 'Press G on foot. Blocks police line of sight for 12 s.', stack: ['smoke', 2, 6] },
  { id: 'grenade', cat: 'Explosives', name: 'Grenades ×3', price: 300, desc: 'Press T to throw at your aim point. Blasts crack ATMs and wreck cameras.', stack: ['grenade', 3, 9] },
  { id: 'c4', cat: 'Explosives', name: 'C4 Charges ×2', price: 450, desc: 'Press B to plant (it sticks to nearby cars). Press B again to detonate.', stack: ['c4', 2, 6] },
  { id: 'rpg', cat: 'Explosives', name: 'Rocket Launcher', price: 4500, desc: 'Weapon 6. Rockets home in on police helicopters. Comes with 4 rockets.', weapon: 'rpg', ammo: ['rockets', 4] },
  { id: 'ammo_rockets', cat: 'Explosives', name: 'Rockets ×4', price: 600, needs: 'rpg', ammo: ['rockets', 4] },
  { id: 'parachute', cat: 'Supplies', name: 'Parachute', price: 250, desc: 'Press SPACE while falling to open it. Bail out of a flying helicopter (F) or jump off rooftops safely.', stack: ['parachute', 1, 3] },
  { id: 'spikes', cat: 'Supplies', name: 'Spike Strips ×2', price: 400, desc: 'Press G while driving to drop spikes behind you.', stack: ['spikes', 2, 6] },
];
G.shopItem = (id) => SHOP.find((s) => s.id === id);
G.owns = function (id) {
  const it = G.shopItem(id), S = G.S;
  if (!it) return false;
  if (it.weapon) return !!S.weapons[it.weapon];
  if (it.tool) return !!S.tools[id];
  if (it.armor) return S.armor >= 100;
  if (it.stack) return S[it.stack[0]] >= it.stack[2];
  return false;
};
G.canBuy = function (id) {
  const it = G.shopItem(id);
  if (!it) return { ok: false, why: 'Unknown' };
  if (it.needs && !G.S.weapons[it.needs]) return { ok: false, why: 'Need ' + G.shopItem(it.needs).name };
  if (!it.ammo || it.weapon) { if (G.owns(id)) return { ok: false, why: it.stack ? 'Full' : it.armor ? 'Full' : 'Owned' }; }
  if (it.stack && G.S[it.stack[0]] >= it.stack[2]) return { ok: false, why: 'Full' };
  if (G.S.cash < it.price) return { ok: false, why: 'Need ' + money(it.price) };
  return { ok: true };
};
G.buy = function (id) {
  const c = G.canBuy(id), it = G.shopItem(id);
  if (!c.ok) { Sfx.error(); return false; }
  const S = G.S;
  S.cash -= it.price;
  if (it.weapon) { S.weapons[it.weapon] = true; G.equip(it.weapon); }
  if (it.ammo) S.ammo[it.ammo[0]] += it.ammo[1];
  if (it.tool) S.tools[id] = true;
  if (it.armor) S.armor = 100;
  if (it.stack) S[it.stack[0]] = Math.min(it.stack[2], S[it.stack[0]] + it.stack[1]);
  Sfx.buy(); G.save(); Story.event('buy', id);
  return true;
};

/* ---------------- heat (wanted level) ---------------- */
const Heat = {
  level: 0, evade: 0, need: 10, seenT: 0, lastX: 0, lastZ: 0, grabV: 0, grabbing: false, spawnT: 0, losT: 0, claimed: [],
  add(n, cap, why) {
    if (G.respawning) return;
    const before = this.level;
    this.level = clamp(Math.max(this.level, Math.min(cap == null ? 5 : cap, this.level + n)), 0, 5);
    this.spotted();
    if (this.level > before) {
      if (!G.autotest) Sfx.sting('heat');
      Voice.heatUp(this.level);
      G.toast((why ? why + ' · ' : '') + 'Heat ' + this.level, 'heat');
      G.S.stats.maxHeat = Math.max(G.S.stats.maxHeat, this.level);
      if (before === 0) this.spawnT = 0.5;
    }
  },
  spotted() { this.seenT = 0.6; this.evade = 0; const t = G.body(); this.lastX = t.x; this.lastZ = t.z; },
  grab(dt, inVehicle) {
    if (G.god) return;
    if (inVehicle) this.carGrab++; else this.grabV += dt * (0.5 + 0.08 * this.level);
    this.grabbing = true;
  },
  carGrab: 0,
  clear() { this.level = 0; this.evade = 0; this.grabV = 0; this.claimed = []; G.rampage = 0; G.rampageT = 0; },
  pickExit(car) {
    let exits = [];
    if (G.playerZone === 'alley' && G.curAlley) exits = G.curAlley.exits;
    else if (G.playerZone === 'forest') exits = W.forestExits.map((e) => ({ x: e.out[0], z: e.out[1] }));
    let best = null, bd = 1e9;
    for (const e of exits) {
      if (this.claimed.some((c) => dist(c.x, c.z, e.x, e.z) < 3)) continue;
      const d = dist(car.x, car.z, e.x, e.z); if (d < bd) { bd = d; best = e; }
    }
    if (best) this.claimed.push(best);
    return best;
  },
  dropCops(car, n, mode) {
    const fx = Math.sin(car.h), fz = Math.cos(car.h);
    const alive = G.npcs.filter((c) => c.kind === 'cop' && !c.down && !c.dead).length;
    n = Math.min(n, 14 - alive);
    for (let k = 0; k < n; k++) {
      const s = k === 0 ? 1 : -1;
      const c = spawnCop(car.x + fz * s * 2, car.z - fx * s * 2, mode);
      W.collideCircle(c, c.r);
    }
  },
  update(dt) {
    const P = G.player;
    // cops pulling you out of a stopped car: slow, and two officers at most count
    if (this.carGrab) { this.grabV += dt * (0.13 + 0.025 * this.level) * Math.min(this.carGrab, 2); this.carGrab = 0; }
    if (!this.grabbing) this.grabV = Math.max(0, this.grabV - dt * 0.6);
    if (G.rampageT > 0) { G.rampageT -= dt; if (G.rampageT <= 0 && G.rampage > 0) { G.rampage--; G.rampageT = G.rampage ? 15 : 0; } }
    this.grabbing = false;
    if (this.level === 0) { this.grabV = 0; return; }
    if (this.grabV >= 1) { this.grabV = 0; G.busted(); return; }
    // police cars and cameras also spot you
    this.losT -= dt;
    if (this.losT <= 0) {
      this.losT = 0.3;
      const t = G.body(), zone = W.ZONES[G.playerZone];
      for (const c of G.cars) {
        if (!c.police || c.dead || c.wreck || !c.ai || c.ai.mode === 'patrol') continue;
        const d = dist(c.x, c.z, t.x, t.z);
        if (d < zone.sight && !W.segBlocked(c.x, c.z, t.x, t.z) && !Smoke.blocks(c.x, c.z, t.x, t.z)) { this.spotted(); break; }
      }
      for (const cam of W.cams) if (camSees(cam, t.x, t.z)) { this.spotted(); break; }
    }
    this.seenT -= dt;
    if (this.seenT <= 0) this.evade += dt;
    const zone = W.ZONES[G.playerZone] || W.ZONES.street;
    this.need = (4 + this.level * 2.4) * zone.evade * (G.S.tools.mask ? 0.75 : 1);
    if (this.evade >= this.need) {
      this.clear(); G.S.stats.escapes++;
      G.toast('You lost the cops!', 'good'); Sfx.sting('lost'); Voice.radio(['dispatch/evaded'], true);
      return;
    }
    this.spawnT -= dt;
    if (this.spawnT <= 0) { this.spawnT = 1.3; spawnPolice(); }
  },
};

function spawnPolice() {
  if (G.noSpawn) return; // tests that need a quiet street
  const t = G.body(), L = Heat.level;
  const footT = [0, 1, 2, 3, 4, 5][L], carT = [0, 1, 1, 2, 3, 4][L];
  let foot = 0, cars = 0;
  for (const n of G.npcs) if (n.kind === 'cop' && !n.down && n.ai.mode !== 'walk' && dist(n.x, n.z, t.x, t.z) < 140) foot++;
  for (const c of G.cars) if (c.police && !c.wreck && c.ai && (c.ai.mode === 'pursuit' || c.ai.mode === 'perimeter' || c.ai.mode === 'parked') && dist(c.x, c.z, t.x, t.z) < 160) cars++;
  if (cars < carT) {
    const cands = W.nodes.filter((n) => { const d = dist(n.x, n.z, t.x, t.z); return d > 60 && d < 130; }), hid = cands.filter((n) => !G.canSee(n.x, n.z, 4));
    if (cands.length) {
      const n = pick(hid.length ? hid : cands), nb = W.nodes[pick(n.adj)];
      const car = new Car('police', n.x, n.z, Math.atan2(t.x - n.x, t.z - n.z));
      car.driver = 'ai'; car.ai = { mode: 'pursuit', stuckT: 0, revT: 0 }; car.siren = true; car.v = 10;
      if (nb) car.ai.node = nb.id;
    }
  }
  if (foot < footT && G.playerZone !== 'highway' && G.playerZone !== 'air' && G.npcs.filter((n) => n.kind === 'cop').length < 12) {
    const p = randomSidewalkPoint(t.x, t.z, 38, 75, true, true) || randomSidewalkPoint(t.x, t.z, 38, 65, true);
    if (p) spawnCop(p.x, p.z, 'chase');
  }
}

/* perimeter: when you duck into an alley or the forest, cops cover the exits */
function onZoneChange(prev, now) {
  Heat.claimed = [];
  if (Heat.level < 2) return;
  const t = G.body();
  let exits = [];
  if (now === 'alley' && G.curAlley) exits = G.curAlley.exits;
  if (now === 'forest') exits = W.forestExits.map((e) => ({ x: e.out[0], z: e.out[1] }));
  if (!exits.length) return;
  let n = 0;
  for (const e of exits) {
    if (dist(e.x, e.z, t.x, t.z) < 14) continue;
    if (G.npcs.filter((c) => c.kind === 'cop').length >= 12) break;
    for (let k = 0; k < (Heat.level >= 3 ? 2 : 1); k++) spawnCop(e.x + rand(-2, 2), e.z + rand(-2, 2), 'chase');
    if (!n) Voice.radio(['dispatch/perimeter', Voice.placeKey(t.x, t.z)], true);
    n++;
  }
  if (n) G.toast(now === 'forest' ? 'Police are covering the Forest Park exits!' : (G.curAlley.dead ? 'Dead end! Cops are blocking the alley mouth!' : 'Cops are covering both ends of the alley!'), 'warn');
}

/* ---------------- crimes and witnesses ---------------- */
function camSees(c, x, z) {
  if (c.deadT > 0 || c.loopT > 0) return false;
  const d = dist(c.x, c.z, x, z);
  if (d > c.range || d < 0.5) return false;
  if (Math.abs(angDiff(c.yaw, Math.atan2(x - c.x, z - c.z))) > c.fov / 2 + 0.05) return false;
  return !W.segBlocked(c.x, c.z, x, z);
}
function witness(x, z, hearR) {
  G.lastWitness = null;
  for (const n of G.npcs) {
    if (n.down || n.dead) continue;
    const d = dist(n.x, n.z, x, z);
    if (n.kind === 'cop' && (d < (hearR || 0) || (d < 42 && !W.segBlocked(n.x, n.z, x, z)))) return 'A cop saw that';
  }
  for (const cam of W.cams) if (camSees(cam, x, z)) return 'Caught on camera';
  for (const n of G.npcs) {
    if (n.kind !== 'ped' || n.down || n.dead || n.ai.mode === 'vera') continue;
    const d = dist(n.x, n.z, x, z);
    if (d > 1 && d < 22 && !W.segBlocked(n.x, n.z, x, z)) { G.lastWitness = n; return 'A witness called it in'; }
    if (hearR && d > 1 && d < hearR * 0.6) { G.lastWitness = n; return 'Someone heard it and called the cops'; }
  }
  return null;
}
const CRIMES = {
  assault: { n: 1, cap: 2, label: 'Assault' }, mug: { n: 1, cap: 2, label: 'Mugging' }, gunfire: { n: 1, cap: 2, hear: 40, label: 'Shots fired' },
  carjack: { n: 1, cap: 2, label: 'Carjacking' }, carTheft: { n: 1, cap: 2, label: 'Car theft' }, atm: { n: 1, cap: 2, label: 'ATM break-in' },
  assaultCop: { n: 1, cap: 2, label: 'Assaulting an officer' }, copKO: { n: 1, cap: 5, label: 'Officer down' },
  copCar: { n: 1, cap: 5, label: 'Stole a police cruiser' }, copHeli: { n: 2, cap: 5, label: 'Stole a police helicopter' },
  milHeli: { n: 2, cap: 5, label: 'Stole a military gunship' },
  explosion: { n: 1, cap: 3, hear: 70, label: 'Explosion' }, atmBlast: { n: 1, cap: 3, hear: 60, label: 'Blew open an ATM' },
};
/* The police only hear about a crime if someone reports it: a cop who sees or hears it, a security camera,
   a passer-by in sight (or in earshot of gunfire and explosions), or a conscious officer you just attacked. */
G.crime = function (type, x, z, o) {
  if (type === 'assaultCop' && o && o.ko) type = 'copKO';
  const c = CRIMES[type]; if (!c) return;
  if (type === 'assault' || type === 'assaultCop') panic(x, z, 18);
  if (type === 'gunfire') panic(x, z, 30);
  const now = G.time;
  if (G.crimeCd[type] && now - G.crimeCd[type] < (type === 'copKO' ? 0.2 : 3)) return;
  const victimSaw = o && (o.radio || (o.victim && o.victim.kind === 'cop' && !o.victim.down && !o.victim.dead));
  const why = victimSaw ? 'The officer radioed it in' : witness(x, z, c.hear);
  if (!why) {
    if (!(G.quietT > now) && Heat.level === 0) { G.quietT = now + 10; G.toast('No witnesses — nobody called that in.', 'good'); }
    return;
  }
  G.crimeCd[type] = now;
  const before = Heat.level;
  if (G.lastWitness && !victimSaw) Voice.bark('witness', G.lastWitness, { force: true });
  Voice.report(type, x, z);
  Heat.add(c.n, c.cap, c.label + ' — ' + why.toLowerCase());
  if (c.cap <= 2 && Heat.level === before && before >= c.cap) {
    G.rampage = (G.rampage || 0) + 1; G.rampageT = 15;
    if (G.rampage >= 3) { G.rampage = 0; Voice.report('rampage', x, z); Heat.add(1, 4, 'Rampage'); }
  }
};
G.onKnockout = function (a) {
  if (a.kind === 'ped') { if (a.cash > 0) { Pickups.add('cash', a.x + rand(-0.5, 0.5), a.z + rand(-0.5, 0.5), a.cash); a.cash = 0; } G.S.stats.kos++; }
  if (a.kind === 'cop') { if (!a.dropped) { a.dropped = true; Pickups.add('ammo', a.x + 0.4, a.z, 12); } G.S.stats.kos++; }
};
G.collect = function (p) {
  if (p.kind === 'cash') { G.addCash(p.amount, p.x, p.z); }
  else if (p.kind === 'ammo') {
    const S = G.S; const gun = S.weapons.smg ? 'smg' : S.weapons.shotgun && chance(0.4) ? 'shells' : 'pistol';
    const amt = gun === 'smg' ? 30 : gun === 'shells' ? 6 : 12;
    if (!S.weapons.pistol && !S.weapons.shotgun && !S.weapons.smg) { G.addCash(40, p.x, p.z); return; }
    S.ammo[gun] += amt; Floaters.add(p.x, 1.6, p.z, '+' + amt + ' ammo', 'ammo'); Sfx.click();
  } else { G.player.hp = Math.min(100, G.player.hp + 40); Floaters.add(p.x, 1.6, p.z, '+40 HP', 'hp'); Sfx.buy(); }
};
G.addCash = function (n, x, z) {
  n = Math.round(n); G.S.cash += n; G.S.stats.earned += n;
  Floaters.add(x, 2, z, '+' + money(n), 'cash'); Sfx.cash();
};

/* ---------------- security: cameras + alarm boxes ---------------- */
function updateSecurity(dt) {
  const blink = Math.floor(G.time * 2) % 2;
  for (const c of W.cams) {
    if (c.deadT > 0) {
      c.deadT -= dt;
      if (c.deadT <= 0) { c.grp.visible = true; c.coneG.visible = true; }
      continue;
    }
    if (c.loopT > 0) c.loopT -= dt;
    c.phase += dt * 0.55;
    c.yaw = c.base + Math.sin(c.phase) * c.sweep;
    c.grp.rotation.y = c.yaw; c.coneG.rotation.y = c.yaw;
    const looped = c.loopT > 0;
    c.coneMat.color.set(looped ? 0x3bd16f : 0xff3b30);
    c.coneMat.opacity = looped ? 0.1 : 0.16 + (blink ? 0.04 : 0);
    c.led.material.color.set(looped ? 0x3bd16f : (blink ? 0xff2020 : 0x550000));
  }
  for (const a of W.alarms) {
    if (a.cutT > 0) { a.cutT -= dt; a.light.material.color.set(0x222222); if (a.cutT <= 0) a.hits = 0; }
    else a.light.material.color.set(blink ? 0xff3030 : 0x661111);
  }
  for (const r of W.robs) if (r.cd > 0) r.cd -= dt;
}
G.cutAlarm = function (al) { al.cutT = 200; Sfx.click(); G.toast('Alarm wires cut — the silent alarm is dead for a while.', 'good'); Story.event('sec'); };
G.loopCam = function (c) { c.loopT = 150; Sfx.click(); G.toast('Camera feed looped. It sees nothing for 2½ minutes.', 'good'); Story.event('sec'); };
G.destroyCam = function (c) {
  c.deadT = 260; c.grp.visible = false; c.coneG.visible = false;
  FX.burst(c.x, c.y, c.z, 14, ['#ffd166', '#ffffff', '#888888'], 6, 0.12, 0.6);
  Sfx.glass(c.x, c.z); G.toast('Camera destroyed.', 'good'); Story.event('sec');
};
G.smashAlarm = function (al) {
  al.hits = (al.hits || 0) + 1;
  FX.burst(al.wx, 1.6, al.wz, 6, ['#ffd166', '#ffffff'], 4, 0.1, 0.4);
  if (al.hits >= 3) {
    al.cutT = 200; Sfx.alarm(al.wx, al.wz);
    Heat.add(1, 2, 'You smashed an alarm box — it tripped');
    Story.event('sec');
  }
};
function secStatus(r) {
  const al = r.sec.alarm;
  const camsOn = r.sec.cams.filter((c) => c.deadT <= 0 && c.loopT <= 0).length;
  return { alarmOn: !!al && al.cutT <= 0, camsOn, camsTotal: r.sec.cams.length };
}
G.robHeat = function (r) {
  if (r.kind === 'atm') return null;
  const s = secStatus(r);
  let h = r.base + (s.alarmOn ? 1 : 0) + (s.camsOn > 0 ? 1 : 0) - (G.S.tools.mask ? 1 : 0);
  return clamp(h, 0, 5);
};

/* ---------------- robbing ---------------- */
G.robHoldTime = function (r) { return r.hold * (G.S.tools.drill && r.kind !== 'bank' ? 0.5 : 1); };
G.startRob = function (r) {
  r.robbing = true;
  if (r.kind === 'atm') { G.crime('atm', r.x, r.z, {}); return; }
  const h = G.robHeat(r), s = secStatus(r);
  if (h > 0) {
    const why = [s.alarmOn ? 'silent alarm' : null, s.camsOn ? 'cameras' : null, r.base ? (r.onTrain ? "the safe's tracker" : 'clerk panicked') : null].filter(Boolean).join(' + ');
    Voice.report(r.kind === 'bank' ? 'bank' : 'rob', r.x, r.z);
    Heat.add(h, 5, why ? 'Robbery — ' + why : 'Robbery');
  } else G.toast('Clean job: no alarm, no cameras. Nobody is calling this in.', 'good');
  panic(r.x, r.z, 16);
  if (!r.onTrain) Voice.bark('clerk', { x: r.x, z: r.z, barkT: 0 }, { force: true });
};
G.completeRob = function (r) {
  r.robbing = false; r.cd = r.cool;
  if (G.holdMem) delete G.holdMem['rob' + r.id];
  const n = randi(r.cash[0], r.cash[1]);
  G.addCash(n, r.x, r.z);
  G.S.stats.robbed++;
  if (r.kind === 'bank') { Pickups.add('cash', r.x + 1.5, r.z + 1, 600); Pickups.add('cash', r.x - 1.5, r.z + 1, 600); }
  G.toast((r.kind === 'atm' ? 'ATM cracked' : r.name + ' robbed') + ': ' + money(n), 'cash');
  Story.event('rob', r);
};

/* ---------------- cars: steal, carjack, sell ---------------- */
G.carValue = function (car) { return Math.round(car.T.value * (0.35 + 0.65 * clamp(car.hp / car.maxHp, 0, 1)) * (car.popped ? 0.85 : 1)); };
G.ejectDriver = function (car) {
  const fx = Math.sin(car.h), fz = Math.cos(car.h);
  const x = car.x + fz * (car.T.w / 2 + 0.8), z = car.z - fx * (car.T.w / 2 + 0.8);
  if (car.police) { const c = spawnCop(x, z, 'chase'); W.collideCircle(c, c.r); return c; }
  const b = W.nearestBlock(x, z);
  const p = spawnPed(x, z, b, 1, 1); W.collideCircle(p, p.r);
  p.ai.mode = 'flee'; p.ai.fleeT = 8; p.ai.thx = car.x; p.ai.thz = car.z;
  if (car.driver === 'ai') Voice.bark('carjacked', p, { force: true });
  return p;
};
G.enterCar = function (car) {
  const P = G.player;
  if (car.wreck || car.dead || car.burning > 0) return false;
  if (car.fallen) { car.fallen = false; car.hp = car.maxHp; car.v = 0; car.vx = car.vz = 0; }
  car.leftT = 0; if (G.remount && G.remount.bike === car) G.remount = null;
  let msg = null;
  car.wasParked = car.parked || car.wasParked;
  if (car.driver === 'ai') {
    if (car.ai && (car.ai.mode === 'roadblock' || car.ai.mode === 'parked')) { /* empty cruiser */ }
    else G.ejectDriver(car);
    G.crime(car.police ? 'copCar' : 'carjack', car.x, car.z, {});
    msg = car.police ? 'You jacked a police cruiser!' : 'Carjacked a ' + car.T.name.toLowerCase();
  } else if (car.parked && car.locked && car.T.bike) {
    // bikes have no windows and no alarm: a quiet theft, though anyone watching still calls it in
    msg = car.T.pedal ? 'Nicked the ' + car.T.name.toLowerCase() + '.' : 'Hotwired the motorbike.'; G.crime('carTheft', car.x, car.z, {});
  } else if (car.parked && car.locked) {
    if (G.S.tools.lockpick) { msg = 'Lock picked. Nice and quiet.'; Sfx.click(); }
    else { Sfx.glass(car.x, car.z); car.alarmT = 6; FX.burst(car.x, 1.2, car.z, 10, ['#cfe8ff', '#ffffff'], 3, 0.1, 0.5); G.crime('carTheft', car.x, car.z, {}); msg = 'Smashed the window. Car alarm!'; }
    if (car.police) G.crime('copCar', car.x, car.z, {});
  }
  car.locked = false; car.driver = 'player'; car.ai = null; car.parked = false; car.siren = false;
  P.inCar = car; P.rig.root.visible = !!car.T.bike; P.vx = P.vz = 0;
  if (car.T.bike && !G.autotest) G.toast(car.T.pedal ? 'Pedal hard! Bikes are quiet but slow.' : 'Motorbike: fastest thing on two wheels. Crash hard and you fly off.');
  if (msg) G.toast(msg);
  Story.event('steal', car);
  return true;
};
G.exitCar = function (force) {
  const P = G.player, car = P.inCar; if (!car) return;
  const fx = Math.sin(car.h), fz = Math.cos(car.h), off = car.T.w / 2 + 0.75;
  let placed = false;
  for (const s of [-1, 1]) {
    const p = { x: car.x + fz * s * off, z: car.z - fx * s * off };
    const ox = p.x, oz = p.z; W.collideCircle(p, P.r);
    if (dist(ox, oz, p.x, p.z) < 0.3) { P.x = p.x; P.z = p.z; placed = true; break; }
  }
  if (!placed) { P.x = car.x - fx * (car.T.len / 2 + 0.8); P.z = car.z - fz * (car.T.len / 2 + 0.8); W.collideCircle(P, P.r); }
  car.driver = null; car.parked = true; car.locked = false;
  if (car.T.pedal) car.leftT = 120;
  P.y = 0; P.yv = 0; P.spin = 0; P.kx = P.kz = 0;
  P.inCar = null; P.rig.root.visible = true; P.facing = car.h; P.resetPose();
  if (!force) Sfx.click();
};
G.sellCar = function () {
  const car = G.player.inCar; if (!car) return false;
  if (Heat.level > 0) { G.toast("Rusty won't touch it with cops on you. Lose the heat.", 'warn'); Sfx.error(); return false; }
  const v = G.carValue(car);
  G.exitCar(true);
  G.addCash(v, car.x, car.z);
  G.toast('Rusty bought the ' + car.T.name.toLowerCase() + ' for ' + money(v), 'cash');
  Story.event('sell', car);
  car.remove();
  return true;
};
/* thrown off a bike in a hard crash. vx/vz = the bike's velocity just before the hit:
   the rider keeps most of it and goes over the bars, as a ragdoll when physics is running. */
G.bail = function (car, impact, vx, vz) {
  if (car.T.pedal) car.fallen = true;
  if (vx == null) { vx = car.vx; vz = car.vz; }
  const sp = Math.hypot(vx, vz), dx = sp > 0.5 ? vx / sp : Math.sin(car.h), dz = sp > 0.5 ? vz / sp : Math.cos(car.h);
  const fly = sp * 0.72 + 1.5, lift = 3.5 + Math.min(6, impact * 0.2);
  const vel = { x: dx * fly, y: lift, z: dz * fly };
  // pitch forward about the sideways axis: head over heels
  const flip = 1.6 + fly * 0.06, spin = { x: dz * flip, y: rand(-0.3, 0.3), z: -dx * flip };
  const launch = (a) => {
    // start from the saddle, above the bike's own physics box
    a.x = car.x; a.z = car.z; a.y = 0.95; a.facing = Math.atan2(dx, dz); a.carHitT = G.time + 1.5;
    a.rig.root.position.set(a.x, a.y + W.groundAt(a.x, a.z), a.z); a.rig.root.rotation.set(0, a.facing, 0);
  };
  if (car.driver === 'ai') {
    const a = G.ejectDriver(car); car.driver = null; car.ai = null; car.parked = true;
    car.v = 0; car.vx *= 0.2; car.vz *= 0.2;
    if (!a) return;
    launch(a); a.down = true; a.downT = rand(3, 5); a.vx = a.vz = 0;
    a.kx = vel.x; a.kz = vel.z; a.yv = lift;
    a.hp = Math.max(1, a.hp - impact);
    Phys.ragdoll(a, vel, spin);
    return;
  }
  const P = G.player; if (P.inCar !== car) return;
  G.exitCar(true);
  car.v = 0; car.vx *= 0.2; car.vz *= 0.2;
  G.toast('Thrown off the ' + car.T.name.toLowerCase() + '!', 'warn');
  // the bike stays where it fell: walk back and press F to pick it up (no teleporting it back under you)
  if (car.T.pedal) car.leftT = 120;
  launch(P); P.vx = P.vz = 0; P.kx = vel.x; P.kz = vel.z; P.yv = lift;
  if (G.hurtPlayer(Math.min(45, impact * 1.4), P.x - dx, P.z - dz, 0, null)) return; // knocked out: that ragdolls too
  if (Phys.ready && Phys.ragdoll(P, vel, spin)) { P.kx = P.kz = 0; P.tumble = { t: 0 }; Sfx.whoosh(P.x, P.z); return; }
  // no physics engine: the old hop-and-skid
  P.y = 0.05; P.yv = 5 + impact * 0.1; P.kx = vx * 0.6; P.kz = vz * 0.6;
};
/* tumbling after a bail: lie there until the body comes to rest, then get up */
G.updateTumble = function (dt) {
  const P = G.player, T = P.tumble; if (!T) return;
  T.t += dt;
  if (P.down || G.respawning || !P.ragdoll) { P.tumble = null; return; }
  if (P.ragdoll.frozen) { Phys.unragdoll(P); P.tumble = null; return; }
  if ((T.t > 1.4 && P.ragdoll.spd < 1.2) || T.t > 5) {
    Phys.unragdoll(P); P.tumble = null; P.safeT = G.time + 0.5; P.kx = P.kz = 0;
  }
};
/* big air: a small reward for any good jump, a big one the first time you clear each named stunt ramp */
G.stunt = function (car, air, distM, ramp) {
  const pay = Math.round(air * 20 + distM * 1.5);
  G.S.stunts = G.S.stunts || [];
  if (ramp && !G.S.stunts.includes(ramp.name)) {
    G.S.stunts.push(ramp.name);
    UI.banner('STUNT JUMP', ramp.name + ' · ' + distM.toFixed(0) + ' m · ' + air.toFixed(1) + ' s · ' + G.S.stunts.length + ' of ' + W.STUNTS.length, 'done');
    G.addCash(500 + pay, car.x, car.z); Sfx.sting('step'); G.save();
  } else {
    G.toast('Big air! ' + distM.toFixed(0) + ' m · ' + air.toFixed(1) + ' s', 'good'); G.addCash(pay, car.x, car.z);
  }
};
G.repairCost = (car) => Math.round(60 + (1 - clamp(car.hp / car.maxHp, 0, 1)) * car.T.value * 0.35);
G.repairCar = function () {
  const car = G.player.inCar; if (!car) return false;
  if (Heat.level > 0) { G.toast("Rusty won't touch it with cops on you. Lose the heat.", 'warn'); Sfx.error(); return false; }
  const cost = G.repairCost(car);
  if (G.S.cash < cost) { G.toast('Repairs cost ' + money(cost) + '. Rob something first.'); Sfx.error(); return false; }
  G.S.cash -= cost; car.repair(); Sfx.buy();
  G.toast('Rusty patched up the ' + car.T.name.toLowerCase() + ' for ' + money(cost), 'good');
  return true;
};
/* smash a tree, street pole or gas pump: it falls/breaks, a pump explodes */
G.smash = function (c, car, ex, ez) {
  if (c.removed) return;
  const d = c.destructible; W.removeCollider(c);
  const sp = car ? Math.hypot(car.vx, car.vz) : 6;
  let dx = car ? car.vx / (sp || 1) : 0, dz = car ? car.vz / (sp || 1) : 0;
  if (!car) { const px = d.x != null ? d.x : c.x, pz = d.z != null ? d.z : c.z, l = dist(px, pz, ex, ez) || 1; dx = (px - ex) / l; dz = (pz - ez) / l; }
  if (d.kind === 'tree') {
    const t = d.ref; W.hideTree(t);
    FX.burst(t.x, 3.5 * t.s, t.z, 18, ['#2f5d34', '#4f8a3a', '#6b4a2f', '#3d6e33'], 6, 0.3, 1.1);
    const g = new THREE.Group(), s = t.s, trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.2 * s, 0.3 * s, 2.4 * s, 6), lam('#6b4a2f'));
    trunk.position.y = -1.6 * s; g.add(trunk);
    const top = new THREE.Mesh(t.type === 'pine' ? new THREE.ConeGeometry(1.9 * s, 5 * s, 7) : new THREE.IcosahedronGeometry(2 * s, 0), lam(t.type === 'pine' ? '#2f5d34' : '#4f8a3a'));
    top.position.y = t.type === 'pine' ? 1.7 * s : 0.9 * s; g.add(top); g.traverse((m) => { if (m.isMesh) m.castShadow = true; });
    if (!Phys.debrisPiece(g, t.x, 3.0 * s, t.z, rand(0, TAU), { x: dx * sp * 0.45, y: 1.5, z: dz * sp * 0.45 }, { x: dz * 2.5, y: 0, z: -dx * 2.5 }, { x: 0.6 * s, y: 2.8 * s, z: 0.6 * s })) FX.burst(t.x, 1, t.z, 8, ['#6b4a2f'], 4, 0.25, 0.8);
    Sfx.crash(0.75, t.x, t.z);
  } else if (d.kind === 'lamp') {
    const l = d.ref; W.hideLamp(l);
    FX.burst(l.x, 5, l.z, 10, ['#fff1b8', '#ffd166', '#ffffff'], 6, 0.12, 0.5);
    const g = new THREE.Group(), p = new THREE.Mesh(new THREE.BoxGeometry(0.18, 5.5, 0.18), lam('#3a3d42')); g.add(p);
    const hd = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.2, 0.4), new THREE.MeshBasicMaterial({ color: 0x777766 })); hd.position.set(0, 2.7, 0); g.add(hd);
    Phys.debrisPiece(g, l.x, 2.75, l.z, 0, { x: dx * sp * 0.5, y: 1, z: dz * sp * 0.5 }, { x: dz * 3, y: 0, z: -dx * 3 }, { x: 0.12, y: 2.75, z: 0.12 });
    Sfx.crash(0.45, l.x, l.z);
  } else if (d.kind === 'pump') {
    d.ref.visible = false;
    explosion(d.x, d.z, 8, 90, car && car.driver === 'player' ? G.player : null);
  }
  if (car) {
    const k = d.kind === 'tree' ? 0.65 : 0.85;
    car.vx *= k; car.vz *= k; car.v *= k;
    car.damage(d.kind === 'tree' ? 10 : 4, car.x + dx * 3, car.z + dz * 3, null);
    if (car.driver === 'player') G.shake(d.kind === 'tree' ? 0.45 : 0.25);
  }
};
G.missionCarLost = function (car) { if (Story.active && Story.active.car === car) Story.fail('The truck got wrecked.'); };

/* ---------------- player damage, bust, knockout ---------------- */
G.hurtPlayer = function (dmg, fx, fz, knock, src) {
  const P = G.player;
  if (P.down || G.respawning || G.god) return false;
  if (P.inCar && !P.inCar.T.bike) { P.inCar.damage(dmg * 0.6, fx, fz); return false; }
  if (P.inHeli) { P.inHeli.damage(dmg * 0.6, null); return false; }
  let d = dmg;
  G.hurtLog = (G.hurtLog || []).slice(-5); G.hurtLog.push((src && src.kind ? src.kind : src === null ? 'world' : String(src)) + ':' + Math.round(dmg) + '@' + G.time.toFixed(1));
  if (G.S.armor > 0) { const a = Math.min(G.S.armor, d * 0.85); G.S.armor -= a; d -= a; }
  P.hp -= d;
  const dd = dist(P.x, P.z, fx, fz) || 1;
  P.kx += (P.x - fx) / dd * (knock || 0); P.kz += (P.z - fz) / dd * (knock || 0);
  G.flash = Math.min(1, (G.flash || 0) + d / 30); G.shake(Math.min(0.5, d / 40)); Sfx.hurt();
  if (P.hp <= 0) { P.hp = 0; G.knockedOut(); return true; }
  return false;
};
G.knockedOut = function () {
  const P = G.player; if (G.respawning) return;
  if (P.inCar) G.exitCar(true);
  if (P.inHeli) G.exitHeli(true);
  P.down = true; P.chute = false; P.tumble = null; // a knocked-out skydiver loses the chute
  if (Heat.level > 0) Voice.radio(['dispatch/suspect_down'], true);
  Phys.ragdoll(P, { x: P.kx + P.vx, y: P.yv, z: P.kz + P.vz }); P.vx = P.vz = 0;
  const loss = Math.round(G.S.cash * 0.15);
  G.startRespawn('KNOCKED OUT', 'Hospital bill: -' + money(loss), W.places.hospital, loss, true);
};
G.busted = function () {
  const P = G.player; if (G.respawning) return;
  if (P.inCar) G.exitCar(true);
  if (P.inHeli) G.exitHeli(true);
  P.handsUp = 99; P.chute = false;
  { let cop = null, cd = 30; for (const n of G.npcs) if (n.kind === 'cop' && !n.down && dist(n.x, n.z, P.x, P.z) < cd) { cd = dist(n.x, n.z, P.x, P.z); cop = n; } if (cop) Voice.bark('cop_cuff', cop, { force: true }); }
  if (Heat.level > 0) Voice.radio(['dispatch/custody'], true);
  const loss = Math.round(G.S.cash * 0.25);
  G.S.stats.busts++;
  G.startRespawn('CUFFED', 'Bail and confiscation: -' + money(loss), W.places.police, loss, false);
};
G.startRespawn = function (title, sub, place, loss, heal) {
  G.respawning = true; G.respawnT = G.autotest ? 0.1 : 3.2; G.respawnTo = { place, loss, heal };
  if (Story.active) Story.fail(title === 'CUFFED' ? 'You got cuffed.' : 'You got knocked out.', true);
  UI.banner(title, sub, title === 'CUFFED' ? 'cuffed' : 'ko');
  if (!G.autotest) Sfx.sting(title === 'CUFFED' ? 'cuffs' : 'ko');
};
G.finishRespawn = function () {
  const P = G.player, r = G.respawnTo;
  G.S.cash = Math.max(0, G.S.cash - r.loss);
  Heat.clear(); clearPolice();
  G.resetPlayer(r.place.x + rand(-1, 1), r.place.z + rand(-1, 1));
  P.hp = r.heal ? 100 : Math.max(P.hp, 50);
  G.respawning = false; G.save();
};
/* a fresh start for the character: standing upright on the ground, nothing in progress */
G.resetPlayer = function (x, z) {
  const P = G.player;
  if (P.inCar) G.exitCar(true);
  if (P.inHeli) G.exitHeli(true);
  if (P.ragdoll) Phys.unragdoll(P);
  P.x = x; P.z = z; P.y = 0; P.yv = 0; P.vx = P.vz = 0; P.kx = P.kz = 0;
  P.down = false; P.downT = 0; P.handsUp = 0; P.spin = 0; P.cd = 0; P.atkT = 0; P.aimT = 0;
  P.chute = false; P.jumping = false; P.vault = null; P.top = null; P.tumble = null; P.carHitT = 0; P.ride = null;
  P.safeT = G.time + 1;
  if (P.stars) P.stars.visible = false;
  P.rig.root.visible = true; P.resetPose();
  W.collideCircle(P, P.r);
  G.stamina = 100; G.winded = false; G.restT = 0; G.remount = null;
  G.jumpQ = false; G.hopQ = false; G.slip = 0; G.crumbs = [];
};
function clearPolice() {
  for (const n of G.npcs) if (n.kind === 'cop' && dist(n.x, n.z, G.player.x, G.player.z) > 0) n.remove();
  for (const c of G.cars) if (c.police && !c.persistent && G.player.inCar !== c) c.remove();
  Roadblocks.clear(); Bullets.clear(); Smoke.clear(); Choppers.clearPolice(); Ordnance.clear();
  for (const s of Spikes.list) if (!s.byPlayer) s.life = 0;
}

/* ---------------- items ---------------- */
G.useMedkit = function () {
  const P = G.player;
  if (G.S.medkit <= 0) { G.toast('No medkits. Hardline Supply sells them.'); Sfx.error(); return; }
  if (P.hp >= 100) { G.toast('Already at full health.'); return; }
  G.S.medkit--; P.hp = Math.min(100, P.hp + 60); Sfx.buy(); Floaters.add(P.x, 2, P.z, '+60 HP', 'hp');
};
G.useGadget = function () {
  const P = G.player;
  if (P.inHeli) { G.toast('Gadgets do not work from a helicopter.'); return; }
  if (P.inCar) {
    if (G.S.spikes <= 0) { G.toast('No spike strips. Buy them at a gun store.'); Sfx.error(); return; }
    G.S.spikes--;
    const c = P.inCar, fx = Math.sin(c.h), fz = Math.cos(c.h);
    Spikes.add(c.x - fx * (c.T.len / 2 + 2.5), c.z - fz * (c.T.len / 2 + 2.5), c.h, 6, 30, true);
    G.toast('Spike strip dropped behind you.');
  } else {
    if (G.S.smoke <= 0) { G.toast('No smoke bombs. Buy them at a gun store.'); Sfx.error(); return; }
    G.S.smoke--; Smoke.add(P.x, P.z); G.toast('Smoke! Cops can\'t see through it.');
  }
};
G.equip = function (id) {
  if (!G.S.weapons[id]) return;
  G.player.setWeapon(id);
};
G.cycleWeapon = function () {
  const owned = WEAPON_ORDER.filter((w) => G.S.weapons[w]);
  const i = owned.indexOf(G.player.weapon);
  G.equip(owned[(i + 1) % owned.length]); Sfx.click();
};
G.attack = function (ang) {
  const P = G.player, w = WEAPONS[P.weapon];
  if (P.cd > 0 || P.down || P.tumble || P.inCar || P.inHeli || P.handsUp > 0) return;
  P.facing = ang;
  if (w.melee) {
    P.cd = w.cd; P.atkT = P.atkDur = w.cd * 0.85;
    meleeHit(P, ang, w);
    return;
  }
  if (G.S.ammo[w.ammo] <= 0) { G.toast('Out of ammo — buy more at a gun store.'); Sfx.error(); G.equip(G.S.weapons.bat ? 'bat' : 'fists'); return; }
  G.S.ammo[w.ammo]--; P.cd = w.cd; P.atkT = P.atkDur = 0.12; P.aimT = 1.5;
  if (w.rocket) { Ordnance.fireRocket(P, ang, G.heliAim); G.crime('gunfire', P.x, P.z, {}); return; }
  if (G.heliAim && !G.heliAim.falling) {
    const h = G.heliAim;
    for (let k = 0; k < (w.pellets || 1); k++) {
      const hit = Math.random() < (w.pellets ? 0.4 : 0.7);
      Choppers.tracer(P.x, 1.5, P.z, h.x + (hit ? 0 : rand(-3, 3)), h.y + 1.8 + (hit ? 0 : rand(-2, 2)), h.z + (hit ? 0 : rand(-3, 3)));
      if (hit) h.damage(w.dmg, P);
    }
    Sfx.shot(P.weapon); G.crime('gunfire', P.x, P.z, {});
    return;
  }
  const mx = P.x + Math.sin(ang) * 0.8, mz = P.z + Math.cos(ang) * 0.8;
  for (let k = 0; k < (w.pellets || 1); k++) Bullets.fire(P, mx, mz, ang + rand(-1, 1) * w.spread, w.dmg, { speed: w.speed, range: w.range, team: 'player', knock: w.knock });
  FX.burst(mx, 1.35, mz, 3, ['#fff3b0', '#ffb703'], 3, 0.15, 0.08, { grav: 0 });
  Sfx.shot(P.weapon);
  G.crime('gunfire', P.x, P.z, {});
};

/* ---------------- story missions ---------------- */
const V = 'Vera Kade';
const MISSIONS = [
  {
    id: 'first', title: 'First Shift', reward: 400,
    intro: [[V, "So you're the driver Nix vouched for. Bayhaven has more cash than sense, and I need someone with nerve."],
      [V, 'Hit the Quick-Stop one block north of here. Stand at the counter and hold E until the register pops.'],
      [V, "The alarm will bring cops. Lose them, then come back to the garage. Don't lead them here."]],
    steps: [{ t: 'rob', target: 'quick', text: 'Rob the Quick-Stop (hold E at the counter)' }, { t: 'loseHeat', text: 'Lose the cops' }, { t: 'goto', at: 'hideout', text: 'Return to Kade Auto' }],
    outro: [[V, 'Not bad. Keep the cash. Everything in this town can be robbed: stores, ATMs, wallets, cars.'], [V, 'Hardline Supply sells guns and gear. Spend wisely.']],
  },
  {
    id: 'tools', title: 'Tools of the Trade', reward: 500,
    intro: [[V, 'Smashing car windows is loud, and loud gets you caught.'],
      [V, 'Buy a Lockpick at a gun store, like Hardline Supply. Then take a parked car quietly and sell it to Rusty at the chop shop.'],
      [V, "Rusty won't take a car while cops are on you. Lose the heat first."]],
    steps: [{ t: 'buy', item: 'lockpick', text: 'Buy a Lockpick at a gun store (H on the map)' }, { t: 'steal', parked: true, text: 'Steal a parked car (F next to it)' }, { t: 'sell', text: "Sell it at Rusty's Chop Shop (E in the yard)" }],
    outro: [[V, "Rusty says you drive like a nervous accountant. From him, that's a compliment."]],
  },
  {
    id: 'atms', title: 'Withdrawal Slip', reward: 600,
    intro: [[V, 'ATMs on every corner and nobody watching them. Crack three. Hold E at the machine.'], [V, 'Pedestrians will call it in if they see you. Pick quiet corners.']],
    steps: [{ t: 'robKind', kind: 'atm', n: 3, text: 'Crack ATMs' }, { t: 'loseHeat', text: 'Lose any heat' }, { t: 'goto', at: 'hideout', text: 'Return to Kade Auto' }],
  },
  {
    id: 'quiet', title: 'Quiet Hands', reward: 900,
    intro: [[V, 'Every store has a silent alarm and a camera. Pros switch them off before they touch the register.'],
      [V, "Buy Wire Cutters and a Laptop at a gun store. Cut the alarm box on Electro Mart's side wall, then loop its camera."],
      [V, 'Do it right and nobody calls anything in. It works on any store in town, not only on my jobs.']],
    steps: [{ t: 'buy', item: 'cutters', text: 'Buy Wire Cutters at a gun store (H on the map)' }, { t: 'buy', item: 'laptop', text: 'Buy a Laptop at a gun store (H on the map)' },
      { t: 'cutAlarm', target: 'electro', text: "Cut Electro Mart's alarm box (red box, side wall)" },
      { t: 'loopCams', target: 'electro', text: "Loop Electro Mart's camera (stand near it, hold E)" },
      { t: 'rob', target: 'electro', text: 'Rob Electro Mart' }, { t: 'loseHeat', text: 'Lose any heat' }, { t: 'goto', at: 'hideout', text: 'Return to Kade Auto' }],
    outro: [[V, "Clean. Remember the alarm boxes reset after a few minutes, and loops don't last forever."]],
  },
  {
    id: 'glimmer', title: 'Glimmer Run', reward: 1500,
    intro: [[V, 'Glimmer & Co. Jewelers. Two cameras, one alarm, and a lot of money behind the glass.'],
      [V, 'Even with the alarm and cameras dead, the clerk will scream. Expect heat.'],
      [V, "Pick your getaway. The Ring Highway is fast, but they'll throw roadblocks and spike strips at you."],
      [V, "Alleys and Forest Park hide you, but they're slow. Pick a dead end or let them cover the exits and you're boxed in."]],
    steps: [{ t: 'rob', target: 'jewel', text: 'Rob Glimmer & Co. (security is optional)' }, { t: 'loseHeat', text: 'Escape: highway, alleys or Forest Park' }, { t: 'goto', at: 'hideout', text: 'Return to Kade Auto' }],
  },
  {
    id: 'snitch', title: 'The Snitch', reward: 2200,
    intro: [[V, "Somebody talked about the jewelry job. A guy called Marty, and he's driving to the cops right now in a silver sedan."],
      [V, "Grab any car, catch him, and run him off the road. Don't let him get away."]],
    steps: [{ t: 'steal', text: 'Get a car' }, { t: 'chase', kind: 'sedan', color: '#c8ccd0', text: "Wreck Marty's silver sedan" }],
    outro: [[V, "Marty won't be talking to anyone for a while. Nice driving."]],
  },
  {
    id: 'truck', title: 'Armored Ego', reward: 800,
    intro: [[V, 'An armored cash truck is parked just north of Bayhaven Federal. The guards are on lunch.'], [V, 'Take it, shake the cops, and sell it to Rusty. Armored trucks fetch top dollar.']],
    steps: [{ t: 'spawnTruck' }, { t: 'steal', missionCar: true, text: 'Steal the armored truck north of the bank' }, { t: 'loseHeat', text: 'Lose the cops' }, { t: 'sell', missionCar: true, text: "Sell the truck at Rusty's Chop Shop" }],
  },
  {
    id: 'flight', title: 'Flight School', reward: 2500,
    intro: [[V, 'Next job needs a pilot. The flight school at City Airport, west of town, never locks its prop planes.'],
      [V, 'Take one up, fly the circuit through the markers, and put it back down on the runway in one piece.']],
    steps: [{ t: 'goto', at: 'airport', r: 30, text: 'Get to City Airport (west, off Airport Road)' }, { t: 'board', kinds: ['prop'], text: 'Climb into a prop plane on the apron' },
      { t: 'rings', set: 'circuit', text: 'Fly through the markers' }, { t: 'land', at: 'runway', text: 'Land on the runway and stop' }],
    outro: [[V, "Smooth landing. Now that you can fly, I've got bigger plans for you."]],
  },
  {
    id: 'bank', title: 'The Federal Job', reward: 3000,
    intro: [[V, 'This is the one. The Bayhaven Federal vault.'],
      [V, "You'll need a Thermal Drill. Cut the alarm on the bank's east wall and kill both cameras first, or half the precinct shows up before the drill is warm."],
      [V, 'Body Armor would be smart. Plan your escape route before you start drilling.']],
    steps: [{ t: 'buy', item: 'drill', text: 'Buy a Thermal Drill at a gun store (H on the map)' }, { t: 'cutAlarm', target: 'bank', text: "Cut the bank's alarm box (east wall)" },
      { t: 'loopCams', target: 'bank', text: 'Loop or shoot out both bank cameras' }, { t: 'rob', target: 'bank', text: 'Drill the vault (hold E at the bank doors)' },
      { t: 'loseHeat', text: 'Lose the cops' }, { t: 'goto', at: 'hideout', text: 'Return to Kade Auto' }],
  },
  {
    id: 'skycash', title: 'Cash in Transit', reward: 6000,
    intro: [[V, 'SkyCash at the airport changes a fortune in foreign money every night.'],
      [V, "Cut their alarm, loop both cameras, and empty the desk. Then take the private jet and lose the cops in the air."]],
    steps: [{ t: 'cutAlarm', target: 'fxdesk', text: "Cut SkyCash's alarm box (at the airport terminal)" }, { t: 'loopCams', target: 'fxdesk', text: 'Loop or shoot out both SkyCash cameras' },
      { t: 'rob', target: 'fxdesk', text: 'Empty the SkyCash desk (hold E)' }, { t: 'board', kinds: ['bizjet'], text: 'Steal the private jet on the apron' },
      { t: 'airborne', alt: 25, text: 'Take off' }, { t: 'loseHeat', text: 'Lose the cops in the air' }, { t: 'land', text: 'Land somewhere and stop' }],
    outro: [[V, 'A getaway by private jet. Bayhaven has never seen anything like you.']],
  },
  {
    id: 'topgun', title: 'Top Gun', reward: 7500,
    intro: [[V, 'Air Base Seven keeps two fighter jets fuelled. A buyer up north wants one, no questions asked.'],
      [V, "Steal a jet, fly the markers over Pine Ridge before they scramble everything, and land it on the runway. Expect company."]],
    steps: [{ t: 'board', kinds: ['fighter'], text: 'Steal a fighter jet at Air Base 7 (airport, west side)' }, { t: 'setHeat', n: 3 },
      { t: 'rings', set: 'ridge', time: 120, text: 'Fly through the markers over Pine Ridge' }, { t: 'land', at: 'runway', text: 'Land the jet on the airport runway' }],
    outro: [[V, "The buyer's thrilled. And the air base is going to need better locks."]],
  },
  {
    id: 'gravy', title: 'Gravy Train', reward: 5000,
    intro: [[V, 'The Federal Reserve moves cash out to the county by rail now. A steel safe bolted to the roof of the third car, and nobody guarding it.'],
      [V, "Catch the train, climb on, and crack the safe while it's moving. Then jump off and lose the cops."]],
    steps: [{ t: 'boardTrain', text: 'Catch the county train and climb on (E next to it)' }, { t: 'rob', target: 'trainSafe', text: 'Crack the safe on the gold car (hold E)' },
      { t: 'loseHeat', text: 'Jump off and lose the cops' }],
    outro: [[V, 'Robbing a moving train. I knew you were crazy, I just did not know how crazy.']],
  },
  {
    id: 'surfer', title: 'Train Surfer', reward: 3500,
    intro: [[V, "A friend of mine bet me nobody would ride the roof of the county train with the cops shooting at them."], [V, 'Prove me right. Stay up there for a full minute, then get away.']],
    steps: [{ t: 'boardTrain', text: 'Climb onto the county train (E next to it)' }, { t: 'setHeat', n: 3 }, { t: 'ride', time: 60, text: 'Stay on the train roof' }, { t: 'loseHeat', text: 'Jump off and lose the cops' }],
    outro: [[V, 'I just won a lot of money. Here is your share.']],
  },
  {
    id: 'boat', title: 'Last Boat Out', reward: 10000,
    intro: [[V, "The feds traced the bank job back to my garage. We're done in Bayhaven."], [V, 'A boat is waiting at Pier 9, south across the Ring Highway. Every cop in the city is out. Just get there.']],
    steps: [{ t: 'setHeat', n: 4 }, { t: 'goto', at: 'pier', r: 5, text: 'Reach the boat at Pier 9' }],
    outro: [[V, 'Look at them standing on the dock. Bayhaven will miss us.'], [V, 'Story complete! The city is still yours to rob in free roam.']],
  },
];

/* marker rings for the flying jobs: [x, z, altitude] */
const RINGS = {
  circuit: [[-560, 300, 30], [-330, 200, 45], [-280, -60, 55], [-560, -250, 60], [-950, -150, 50], [-1150, 150, 35]],
  ridge: [[-650, -900, 65], [-300, -1130, 75], [50, -1130, 75], [330, -950, 60], [100, -620, 50], [-350, -420, 45]],
};
const Story = {
  active: null, rings: [],
  get done() { return G.S.storyDone; },
  // jobsDone (ids) is the record; storyDone is its count. Setting storyDone directly (tests, old code) re-derives the list.
  sync() { const S = G.S; if (!Array.isArray(S.jobsDone) || S.jobsDone.length !== S.storyDone) S.jobsDone = MISSIONS.slice(0, S.storyDone).map((m) => m.id); },
  available() { this.sync(); return !!this.next() && !this.active; },
  next() { this.sync(); return MISSIONS.find((m) => !G.S.jobsDone.includes(m.id)); },
  start() {
    const m = this.next(); if (!m) return;
    UI.dialog(m.intro, () => this.begin());
  },
  begin() {
    const m = this.next(); if (!m) return;
    this.active = { m, i: -1, count: 0, flag: false, t: 0, car: null };
    UI.banner(m.title.toUpperCase(), 'Job ' + (G.S.storyDone + 1) + ' of ' + MISSIONS.length, 'job');
    this.advance();
  },
  step() { return this.active && this.active.m.steps[this.active.i]; },
  advance() {
    const a = this.active;
    a.i++; a.count = 0; a.flag = false; a.t = 0;
    if (a.i >= a.m.steps.length) { this.complete(); return; }
    const s = this.step();
    if (s.t === 'setHeat') { Heat.add(s.n, 5, 'The whole city is hunting you'); this.advance(); return; }
    if (s.t === 'spawnTruck') {
      const p = W.places.bankLot;
      if (a.car && !a.car.dead) a.car.remove();
      const car = new Car('armored', p.x, p.z, -Math.PI / 2, { parked: true, mission: true, persistent: true });
      car.locked = true; a.car = car;
      this.advance(); return;
    }
    if (s.t === 'rob' && W.places[s.target]) W.places[s.target].cd = 0;
    if (s.t === 'rings') this.showRings(RINGS[s.set], 0);
    if (s.t === 'chase') this.spawnRunner(s);
    if (this.check(s)) { this.advance(); return; }
    if (!G.autotest && a.i > 0) Sfx.sting('step');
  },
  check(s) {
    const a = this.active, P = G.player, t = G.body();
    switch (s.t) {
      case 'goto': { const p = W.places[s.at]; return dist(t.x, t.z, p.x, p.z) < (s.r || 4); }
      case 'rob': case 'sell': return a.flag;
      case 'robKind': return a.count >= s.n;
      case 'buy': return G.owns(s.item) || (s.item && G.S.tools[s.item]);
      case 'steal': return !!P.inCar && (!s.parked || P.inCar.wasParked) && (!s.missionCar || P.inCar === a.car);
      case 'loseHeat': return Heat.level === 0;
      case 'cutAlarm': { const al = W.places[s.target].sec.alarm; return al.cutT > 0; }
      case 'loopCams': return W.places[s.target].sec.cams.every((c) => c.loopT > 0 || c.deadT > 0);
      case 'board': return !!P.inHeli && s.kinds.includes(P.inHeli.kind);
      case 'rings': return a.count >= RINGS[s.set].length;
      case 'land': { const h = P.inHeli; if (!h || !G.heliLanded(h)) return false; if (s.at !== 'runway') return true; const r = W.AIRPORT.runway; return h.x > r.minX - 10 && h.x < r.maxX + 10 && h.z > r.minZ - 10 && h.z < r.maxZ + 10; }
      case 'chase': { const c = a.target; return !!c && (c.wreck || c.dead || c.hp <= 0 || c.driver !== 'ai'); }
      case 'boardTrain': return !!Train.onTrain(P);
      case 'airborne': return !!P.inHeli && P.inHeli.y > s.alt;
      case 'ride': return (a.rideT || 0) >= s.time;
      default: return false;
    }
  },
  /* the chase target: a car that drives away from you as fast as it dares */
  spawnRunner(s) {
    const a = this.active, t = G.body();
    let cands = W.nodes.filter((n) => { const d = dist(n.x, n.z, t.x, t.z); return d > 80 && d < 150 && n.adj.length && !n.hwy; });
    if (!cands.length) cands = W.nodes.filter((n) => n.adj.length);
    const n = pick(cands), nb = W.nodes[pick(n.adj)];
    const car = new Car(s.kind || 'sedan', n.x, n.z, Math.atan2(nb.x - n.x, nb.z - n.z), { color: s.color, mission: true, persistent: true });
    car.driver = 'ai'; initTraffic(car, n.id, nb.id); car.ai.flee = true; car.v = 8;
    a.target = car; a.lostT = 0;
  },
  showRings(list, k) {
    this.clearRings();
    list.forEach(([x, z, y], i) => {
      if (i < k || i > k + 1) return;
      const m = new THREE.Mesh(new THREE.TorusGeometry(10, 0.7, 8, 36), new THREE.MeshBasicMaterial({ color: i === k ? 0xffd23f : 0xfff3b0, transparent: true, opacity: i === k ? 0.9 : 0.35 }));
      const [px, pz] = i > 0 ? list[i - 1] : [x - 50, z]; m.position.set(x, W.airY(x, z, y), z); m.rotation.y = Math.atan2(x - px, z - pz); G.scene.add(m); this.rings.push(m);
    });
  },
  clearRings() { for (const m of this.rings) G.scene.remove(m); this.rings = []; },
  event(type, payload) {
    const a = this.active; if (!a) return;
    const s = this.step(); if (!s) return;
    if (type === 'rob' && s.t === 'rob' && payload.id === s.target) a.flag = true;
    if (type === 'rob' && s.t === 'robKind' && payload.kind === s.kind) { a.count++; if (a.count < s.n) G.toast(a.count + ' of ' + s.n + ' ATMs cracked'); }
    if (type === 'sell' && s.t === 'sell' && (!s.missionCar || payload === a.car)) a.flag = true;
  },
  update(dt) {
    const a = this.active; if (!a) return;
    const s = this.step(); if (!s) return;
    a.t += dt;
    if (s.t === 'rings') {
      const list = RINGS[s.set], r = list[a.count], P = G.player, B = G.body(), y = P.inHeli ? P.inHeli.y + 1.5 : P.inCar ? 1 : P.y + 1;
      if (r && dist(B.x, B.z, r[0], r[1]) < 12 && Math.abs(y - r[2]) < 12) { a.count++; Sfx.tick(); Sfx.whoosh(); if (a.count < list.length) { G.toast('Marker ' + a.count + ' of ' + list.length, 'good'); this.showRings(list, a.count); } else this.clearRings(); }
      if (s.time && a.t > s.time) { this.fail('Too slow through the markers.'); return; }
    }
    if (s.t === 'ride') {
      if (Train.onTrain(G.player)) { a.rideT = (a.rideT || 0) + dt; a.offT = 0; } else a.offT = (a.offT || 0) + dt;
      if (a.offT > 8) { this.fail('You came off the train.'); return; }
    }
    if (s.t === 'chase' && a.target && !a.target.dead) {
      const B = G.body(); a.lostT = dist(a.target.x, a.target.z, B.x, B.z) > 280 ? a.lostT + dt : 0;
      if (a.lostT > 6) { this.fail('Marty got away.'); return; }
    }
    if (this.check(s)) this.advance();
  },
  fail(reason, quiet) {
    const a = this.active; if (!a) return;
    if (a.car && !a.car.dead && G.player.inCar !== a.car) a.car.remove();
    if (a.target && !a.target.dead) a.target.remove();
    this.clearRings();
    this.active = null;
    G.toast('Job failed: ' + reason + ' Talk to Vera to try again.', 'warn');
    if (!quiet) UI.banner('JOB FAILED', reason, 'ko');
    Sfx.sting('fail');
  },
  complete() {
    const m = this.active.m; this.clearRings();
    if (this.active.target && !this.active.target.dead && !this.active.target.wreck) this.active.target.mission = false;
    this.active = null;
    this.sync(); if (!G.S.jobsDone.includes(m.id)) G.S.jobsDone.push(m.id); G.S.storyDone = G.S.jobsDone.length;
    if (G.S.storyDone >= MISSIONS.length) { Heat.clear(); clearPolice(); }
    G.addCash(m.reward, G.player.x, G.player.z);
    G.save();
    UI.banner('JOB DONE', m.title + ' · +' + money(m.reward), 'done'); Sfx.sting('done');
    if (m.outro && !G.autotest) setTimeout(() => UI.dialog(m.outro, () => { if (G.S.storyDone >= MISSIONS.length) UI.ending(); }), 1600);
  },
  target() {
    const a = this.active;
    if (!a) return this.available() ? { x: W.places.hideout.x, z: W.places.hideout.z, vera: true } : null;
    const s = this.step(); if (!s) return null;
    switch (s.t) {
      case 'goto': return W.places[s.at];
      case 'rob': return W.places[s.target];
      case 'robKind': { const P = G.player; let best = null, bd = 1e9; for (const r of W.robs) if (r.kind === s.kind && r.cd <= 0) { const d = dist(r.x, r.z, P.x, P.z); if (d < bd) { bd = d; best = r; } } return best; }
      case 'buy': return G.owns(s.item) ? null : nearestShop();
      case 'steal': return s.missionCar ? a.car : (G.player.inCar ? null : nearestParked());
      case 'sell': return W.places.chop;
      case 'cutAlarm': return W.places[s.target].sec.alarm;
      case 'loopCams': { const c = W.places[s.target].sec.cams.find((k) => k.loopT <= 0 && k.deadT <= 0); return c || null; }
      case 'board': { const P = G.player; let best = null, bd = 1e9; for (const h of Choppers.list) if (!h.dead && !h.pilot && s.kinds.includes(h.kind)) { const d = dist(h.x, h.z, P.x, P.z); if (d < bd) { bd = d; best = h; } } return best; }
      case 'rings': { const r = RINGS[s.set][a.count]; return r ? { x: r[0], z: r[1] } : null; }
      case 'land': { if (s.at !== 'runway') return null; const r = W.AIRPORT.runway; return { x: (r.minX + r.maxX) / 2, z: (r.minZ + r.maxZ) / 2 }; }
      case 'chase': return a.target && !a.target.dead ? a.target : null;
      case 'boardTrain': { const P = G.player; let best = null, bd = 1e9; for (const c of Train.cars) { const d = dist(c.x, c.z, P.x, P.z); if (d < bd) { bd = d; best = c; } } return best; }
      default: return null;
    }
  },
  text() {
    const a = this.active;
    if (!a) return this.available() ? { title: 'Free roam', text: 'Vera has a job for you at Kade Auto (yellow marker)' } : { title: 'Free roam', text: 'Rob anything. Spend it at Hardline Supply.' };
    const s = this.step();
    let text = s ? s.text : '';
    if (s && s.t === 'robKind') text += ' (' + a.count + '/' + s.n + ')';
    if (s && s.t === 'ride') text += ' (' + Math.max(0, Math.ceil(s.time - (a.rideT || 0))) + 's to go)';
    if (s && s.t === 'rings') text += ' (' + a.count + '/' + RINGS[s.set].length + (s.time ? ' · ' + Math.max(0, Math.ceil(s.time - a.t)) + 's' : '') + ')';
    return { title: a.m.title, text };
  },
};
function nearestShop() {
  const t = G.body(); let best = null, bd = 1e9;
  for (const s of W.places.shops) { const d = dist(s.x, s.z, t.x, t.z); if (d < bd) { bd = d; best = s; } }
  return best;
}
/* explosions set off by the player: crack ATMs, blow the vault, wreck alarms and cameras */
G.blastLoot = function (x, z, r) {
  for (const rb of W.robs) {
    if (rb.cd > 0) continue;
    const d = dist(rb.x, rb.z, x, z);
    if (rb.kind === 'atm' && d < r) { G.crime('atmBlast', rb.x, rb.z, {}); G.completeRob(rb); }
    if (rb.kind === 'bank' && d < 5) { Heat.add(5, 5, 'Blew the vault door'); G.completeRob(rb); }
  }
  // a blown-up alarm box is destroyed before it can ring (the bang itself may still be reported)
  for (const al of W.alarms) if (al.cutT <= 0 && dist(al.wx, al.wz, x, z) < r) al.cutT = 200;
  for (const c of W.cams) if (c.deadT <= 0 && dist(c.x, c.z, x, z) < r + 3) G.destroyCam(c);
};
G.throwGrenade = function () {
  const P = G.player;
  if (P.inCar || P.inHeli || P.down || P.handsUp > 0) return;
  if (G.S.grenade <= 0) { G.toast('No grenades. Gun stores sell them.'); Sfx.error(); return; }
  G.S.grenade--;
  const chase = G.camMode === 'chase';
  const tx = chase ? P.x + Math.sin(CAM.yaw) * 14 : G.aimX, tz = chase ? P.z + Math.cos(CAM.yaw) * 14 : G.aimZ;
  P.facing = Math.atan2(tx - P.x, tz - P.z); P.atkT = P.atkDur = 0.3;
  Ordnance.throwGrenade(P, tx, tz);
};
G.useC4 = function () {
  const P = G.player;
  if (Ordnance.c4.length) { Sfx.tick(); Ordnance.detonate(); return; }
  if (P.inCar || P.inHeli || P.down) return;
  if (G.S.c4 <= 0) { G.toast('No C4. Gun stores sell it.'); Sfx.error(); return; }
  G.S.c4--;
  const b = Ordnance.plantC4(P.x + Math.sin(P.facing) * 0.8, P.z + Math.cos(P.facing) * 0.8);
  G.toast(b.car ? 'C4 stuck to the ' + b.car.T.name.toLowerCase() + '. Press B to detonate.' : 'C4 planted. Get clear, then press B to detonate.');
};
function nearestParked() {
  const P = G.player; let best = null, bd = 1e9;
  for (const c of G.cars) if (c.parked && c.locked && !c.wreck && !c.police) { const d = dist(c.x, c.z, P.x, P.z); if (d < bd) { bd = d; best = c; } }
  return best;
}

/* ---------------- population ---------------- */
function randomSidewalkPoint(px, pz, minD, maxD, avoidLos, hidden) {
  for (let k = 0; k < 30; k++) {
    const b = pick(W.blocks);
    if (dist(b.cx, b.cz, px, pz) > maxD + 25) continue;
    const side = randi(0, 3), t = rand(-1, 1) * W.RING;
    let x, z, sx, sz;
    if (side === 0) { x = b.cx + t; z = b.cz - W.RING; sx = 1; sz = -1; }
    else if (side === 1) { x = b.cx + W.RING; z = b.cz + t; sx = 1; sz = 1; }
    else if (side === 2) { x = b.cx - t; z = b.cz + W.RING; sx = -1; sz = 1; }
    else { x = b.cx - W.RING; z = b.cz - t; sx = -1; sz = -1; }
    const d = dist(x, z, px, pz);
    if (d < minD || d > maxD) continue;
    if (avoidLos && !W.segBlocked(x, z, px, pz) && k < 20) continue;
    if (hidden && G.canSee(x, z, 1)) continue;
    return { x, z, b, sx, sz };
  }
  return null;
}
let popT = 0;
function updatePopulation(dt) {
  popT -= dt; if (popT > 0) return; popT = 0.5;
  const P = G.player, t = G.body();
  // pedestrians
  let peds = 0, patrol = 0;
  for (const n of G.npcs) {
    const d = dist(n.x, n.z, t.x, t.z);
    const unseen = () => !G.canSee(n.x, n.z, 1) || d > 340;
    if (n.kind === 'ped' && n.ai.mode !== 'vera') {
      const keep = n.ai.park ? Funland.keepVisitor(n, t) : d <= 170;
      if (!keep && unseen()) n.remove(); else if (!n.ai.park) peds++;
    }
    if (n.kind === 'cop') {
      if (n.ai.mode === 'walk') patrol++;
      if (((Heat.level === 0 && d > 140) || d > 230 || (n.down && d > 90)) && unseen()) n.remove();
    }
  }
  if (peds < 32) { const p = randomSidewalkPoint(t.x, t.z, 35, 150, false, true); if (p) spawnPed(p.x, p.z, p.b, p.sx, p.sz); }
  Funland.populate(t);
  if (Heat.level === 0 && patrol < 2) { const p = randomSidewalkPoint(t.x, t.z, 50, 140, false, true); if (p) { const c = spawnCop(p.x, p.z, 'walk'); c.ai.mode = 'walk'; c.ai.block = p.b; c.ai.sx = p.sx; c.ai.sz = p.sz; c.ai.dir = 1; c.ai.speed = 1.8; pedTarget(c); } }
  // vehicles
  let traffic = 0, parked = 0;
  for (const c of G.cars) {
    if (c.dead) continue;
    const d = dist(c.x, c.z, t.x, t.z), mine = P.inCar === c;
    const unseen = !G.canSee(c.x, c.z, 4) || d > 360;
    if (c.wreck && c.wreckT <= 0 && d > 40 && !mine && unseen) { c.remove(); continue; }
    if (c.persistent || mine || c.mission) continue;
    if (c.ai && c.ai.mode === 'roadblock') continue;
    if (d > 250 && unseen) { c.remove(); continue; }
    if (c.driver === 'ai' && c.ai && (c.ai.mode === 'traffic' || c.ai.mode === 'patrol')) traffic++;
    else if (c.parked && d < 170) parked++;
  }
  if (traffic < 24 && !G.noSpawn) spawnTraffic(t);
  if (parked < 9) spawnCurbCar(t);
  let bikes = 0; for (const c of G.cars) if (c.T.bike && c.parked && !c.driver && dist(c.x, c.z, t.x, t.z) < 130) bikes++;
  if (bikes < 5) {
    const p = randomSidewalkPoint(t.x, t.z, 30, 125, false, true);
    if (p && carFree(p.x, p.z, 3)) {
      const horiz = Math.abs(p.z - p.b.cz) > Math.abs(p.x - p.b.cx);
      const type = pick(['bicycle', 'bicycle', 'bmx', 'motorbike']);
      const bike = new Car(type, p.x, p.z, (horiz ? Math.PI / 2 : 0) + (chance(0.5) ? Math.PI : 0), { parked: true });
      bike.locked = type === 'motorbike';
    }
  }
  G.npcs = G.npcs.filter((n) => !n.dead);
  G.cars = G.cars.filter((c) => !c.dead);
}
function carFree(x, z, r) { for (const c of G.cars) if (!c.dead && dist(c.x, c.z, x, z) < r) return false; return true; }
function spawnTraffic(t) {
  const near = W.edges.filter((e) => { const a = W.nodes[e.a], b = W.nodes[e.b]; return segPointDist(t.x, t.z, a.x, a.z, b.x, b.z) < 230; });
  if (!near.length) return null;
  for (let k = 0; k < 10; k++) {
    const e = pick(near);
    const fwd = chance(0.5), A = W.nodes[fwd ? e.a : e.b], B = W.nodes[fwd ? e.b : e.a];
    const lane = pick(HWY_LANES), L = dist(A.x, A.z, B.x, B.z), dx = (B.x - A.x) / L, dz = (B.z - A.z) / L, lo = (A.hwy && B.hwy) ? lane : 2.5;
    const s = rand(0.25, 0.75) * L;
    const x = A.x + dx * s - dz * lo, z = A.z + dz * s + dx * lo;
    const d = dist(x, z, t.x, t.z);
    if (d < 70 || d > 230 || !carFree(x, z, 9) || G.canSee(x, z, 4)) continue; // traffic arrives from out of sight
    const r = Math.random();
    const type = r < 0.07 ? 'police' : r < 0.15 ? 'taxi' : r < 0.23 ? 'van' : r < 0.31 ? 'pickup' : r < 0.37 ? 'sports' : r < 0.39 ? 'armored' : r < 0.42 ? 'supercar' : r < 0.52 ? 'hatch' : r < 0.61 ? 'suv' : r < 0.66 ? 'muscle' : r < 0.72 ? 'truck' : r < 0.78 ? 'motorbike' : 'sedan';
    const car = new Car(type, x, z, Math.atan2(dx, dz), { driver: 'ai' }); car.lane = lane;
    initTraffic(car, A.id, B.id);
    car.v = car.ai.limit * 0.8; car.vx = dx * car.v; car.vz = dz * car.v;
    return car;
  }
  return null;
}
function spawnCurbCar(t) {
  for (let k = 0; k < 10; k++) {
    const s = pick(W.curbSpots), d = dist(s.x, s.z, t.x, t.z);
    if (d < 45 || d > 170 || !carFree(s.x, s.z, 6) || G.canSee(s.x, s.z, 4)) continue;
    const type = pick(['sedan', 'sedan', 'hatch', 'hatch', 'suv', 'sports', 'van', 'pickup', 'muscle', 'taxi', chance(0.3) ? 'supercar' : 'truck']);
    const car = new Car(type, s.x, s.z, s.h, { parked: true }); car.locked = true;
    return car;
  }
  return null;
}
function spawnFixedCars() {
  for (const s of W.parkingSpots) if (chance(0.6)) { const c = new Car(pick(['sedan', 'sports', 'van', 'pickup', 'hatch', 'suv', 'muscle', 'supercar']), s.x, s.z, s.h, { parked: true, persistent: true }); c.locked = true; }
  for (const s of W.places.policeLot) { const c = new Car('police', s.x, s.z, s.h, { parked: true, persistent: true }); c.locked = true; }
}
