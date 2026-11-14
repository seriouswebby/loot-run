'use strict';
/* Rendering, camera, HUD, UI screens, interactions, main loop, autotest, boot. */

const $ = (id) => document.getElementById(id);
const STEP = 1 / 60;
let renderer = null, ortho, persp, sun, raycaster, aimPlane, lastT = 0, acc = 0;
const ISO_DIR = new THREE.Vector3(1, 1.25, 1).normalize();

/* ---------------- UI ---------------- */
const UI = {
  cache: {}, toasts: [], bannerT: 0, dlg: null, onDlgDone: null,
  set(id, v, prop) { const k = id + (prop || ''); if (this.cache[k] === v) return; this.cache[k] = v; const el = $(id); if (!el) return; if (prop) el.style[prop] = v; else el.textContent = v; },
  toast(msg, kind) {
    const el = document.createElement('div'); el.className = 'toast ' + (kind || ''); el.textContent = msg;
    $('toasts').prepend(el); this.toasts.push({ el, t: 4 });
    while (this.toasts.length > 4) { const o = this.toasts.shift(); o.el.remove(); }
  },
  banner(title, sub, kind) {
    const b = $('banner'); b.className = 'show ' + (kind || '');
    $('bannerTitle').textContent = title; $('bannerSub').textContent = sub || '';
    this.bannerT = 3;
  },
  dialog(lines, done) {
    if (G.autotest) { if (done) done(); return; }
    this.dlg = { lines, i: 0 }; this.onDlgDone = done;
    G.prevState = G.state === 'dialog' ? G.prevState : G.state; G.state = 'dialog'; Input.exitLock();
    this.showLine(); $('dialog').hidden = false;
  },
  showLine() { const [who, text] = this.dlg.lines[this.dlg.i]; $('dlgName').textContent = who; $('dlgText').textContent = text; $('dlgStep').textContent = (this.dlg.i + 1) + ' / ' + this.dlg.lines.length; Voice.dialog(text); },
  advanceDialog() {
    if (!this.dlg) return;
    this.dlg.i++; Sfx.click();
    if (this.dlg.i >= this.dlg.lines.length) {
      Voice.stopDialog(); $('dialog').hidden = true; this.dlg = null; G.state = 'play';
      const d = this.onDlgDone; this.onDlgDone = null; if (d) d();
    } else this.showLine();
  },
  openShop(name) { G.state = 'shop'; G.shopName = name || 'Hardline Supply'; Input.exitLock(); $('shopName').textContent = G.shopName.toUpperCase(); $('shop').hidden = false; this.renderShop(); Sfx.click(); },
  closeShop() { $('shop').hidden = true; G.state = 'play'; Sfx.click(); },
  renderShop() {
    $('shopCash').textContent = money(G.S.cash);
    const list = $('shopList'); list.innerHTML = '';
    let cat = '';
    for (const it of SHOP) {
      if (it.cat !== cat) { cat = it.cat; const h = document.createElement('h3'); h.textContent = cat; list.appendChild(h); }
      const row = document.createElement('div'); row.className = 'item';
      const c = G.canBuy(it.id);
      const extra = it.stack ? ' (have ' + G.S[it.stack[0]] + ')' : it.armor ? ' (armor ' + Math.round(G.S.armor) + ')' : (it.ammo && !it.weapon && G.S.weapons[it.needs]) ? ' (have ' + G.S.ammo[it.ammo[0]] + ')' : '';
      row.innerHTML = '<div class="info"><b></b><span></span></div><button type="button"></button>';
      row.querySelector('b').textContent = it.name + extra;
      row.querySelector('span').textContent = it.desc || 'Ammunition refill.';
      const btn = row.querySelector('button');
      btn.textContent = c.ok ? money(it.price) : c.why;
      btn.disabled = !c.ok; if (!c.ok && (c.why === 'Owned' || c.why === 'Full')) btn.classList.add('owned');
      btn.addEventListener('click', () => { if (G.buy(it.id)) { UI.toast('Bought ' + it.name, 'good'); this.renderShop(); } });
      list.appendChild(row);
    }
  },
  ending() {
    G.state = 'end'; Input.exitLock(); $('ending').hidden = false;
    const s = G.S.stats;
    $('endStats').textContent = `${s.robbed} robberies · ${money(s.earned)} earned · ${s.escapes} escapes · max heat ${s.maxHeat}`;
  },
  update(dt) {
    const S = G.S, P = G.player;
    this.set('cash', money(S.cash));
    this.set('hpFill', clamp(P.hp, 0, 100) + '%', 'width');
    this.set('armorFill', clamp(S.armor, 0, 100) + '%', 'width');
    this.set('armorBar', S.armor > 0 ? '1' : '0.25', 'opacity');
    this.set('stamFill', Math.round(G.stamina == null ? 100 : G.stamina) + '%', 'width');
    $('stamBar').classList.toggle('winded', !!G.winded); $('stamBar').hidden = !!(P.inCar || P.inHeli);
    // heat pips
    const blink = Math.floor(G.time * 4) % 2;
    for (let i = 0; i < 5; i++) {
      const on = i < Heat.level;
      const cls = 'pip' + (on ? (Heat.seenT > 0 ? ((i + blink) % 2 ? ' red' : ' blue') : ' dim') : '');
      this.set('pip' + i + 'c', cls); const el = $('pip' + i); if (el.className !== cls) el.className = cls;
    }
    let status = '';
    if (Heat.level > 0) status = Heat.seenT > 0 ? 'SPOTTED' : 'LOSING THEM ' + Math.round(clamp(Heat.evade / Heat.need, 0, 1) * 100) + '%';
    this.set('heatStatus', status);
    this.set('evadeFill', Heat.level > 0 && Heat.seenT <= 0 ? Math.round(clamp(Heat.evade / Heat.need, 0, 1) * 100) + '%' : '0%', 'width');
    $('heatBox').classList.toggle('active', Heat.level > 0);
    const z = W.ZONES[G.playerZone] || W.ZONES.street;
    const B0 = G.body();
    this.set('zoneLabel', G.playerZone === 'street' ? W.streetName(B0.x, B0.z).toUpperCase() : z.label + (G.playerZone === 'alley' && G.curAlley && G.curAlley.dead ? ' (DEAD END)' : ''));
    this.set('zoneHint', z.hint);
    $('zone').dataset.z = G.playerZone;
    // objective
    const o = Story.text();
    this.set('objTitle', o.title); this.set('objText', o.text);
    // weapon + items
    const w = WEAPONS[P.weapon], car = P.inCar, heli = P.inHeli, items = [];
    if (heli) {
      this.set('weapon', heli.wing ? PLANES[heli.kind].name : ({ police: 'POLICE CHOPPER', tour: 'TOUR CHOPPER', news: 'NEWS CHOPPER', attack: 'GUNSHIP' })[heli.kind] || 'CHOPPER');
      this.set('ammo', (heli.armed ? 'GUN ' + heli.ammo + (G.heliAim ? ' · LOCKED · ' : ' · ') : '') + (heli.wing ? Math.round(heli.v * 3.6) + ' KM/H · THR ' + Math.round(heli.thr * 100) + '% · ' + (heli.stall ? 'STALL · ' : '') : '') + 'HULL ' + Math.round(clamp(heli.hp / heli.maxHp, 0, 1) * 100) + '% · ALT ' + Math.round(heli.y) + ' M');
      if (heli.wing) items.push('W/S throttle', 'SPACE pull up', '⇧ dive', G.S.parachute ? 'F bail out (chute ×' + G.S.parachute + ')' : 'F stop & exit');
      else items.push('SPACE climb', '⇧ descend', G.S.parachute ? 'F bail out (chute ×' + G.S.parachute + ')' : 'F land & exit');
      if (heli.armed) items.unshift('CLICK fire');
    } else if (car) {
      this.set('weapon', car.T.name.toUpperCase());
      this.set('ammo', Math.round(Math.abs(car.v) * 3.6) + ' KM/H · ' + (car.popped ? 'TIRES SHOT · ' : '') + 'CAR ' + Math.round(clamp(car.hp / car.maxHp, 0, 1) * 100) + '%' + (G.boosting ? ' · NITRO!' : car.y > 0.05 ? ' · AIRBORNE' : Input.down('Space') && car.type !== 'bmx' ? ' · HANDBRAKE' : ''));
      if (car.T.tank) items.push('Click fire the gun', 'A/D turn on the spot');
      items.push(car.type === 'bmx' || car.T.dirt ? 'SPACE hop' : 'SPACE handbrake', 'G spikes ×' + S.spikes, 'H medkit ×' + S.medkit);
      if (S.tools.nitro || car.T.nitro) { const n = Math.round(G.nitro * 10); items.push('⇧ NITRO ' + '▮'.repeat(n) + '▯'.repeat(10 - n)); }
    } else {
      this.set('weapon', w.name.toUpperCase());
      this.set('ammo', w.melee ? 'MELEE' : S.ammo[w.ammo] + (w.rocket ? ' ROCKETS' : ' ROUNDS') + (G.heliAim ? ' · TARGET LOCKED' : ''));
      items.push('H medkit ×' + S.medkit, 'G smoke ×' + S.smoke);
      if (S.grenade) items.push('T grenade ×' + S.grenade);
      if (S.parachute) items.push('chute ×' + S.parachute);
      if (Ordnance.c4.length) items.push('B DETONATE ×' + Ordnance.c4.length); else if (S.c4) items.push('B C4 ×' + S.c4);
    }
    this.set('items', items.join('  ·  '));
    let air = '';
    if (Heat.level >= 3 && Weather.noHeli()) air = 'CHOPPERS GROUNDED BY STORM';
    else { const act = Choppers.active(); if (act.length) air = act.some((h) => h.ai.sees) ? 'CHOPPER HAS YOU' : 'CHOPPER SEARCHING'; }
    if (!air && G.rampage > 0 && Heat.level >= 2 && Heat.level < 4) air = 'RAMPAGE ' + G.rampage + '/3 · NEXT HEAT ' + (Heat.level + 1);
    this.set('airStatus', air);
    const wk = WEATHER[Weather.cur]; this.set('weatherLine', wk.label + ' · ' + wk.hint);
    this.set('grabText', P.inCar ? 'COPS PULLING YOU OUT — DRIVE!' : 'GETTING CUFFED — RUN!');
    // prompt
    const it = G.interact;
    let ptxt = '';
    if (it.e) ptxt += (it.e.disabled ? '' : '[E] ') + (it.e.disabled || it.e.label);
    if (it.f) ptxt += (ptxt ? '      ' : '') + '[F] ' + it.f.label;
    if (it.r) ptxt += '      [R] ' + it.r.label;
    this.set('promptText', ptxt);
    $('prompt').hidden = !ptxt || G.state !== 'play';
    const hp = G.hold.key ? clamp(G.hold.t / G.hold.dur, 0, 1) : (G.hold.peek || 0);
    this.set('holdFill', Math.round(hp * 100) + '%', 'width');
    $('holdBar').hidden = !hp;
    // security panel
    let sec = null;
    if (!P.inHeli) for (const r of W.robs) if (r.kind !== 'atm' && !r.onTrain && dist(r.x, r.z, P.x, P.z) < 26) { sec = r; break; }
    if (sec) {
      const s = secStatus(sec);
      this.set('secName', sec.name);
      this.set('secAlarm', s.alarmOn ? 'ARMED' : 'CUT'); $('secAlarm').className = s.alarmOn ? 'bad' : 'ok';
      this.set('secCams', s.camsOn + '/' + s.camsTotal + ' LIVE'); $('secCams').className = s.camsOn ? 'bad' : 'ok';
      const h = G.robHeat(sec);
      this.set('secHeat', sec.cd > 0 ? 'EMPTY ' + Math.ceil(sec.cd) + 's' : '+' + h + ' HEAT'); $('secHeat').className = h ? 'bad' : 'ok';
    }
    $('sec').hidden = !sec || G.state !== 'play';
    // toasts + banner
    for (let i = this.toasts.length - 1; i >= 0; i--) { const t = this.toasts[i]; t.t -= dt; if (t.t < 0.4) t.el.style.opacity = String(Math.max(0, t.t / 0.4)); if (t.t <= 0) { t.el.remove(); this.toasts.splice(i, 1); } }
    if (this.bannerT > 0) { this.bannerT -= dt; if (this.bannerT <= 0) $('banner').className = ''; }
    G.flash = Math.max(0, (G.flash || 0) - dt * 1.5);
    this.set('flash', String(G.flash * 0.6), 'opacity');
    const aiming = G.camMode === 'chase' && G.state === 'play' && !P.inCar && (!P.inHeli || P.inHeli.armed) && !P.down;
    $('crosshair').hidden = !aiming;
    $('lookHint').hidden = !aiming || Input.locked;
    this.set('lookHint', Input.lockFailed ? 'Hold right-click and drag to look around' : 'Click to look around with the mouse');
    $('grab').hidden = Heat.grabV <= 0.02;
    this.set('grabFill', Math.round(Heat.grabV * 100) + '%', 'width');
  },
};
G.toast = (m, k) => UI.toast(m, k);
G.shake = (a) => { G.shakeAmt = Math.min(1.2, G.shakeAmt + a); };

/* ---------------- minimap + big map ---------------- */
function drawMap(ctx, size, cx, cz, span, full) {
  const s = size / span, k = W.mmScale;
  ctx.save();
  ctx.fillStyle = '#41583a'; ctx.fillRect(0, 0, size, size);
  ctx.drawImage(W.minimap, (cx - span / 2 - W.mmX0) * k, (cz - span / 2 - W.mmZ0) * k, span * k, span * k, 0, 0, size, size);
  const X = (x) => (x - cx) * s + size / 2, Z = (z) => (z - cz) * s + size / 2;
  const inView = (x, z) => Math.abs(x - cx) < span / 2 && Math.abs(z - cz) < span / 2;
  const P = G.player, t = G.body();
  const dot = (x, z, r, col, stroke) => { ctx.beginPath(); ctx.arc(X(x), Z(z), r, 0, TAU); ctx.fillStyle = col; ctx.fill(); if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1.5; ctx.stroke(); } };
  const label = (x, z, txt, col) => { ctx.font = (full ? 13 : 10) + 'px Bungee, Impact, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#0f1216'; ctx.fillText(txt, X(x) + 1, Z(z) + 1); ctx.fillStyle = col; ctx.fillText(txt, X(x), Z(z)); };
  // places
  for (const r of W.robs) if (inView(r.x, r.z)) {
    if (r.kind === 'atm') dot(r.x, r.z, full ? 3 : 2.5, r.cd > 0 ? '#5e655c' : '#7fe3ff');
    else label(r.x, r.z, '$', r.cd > 0 ? '#7a7f78' : r.kind === 'bank' ? '#ffd23f' : '#8bea5a');
  }
  const pl = W.places;
  for (const s of pl.shops) label(s.x, s.z, 'G', '#ff8a3d');
  for (const hp of pl.helipads) if (inView(hp.x, hp.z) && !hp.stand) label(hp.x, hp.z, 'H', '#ffffff');
  label(pl.chop.x, pl.chop.z, 'R', '#ff7b29');
  label(pl.hospital.x, pl.hospital.z, '+', '#ff5a5f');
  label(pl.police.x, pl.police.z, 'P', '#6fa8ff');
  if (pl.airport) label(pl.airport.x, pl.airport.z - (full ? 24 : 10), '✈', '#ffffff');
  if (full) for (const d of W.districtLabels) if (inView(d.x, d.z)) label(d.x, d.z, d.text, d.col); // district names on the big map
  if (G.ownsTank() && pl.tankDepot && inView(pl.tankDepot.x, pl.tankDepot.z)) label(pl.tankDepot.x - 6, pl.tankDepot.z, 'T', '#a7c957'); // your tank's home
  if (pl.funland && inView(pl.funland.x, pl.funland.z)) { // a little big-wheel glyph for Funland
    const fx = X(pl.funland.x), fz = Z(pl.funland.z) - (full ? 14 : 7), r = full ? 7 : 5;
    ctx.strokeStyle = '#0f1216'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(fx, fz, r, 0, TAU); ctx.stroke();
    ctx.strokeStyle = '#ff5d8f'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(fx, fz, r, 0, TAU); for (let i = 0; i < 4; i++) { const a = i * Math.PI / 4; ctx.moveTo(fx + Math.cos(a) * r, fz + Math.sin(a) * r); ctx.lineTo(fx - Math.cos(a) * r, fz - Math.sin(a) * r); } ctx.moveTo(fx - r * 0.6, fz + r * 1.6); ctx.lineTo(fx, fz); ctx.lineTo(fx + r * 0.6, fz + r * 1.6); ctx.stroke();
  }
  for (const k in GIVERS) { const g = GIVERS[k], p = pl[g.place]; if (k !== 'vera' && p && inView(p.x, p.z)) label(p.x, p.z, g.letter, Story.available(k) ? g.col : '#7d7a72'); } // side-job givers
  if (Story.available()) label(pl.hideout.x, pl.hideout.z, 'V', '#ffd23f'); else label(pl.hideout.x, pl.hideout.z, 'K', '#d9c9a8');
  // cameras nearby
  if (!full) for (const c of W.cams) if (c.deadT <= 0 && inView(c.x, c.z) && dist(c.x, c.z, t.x, t.z) < 70) {
    ctx.beginPath(); ctx.moveTo(X(c.x), Z(c.z));
    ctx.arc(X(c.x), Z(c.z), c.range * s, Math.atan2(Math.cos(c.yaw), Math.sin(c.yaw)) - c.fov / 2, Math.atan2(Math.cos(c.yaw), Math.sin(c.yaw)) + c.fov / 2);
    ctx.closePath(); ctx.fillStyle = c.loopT > 0 ? 'rgba(59,209,111,0.35)' : 'rgba(255,59,48,0.4)'; ctx.fill();
  }
  // cops
  const scanner = !!G.S.tools.scanner, blink = Math.floor(G.time * 5) % 2;
  for (const n of G.npcs) if (n.kind === 'cop' && !n.down && inView(n.x, n.z) && (scanner || dist(n.x, n.z, t.x, t.z) < 55 || Heat.level > 0)) dot(n.x, n.z, full ? 3 : 2.6, Heat.level > 0 ? (blink ? '#ff4a3d' : '#3d8bff') : '#3d8bff');
  for (const c of G.cars) if (c.police && !c.wreck && inView(c.x, c.z) && (scanner || dist(c.x, c.z, t.x, t.z) < 80 || (c.siren && Heat.level > 0))) dot(c.x, c.z, full ? 4.5 : 3.6, c.siren ? (blink ? '#3d8bff' : '#ff4a3d') : '#3d8bff', '#ffffff');
  for (const h of Choppers.list) {
    if (h.dead || !inView(h.x, h.z) || h === P.inHeli) continue;
    if (h.pilot === 'ai') { if (!full) { ctx.beginPath(); ctx.arc(X(h.spotX), Z(h.spotZ), 3.4 * s + 1, 0, TAU); ctx.fillStyle = 'rgba(255,242,176,0.45)'; ctx.fill(); } dot(h.x, h.z, full ? 5 : 4.2, blink ? '#ff4a3d' : '#3d8bff', '#ffffff'); }
    else dot(h.x, h.z, full ? 4 : 3.2, '#ffffff', '#0f1216');
  }
  // stunt ramps: yellow chevrons pointing the way you jump (grey once done)
  for (const r of W.RAMPS) if (inView(r.x, r.z)) {
    const done = G.S.stunts && G.S.stunts.includes(r.name), k = full ? 7 : 5;
    ctx.save(); ctx.translate(X(r.x), Z(r.z)); ctx.rotate(Math.atan2(r.fz, r.fx)); ctx.beginPath(); ctx.moveTo(k, 0); ctx.lineTo(-k, -k * 0.8); ctx.lineTo(-k * 0.4, 0); ctx.lineTo(-k, k * 0.8); ctx.closePath();
    ctx.fillStyle = done ? '#8a8a8a' : '#ffd23f'; ctx.fill(); ctx.strokeStyle = '#0f1216'; ctx.lineWidth = 1.2; ctx.stroke(); ctx.restore();
  }
  for (const c of Train.cars) if (inView(c.x, c.z)) { ctx.save(); ctx.translate(X(c.x), Z(c.z)); ctx.rotate(-c.h); ctx.fillStyle = c.loco ? '#e0a100' : c.cash ? '#c9a227' : '#8b3a2a'; ctx.fillRect(-1.6 * s - 1, -c.hl * s, 3.2 * s + 2, c.len * s); ctx.restore(); }
  for (const rb of Roadblocks.list) if (inView(rb.x, rb.z) && (scanner || dist(rb.x, rb.z, t.x, t.z) < 160)) { label(rb.x, rb.z, '✕', '#ff4a3d'); }
  // objective
  const obj = Story.target();
  if (obj) {
    const pulse = 4 + Math.sin(G.time * 6) * 1.5;
    if (inView(obj.x, obj.z)) dot(obj.x, obj.z, (full ? 6 : 4) + pulse * 0.4, '#ffd23f', '#0f1216');
    else if (!full) {
      const a = Math.atan2(obj.z - cz, obj.x - cx), r = size / 2 - 9;
      ctx.save(); ctx.translate(size / 2 + Math.cos(a) * r, size / 2 + Math.sin(a) * r); ctx.rotate(a);
      ctx.beginPath(); ctx.moveTo(7, 0); ctx.lineTo(-5, -6); ctx.lineTo(-5, 6); ctx.closePath(); ctx.fillStyle = '#ffd23f'; ctx.fill(); ctx.restore();
    }
  }
  // your own waypoint: a pink pin (an arrow on the minimap's edge when it's out of view)
  const wp = G.waypoint;
  if (wp) {
    if (inView(wp.x, wp.z)) {
      const px = X(wp.x), pz = Z(wp.z), r = full ? 8 : 5.5;
      ctx.beginPath(); ctx.moveTo(px, pz); ctx.arc(px, pz - r * 1.6, r, Math.PI * 0.75, Math.PI * 2.25); ctx.closePath();
      ctx.fillStyle = WP_COL; ctx.fill(); ctx.strokeStyle = '#0f1216'; ctx.lineWidth = 1.8; ctx.stroke();
      ctx.beginPath(); ctx.arc(px, pz - r * 1.6, r * 0.38, 0, TAU); ctx.fillStyle = '#ffffff'; ctx.fill();
    } else if (!full) {
      const a = Math.atan2(wp.z - cz, wp.x - cx), r = size / 2 - 9;
      ctx.save(); ctx.translate(size / 2 + Math.cos(a) * r, size / 2 + Math.sin(a) * r); ctx.rotate(a);
      ctx.beginPath(); ctx.moveTo(7, 0); ctx.lineTo(-5, -6); ctx.lineTo(-5, 6); ctx.closePath(); ctx.fillStyle = WP_COL; ctx.fill(); ctx.restore();
    }
  }
  // GPS route
  if (GPS.path && GPS.path.length > 1) {
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    for (const [col, wdt] of [['#0f1216', full ? 7 : 6], [GPS.toWaypoint ? WP_COL : '#ffd23f', full ? 4 : 3.2]]) {
      ctx.beginPath(); ctx.strokeStyle = col; ctx.lineWidth = wdt;
      GPS.path.forEach(([x, z], i) => (i ? ctx.lineTo(X(x), Z(z)) : ctx.moveTo(X(x), Z(z))));
      ctx.stroke();
    }
  }
  // player arrow
  const ang = P.inCar ? P.inCar.h : P.inHeli ? P.inHeli.yaw : P.facing;
  ctx.save(); ctx.translate(X(t.x), Z(t.z)); ctx.rotate(-ang + Math.PI);
  ctx.beginPath(); ctx.moveTo(0, -7); ctx.lineTo(5, 6); ctx.lineTo(0, 3); ctx.lineTo(-5, 6); ctx.closePath();
  ctx.fillStyle = '#ffffff'; ctx.fill(); ctx.strokeStyle = '#0f1216'; ctx.lineWidth = 1.5; ctx.stroke(); ctx.restore();
  ctx.restore();
}
function drawMinimap() {
  const c = $('minimap'), ctx = c.getContext('2d'), P = G.player, t = G.body();
  drawMap(ctx, c.width, t.x, t.z, P.inHeli ? 320 : P.inCar ? 200 : 150, false);
}
/* the big map: opens on the whole world; mouse wheel zooms around the cursor, drag to pan */
const BM = { cx: 0, cz: 0, span: 1, drag: null, moved: false };
function openBigMap() { BM.cx = W.VIEW.cx; BM.cz = W.VIEW.cz; BM.span = W.VIEW.span; G.state = 'map'; $('bigmap').hidden = false; drawBigMap(); }
function drawBigMap() {
  const c = $('bigmapCanvas'), ctx = c.getContext('2d');
  const h = W.VIEW.span / 2; BM.span = clamp(BM.span, 160, W.VIEW.span);
  const m = (W.VIEW.span - BM.span) / 2; BM.cx = clamp(BM.cx, W.VIEW.cx - m, W.VIEW.cx + m); BM.cz = clamp(BM.cz, W.VIEW.cz - m, W.VIEW.cz + m); void h;
  drawMap(ctx, c.width, BM.cx, BM.cz, BM.span, true);
}
function bigMapZoom(fx, fy, k) {
  const wx = BM.cx + (fx - 0.5) * BM.span, wz = BM.cz + (fy - 0.5) * BM.span;
  BM.span = clamp(BM.span * k, 160, W.VIEW.span);
  BM.cx = wx - (fx - 0.5) * BM.span; BM.cz = wz - (fy - 0.5) * BM.span; drawBigMap();
}
/* waypoints: click the big map to set one, click it again (or right-click) to clear it */
const WP_COL = '#ff4fd8';
G.setWaypoint = function (x, z) {
  G.waypoint = x == null ? null : { x: clamp(x, W.LAND.minX, W.LAND.maxX), z: clamp(z, W.LAND.minZ, W.LAND.maxZ) };
  GPS.t = 0; GPS.update(0);
};
/* right-click on the big map: teleport there (with whatever you're driving or flying) */
G.teleport = function (x, z) {
  const P = G.player; if (G.respawning || P.down) return false;
  x = clamp(x, W.LAND.minX + 8, W.LAND.maxX - 8); z = clamp(z, W.LAND.minZ + 8, W.SHORE - 6);
  const veh = P.inCar || P.inHeli, r = P.inHeli ? 6 : P.inCar ? 3 : 1;
  // nearest open spot: spiral out until nothing solid is in the way
  let sx = x, sz = z;
  for (let k = 0; k < 400; k++) {
    const a = k * 2.4, d = Math.sqrt(k) * 3, px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d, p = { x: px, z: pz };
    if (P.inHeli || (!W.collideCircle(p, r, 0) && !W.buildings.some((b) => px > b.minX - r && px < b.maxX + r && pz > b.minZ - r && pz < b.maxZ + r))) { sx = px; sz = pz; break; }
  }
  if (P.ragdoll) Phys.unragdoll(P);
  if (P.ride) { P.ride = null; P.rig.root.rotation.x = 0; }
  P.tumble = null; P.vault = null; P.chute = false; P.jumping = false; P.kx = P.kz = 0;
  if (veh) { veh.x = sx; veh.z = sz; if (P.inCar) { veh.v = 0; veh.vx = veh.vz = 0; } }
  P.x = sx; P.z = sz; P.y = P.inHeli ? P.y : 0; P.yv = 0;
  CAM.fx = sx; CAM.fz = sz; GPS.t = 0;
  return true;
};
function bigMapTeleport(fx, fy) {
  const x = BM.cx + (fx - 0.5) * BM.span, z = BM.cz + (fy - 0.5) * BM.span;
  if (!G.teleport(x, z)) { Sfx.error(); return; }
  $('bigmap').hidden = true; G.state = 'play'; Sfx.whoosh(); G.toast('Teleported.', 'good');
}
function bigMapClick(fx, fy, clear) {
  // fx, fy: click position as a fraction of the canvas (0..1)
  const span = BM.span, x = BM.cx + (fx - 0.5) * span, z = BM.cz + (fy - 0.5) * span, wp = G.waypoint;
  if (clear || (wp && dist(wp.x, wp.z, x, z) < span * 0.02)) { G.setWaypoint(null); Sfx.click(); }
  else { G.setWaypoint(x, z); Sfx.tick(); }
  drawBigMap();
}

/* ---------------- GPS: shortest road route to the objective ---------------- */
const GPS = {
  path: null, t: 0, arrow: null, beam: null, toWaypoint: false,
  route(ax, az, bx, bz) {
    if (dist(ax, az, bx, bz) < 35 && !W.segBlocked(ax, az, bx, bz)) return [[ax, az], [bx, bz]];
    const N = W.nodes.length, s = W.nearestNode(ax, az), e = W.nearestNode(bx, bz);
    const d = new Float64Array(N).fill(Infinity), prev = new Int32Array(N).fill(-1), done = new Uint8Array(N);
    d[s] = 0;
    for (;;) {
      let u = -1, best = Infinity;
      for (let i = 0; i < N; i++) if (!done[i] && d[i] < best) { best = d[i]; u = i; }
      if (u < 0 || u === e) break;
      done[u] = 1;
      const nu = W.nodes[u];
      for (const v of nu.adj) { const nv = W.nodes[v], w = dist(nu.x, nu.z, nv.x, nv.z); if (d[u] + w < d[v]) { d[v] = d[u] + w; prev[v] = u; } }
    }
    const pts = [];
    for (let v = e; v >= 0; v = prev[v]) { pts.push([W.nodes[v].x, W.nodes[v].z]); if (v === s) break; }
    pts.reverse();
    // don't send the player backwards to a junction they're already past
    if (pts.length > 1 && dist(ax, az, pts[1][0], pts[1][1]) < dist(pts[0][0], pts[0][1], pts[1][0], pts[1][1])) pts.shift();
    const n = pts.length;
    if (n > 1 && dist(bx, bz, pts[n - 2][0], pts[n - 2][1]) < dist(pts[n - 1][0], pts[n - 1][1], pts[n - 2][0], pts[n - 2][1])) pts.pop();
    return [[ax, az], ...pts, [bx, bz]];
  },
  update(dt) {
    this.t -= dt;
    const B = G.body();
    if (G.waypoint && G.state === 'play' && dist(B.x, B.z, G.waypoint.x, G.waypoint.z) < (G.player.inHeli ? 25 : 9)) { G.waypoint = null; G.toast('Waypoint reached.', 'good'); Sfx.tick(); this.t = 0; }
    // your own waypoint wins over the story objective
    const obj = G.state === 'title' ? null : G.waypoint || (G.state === 'play' || G.state === 'map' ? Story.target() : null);
    if (this.toWaypoint !== !!(obj && obj === G.waypoint)) { this.toWaypoint = !this.toWaypoint; this.t = 0; }
    if (!obj) { this.path = null; }
    else if (this.t <= 0) {
      this.t = 0.4;
      this.path = G.player.inHeli ? [[B.x, B.z], [obj.x, obj.z]] : this.route(B.x, B.z, obj.x, obj.z);
    } else if (this.path) { this.path[0] = [B.x, B.z]; }
    if (!this.arrow) {
      const sh = new THREE.Shape(); sh.moveTo(0, 1.3); sh.lineTo(0.9, -0.2); sh.lineTo(0.3, -0.2); sh.lineTo(0.3, -1); sh.lineTo(-0.3, -1); sh.lineTo(-0.3, -0.2); sh.lineTo(-0.9, -0.2); sh.closePath();
      const g = new THREE.ShapeGeometry(sh); g.rotateX(Math.PI / 2);
      this.arrow = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }));
      this.arrow.renderOrder = 5; G.scene.add(this.arrow);
      // a tall light beam standing on the waypoint, visible from across the city
      this.beam = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 70, 12, 1, true), new THREE.MeshBasicMaterial({ color: 0xff4fd8, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide }));
      this.beam.renderOrder = 4; G.scene.add(this.beam);
    }
    const wp = G.waypoint;
    this.beam.visible = !!wp && dist(B.x, B.z, wp.x, wp.z) > 12;
    if (wp) { this.beam.position.set(wp.x, 35 + W.groundAt(wp.x, wp.z), wp.z); this.beam.material.opacity = 0.25 + Math.sin(G.time * 3) * 0.08; }
    this.arrow.material.color.set(this.toWaypoint ? 0xff4fd8 : 0xffd23f);
    const a = this.arrow, p = this.path, car = G.player.inCar;
    if (!p || p.length < 2 || G.player.inHeli || dist(B.x, B.z, obj.x, obj.z) < 7) { a.visible = false; return; }
    // painted on the route itself, a little way ahead (further at speed), pointing along the road to take:
    // coming up to a turn, it sits on the road you turn into instead of swinging around under the car
    const ahead = car ? clamp(12 + Math.abs(car.v) * 0.6, 12, 32) : 5;
    let left = ahead, px = p[0][0], pz = p[0][1], ang = 0, found = false;
    for (let i = 1; i < p.length; i++) {
      const ax = p[i - 1][0], az = p[i - 1][1], bx = p[i][0], bz = p[i][1], L = dist(ax, az, bx, bz);
      if (L < 0.01) continue;
      ang = Math.atan2(bx - ax, bz - az);
      if (L >= left) { px = ax + (bx - ax) * left / L; pz = az + (bz - az) * left / L; found = true; break; }
      left -= L; px = bx; pz = bz;
    }
    if (!found) { a.visible = false; return; }
    // the route is behind you: put the arrow in front of the car, pointing back the way to go
    if (car) { const fx = Math.sin(car.h), fz = Math.cos(car.h); if ((px - B.x) * fx + (pz - B.z) * fz < 6) { const qx = B.x + fx * 12, qz = B.z + fz * 12; ang = Math.atan2(px - qx, pz - qz); px = qx; pz = qz; } }
    a.visible = true; a.position.set(px, 0.13 + W.groundAt(px, pz), pz);
    a.rotation.set(0, ang, 0); a.scale.setScalar(car ? 1.8 : 0.9);
    a.material.opacity = 0.7 + Math.sin(G.time * 5) * 0.2;
  },
};

/* ---------------- what the camera can see ----------------
   People and cars only appear and disappear where you can't see them: off-screen, behind buildings or hills,
   or out in the fog. So nothing pops in or vanishes in front of you. */
const VIS = { fr: new THREE.Frustum(), m: new THREE.Matrix4(), s: new THREE.Sphere(new THREE.Vector3(), 3), n: -1 };
G.canSee = function (x, z, r, y) {
  const cam = G.cam; if (!cam) return false;
  if (VIS.n !== G.frameN) { VIS.n = G.frameN; cam.updateMatrixWorld(); VIS.m.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse); VIS.fr.setFromProjectionMatrix(VIS.m); }
  VIS.s.center.set(x, W.groundAt(x, z) + (y || 1), z); VIS.s.radius = (r || 2) + 3; // a margin, so nothing appears right at the screen edge either
  if (!VIS.fr.intersectsSphere(VIS.s)) return false;
  if (cam.isOrthographicCamera) return true;
  const cp = cam.position, d = Math.hypot(x - cp.x, z - cp.z);
  if (G.scene.fog && d > G.scene.fog.far) return false;
  if (cp.y - W.groundAt(cp.x, cp.z) > 30) return true; // from high up you see over the rooftops
  return !W.segBlocked(cp.x, cp.z, x, z, 3, true) && !W.terrainBlocks(cp.x, cp.z, x, z, cp.y - W.groundAt(cp.x, cp.z), (y || 1) + 0.5); // hills, from the camera's own height
};

/* ---------------- camera ---------------- */
const CAM = { fx: 0, fz: 0, lx: 0, lz: 0, zoomIso: 26, zoomTop: 60, curIso: 26, curTop: 60, yaw: Math.PI, pitch: 0.3, chaseD: 8, carYaw: 0, carLook: 0, carPitch: 0.32, lookT: 0, wasInCar: false, sens: 0.0026 };
function updateCamera(dt) {
  const P = G.player, t = G.body(), veh = P.inCar || P.inHeli, fy = P.inHeli ? W.airY(t.x, t.z, P.inHeli.y) : (P.inCar ? P.inCar.y : P.y) + W.groundAt(t.x, t.z);
  const vx = veh ? veh.vx : P.vx, vz = veh ? veh.vz : P.vz, spd = Math.hypot(vx, vz);
  CAM.lx = damp(CAM.lx, vx * (veh ? 0.6 : 0.25), 2.5, dt); CAM.lz = damp(CAM.lz, vz * (veh ? 0.6 : 0.25), 2.5, dt);
  CAM.fx = damp(CAM.fx, t.x + CAM.lx, 10, dt); CAM.fz = damp(CAM.fz, t.z + CAM.lz, 10, dt);
  if (G.state === 'title') { CAM.fx = Math.sin(G.time * 0.05) * 60 - 30; CAM.fz = Math.cos(G.time * 0.05) * 60; }
  G.shakeAmt = Math.max(0, G.shakeAmt - dt * 2.5);
  const sh = G.shakeAmt * G.shakeAmt * 1.2, sx = (Math.random() - 0.5) * sh, sz = (Math.random() - 0.5) * sh;
  const fx = CAM.fx + sx, fz = CAM.fz + sz, aspect = innerWidth / innerHeight;
  let cam;
  if (G.camMode === 'iso' || G.state === 'title') {
    cam = ortho;
    CAM.curIso = damp(CAM.curIso, CAM.zoomIso + (veh ? spd * 0.3 : 0) + fy * 0.45 + (G.boosting ? 6 : 0), 2, dt);
    const h = CAM.curIso / 2;
    ortho.left = -h * aspect; ortho.right = h * aspect; ortho.top = h; ortho.bottom = -h; ortho.updateProjectionMatrix();
    ortho.position.set(fx + ISO_DIR.x * 200, fy + ISO_DIR.y * 200, fz + ISO_DIR.z * 200);
    ortho.lookAt(fx, fy, fz);
    G.camFwd = { x: -Math.SQRT1_2, z: -Math.SQRT1_2 };
  } else if (G.camMode === 'top') {
    cam = persp; persp.fov = 45; persp.aspect = aspect; persp.updateProjectionMatrix();
    CAM.curTop = damp(CAM.curTop, CAM.zoomTop + (veh ? spd * 0.8 : 0), 2, dt);
    persp.position.set(fx, fy + CAM.curTop, fz + CAM.curTop * 0.2); persp.lookAt(fx, fy, fz);
    G.camFwd = { x: 0, z: -1 };
  } else {
    CAM.fov = damp(CAM.fov || 62, G.boosting ? 76 : 62, 4, dt);
    cam = persp; persp.fov = CAM.fov; persp.aspect = aspect; persp.updateProjectionMatrix();
    let yaw = CAM.yaw, pitch = CAM.pitch;
    if (veh) {
      if (!CAM.wasInCar) { CAM.carYaw = CAM.yaw; CAM.carLook = 0; CAM.carPitch = 0.32; }
      // camera trails the vehicle; mouse glances around and springs back when the mouse rests
      const head = P.inHeli ? P.inHeli.yaw : P.inCar.h + (P.inCar.v < -1 ? Math.PI : 0);
      CAM.carYaw += angDiff(CAM.carYaw, head) * (1 - Math.exp(-4 * dt));
      if (CAM.lookT > 0) CAM.lookT -= dt; else { CAM.carLook = damp(CAM.carLook, 0, 3, dt); CAM.carPitch = damp(CAM.carPitch, 0.32, 3, dt); }
      yaw = CAM.carYaw + CAM.carLook; pitch = CAM.carPitch; CAM.yaw = yaw;
    }
    CAM.wasInCar = !!veh;
    const back = P.inHeli ? (P.inHeli.wing ? PLANES[P.inHeli.kind].cam : 17) : P.inCar ? (P.inCar.T.bike ? 7 : P.inCar.T.tank ? 15 : 10) + spd * 0.08 : CAM.chaseD;
    const fx3 = Math.sin(yaw), fz3 = Math.cos(yaw), cp = Math.cos(pitch), spch = Math.sin(pitch);
    const sh = veh ? 0 : 0.75; // over-the-shoulder offset to the right
    const px = t.x - fz3 * sh, pz = t.z + fx3 * sh, py = P.inHeli ? fy + 3.5 : P.inCar ? fy + (P.inCar.T.tank ? 3.8 : 2.3) : fy + 1.8;
    let cx = px - fx3 * cp * back, cz = pz - fz3 * cp * back, cy = py + spch * back;
    const hit = py > 25 ? 1 : W.segHitT(px, pz, cx, cz, 2);
    if (hit < 1) { const k = Math.max(0.12, hit - 0.06); cx = px + (cx - px) * k; cz = pz + (cz - pz) * k; cy = py + (cy - py) * k; }
    persp.position.set(cx + sx, Math.max(0.45 + W.groundAt(cx, cz), cy), cz + sz); // never below the hillside behind you
    persp.lookAt(px + fx3 * cp * 10, py - spch * 10, pz + fz3 * cp * 10);
    G.camFwd = { x: fx3, z: fz3 };
  }
  Weather.camDist = cam === ortho ? 200 : G.camMode === 'top' ? CAM.curTop : (P.inHeli ? 17 : P.inCar ? 10 : CAM.chaseD);
  const ahead = cam === persp && G.camMode === 'chase' ? 75 : 0, sfx = fx + G.camFwd.x * ahead, sfz = fz + G.camFwd.z * ahead;
  sun.position.set(sfx + 45, 90 + fy, sfz + 30); sun.target.position.set(sfx, fy, sfz); sun.target.updateMatrixWorld();
  G.cam = cam;
  return cam;
}
function segBox3(ax, ay, az, bx, by, bz, b) {
  let t0 = 0, t1 = 1;
  const d = [bx - ax, by - ay, bz - az], o = [ax, ay, az], mn = [b.minX, 0, b.minZ], mx = [b.maxX, b.h, b.maxZ];
  for (let i = 0; i < 3; i++) {
    if (Math.abs(d[i]) < 1e-9) { if (o[i] < mn[i] || o[i] > mx[i]) return false; continue; }
    let ta = (mn[i] - o[i]) / d[i], tb = (mx[i] - o[i]) / d[i]; if (ta > tb) { const s = ta; ta = tb; tb = s; }
    t0 = Math.max(t0, ta); t1 = Math.min(t1, tb); if (t0 > t1) return false;
  }
  return true;
}
function updateFades(cam, dt) {
  const P = G.player, t = G.body(), cp = cam.position, ty = P.inHeli ? P.inHeli.y + 1.5 : P.y + 1.2;
  // in the tunnel the mountain above would hide you from the overhead cameras: make it see-through
  if (W.ridgeMats) { const want = W.inTunnel(t.x, t.z) && G.camMode !== 'chase' ? 0.25 : 1; for (const m of W.ridgeMats) if (Math.abs(m.opacity - want) > 0.01) { m.opacity = damp(m.opacity, want, 8, dt); m.transparent = m.opacity < 0.99; m.depthWrite = m.opacity > 0.6; } }
  for (const b of W.buildings) {
    const near = Math.abs((b.minX + b.maxX) / 2 - t.x) < 70 && Math.abs((b.minZ + b.maxZ) / 2 - t.z) < 70;
    const hit = near && G.state !== 'title' && (segBox3(t.x, ty, t.z, cp.x, cp.y, cp.z, b) || segBox3(t.x, ty, t.z + 1.5, cp.x, cp.y, cp.z + 1.5, b));
    const target = hit ? 0.2 : 1;
    if (b.fade === target) continue;
    W.soloBuilding(b, true); // out of its merged batch while it's see-through
    b.fade = Math.abs(b.fade - target) < 0.02 ? target : damp(b.fade, target, 12, dt);
    for (const m of b.mats) { m.opacity = b.fade; m.transparent = b.fade < 0.999; m.depthWrite = b.fade > 0.6; }
    if (b.fade === 1) W.soloBuilding(b, false);
  }
}

/* ---------------- markers ---------------- */
const Markers = { list: [] };
function makeMarker(color, h) {
  const g = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.RingGeometry(1.0, 1.35, 28), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.08; g.add(ring);
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, h || 6, 16, 1, true), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide }));
  beam.position.y = (h || 6) / 2; g.add(beam);
  G.scene.add(g); g.userData = { ring, beam };
  return g;
}
function initMarkers() {
  Markers.obj = makeMarker(0xffd23f, 14);
  Markers.shops = W.places.shops.map((s) => { const m = makeMarker(0xff8a3d, 4); m.position.set(s.x, 0, s.z); return m; });
  Markers.chop = makeMarker(0xff7b29, 3); Markers.chop.position.set(W.places.chop.x, 0, W.places.chop.z); Markers.chop.scale.set(3.5, 1, 3.5);
  Markers.rob = W.robs.map((r) => { const m = makeMarker(r.kind === 'atm' ? 0x7fe3ff : r.kind === 'bank' ? 0xffd23f : 0x8bea5a, r.kind === 'atm' ? 2 : 3.5); m.position.set(r.x, 0, r.z); if (r.kind === 'atm') m.scale.setScalar(0.7); return m; });
  const pm = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.6, 4), new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false }));
  pm.rotation.x = Math.PI; pm.renderOrder = 10; G.scene.add(pm); Markers.player = pm;
}
function updateMarkers() {
  const obj = Story.target(), P = G.player, t = G.body(), pulse = 1 + Math.sin(G.time * 4) * 0.08;
  Markers.obj.visible = !!obj;
  if (obj) { Markers.obj.position.set(obj.x, W.groundAt(obj.x, obj.z), obj.z); Markers.obj.userData.ring.scale.setScalar(pulse); }
  W.robs.forEach((r, i) => { const m = Markers.rob[i]; m.visible = r.cd <= 0 && dist(r.x, r.z, t.x, t.z) < 90; });
  Markers.player.position.set(t.x, P.inHeli ? W.airY(t.x, t.z, P.inHeli.y) + 5 : (P.inCar ? 3.3 + P.inCar.y : P.y + 2.75 + Math.sin(G.time * 5) * 0.1) + W.groundAt(t.x, t.z), t.z);
  Markers.player.visible = G.state !== 'title' && !P.down && G.camMode !== 'chase';
  W.water.position.y = -0.15 + Math.sin(G.time * 0.8) * 0.04;
}

/* ---------------- interactions ---------------- */
function robPrompt(r) {
  if (r.cd > 0) return { id: 'rob' + r.id, disabled: r.name + ' is cleaned out (' + Math.ceil(r.cd) + 's)' };
  if (r.needs && !G.S.tools[r.needs]) return { id: 'rob' + r.id, disabled: 'The vault needs a Thermal Drill (any gun store), or blow it open with C4' };
  const h = G.robHeat(r);
  return { id: 'rob' + r.id, label: (r.kind === 'bank' ? 'Drill the vault' : r.kind === 'atm' ? 'Crack the ATM' : r.onTrain ? 'Crack the rail safe' : 'Rob ' + r.name) + (h != null ? ' · +' + h + ' heat' : ''), hold: G.robHoldTime(r), start: () => { if (!r.robbing) G.startRob(r); }, run: () => G.completeRob(r) };
}
const AIRCRAFT_LABEL = { police: 'Steal the police helicopter (+2 heat)', attack: 'Steal the gunship (+2 heat)', tour: 'Fly the tour helicopter', news: 'Steal the news helicopter',
  prop: 'Fly the prop plane', bizjet: 'Steal the private jet', fighter: 'Steal the fighter jet (+2 heat)' };
function computeInteract() {
  const P = G.player, out = { e: null, f: null };
  if (G.respawning || P.down || P.tumble || P.handsUp > 0) return out;
  if (P.ride) { out.f = { label: Funland.leaveLabel(), run: () => Funland.leave() }; return out; }
  if (P.inHeli) { const h = P.inHeli; out.f = { label: G.heliLanded(h) ? 'Get out' : G.S.parachute > 0 ? 'Bail out with your parachute' : h.wing ? 'Land and stop first (S brakes)' : 'Land first (hold Shift)', run: () => G.exitHeli() }; return out; }
  if (P.y > 1.5) {
    for (const h of Choppers.list) if (!h.dead && !h.pilot && h.falling <= 0 && G.heliLanded(h) && Math.abs(h.y - P.y) < 2.5 && dist(h.x, h.z, P.x, P.z) < 5.5) { const hh = h; out.f = { label: AIRCRAFT_LABEL[hh.kind] || 'Fly the helicopter', run: () => G.enterHeli(hh) }; }
    const tr = Train.onTrain(P) && W.robs.find((r) => r.onTrain && dist(P.x, P.z, r.x, r.z) < r.r + 0.5);
    if (tr) out.e = robPrompt(tr);
    return out;
  }
  if (P.inCar) {
    const car = P.inCar, ch = W.places.chop, air = car.phys ? car.phys.wasAir && car.phys.airT > 0.15 : car.y > 0.3 && car.yv !== 0;
    if (!air) out.f = { label: 'Get out', run: () => G.exitCar() };
    if (dist(car.x, car.z, ch.x, ch.z) < ch.r + 2) {
      out.e = { id: 'sell', label: 'Sell ' + car.T.name.toLowerCase() + ' to Rusty for ' + money(G.carValue(car)), disabled: Heat.level > 0 ? "Rusty won't buy while you have heat" : null, run: () => G.sellCar() };
      if (car.hp < car.maxHp || car.bumpers.some((b) => !b.on) || car.popped) out.r = { label: 'Repair for ' + money(G.repairCost(car)), run: () => G.repairCar() };
    }
    return out;
  }
  if (P.chute) return out;
  // F: nearest car
  let bc = null, bd = 3.6;
  for (const c of G.cars) {
    if (c.dead || c.wreck || c.burning > 0) continue;
    const d = dist(c.x, c.z, P.x, P.z) - c.T.w * 0.3; if (d < bd) { bd = d; bc = c; }
  }
  if (bc) {
    let lbl = (bc.T.bike ? 'Ride the ' : 'Get in the ') + bc.T.name.toLowerCase();
    if (bc.fallen) lbl = 'Pick up the ' + bc.T.name.toLowerCase();
    if (bc.driver === 'ai' && bc.ai && bc.ai.mode !== 'roadblock' && bc.ai.mode !== 'parked') lbl = 'Carjack the ' + bc.T.name.toLowerCase();
    else if (bc.parked && bc.locked) lbl = bc.T.bike ? (bc.T.pedal ? 'Steal the ' : 'Hotwire the ') + bc.T.name.toLowerCase() : (G.S.tools.lockpick ? 'Pick the lock: ' : 'Smash window (loud): ') + bc.T.name.toLowerCase();
    const car = bc; out.f = { label: lbl, run: () => G.enterCar(car) };
  }
  let bh = null, bhd = 5.5;
  for (const h of Choppers.list) { if (h.dead || h.pilot || h.falling > 0 || !G.heliLanded(h) || h.y > 1.5) continue; const d = dist(h.x, h.z, P.x, P.z) - (h.wing ? 2.5 : 0); if (d < bhd) { bhd = d; bh = h; } }
  if (bh && (!bc || bhd < bd + 1.5)) { const h = bh; out.f = { label: AIRCRAFT_LABEL[h.kind] || 'Fly the helicopter', run: () => G.enterHeli(h) }; }
  // E options by priority
  const pl = W.places;
  for (const k in GIVERS) { const g = GIVERS[k], p = pl[g.place]; if (k === 'vera' || !p || !Story.available(k) || dist(P.x, P.z, p.x, p.z) > 3) continue; const m = Story.next(k); out.e = { id: 'giver' + k, label: 'Talk to ' + g.first + ': "' + m.title + '"', run: () => Story.start(k) }; return out; }
  if (Story.available() && dist(P.x, P.z, pl.hideout.x, pl.hideout.z) < 3) { const m = Story.next(); out.e = { id: 'vera', label: 'Talk to Vera: "' + m.title + '"', run: () => Story.start() }; return out; }
  for (const s of pl.shops) if (dist(P.x, P.z, s.x, s.z) < 2.4) { out.e = { id: 'shop' + s.id, label: 'Shop at ' + s.name, run: () => UI.openShop(s.name) }; return out; }
  const ride = Funland.prompt(P);
  if (ride) { if (ride.f) out.f = ride.f; else out.e = ride.e; return out; }
  // a moving train: you can grab on from a little further out (any closer and it knocks you flat)
  const moving = Train.v > 2, tc = Train.near(P.x, P.z, moving ? 4 : 2.5);
  if (tc) { out.e = { id: 'train', label: moving ? 'Grab onto the moving train (E or SPACE)' : 'Climb onto the train', run: () => Train.climb(tc) }; return out; }
  for (const r of W.robs) {
    if (r.onTrain || dist(P.x, P.z, r.x, r.z) > r.r + 0.5) continue;
    out.e = robPrompt(r); return out;
  }
  for (const al of W.alarms) {
    if (al.cutT > 0 || dist(P.x, P.z, al.x, al.z) > 1.9) continue;
    out.e = G.S.tools.cutters ? { id: 'al' + al.target.id, label: 'Cut the alarm wires (' + al.target.name + ')', hold: 2.2, run: () => G.cutAlarm(al) }
      : { id: 'al' + al.target.id, disabled: 'Need Wire Cutters to cut this alarm, or hit it 3× (it will trip)' };
    return out;
  }
  let cam = null, cd = 9;
  for (const c of W.cams) { if (c.deadT > 0 || c.loopT > 0) continue; const d = dist(P.x, P.z, c.x, c.z); if (d < cd) { cd = d; cam = c; } }
  if (cam) {
    const c = cam;
    out.e = G.S.tools.laptop ? { id: 'cam' + W.cams.indexOf(c), label: 'Loop the camera feed (' + c.target.name + ')', hold: 1.8, run: () => G.loopCam(c) }
      : { id: 'cam', disabled: 'Need a Laptop to loop this camera, or shoot it out' };
    return out;
  }
  const fx = Math.sin(P.facing), fz = Math.cos(P.facing);
  for (const n of G.npcs) {
    if (n.kind !== 'ped' || n.down || n.ai.mode === 'vera' || n.handsUp > 0) continue;
    const dx = n.x - P.x, dz = n.z - P.z, d = Math.hypot(dx, dz);
    if (d < 2 && (dx * fx + dz * fz) / (d || 1) > 0.2) { out.e = { id: 'mug', label: 'Mug this pedestrian', run: () => G.mug(n) }; return out; }
  }
  return out;
}
G.mug = function (n) {
  n.handsUp = 1.1; n.vx = n.vz = 0; n.facing = Math.atan2(G.player.x - n.x, G.player.z - n.z);
  const cash = n.cash > 0 ? n.cash : randi(3, 20); n.cash = 0;
  Pickups.add('cash', n.x + rand(-0.4, 0.4), n.z + rand(-0.4, 0.4), cash);
  G.S.stats.robbed++;
  G.crime('mug', n.x, n.z, {});
  Story.event('rob', { id: 'ped', kind: 'ped' });
};
function processHold(dt) {
  const it = G.interact.e, P = G.player;
  const holding = Input.down('KeyE') && !G.holdLock;
  const mem = G.holdMem || (G.holdMem = {});
  if (it && it.hold && !it.disabled && holding) {
    if (G.hold.key !== it.id) G.hold = { key: it.id, t: it.id.startsWith('rob') ? (mem[it.id] || 0) : 0, dur: it.hold, started: false };
    if (!G.hold.started) { G.hold.started = true; if (it.start) it.start(); }
    G.hold.t += dt; P.vx = P.vz = 0;
    if (it.id.startsWith('rob')) mem[it.id] = G.hold.t;
    if (Math.floor(G.time * 3) !== Math.floor((G.time - dt) * 3) && it.id.startsWith('rob')) Sfx.tick();
    if (G.hold.t >= G.hold.dur) { delete mem[it.id]; G.hold = { key: null, t: 0, dur: 1 }; G.holdLock = true; it.run(); }
  } else {
    if (!Input.down('KeyE')) G.holdLock = false;
    G.hold.key = null; G.hold.t = 0;
    for (const r of W.robs) if (r.robbing && dist(P.x, P.z, r.x, r.z) > r.r + 20) { r.robbing = false; delete mem['rob' + r.id]; }
    if (it && it.hold && mem[it.id]) { G.hold.peek = mem[it.id] / it.hold; } else G.hold.peek = 0;
  }
}

/* ---------------- player ---------------- */
function updatePlayer(dt) {
  const P = G.player;
  P.cd -= dt;
  const key = (a, b) => Input.down(a) || Input.down(b);
  const fw = (key('KeyW', 'ArrowUp') ? 1 : 0) - (key('KeyS', 'ArrowDown') ? 1 : 0);
  const st = (key('KeyD', 'ArrowRight') ? 1 : 0) - (key('KeyA', 'ArrowLeft') ? 1 : 0);
  G.slip = 0; G.boosting = false; G.throttle = fw;
  if (P.inHeli) {
    const h = P.inHeli;
    if (h.falling <= 0) (h.wing ? flyPlane : flyHeli)(h, dt, fw, st, Input.down('Space') ? 1 : 0, key('ShiftLeft', 'ShiftRight') ? 1 : 0);
    P.x = h.x; P.z = h.z; P.vx = h.vx; P.vz = h.vz;
    // armed choppers: hold the mouse button to fire the nose gun at the crosshair (or a locked-on chopper)
    if (h.armed && h.falling <= 0 && h.y > 1 && (Input.mdown || G.attackQ) && !G.uiBlock && P.cd <= 0) { G.attackQ = null; heliGunFire(h); }
    return;
  }
  if (P.inCar) {
    const car = P.inCar, ov = G.inputOverride;
    let boost = false;
    // nitro: built into sports cars, supercars, muscle cars and motorbikes; the Nitro Kit adds it to every car
    const hasNitro = !!(G.S.tools.nitro || car.T.nitro), wantBoost = key('ShiftLeft', 'ShiftRight') && fw > 0 && !(ov);
    if (wantBoost && hasNitro && G.nitro > 0.02 && car.burning <= 0 && !car.wreck) {
      boost = true;
      if (!G.wasBoosting) { car.v += 6; Sfx.whoosh(car.x, car.z); G.shake(0.25); }
      G.nitro = Math.max(0, G.nitro - dt * 0.3);
      const fx = Math.sin(car.h), fz = Math.cos(car.h), bx = car.x - fx * (car.T.len / 2 + 0.3), bz = car.z - fz * (car.T.len / 2 + 0.3);
      for (let k = 0; k < 2; k++) FX.spawn(bx + rand(-0.3, 0.3), 0.6, bz + rand(-0.3, 0.3), -fx * rand(4, 9) + car.vx * 0.5, rand(0, 0.6), -fz * rand(4, 9) + car.vz * 0.5, pick(['#5ff0ff', '#3a86ff', '#ffffff', '#a0e9ff']), rand(0.25, 0.5), 0.25, { grav: 0, drag: 2 });
      if (G.nitro <= 0.02) G.toast('Nitro empty — it refills in a few seconds.');
    } else {
      if (wantBoost && !hasNitro && (G.time - (G.nitroHintT || -99)) > 5) { G.nitroHintT = G.time; G.toast('No nitro in this car. Buy a Nitro Kit at a gun store, or steal a sports car, supercar, muscle car or motorbike.'); }
      G.nitro = Math.min(1, G.nitro + dt * 0.09);
    }
    G.wasBoosting = boost;
    if (car.burning > 0 || car.wreck) car.drive(dt, 0, 0, true, false);
    else {
      const bmx = car.type === 'bmx' || !!car.T.dirt; // a BMX and a dirt bike hop on Space
      if (bmx && G.hopQ && car.y <= 0.01) { car.yv = car.T.dirt ? 7.5 : 8.5; car.y = 0.02; Sfx.jump(car.x, car.z); }
      // hop assist: mid-hop, lift just enough to clear a low barrier the front wheel is about to clip
      if (bmx && car.y > 0.25 && car.v > 2) {
        const fx = car.x + Math.sin(car.h) * 1.3, fz = car.z + Math.cos(car.h) * 1.3;
        for (const c of W.queryBox(fx - 0.6, fz - 0.6, fx + 0.6, fz + 0.6)) {
          if (NO_CLIMB.includes(c.kind) || c.h > 1.6 || car.y >= c.h + 0.1) continue;
          const hit = c.circle ? dist(fx, fz, c.x, c.z) < c.r + 0.4 : fx > c.minX - 0.4 && fx < c.maxX + 0.4 && fz > c.minZ - 0.4 && fz < c.maxZ + 0.4;
          if (hit) { car.y = c.h + 0.1; car.yv = Math.max(car.yv, 1.5); }
        }
      }
      car.drive(dt, ov ? ov.thr : fw, ov ? ov.steer : st, !bmx && Input.down('Space'), boost);
    }
    G.hopQ = false;
    G.boosting = boost;
    // handbrake slides + wet-road drifts: tire screech, smoke and skid marks
    const hx = Math.sin(car.h), hz = Math.cos(car.h), spd = Math.hypot(car.vx, car.vz), lat = Math.abs(car.vx * hz - car.vz * hx);
    G.slip = car.y > 0.05 ? 0 : clamp((Input.down('Space') && car.type !== 'bmx' && spd > 5 ? 0.55 : 0) + (lat - 2.5) / 7, 0, 1);
    if (G.slip > 0.25 && spd > 4) Skids.add(car, dt);
    P.x = car.x; P.z = car.z; P.vx = car.vx; P.vz = car.vz;
    return;
  }
  if (P.ride) { P.vx = P.vz = 0; G.jumpQ = false; G.attackQ = null; return; } // on a Funland ride: the ride moves you
  if (P.down || P.tumble || P.handsUp > 0 || G.respawning) { P.vx = P.vz = 0; P.vault = null; if (P.handsUp > 0 && !G.respawning) P.handsUp -= dt; return; }
  if (P.vault) { stepVault(P, dt); return; }
  const f = G.camFwd || { x: -Math.SQRT1_2, z: -Math.SQRT1_2 }, r = { x: -f.z, z: f.x };
  const chase = G.camMode === 'chase';
  let mx, mz;
  if (chase) {
    // 3rd person: W/S along the view, A/D strafe, arrow keys turn the camera (mouse-free fallback)
    const turn = (Input.down('ArrowRight') ? 1 : 0) - (Input.down('ArrowLeft') ? 1 : 0);
    CAM.yaw -= turn * 2.4 * dt;
    const sd = (Input.down('KeyD') ? 1 : 0) - (Input.down('KeyA') ? 1 : 0);
    const cf = { x: Math.sin(CAM.yaw), z: Math.cos(CAM.yaw) };
    mx = cf.x * fw - cf.z * sd; mz = cf.z * fw + cf.x * sd;
  } else { mx = f.x * fw + r.x * st; mz = f.z * fw + r.z * st; }
  if (G.inputOverride) { mx = G.inputOverride.mx || 0; mz = G.inputOverride.mz || 0; }
  const m = Math.hypot(mx, mz), holding = !!G.hold.key && Input.down('KeyE');
  const wantSprint = key('ShiftLeft', 'ShiftRight') && m > 0.01 && !holding && !P.chute && P.y < 0.5 + (P.y > 0.5 ? W.floorAt(P.x, P.z, P.y) : 0);
  if (G.stamina == null) G.stamina = 100;
  if (G.winded && G.stamina >= 30) G.winded = false;
  const sprinting = wantSprint && !G.winded && G.stamina > 0;
  if (sprinting) { G.stamina = Math.max(0, G.stamina - dt * 17); G.restT = 0.6; if (G.stamina <= 0) { G.winded = true; G.toast('Out of breath!'); } }
  else { G.restT = (G.restT || 0) - dt; if (G.restT <= 0) G.stamina = Math.min(100, G.stamina + dt * 26); }
  G.sprinting = sprinting;
  if (m > 0.01 && !holding) { const sp = P.chute ? 8.5 : sprinting ? 9.4 : 4.8; P.vx = mx / m * sp; P.vz = mz / m * sp; }
  else if (P.chute) { P.vx = Math.sin(P.facing) * 4.5; P.vz = Math.cos(P.facing) * 4.5; }
  else { P.vx = P.vz = 0; }
  // footsteps, on the ground or a rooftop (a longer stride when sprinting)
  const grounded = !P.chute && !P.jumping && P.y < 0.05 + (P.y > 0.5 ? W.floorAt(P.x, P.z, P.y) : 0);
  if (grounded && (P.vx || P.vz)) { G.stepD = (G.stepD || 0) + Math.hypot(P.vx, P.vz) * dt; if (G.stepD > (sprinting ? 1.9 : 1.25)) { G.stepD = 0; Sfx.step(P.x, P.z, sprinting ? 0.3 : 0.2); } }
  const w = WEAPONS[P.weapon], aim = chase ? CAM.yaw : Math.atan2(G.aimX - P.x, G.aimZ - P.z);
  if (!w.melee && !holding) { P.facing = turnTo(P.facing, aim, dt * 14); P.aimT = 0.3; }
  else if (m > 0.01) P.facing = turnTo(P.facing, Math.atan2(mx, mz), dt * 12);
  else if (chase && !holding) P.facing = turnTo(P.facing, aim, dt * 6);
  const fallH = P.y - (P.y > 0.5 ? W.floorAt(P.x, P.z, P.y) : 0);
  if (G.jumpQ && fallH > 2.5 && !P.chute) {
    G.jumpQ = false;
    if (G.S.parachute > 0) { G.S.parachute--; P.chute = true; P.jumping = false; P.spin = 0; Sfx.whoosh(P.x, P.z); G.toast('Parachute open. Steer with WASD.', 'good'); }
    else { G.toast('No parachute! Gun stores sell them.'); Sfx.error(); }
  }
  if (P.yv < -6 && fallH > 8 && !P.chute && G.S.parachute > 0 && !(G.chuteHintT > G.time)) { G.chuteHintT = G.time + 4; G.toast('Falling! Press SPACE to open your parachute.', 'warn'); }
  // jumping next to a train (moving or not) grabs on and climbs up
  if (G.jumpQ && P.y < 0.5 && !P.vault) { const tc = Train.near(P.x, P.z, Train.v > 2 ? 4 : 2.5); if (tc) { G.jumpQ = false; Train.climb(tc); } }
  if (G.jumpQ) { G.jumpQ = false; tryJump(P, mx, mz, m); }
  // jumping at something low turns into a vault, so you clear it whatever your timing
  if (P.jumping && P.y > 0.2 && fallH < 2.5 && m > 0.01 && !P.vault) {
    const ob = findObstacle(P.x, P.z, mx / m, mz / m);
    if (ob && !ob.mantle) { P.jumping = false; P.yv = 0; P.vault = { t: 0, dur: 0.32, fx: P.x, fz: P.z, tx: ob.x, tz: ob.z, h: ob.h, y0: P.y, mantle: false }; }
  }
  if (G.attackQ && P.cd <= 0) { const a = G.attackQ.ang; G.attackQ = null; G.attack(a); }
  else if (w.auto && Input.mdown && !G.uiBlock && P.cd <= 0) G.attack(aim);
}
/* ---------------- jump, vault, mantle ---------------- */
const NO_CLIMB = ['bound', 'water', 'block', 'building', 'tree', 'column', 'pillar', 'fountain'];
function clearSpot(x, z, r) {
  for (const c of W.queryBox(x - r - 0.5, z - r - 0.5, x + r + 0.5, z + r + 0.5)) {
    if (c.circle) { if (dist(x, z, c.x, c.z) < r + c.r) return false; }
    else if (x > c.minX - r && x < c.maxX + r && z > c.minZ - r && z < c.maxZ + r) return false;
  }
  for (const c of G.cars) if (!c.dead && dist(x, z, c.x, c.z) < c.T.len / 2 + r) return false;
  return true;
}
/* what's right in front of you: a low thing to vault, a taller thing to mantle, or nothing */
function findObstacle(px, pz, dx, dz) {
  const P = G.player, fx = px + dx * 0.95, fz = pz + dz * 0.95;
  let h = 0, blocked = false;
  for (const c of G.cars) {
    if (c.dead || Math.abs(c.v) > 6 || c.T.bike) continue;
    const rx = fx - c.x, rz = fz - c.z, s = Math.sin(c.h), co = Math.cos(c.h);
    if (Math.abs(rx * s + rz * co) < c.T.len / 2 + 0.3 && Math.abs(rx * co - rz * s) < c.T.w / 2 + 0.3) h = Math.max(h, c.type === 'truck' || c.type === 'van' || c.type === 'armored' ? 2.6 : 1.5);
  }
  for (const c of W.queryBox(fx - 0.8, fz - 0.8, fx + 0.8, fz + 0.8)) {
    const hit = c.circle ? dist(fx, fz, c.x, c.z) < c.r + 0.45 : fx > c.minX - 0.45 && fx < c.maxX + 0.45 && fz > c.minZ - 0.45 && fz < c.maxZ + 0.45;
    if (!hit) continue;
    if (NO_CLIMB.includes(c.kind) || c.h > 3.2) { blocked = true; continue; }
    h = Math.max(h, c.h);
  }
  if (blocked || h <= 0) return null;
  for (let t = 1.2; t <= 6; t += 0.25) {
    const x = px + dx * t, z = pz + dz * t;
    if (clearSpot(x, z, P.r + 0.05)) return { x, z, h, mantle: h > 1.7 };
  }
  return null;
}
function tryJump(P, mx, mz, m) {
  const floor = P.y > 0.5 ? W.floorAt(P.x, P.z, P.y) : 0;
  if (P.y - floor > 0.05 || P.vault || P.down || P.handsUp > 0) return;
  const dx = m > 0.01 ? mx / m : Math.sin(P.facing), dz = m > 0.01 ? mz / m : Math.cos(P.facing);
  const ob = findObstacle(P.x, P.z, dx, dz);
  if (ob) {
    P.vault = { t: 0, dur: ob.mantle ? 0.85 : 0.45, fx: P.x, fz: P.z, tx: ob.x, tz: ob.z, h: ob.h, mantle: ob.mantle };
    P.facing = Math.atan2(dx, dz); Sfx.jump(P.x, P.z);
    return;
  }
  P.yv = 8; P.y = floor + 0.02; P.jumping = true; Sfx.jump(P.x, P.z);
}
function stepVault(P, dt) {
  const v = P.vault; v.t += dt;
  const k = Math.min(1, v.t / v.dur), e = k * k * (3 - 2 * k), top = v.h + 0.35;
  if (v.mantle) { const ek = clamp((k - 0.45) / 0.55, 0, 1); P.x = lerp(v.fx, v.tx, ek * ek * (3 - 2 * ek)); P.z = lerp(v.fz, v.tz, ek * ek * (3 - 2 * ek)); P.y = k < 0.45 ? top * (k / 0.45) : top * (1 - (k - 0.45) / 0.55) ** 2; }
  else { P.x = lerp(v.fx, v.tx, e); P.z = lerp(v.fz, v.tz, e); P.y = v.y0 != null ? Math.max((1 - k) * v.y0, 0) + Math.sin(Math.PI * k) * Math.max(0.3, top - v.y0) : Math.sin(Math.PI * k) * top; }
  P.vx = P.vz = 0;
  if (k >= 1) { P.vault = null; P.y = 0; P.yv = 0; W.collideCircle(P, P.r); Sfx.land(P.x, P.z); }
}

function separateActors() {
  const P = G.player, all = [];
  if (!P.inCar && !P.inHeli && !P.down && !P.ride) all.push(P);
  for (const n of G.npcs) if (!n.dead && !n.down) all.push(n);
  for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
    const a = all[i], b = all[j], dx = b.x - a.x, dz = b.z - a.z, rr = a.r + b.r;
    if (Math.abs(dx) > rr || Math.abs(dz) > rr || Math.abs(a.y - b.y) > 1.5) continue;
    const d = Math.hypot(dx, dz);
    if (d < rr && d > 1e-4) { const p = (rr - d) / 2, nx = dx / d, nz = dz / d; a.x -= nx * p; a.z -= nz * p; b.x += nx * p; b.z += nz * p; }
  }
}
let zoneT = 0, crumbT = 0;
function updateZone(dt) {
  zoneT -= dt; if (zoneT > 0) return; zoneT = 0.2;
  const t = G.body(), prev = G.playerZone, h = G.player.inHeli;
  const py = G.player.y, standing = py > 3 && py - W.floorAt(t.x, t.z, py) < 1;
  G.playerZone = G.player.ride ? 'funland' : h && h.y - roofAt(h.x, h.z, 1.5) > 4 ? 'air' : !G.player.inCar && !h && py > 3 ? (standing ? (Train.onTrain(G.player) ? 'train' : 'rooftop') : 'air') : W.zoneAt(t.x, t.z);
  G.curAlley = G.playerZone === 'alley' ? W.alleys.find((a) => t.x >= a.minX && t.x <= a.maxX && t.z >= a.minZ && t.z <= a.maxZ) : null;
  if (prev !== G.playerZone) onZoneChange(prev, G.playerZone);
}

/* ---------------- simulation step ---------------- */
function step(dt) {
  G.time += dt;
  const P = G.player;
  if (G.respawning) { G.respawnT -= dt; if (G.respawnT <= 0) G.finishRespawn(); }
  // after a pedal-bike crash: once you've landed, pick the bike up and keep riding
  G.updateTumble(dt);
  updateZone(dt);
  updatePlayer(dt);
  Train.update(dt);
  Funland.update(dt); Dam.update(dt); Tanks.update(dt);
  processHold(dt);
  for (const n of G.npcs) { if (n.dead) continue; if (n.kind === 'cop') copAI(n, dt); else pedAI(n, dt); }
  Heat.update(dt);
  if (!P.inCar && !P.inHeli && !P.ride) P.physics(dt);
  for (const n of G.npcs) if (!n.dead) n.physics(dt);
  separateActors();
  for (const c of G.cars) {
    if (c.dead) continue;
    if (c !== P.inCar) {
      if (c.driver === 'ai' && c.ai) { if (c.police) aiPolice(c, dt); else aiTraffic(c, dt); }
      else if (Math.abs(c.v) > 0.01 || Math.abs(c.vx) + Math.abs(c.vz) > 0.02) c.drive(dt, 0, 0, true, false);
    }
  }
  // at high speed, move cars and resolve car-vs-car contacts in a few sub-steps so they can't pass through each other
  const movers = G.cars.filter((c) => !c.dead && (c === P.inCar || Math.abs(c.vx) + Math.abs(c.vz) + Math.abs(c.kx) + Math.abs(c.kz) > 0.01 || c.driver));
  let fastest = 0; for (const c of movers) fastest = Math.max(fastest, Math.hypot(c.vx + c.kx, c.vz + c.kz));
  const sub = Math.min(4, Math.max(1, Math.ceil(fastest * dt / 0.7)));
  for (let s = 0; s < sub; s++) { for (const c of movers) c.integrate(dt / sub); carPairs(); }
  for (const c of G.cars) if (!c.dead && Math.abs(c.vx) + Math.abs(c.vz) > 0.3) carHitsActors(c);
  for (const c of G.cars) if (!c.dead) c.update(dt);
  if (P.inCar) { P.x = P.inCar.x; P.z = P.inCar.z; }
  Bullets.update(dt); Pickups.update(dt); Spikes.update(dt); Roadblocks.update(dt); Smoke.update(dt);
  Choppers.update(dt); Ordnance.update(dt);
  PhysCar.preStep(dt); Phys.step(dt); PhysCar.postStep(dt);
  if (P.inCar) { P.x = P.inCar.x; P.z = P.inCar.z; }
  updateSecurity(dt); Story.update(dt); updatePopulation(dt);
  crumbT -= dt;
  if (crumbT <= 0) {
    crumbT = 0.5; const t = G.body(), cr = G.crumbs, last = cr[cr.length - 1];
    if (!last || dist(last.x, last.z, t.x, t.z) > 2.5) { cr.push({ x: t.x, z: t.z }); if (cr.length > 40) cr.shift(); }
  }
}

/* sit the player on a bike: lean with it, pedal or grip the bars */
function poseRider(P, bike, dt) {
  const rg = P.rig, fx = Math.sin(bike.h), fz = Math.cos(bike.h), seat = bike.type === 'bmx' ? 0.35 : bike.T.pedal ? 0.45 : bike.T.dirt ? 0.5 : 0.4;
  rg.root.visible = true;
  rg.root.position.set(bike.x - fx * 0.2, seat + (bike.y || 0) + W.groundAt(bike.x, bike.z), bike.z - fz * 0.2);
  rg.root.rotation.set(0, bike.h, 0);
  rg.body.rotation.set(0.3, 0, bike.phys ? bike.lean || 0 : bike.mesh.rotation.z); rg.body.position.set(0, 0, 0); // (a physics bike's mesh carries the body's whole rotation: its lean is kept apart)
  const pedal = bike.T.pedal ? (G.time * Math.abs(bike.v) * 1.2) : 0;
  rg.legL.rotation.x = -1.25 + Math.sin(pedal) * 0.45; rg.legR.rotation.x = -1.25 - Math.sin(pedal) * 0.45;
  rg.armL.rotation.x = rg.armR.rotation.x = -1.15;
  P.facing = bike.h;
}

/* ---------------- per-frame input ---------------- */
function frameInput() {
  const P = G.player;
  if (G.state === 'dialog') { if (Input.hit('KeyE') || Input.hit('Space') || Input.hit('Enter') || Input.mclick) UI.advanceDialog(); return; }
  if (G.state === 'shop') { if (Input.hit('Escape') || Input.hit('KeyE')) UI.closeShop(); return; }
  if (G.state === 'map') { if (Input.hit('KeyM') || Input.hit('Escape')) { $('bigmap').hidden = true; G.state = 'play'; } return; }
  // Esc that released the mouse already paused the game; don't let the same press unpause it
  const esc = Input.hit('Escape') && performance.now() - (G.lockLostAt || 0) > 400;
  if (G.state === 'pause') { if (esc || Input.hit('KeyP')) togglePause(); return; }
  if (G.state !== 'play') return;
  if (esc || Input.hit('KeyP')) { togglePause(); return; }
  if (Input.hit('KeyM')) { Input.exitLock(); openBigMap(); return; }
  if (Input.hit('KeyC')) {
    G.camMode = { iso: 'top', top: 'chase', chase: 'iso' }[G.camMode];
    if (G.camMode === 'chase') {
      CAM.yaw = P.inCar ? P.inCar.h : P.inHeli ? P.inHeli.yaw : P.facing; CAM.pitch = 0.3; CAM.wasInCar = false;
      UI.toast(Input.lockFailed ? 'Third person: hold right-click and drag to look · A/D strafe' : 'Third person: click to look with the mouse · A/D strafe · Esc frees the mouse');
    } else { Input.exitLock(); UI.toast('Camera: ' + { iso: 'isometric', top: 'top-down' }[G.camMode]); }
  }
  if (G.camMode === 'chase' && (Input.locked || Input.rdown) && (Input.dx || Input.dy)) {
    if (P.inCar || P.inHeli) {
      CAM.carLook = clamp(CAM.carLook - Input.dx * CAM.sens, -Math.PI, Math.PI);
      CAM.carPitch = clamp(CAM.carPitch + Input.dy * CAM.sens, -0.15, 1.0); CAM.lookT = 1.5;
    } else {
      CAM.yaw -= Input.dx * CAM.sens;
      CAM.pitch = clamp(CAM.pitch + Input.dy * CAM.sens, -0.25, 1.05);
    }
  }
  if (Input.hit('KeyN')) { Sfx.setMuted(!Sfx.muted); UI.toast(Sfx.muted ? 'Sound off' : 'Sound on'); }
  if (Input.hit('KeyK')) { if (!Phys.ready) UI.toast('Physics traffic needs the physics engine (it loads online).'); else UI.toast(PhysCar.toggleWorld() ? 'Physics traffic: on (every car is a physics body)' : 'Physics traffic: off (only your car)'); }
  if (Input.hit('KeyL')) { if (!Phys.ready) UI.toast('Realistic handling needs the physics engine (it loads online).'); else UI.toast(PhysCar.toggle() ? 'Your handling: realistic (physics)' : 'Your handling: arcade (K is for the traffic)'); }
  if (Input.hit('KeyV')) { Voice.muted = !Voice.muted; if (Voice.muted) { Voice.stopDialog(); Voice.radioQ.length = 0; } UI.toast(Voice.muted ? 'Voices off (V to turn them back on)' : 'Voices on'); try { localStorage.setItem('lootrun.voices', Voice.muted ? 'off' : 'on'); } catch (e) { /* storage blocked */ } }
  if (Input.wheel) {
    if (G.camMode === 'iso') CAM.zoomIso = clamp(CAM.zoomIso + Input.wheel * 3, 14, 70);
    else if (G.camMode === 'top') CAM.zoomTop = clamp(CAM.zoomTop + Input.wheel * 6, 25, 140);
    else CAM.chaseD = clamp(CAM.chaseD + Input.wheel, 5, 16);
  }
  if (G.respawning) return;
  if (Input.hit('KeyF') && G.interact.f) G.interact.f.run();
  if (Input.hit('KeyE') && G.interact.e && !G.interact.e.hold) {
    if (G.interact.e.disabled) { UI.toast(G.interact.e.disabled); Sfx.error(); } else G.interact.e.run();
  } else if (Input.hit('KeyE') && G.interact.e && G.interact.e.disabled) { UI.toast(G.interact.e.disabled); Sfx.error(); }
  if (Input.hit('KeyR') && G.interact.r) G.interact.r.run();
  if (Input.hit('KeyQ')) G.cycleWeapon();
  ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6'].forEach((k, i) => { if (Input.hit(k)) { if (G.S.weapons[WEAPON_ORDER[i]]) { G.equip(WEAPON_ORDER[i]); Sfx.click(); } else UI.toast(WEAPONS[WEAPON_ORDER[i]].name + ' not owned yet. Gun stores sell it.'); } });
  if (Input.hit('KeyT')) G.throwGrenade();
  if (Input.hit('KeyB')) G.useC4();
  if (Input.hit('KeyG')) G.useGadget();
  if (Input.hit('KeyH')) G.useMedkit();
  if (!P.inCar && !P.inHeli) {
    if (Input.mclick && !G.uiBlock) G.attackQ = { ang: G.camMode === 'chase' ? CAM.yaw : Math.atan2(G.aimX - P.x, G.aimZ - P.z) };
    if (Input.hit('Space')) G.jumpQ = true;
  } else if (P.inCar && (P.inCar.type === 'bmx' || P.inCar.T.dirt)) {
    if (Input.hit('Space')) G.hopQ = true;
  }
}
function togglePause() {
  if (G.state === 'pause') { G.state = 'play'; $('pause').hidden = true; }
  else { G.state = 'pause'; $('pause').hidden = false; Input.exitLock(); const s = G.S.stats; $('pauseStats').textContent = `Jobs done ${G.S.storyDone}/${MISSIONS.length} · ${s.robbed} robberies · ${money(s.earned)} earned · ${s.escapes} escapes · ${s.busts} times cuffed`; }
}
const aimV = new THREE.Vector2(), aimP = new THREE.Vector3();
function updateAim(cam) {
  if (G.camMode === 'chase') aimV.set(0, 0); else aimV.set((Input.mx / innerWidth) * 2 - 1, -(Input.my / innerHeight) * 2 + 1);
  raycaster.setFromCamera(aimV, cam);
  aimPlane.constant = -(1.2 + W.groundAt(G.player.x, G.player.z)); // aim at chest height on the slope you're standing on
  if (raycaster.ray.intersectPlane(aimPlane, aimP)) { G.aimX = aimP.x; G.aimZ = aimP.z; }
  // aiming at a police chopper locks guns and rockets on to it
  G.heliAim = null;
  const P = G.player, w = WEAPONS[P.weapon];
  const gunship = P.inHeli && P.inHeli.armed;
  if ((!P.inCar && !P.inHeli && w && !w.melee) || gunship) for (const h of Choppers.list) {
    if (h.dead || h.falling > 0 || h.pilot === 'player' || h === P.inHeli || h.y < 4) continue;
    aimP.set(h.x, h.y + 1.8, h.z);
    if (raycaster.ray.distanceToPoint(aimP) < (gunship ? 6 : 4) && dist(h.x, h.z, P.x, P.z) < (gunship ? 140 : 80)) { G.heliAim = h; break; }
  }
  const lk = $('heliLock');
  if (G.heliAim && G.state === 'play') {
    aimP.set(G.heliAim.x, G.heliAim.y + 1.8, G.heliAim.z).project(cam);
    lk.hidden = false; lk.style.transform = `translate(${(aimP.x * 0.5 + 0.5) * innerWidth}px, ${(-aimP.y * 0.5 + 0.5) * innerHeight}px) translate(-50%,-50%)`;
    $('heliLockFill').style.width = Math.round(clamp(G.heliAim.hp / G.heliAim.maxHp, 0, 1) * 100) + '%';
  } else lk.hidden = true;
}

/* ---------------- loop ---------------- */
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - lastT) / 1000 || 0); lastT = now;
  G.frameN = (G.frameN || 0) + 1;
  frameInput();
  if (G.state === 'play') {
    acc += dt; let n = 0;
    while (acc >= STEP && n < 5) { step(STEP); acc -= STEP; n++; }
    if (n >= 5) acc = 0;
    G.interact = computeInteract();
  } else if (G.state === 'title') G.time += dt;
  const cam = updateCamera(dt);
  updateAim(cam);
  const P = G.player;
  if (!G.canopy) {
    G.canopy = new THREE.Group();
    const cg = new THREE.SphereGeometry(2.6, 16, 6, 0, TAU, 0, Math.PI / 2.6); cg.scale(1.3, 0.55, 1);
    const cm = new THREE.Mesh(cg, new THREE.MeshLambertMaterial({ color: 0xff7b00, side: THREE.DoubleSide })); cm.position.y = 3.2; cm.castShadow = true; G.canopy.add(cm);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.05, 5.2), lam('#ffffff')); stripe.position.y = 4.65; G.canopy.add(stripe);
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.03, 2.6, 0.03), lam('#333333')); l.position.set(sx * 1.4, 2.3, sz * 0.9); l.rotation.z = sx * 0.45; l.rotation.x = -sz * 0.3; G.canopy.add(l); }
    G.scene.add(G.canopy);
  }
  G.canopy.visible = !!P.chute && !P.inCar && !P.inHeli;
  if (G.canopy.visible) { G.canopy.position.set(P.x, P.y + W.groundAt(P.x, P.z), P.z); G.canopy.rotation.y = P.facing; }
  if (G.state !== 'title') { P.animate(dt); for (const n of G.npcs) n.animate(dt); if (P.inCar && P.inCar.T.bike) poseRider(P, P.inCar, dt); }
  FX.update(G.state === 'play' ? dt : 0);
  Puffs.update(G.state === 'play' ? dt : 0, cam, renderer.domElement.height);
  updateFades(cam, dt);
  updateMarkers();
  GPS.update(dt);
  if (G.state !== 'title') { UI.update(dt); drawMinimap(); }
  Floaters.update(G.state === 'play' ? dt : 0, cam, innerWidth, innerHeight);
  const B = G.body();
  Weather.update(dt, CAM.fx, (P.inHeli ? Math.max(0, P.inHeli.y - 12) : Math.max(0, P.y - 4)) + W.groundAt(CAM.fx, CAM.fz), CAM.fz);
  // nothing past the fog can be seen, so don't draw it: with the county out there this culls most of the world
  if (G.scene.fog) { const far = Math.min(2600, G.scene.fog.far + 25); if (Math.abs(persp.far - far) > 5) { persp.far = far; persp.updateProjectionMatrix(); } }
  const sir = G.cars.filter((c) => c.siren && !c.wreck && !c.dead).sort((a, b) => dist(a.x, a.z, B.x, B.z) - dist(b.x, b.z, B.x, B.z)).slice(0, 2);
  let heli = null, hd = 1e9;
  for (const h of Choppers.list) if (!h.dead && h.rotor > 0.3 && (!h.wing || h.pilot)) { const d = h === P.inHeli ? 0 : dist(h.x, h.z, B.x, B.z); if (d < hd) { hd = d; heli = h; } }
  const cf = G.camFwd || { x: 0, z: -1 };
  Sfx.update(dt, { playing: G.state === 'play', lx: B.x, lz: B.z, rx: -cf.z, rz: cf.x, sirens: sir, heat: Heat.level, zone: G.playerZone, rain: Math.max(Weather.p.rain, Weather.p.hail * 0.8), hail: Weather.p.hail, wind: Weather.p.wind + Weather.gust, slip: G.slip || 0,
    engine: P.inCar && !P.inCar.T.pedal ? { speed: P.inCar.v, throttle: G.throttle || 0, boost: G.boosting, bike: !!P.inCar.T.bike } : null, heli: heli ? { x: heli.x, z: heli.z, kind: heli.kind, v: heli.v || 0, thr: heli.thr || 0, mine: heli === P.inHeli } : null,
    train: Train.cars.length ? (() => { let best = Train.cars[0], bd = 1e9; for (const c of Train.cars) { const d = dist(c.x, c.z, B.x, B.z); if (d < bd) { bd = d; best = c; } } return { x: best.x, z: best.z, v: Train.v }; })() : null });
  renderer.render(G.scene, cam);
  Input.endFrame();
}

/* ---------------- setup ---------------- */
function setupScene() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xa9cfe3);
  scene.fog = new THREE.Fog(0xa9cfe3, 230, 420);
  G.hemi = new THREE.HemisphereLight(0xd6e8ff, 0x7a6a50, 0.72); scene.add(G.hemi);
  sun = new THREE.DirectionalLight(0xfff0d0, 0.85);
  const sm = Math.min(4096, renderer.capabilities.maxTextureSize || 2048);
  sun.castShadow = true; sun.shadow.mapSize.set(sm, sm);
  const sc = sun.shadow.camera, SB = sm >= 4096 ? 125 : 95; sc.left = -SB; sc.right = SB; sc.top = SB; sc.bottom = -SB; sc.near = 10; sc.far = 300;
  sun.shadow.bias = -0.0008;
  scene.add(sun); scene.add(sun.target);
  ortho = new THREE.OrthographicCamera(-20, 20, 20, -20, 1, 800);
  persp = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.5, 2000);
  raycaster = new THREE.Raycaster(); aimPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -1.2);
  return scene;
}
function newWorld() {
  G.scene = setupScene();
  W.build(G.scene, 7);
  FX.init(G.scene); Puffs.init(G.scene); Bullets.init(); Floaters.init($('floaters')); Ordnance.init(); Skids.init(); Weather.init(G.scene, G.hemi, sun);
  const sp = W.places.spawn;
  G.player = new Actor('player', sp.x, sp.z, { shirt: '#f77f00', pants: '#283618', skin: '#e0ac69', hair: '#2b1b10' });
  G.player.r = 0.4; G.player.inCar = null;
  const hv = W.places.hideout;
  const vera = new Actor('ped', hv.x, hv.z - 0.5, { shirt: '#7b2cbf', pants: '#1d1d1d', skin: '#c68642', hair: '#8b2f1b' });
  vera.ai = { mode: 'vera' }; vera.invuln = true; G.npcs.push(vera); G.vera = vera;
  for (const k in GIVERS) { const g = GIVERS[k], p = W.places[g.place]; if (k === 'vera' || !p) continue; const a = new Actor('ped', p.x, p.z, g.look); a.ai = { mode: 'vera', giver: k }; a.invuln = true; a.facing = p.face || 0; G.npcs.push(a); }
  spawnFixedCars();
  Choppers.init();
  Train.init(); W.trainFloor = (x, z, y) => Train.floorAt(x, z, y);
  Phys.spawnProps();
  initMarkers();
  G.interact = { e: null, f: null };
  G.aimX = sp.x; G.aimZ = sp.z + 5;
}
function startGame(state) {
  G.S = state || freshState();
  const P = G.player, sp = W.places.spawn;
  G.respawning = false; G.resetPlayer(sp.x, sp.z); P.hp = 100; G.waypoint = null;
  G.equip(G.S.weapons.pistol ? 'pistol' : G.S.weapons.bat ? 'bat' : 'fists');
  Heat.clear(); Story.active = null;
  CAM.fx = P.x; CAM.fz = P.z;
  // start in third person, looking toward Vera
  P.facing = CAM.yaw = Math.atan2(G.vera.x - P.x, G.vera.z - P.z); CAM.pitch = 0.3; CAM.wasInCar = false;
  G.state = 'play';
  $('title').hidden = true; $('hud').hidden = false;
  Sfx.init();
  if (!state) setTimeout(() => UI.toast('Vera is waiting at the yellow marker. Press E to talk.', 'good'), 600);
  if (G.camMode === 'chase') setTimeout(() => UI.toast('Click to look around with the mouse. Press C to switch camera views.'), 1400);
}
function bootUI() {
  $('btnNew').addEventListener('click', () => { startGame(null); G.save(); });
  const saved = G.loadSave();
  if (saved) { $('btnCont').hidden = false; $('btnCont').addEventListener('click', () => startGame(G.loadSave())); }
  $('btnResume').addEventListener('click', () => { togglePause(); if (G.camMode === 'chase' && !Input.lockFailed) Input.requestLock(); });
  // 3rd person: first click on the game captures the mouse; losing it mid-game pauses
  Input.wantLock = () => G.state === 'play' && G.camMode === 'chase' && !Input.locked && !Input.lockFailed;
  Input.onLock = (locked) => {
    if (!locked && G.state === 'play' && G.camMode === 'chase') { G.lockLostAt = performance.now(); togglePause(); }
  };
  $('btnSound').addEventListener('click', () => { Sfx.setMuted(!Sfx.muted); $('btnSound').textContent = Sfx.muted ? 'Sound: off' : 'Sound: on'; });
  $('btnTitle').addEventListener('click', () => { G.save(); location.reload(); });
  $('shopClose').addEventListener('click', () => UI.closeShop());
  $('dialog').addEventListener('click', () => UI.advanceDialog());
  $('btnEndPlay').addEventListener('click', () => { $('ending').hidden = true; G.state = 'play'; });
  $('bigmap').addEventListener('click', (e) => {
    const cv = $('bigmapCanvas');
    if (e.target === cv) { if (BM.moved) return; const r = cv.getBoundingClientRect(); bigMapClick((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height, false); return; }
    $('bigmap').hidden = true; G.state = 'play';
  });
  const cvs = $('bigmapCanvas'), frac = (e) => { const r = cvs.getBoundingClientRect(); return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height, r.width]; };
  $('bigmapCanvas').addEventListener('contextmenu', (e) => { e.preventDefault(); const [fx, fy] = frac(e); bigMapTeleport(fx, fy); });
  cvs.addEventListener('wheel', (e) => { e.preventDefault(); const [fx, fy] = frac(e); bigMapZoom(fx, fy, e.deltaY > 0 ? 1.2 : 1 / 1.2); }, { passive: false });
  cvs.addEventListener('mousedown', (e) => { if (e.button !== 0) return; BM.drag = { x: e.clientX, y: e.clientY, cx: BM.cx, cz: BM.cz }; BM.moved = false; });
  window.addEventListener('mousemove', (e) => {
    if (!BM.drag) return; const [, , w] = frac(e), dx = e.clientX - BM.drag.x, dy = e.clientY - BM.drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 5) BM.moved = true;
    if (BM.moved) { BM.cx = BM.drag.cx - dx / w * BM.span; BM.cz = BM.drag.cz - dy / w * BM.span; drawBigMap(); }
  });
  window.addEventListener('mouseup', () => { BM.drag = null; });
  for (const id of ['shop', 'pause', 'title', 'dialog', 'ending', 'bigmap']) {
    $(id).addEventListener('mouseenter', () => { G.uiBlock = true; }); $(id).addEventListener('mouseleave', () => { G.uiBlock = false; });
  }
  window.addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); });
  window.addEventListener('blur', () => { if (G.state === 'play' && !G.autotest) togglePause(); });
}

function boot() {
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  } catch (e) { $('nogl').hidden = false; return; }
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  GFX.aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  $('game').appendChild(renderer.domElement);
  Input.init(renderer.domElement);
  const tBuild = performance.now();
  newWorld();
  G.buildMs = performance.now() - tBuild;
  G.S = freshState();
  bootUI();
  const physReady = Phys.init(); PhysCar.init();
  const q = new URLSearchParams(location.search);
  if (q.has('autotest')) { G.autotest = true; physReady.then(() => runAutotest()); return; }
  if (q.has('bench')) { G.autotest = true; if (q.has('phys')) physReady.then(() => runBench()); else runBench(); return; } // synchronous unless ?phys (then it waits for Box3D)
  if (q.has('demo')) { startGame(null); G.camMode = 'iso'; physReady.then(() => demoSetup(q.get('demo'))); }
  requestAnimationFrame((t) => { lastT = t; frame(t); });
}

/* ---------------- screenshot demo states (used for testing) ---------------- */
function demoSetup(kind) {
  const P = G.player; G.autotest = true;
  for (let i = 0; i < 240; i++) step(STEP);
  G.autotest = false;
  if (kind === 'chase') {
    const s = W.robs.find((r) => r.id === 'quick'); P.x = s.x; P.z = s.z + 3;
    Heat.add(3, 5, 'Demo');
    for (let i = 0; i < 600; i++) step(STEP);
  } else if (kind === 'drive') {
    const car = new Car('sports', P.x + 3, P.z - 2, Math.PI); G.enterCar(car); car.v = 15;
    for (let i = 0; i < 90; i++) step(STEP);
  } else if (kind === 'top') { G.camMode = 'top'; }
  else if (kind === 'chasecam') { G.camMode = 'chase'; CAM.yaw = Math.PI; }
  else if (kind === 'roadblock') {
    const H = W.HWY, car = new Car('sedan', -150, -H, Math.PI / 2); G.enterCar(car); car.v = 25; car.vx = 25;
    Heat.add(3, 5, 'Demo'); Roadblocks.spawnAhead();
    const rb = Roadblocks.list[0]; car.x = rb.x - 25 * Math.sign(rb.x - car.x || 1); car.z = -H; P.x = car.x; P.z = car.z;
    for (let i = 0; i < 30; i++) step(STEP);
  } else if (kind === 'forest') { P.x = W.FOREST_C.x - 5; P.z = W.FOREST_C.z + 6; for (let i = 0; i < 30; i++) step(STEP); }
  else if (kind === 'shop') { G.S.cash = 3000; UI.openShop('Boom Town Explosives'); }
  else if (kind === 'heli') { const pad = W.places.helipads[0]; P.x = pad.x + 4; P.z = pad.z; G.enterHeli(pad.heli); pad.heli.rotor = 1; pad.heli.y = 22; pad.heli.vx = -8; for (let i = 0; i < 60; i++) step(STEP); }
  else if (kind === 'chopper') { P.x = 0; P.z = 20; G.god = true; Heat.add(3, 5, 'Demo'); for (let i = 0; i < 900; i++) step(STEP); G.god = false; }
  else if (WEATHER[kind]) { Weather.set(kind, true); if (kind === 'snow') Weather.snowCover = 0.8; G.camMode = 'chase'; CAM.pitch = 0.12; for (let i = 0; i < 60; i++) { step(STEP); Weather.update(STEP, P.x, 0, P.z); } }
  else if (kind === 'curve') { const k = W.HWY - W.RR, rp = W.ringPoint(2 * k + 40); const car = new Car('supercar', rp.x - rp.tz * 7.5, rp.z + rp.tx * 7.5, Math.atan2(rp.tx, rp.tz)); P.x = car.x; P.z = car.z; G.enterCar(car); car.v = 40; for (let i = 0; i < 20; i++) step(STEP); CAM.zoomIso = 60; CAM.curIso = 60; }
  else if (kind === 'chute') { const b = W.buildings.filter((k) => k.h > 25).sort((p, q) => q.h - p.h)[0]; P.x = b.maxX + 6; P.z = (b.minZ + b.maxZ) / 2; P.y = b.h * 0.6; P.yv = -2; P.chute = true; P.facing = Math.PI / 2; for (let i = 0; i < 20; i++) step(STEP); CAM.zoomIso = 34; CAM.curIso = 34; }
  else if (kind === 'ragdoll') {
    G.camMode = 'chase'; P.x = W.rp(3) + 2.5; P.z = W.rp(4) + 20; P.facing = CAM.yaw = 0; CAM.pitch = 0.35;
    for (let i = 0; i < 5; i++) { const p = spawnPed(P.x - 2 + i, P.z + 9 + (i % 2), W.nearestBlock(P.x, P.z), 1, 1); p.ai.mode = 'idle'; }
    for (let i = 0; i < 4; i++) { const pr = { kind: i % 2 ? 'bin' : 'cone', x: P.x - 3 + i * 2, y: 0.5, z: P.z + 12, q: new THREE.Quaternion(), body: null, mesh: Phys.propMesh(i % 2 ? 'bin' : 'cone') }; Phys.props.push(pr); }
    for (let i = 0; i < 40; i++) step(STEP);
    explosion(P.x, P.z + 10, 7, 120, null);
    for (let i = 0; i < 22; i++) step(STEP);
  }
  else if (kind === 'bikecrash') {
    G.noSpawn = true; G.camMode = 'chase'; const z = -W.HWY + 7.5;
    new Car('sedan', 25, z, 0, { parked: true, color: '#3a86ff' }); const bike = new Car('motorbike', 6, z, Math.PI / 2);
    P.x = 6; P.z = z; G.enterCar(bike); bike.v = 30; bike.vx = 30; G.god = true; CAM.yaw = Math.PI / 2 + 0.5; CAM.pitch = 0.25;
    let n = 0; for (let i = 0; i < 200; i++) { step(STEP); if (!P.inCar && ++n > 14) break; }
    G.god = false; P.facing = Math.PI / 2;
  }
  else if (kind === 'damage') {
    G.camMode = 'chase'; P.x = W.rp(3) + 2.5; P.z = W.rp(4) + 20; P.facing = CAM.yaw = 0; CAM.pitch = 0.45; CAM.chaseD = 6;
    const car = new Car('sedan', P.x + 1.2, P.z + 6, 0.7, { parked: true, color: '#3a86ff' });
    car.damage(30, car.x + 3, car.z + 1); car.damage(25, car.x - 1, car.z + 4); car.damage(35, car.x + 1, car.z - 4); car.damage(20, car.x - 3, car.z);
    for (let i = 0; i < 30; i++) step(STEP);
  }
  else if (kind === 'heligun') {
    G.noSpawn = true; G.camMode = 'chase'; const h = new Chopper('police', P.x, P.z, 0, { y: 16 }); h.rotor = 1; G.enterHeli(h); h.y = 16;
    CAM.yaw = 0; CAM.pitch = 0.45; Input.mdown = true;
    for (let i = 0; i < 40; i++) { G.aimX = h.x + 2; G.aimZ = h.z + 18; step(STEP); }
    Input.mdown = false;
  }
  else if (kind === 'county') { G.camMode = 'chase'; P.x = W.ROUNDABOUT.x + 60; P.z = W.ROUNDABOUT.z - 3; P.facing = CAM.yaw = Math.PI / 2; CAM.pitch = 0.3; for (let i = 0; i < 30; i++) step(STEP); }
  else if (kind === 'countyiso') { P.x = -560; P.z = -560; CAM.zoomIso = 90; CAM.curIso = 90; for (let i = 0; i < 30; i++) step(STEP); }
  else if (kind === 'airport') { G.camMode = 'chase'; P.x = -650; P.z = 62; P.facing = CAM.yaw = 0; CAM.pitch = 0.18; for (let i = 0; i < 30; i++) step(STEP); }
  else if (kind === 'airbase') { G.camMode = 'chase'; P.x = -960; P.z = 192; P.facing = CAM.yaw = -Math.PI / 2 - 0.3; CAM.pitch = 0.2; for (let i = 0; i < 30; i++) step(STEP); }
  else if (kind === 'funland') { G.camMode = 'chase'; P.x = 735; P.z = 66; P.facing = CAM.yaw = 0; CAM.pitch = 0.05; for (let i = 0; i < 400; i++) step(STEP); P.x = 735; P.z = 66; for (let i = 0; i < 4; i++) step(STEP); }
  else if (kind === 'funland2') { G.camMode = 'chase'; P.x = 735; P.z = 200; P.facing = CAM.yaw = -2.2; CAM.pitch = 0.1; for (let i = 0; i < 1500; i++) step(STEP); P.x = 735; P.z = 200; for (let i = 0; i < 4; i++) step(STEP); }
  else if (kind === 'viper') { G.camMode = 'chase'; P.x = 676; P.z = 238; P.facing = CAM.yaw = -2.5; CAM.pitch = -0.12; const c = W.FUN.rides.coaster; for (let i = 0; i < 9000 && !(c.state === 'run' && c.trip > (c.sTop - c.sStop + c.V.len) % c.V.len + 8); i++) step(STEP); P.x = 676; P.z = 238; step(STEP); }
  else if (kind === 'ridecoaster') { G.camMode = 'chase'; G.noSpawn = true; const c = W.FUN.rides.coaster; c.state = 'load'; c.dwell = 3; P.x = 718.5; P.z = 248; Funland.board('viper'); for (let i = 0; i < 9000 && !(c.state === 'run' && c.trip > (c.sTop - c.sStop + c.V.len) % c.V.len + 6); i++) step(STEP); CAM.yaw = P.facing; CAM.pitch = 0.25; for (let i = 0; i < 3; i++) step(STEP); }
  else if (kind === 'ridewheel') { G.camMode = 'chase'; G.noSpawn = true; P.x = 802; P.z = 140; Funland.board('wheel'); for (let i = 0; i < 9000 && P.y < 30; i++) step(STEP); CAM.yaw = -Math.PI / 2 + 0.4; CAM.pitch = 0.3; for (let i = 0; i < 3; i++) step(STEP); }
  else if (kind === 'kerb') { G.camMode = 'chase'; G.noSpawn = true; const RB = W.ROUNDABOUT, car = new Car('sports', RB.x - 30, RB.z + 5.5, Math.PI / 2); P.x = car.x; P.z = car.z; G.enterCar(car); Input.keys.KeyW = true; for (let i = 0; i < 95; i++) step(STEP); Input.keys.KeyW = false; CAM.yaw = car.h - 0.9; CAM.pitch = 0.15; for (let i = 0; i < 2; i++) step(STEP); }
  else if (kind === 'millbrook') { G.camMode = 'chase'; P.x = 650; P.z = -470; P.facing = CAM.yaw = 0; CAM.pitch = 0.08; for (let i = 0; i < 300; i++) step(STEP); P.x = 650; P.z = -470; for (let i = 0; i < 4; i++) step(STEP); }
  else if (kind === 'millbrookiso') { P.x = 650; P.z = -395; CAM.zoomIso = 150; CAM.curIso = 150; for (let i = 0; i < 300; i++) step(STEP); P.x = 650; P.z = -395; for (let i = 0; i < 30; i++) step(STEP); }
  else if (kind === 'cacti') { const c = W.cacti[25]; P.x = c.x + 6; P.z = c.z + 6; CAM.zoomIso = 70; CAM.curIso = 70; for (let i = 0; i < 30; i++) step(STEP); }
  else if (kind === 'dam') { G.camMode = 'chase'; const D = W.DAM; P.x = D.x + 25; P.z = D.z + 70; P.facing = CAM.yaw = Math.PI - 0.25; CAM.pitch = 0.18; for (let i = 0; i < 40; i++) step(STEP); }
  else if (kind === 'damcrest') { G.camMode = 'chase'; const D = W.DAM; P.x = D.x - 30; P.z = D.z; P.facing = CAM.yaw = Math.PI / 2 + 0.5; CAM.pitch = 0.2; for (let i = 0; i < 40; i++) step(STEP); }
  else if (kind === 'damiso') { const D = W.DAM; P.x = D.x; P.z = D.z - 30; CAM.zoomIso = 260; CAM.curIso = 260; for (let i = 0; i < 30; i++) step(STEP); }
  else if (kind === 'tank') { G.camMode = 'chase'; G.noSpawn = true; const p = W.places.tankDepot, t = new Car('tank', p.x, p.z, p.h, { parked: true, persistent: true }); t.owned = true; P.x = p.x + 3; P.z = p.z; G.enterCar(t); CAM.yaw = p.h + 0.6; CAM.pitch = 0.18; for (let i = 0; i < 90; i++) step(STEP); }
  else if (kind === 'dirtbike') { G.camMode = 'chase'; G.noSpawn = true; const x = W.ROUNDABOUT.x + 60, z = W.ROUNDABOUT.z - 120, parked = new Car('dirtbike', x + 4, z + 3, 0.6, { parked: true }); void parked; const b = new Car('dirtbike', x, z, Math.PI, { parked: true, color: '#ff6d00' }); P.x = x + 1; P.z = z; G.enterCar(b); Input.keys.KeyW = true; for (let i = 0; i < 40; i++) step(STEP); Input.keys.KeyW = false; CAM.yaw = b.h + 2.3; CAM.pitch = 0.12; for (let i = 0; i < 4; i++) step(STEP); }
  else if (kind === 'funlandiso') { P.x = 735; P.z = 200; CAM.zoomIso = 260; CAM.curIso = 260; for (let i = 0; i < 300; i++) step(STEP); P.x = 735; P.z = 200; for (let i = 0; i < 30; i++) step(STEP); }
  else if (kind === 'airportiso') { P.x = -760; P.z = 210; CAM.zoomIso = 230; CAM.curIso = 230; for (let i = 0; i < 30; i++) step(STEP); }
  else if (kind === 'planes') { G.camMode = 'chase'; P.x = -680; P.z = 150; P.facing = CAM.yaw = Math.PI * 0.85; CAM.pitch = 0.22; for (let i = 0; i < 30; i++) step(STEP); }
  else if (kind === 'fighters') { G.camMode = 'chase'; P.x = -1160; P.z = 178; P.facing = CAM.yaw = Math.PI * 0.95; CAM.pitch = 0.2; for (let i = 0; i < 30; i++) step(STEP); }
  else if (kind === 'jetflight') {
    G.noSpawn = true; G.camMode = 'chase'; const r = W.AIRPORT.runway, h = new Chopper('fighter', r.minX + 40, 300, Math.PI / 2); P.x = h.x; P.z = h.z + 6; G.enterHeli(h);
    Input.keys.KeyW = true; for (let i = 0; i < 200; i++) step(STEP); Input.keys.Space = true; for (let i = 0; i < 120; i++) step(STEP); Input.keys.Space = false; Input.keys.KeyA = true; for (let i = 0; i < 40; i++) step(STEP); Input.keys.KeyA = false; Input.keys.KeyW = false;
    CAM.yaw = h.yaw; CAM.pitch = 0.2;
  }
  else if (kind === 'bridge') { const b = W.bridges.find((q) => q.name === 'East Road'); G.camMode = 'chase'; P.x = b.x - 40; P.z = b.z + 12; P.facing = CAM.yaw = Math.PI / 2 - 0.35; CAM.pitch = 0.25; for (let i = 0; i < 30; i++) step(STEP); }
  else if (kind === 'lake') { const L = W.LAKE; G.camMode = 'chase'; P.x = L.x + L.r + 22; P.z = L.z + 6; P.facing = CAM.yaw = -Math.PI / 2; CAM.pitch = 0.2; for (let i = 0; i < 30; i++) step(STEP); }
  else if (kind === 'roundabout') { const R = W.ROUNDABOUT; P.x = R.x - 30; P.z = R.z + 25; CAM.zoomIso = 70; CAM.curIso = 70; for (let i = 0; i < 60; i++) step(STEP); }
  else if (kind === 'tunnel') { G.camMode = 'chase'; P.x = -100 + 2; P.z = W.TUNNEL.maxZ + 40; P.facing = CAM.yaw = Math.PI; CAM.pitch = 0.12; for (let i = 0; i < 30; i++) step(STEP); }
  else if (kind === 'ridge') { P.x = -100; P.z = W.TUNNEL.maxZ - 30; CAM.zoomIso = 120; CAM.curIso = 120; for (let i = 0; i < 30; i++) step(STEP); }
  else if (kind === 'narrow') { const b = W.blocks.find((k) => k.type === 'city' && k.j === 2); G.camMode = 'chase'; P.x = b.cx; P.z = b.cz - 13; P.facing = CAM.yaw = 0; CAM.pitch = 0.15; CAM.chaseD = 5; for (let i = 0; i < 30; i++) step(STEP); }
  else if (kind === 'train') { G.noSpawn = true; for (let i = 0; i < 900; i++) step(STEP); const c = Train.cars[0], fx = Math.sin(c.h), fz = Math.cos(c.h); G.camMode = 'chase'; P.x = c.x + fx * 45 + fz * 12; P.z = c.z + fz * 45 - fx * 12; P.facing = CAM.yaw = Math.atan2(c.x - P.x, c.z - P.z); CAM.pitch = 0.15; for (let i = 0; i < 20; i++) step(STEP); }
  else if (kind === 'trainride') { G.noSpawn = true; for (let i = 0; i < 900; i++) step(STEP); Train.climb(Train.cars[2]); G.camMode = 'chase'; CAM.yaw = Train.cars[2].h; CAM.pitch = 0.3; for (let i = 0; i < 60; i++) step(STEP); }
  else if (kind === 'station') { const st = W.STATIONS[0]; G.camMode = 'chase'; P.x = st.x - 40; P.z = st.z + 18; P.facing = CAM.yaw = Math.PI / 2 + 0.3; CAM.pitch = 0.15; for (let i = 0; i < 30; i++) step(STEP); }
  else if (kind === 'snowlake') { const L = W.LAKE; Weather.set('snow', true); Weather.snowCover = 0.8; G.camMode = 'chase'; P.x = L.x + L.r + 22; P.z = L.z + 6; P.facing = CAM.yaw = -Math.PI / 2; CAM.pitch = 0.2; for (let i = 0; i < 60; i++) { step(STEP); Weather.update(STEP, P.x, 0, P.z); } }
  else if (kind === 'cloudyiso') { Weather.set('cloudy', true); for (let i = 0; i < 30; i++) { step(STEP); Weather.update(STEP, P.x, 0, P.z); } }
  else if (kind === 'drivechase' || kind === 'drivechase2') {
    G.camMode = 'chase'; const b = W.places.spawn; const car = new Car('sedan', W.rp(3) + 2.5, W.rp(1) + 20, 0); P.x = car.x; P.z = car.z; G.enterCar(car);
    if (kind === 'drivechase2') G.setWaypoint(W.places.chop.x, W.places.chop.z);
    Input.keys.KeyW = true; for (let i = 0; i < 90; i++) step(STEP); Input.keys.KeyW = false; void b; GPS.t = 0; GPS.update(0.016);
  }
  else if (kind === 'smoke') {
    G.camMode = 'chase'; G.noSpawn = true; const x = W.rp(3) + 2.5, z = W.rp(4) + 20; P.x = x; P.z = z; P.facing = CAM.yaw = 0; CAM.pitch = 0.25;
    const a = new Car('sedan', x - 4, z + 12, 0.6, { parked: true }); a.damage(a.maxHp * 0.55, a.x, a.z + 2);
    const b = new Car('sports', x + 4, z + 14, -0.4, { parked: true }); b.damage(b.maxHp * 0.8, b.x, b.z + 2);
    const c = new Car('van', x + 1, z + 26, 1.2, { parked: true }); c.burning = 6;
    for (let i = 0; i < 150; i++) { step(STEP); Puffs.update(STEP, persp, 800); }
  }
  else if (kind === 'smoke2') {
    G.camMode = 'chase'; G.noSpawn = true; const x = W.rp(3) + 2.5, z = W.rp(4) + 20; P.x = x; P.z = z; P.facing = CAM.yaw = 0; CAM.pitch = 0.1;
    const b = new Car('sports', x + 1, z + 9, Math.PI, { parked: true }); b.damage(b.maxHp * 0.8, b.x, b.z - 2);
    const a = new Car('sedan', x - 4, z + 9, Math.PI, { parked: true }); a.damage(a.maxHp * 0.6, a.x, a.z - 2);
    for (let i = 0; i < 150; i++) { step(STEP); Puffs.update(STEP, persp, 800); }
  }
  else if (kind === 'stunt') {
    G.noSpawn = true; G.camMode = 'chase'; const r = W.RAMPS.find((q) => q.name === 'River Run'), x = r.x - r.fx * 45, z = r.z - r.fz * 45;
    const car = new Car('supercar', x, z, Math.atan2(r.fx, r.fz)); P.x = x; P.z = z; G.enterCar(car); car.v = 40; car.vx = r.fx * 40; car.vz = r.fz * 40; Input.keys.KeyW = true;
    for (let i = 0; i < 400 && !(car.y > 6 || (car.airT > 0.4 && car.y > 3)); i++) step(STEP); Input.keys.KeyW = false; CAM.carYaw = car.h + 0.7; CAM.carPitch = 0.2; CAM.wasInCar = true;
  }
  else if (kind === 'highlands' || kind === 'badlands' || kind === 'hills') {
    const at = { highlands: [-820, -700, -Math.PI * 0.75], badlands: [760, -800, Math.PI * 0.6], hills: [-60, -620, Math.PI] }[kind];
    G.camMode = 'chase'; P.x = at[0]; P.z = at[1]; P.facing = CAM.yaw = at[2]; CAM.pitch = 0.18; for (let i = 0; i < 30; i++) step(STEP);
  }
  else if (kind === 'hillsiso') { P.x = -700; P.z = -700; CAM.zoomIso = 260; CAM.curIso = 260; for (let i = 0; i < 30; i++) step(STEP); }
  else if (kind === 'bigmap') { openBigMap(); BM.span = W.VIEW.span; BM.cx = W.VIEW.cx; BM.cz = W.VIEW.cz; drawBigMap(); }
  else if (kind === 'waypoint') { G.setWaypoint(W.places.chop.x + 6, W.places.chop.z); GPS.update(0.5); openBigMap(); bigMapZoom(0.5, 0.42, 0.35); }
  else if (kind === 'waypointcam') { G.camMode = 'chase'; G.setWaypoint(P.x + 60, P.z - 90); CAM.yaw = Math.atan2(60, -90); CAM.pitch = 0.15; for (let i = 0; i < 10; i++) step(STEP); }
  else if (kind === 'map') { GPS.update(0.5); openBigMap(); }
  else if (kind === 'beach') { P.x = 30; P.z = W.SHORE - 8; for (let i = 0; i < 30; i++) step(STEP); }
  else if (kind === 'dialog') { Story.start(); }
  else if (kind === 'bank') { const b = W.places.bank; P.x = b.x + 4; P.z = b.z + 3; for (let i = 0; i < 30; i++) step(STEP); }
  CAM.fx = G.body().x; CAM.fz = G.body().z;
}

window.addEventListener('error', (e) => { const el = $('autotest'); if (el && G.autotest) el.textContent += '\nERROR ' + e.message + ' @' + (e.filename || '').split('/').pop() + ':' + e.lineno; });

/* ?bench: world build time, simulation cost and draw cost at a few spots (for sizing the map) */
function runBench() {
  startGame(null); G.camMode = 'chase';
  const out = ['build ' + G.buildMs.toFixed(0) + ' ms · colliders ' + W.colliders.length + ' · trees ' + W.trees.length + ' · buildings ' + W.buildings.length + ' · nodes ' + W.nodes.length];
  const inst = []; G.scene.traverse((o) => { if (o.isInstancedMesh) { const g = o.geometry, t = (g.index ? g.index.count : g.attributes.position.count) / 3; inst.push(Math.round(t * o.count / 1000) + 'k' + (o.frustumCulled ? '' : '!') + (g.boundingSphere ? '' : '?')); } });
  out.push('instanced: ' + inst.length + ' meshes, biggest ' + inst.sort((a, b) => parseInt(b) - parseInt(a)).slice(0, 8).join(' '));
  const spots = [['city', W.places.spawn.x, W.places.spawn.z]].concat(W.benchSpots || []);
  for (const [name, x, z] of spots) {
    const P = G.player; P.x = x; P.z = z; W.collideCircle(P, P.r);
    for (let i = 0; i < 120; i++) step(STEP); // let traffic and people fill in
    const t0 = performance.now(); for (let i = 0; i < 600; i++) step(STEP); const stepMs = (performance.now() - t0) / 600;
    Weather.update(0.016, CAM.fx, 0, CAM.fz); persp.far = Math.min(2600, G.scene.fog.far + 25); persp.updateProjectionMatrix();
    const cam = updateCamera(0.016); renderer.info.autoReset = false; renderer.info.reset();
    const t1 = performance.now(); for (let i = 0; i < 5; i++) renderer.render(G.scene, cam); const drawMs = (performance.now() - t1) / 5;
    // where the triangles go: render again with one kind of object hidden at a time
    const kinds = { instanced: (o) => o.isInstancedMesh, merged: (o) => o.isMesh && !o.isInstancedMesh && o.frustumCulled === false, buildings: (o) => o.isMesh && (o.userData.buildings || Array.isArray(o.material)) };
    const split = [];
    for (const k in kinds) {
      const hid = []; G.scene.traverse((o) => { if (o.visible && kinds[k](o)) { o.visible = false; hid.push(o); } });
      renderer.info.reset(); renderer.render(G.scene, cam); split.push(k + ' ' + Math.round((renderer.info.render.triangles) / 1000) + 'k/' + renderer.info.render.calls);
      for (const o of hid) o.visible = true;
    }
    // and with the shadows, the cars or the people left out
    const objs = { cars: () => G.cars.filter((c) => !c.dead && c.mesh.visible).map((c) => c.mesh), people: () => G.npcs.filter((n) => !n.dead && n.rig.root.visible).map((n) => n.rig.root) };
    for (const k in objs) { const hid = objs[k](); for (const o of hid) o.visible = false; renderer.info.reset(); renderer.render(G.scene, cam); split.push(k + ' ' + Math.round(renderer.info.render.triangles / 1000) + 'k/' + renderer.info.render.calls); for (const o of hid) o.visible = true; }
    sun.castShadow = false; renderer.info.reset(); renderer.render(G.scene, cam); split.push('shadows ' + Math.round(renderer.info.render.triangles / 1000) + 'k/' + renderer.info.render.calls); sun.castShadow = true;
    if (location.search.includes('meshes')) { // which kinds of mesh are on screen (diagnostic)
      cam.updateMatrixWorld(); const fr = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse)), cnt = {};
      G.scene.traverseVisible((o) => { if (!o.isMesh && !o.isPoints) return; if (o.frustumCulled && o.geometry.boundingSphere !== undefined) { if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere(); const sp = o.geometry.boundingSphere.clone().applyMatrix4(o.matrixWorld); if (!fr.intersectsSphere(sp)) return; }
        let p = o, tag = ''; while (p.parent && p.parent !== G.scene) p = p.parent; tag = p === o ? 'top' : 'grp' + p.children.length;
        const k = tag + ' ' + o.geometry.type + '/' + (Array.isArray(o.material) ? 'multi' : o.material.type); cnt[k] = (cnt[k] || 0) + 1; });
      out.push('   meshes: ' + Object.entries(cnt).sort((a, b) => b[1] - a[1]).slice(0, 14).map(([k, v]) => k + ' ' + v).join(' · '));
    }
    renderer.info.reset(); for (let i = 0; i < 5; i++) renderer.render(G.scene, cam);
    out.push('   without: ' + split.join(' · '));
    const r = renderer.info.render; out.push(name.padEnd(10) + ' step ' + stepMs.toFixed(2) + ' ms' + (Phys.ready ? ' (physics cars ' + PhysCar.list.size + ', static bodies ' + Phys.statics.size + ')' : '') + ' · calls ' + Math.round(r.calls / 5) + ' · tris ' + Math.round(r.triangles / 5 / 1000) + 'k · cpu render ' + drawMs.toFixed(1) + ' ms · cars ' + G.cars.length + ' · npcs ' + G.npcs.length);
  }
  $('autotest').hidden = false; $('autotest').textContent = out.join('\n'); document.title = 'BENCH DONE';
}
