// ===================== 模拟·防御：近防炮、空战、拦截锁定、护盾/拦截技能、大招、重建 =====================
'use strict';

// ---------- 近防炮：自动打飞进本国领土的无人机 ----------
// 和护盾共用能量，但能量低于开一次护盾所需时自动停火，护盾永远开得出来
function stepCiws(n, dt) {
  n.ciwsT = Math.max(0, n.ciwsT - dt);
  if (n.ciwsT > 0 || (n.isPlayer && !n.autoCiws) || n.hackT > 0) return;
  if (n.energy - CIWS.cost < COSTS.shield) return;
  let best = null, bestLeft = Infinity;
  for (const p of G.projectiles) {
    if (p.kind !== 'drone' || p.tgt !== n.id || !p.launched || p.done || !nearHome(p, n)) continue;
    const left = p.delay + p.flight - p.t;
    if (left < bestLeft) { bestLeft = left; best = p; }
  }
  if (!best) return;
  n.energy -= CIWS.cost; n.ciwsT = CIWS.interval;
  const hit = chance(CIWS.hit * (n.mods.ciws || 1));
  Bus.emit('ciws', { n, p: best, hit });
  if (hit) { best.done = true; n.stats.ciwsKills++; }
}
// ---------- 空战：小摩托互打 + 升空拦截 ----------
// 空中位置：来袭的小摩托沿直线飞（和画面一致，忽略轻微摆动）；升空拦截的小摩托记录自己的坐标
function airPos(p) {
  if (p.kind === 'guard') return { x: p.fx, y: p.fy };
  const u = clamp((p.t - p.delay) / p.flight, 0, 1);
  return { x: lerp(p.fx, p.tx, u), y: lerp(p.fy, p.ty, u) };
}
function stepAir(dt) {
  const fighters = [];
  for (const p of G.projectiles) {
    if (p.done) continue;
    if (p.kind === 'guard') { moveGuard(p, dt); if (!p.done && p.fade === undefined) fighters.push(p); }
    else if (p.kind === 'drone' && p.launched) fighters.push(p);
  }
  if (fighters.length < 2) return;
  // 按交战距离分格，只和相邻格子里的比较
  const R = DOG.range, cells = new Map();
  for (const p of fighters) {
    p.fightT = Math.max(0, (p.fightT || 0) - dt);
    const q = airPos(p); p._x = q.x; p._y = q.y;
    const key = Math.floor(q.x / R) * 4096 + Math.floor(q.y / R);
    if (!cells.has(key)) cells.set(key, []);
    cells.get(key).push(p);
  }
  for (const p of fighters) {
    if (p.done || p.fightT > 0) continue;
    const cx = Math.floor(p._x / R), cy = Math.floor(p._y / R);
    let foe = null, bd = R;
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      for (const o of cells.get((cx + dx) * 4096 + cy + dy) || []) {
        if (o === p || o.done || o.att === p.att || o.fightT > 0) continue;
        // 升空拦截的小摩托只和自己盯住的那一架交战，不被路过的小摩托打断
        if (p.kind === 'guard' && o.id !== p.prey) continue;
        if (o.kind === 'guard' && p.id !== o.prey) continue;
        const d = Math.hypot(o._x - p._x, o._y - p._y);
        if (d < bd) { bd = d; foe = o; }
      }
    }
    if (!foe) continue;
    const ka = chance(DOG.hit), kb = chance(DOG.hit);
    p.fightT = foe.fightT = DOG.interval;
    if (ka) { foe.done = true; G.nations[p.att].stats.dogKills++; }
    if (kb) { p.done = true; G.nations[foe.att].stats.dogKills++; }
    Bus.emit('dogfight', { a: p, b: foe, ka, kb });
  }
}
// 升空拦截：敌方小摩托飞进本国领土，库存里的小摩托自动起飞，同时最多 4 架，每架盯一个目标
function scramble(n, dt) {
  n.scrambleT = Math.max(0, n.scrambleT - dt);
  if (n.scrambleT > 0 || (n.isPlayer && !n.autoScramble) || n.drones <= 0 || n.hackT > 0) return;
  n.scrambleT = 0.3; // 没有目标时每 0.3 秒看一眼
  let active = 0;
  const hunted = new Set();
  for (const p of G.projectiles) if (p.kind === 'guard' && !p.done && p.fade === undefined) { if (p.att === n.id) active++; hunted.add(p.prey); }
  for (const p of G.projectiles) {
    if (active >= GUARD.max || n.drones <= 0) break;
    if (p.kind !== 'drone' || p.tgt !== n.id || !p.launched || p.done || hunted.has(p.id) || !nearHome(p, n)) continue;
    if (p.delay + p.flight - p.t < 4) continue; // 来不及拦了就不起飞，免得白白消耗
    if (launchGuard(n, p)) { n.scrambleT = GUARD.every; break; } // 起飞有节奏，每次只起飞 1 架
  }
}
function launchGuard(n, prey) {
  // 从机场起飞（有一段明显的出击、迎击、返航航线）；机场被炸了才用离敌机最近的城市或设施
  const q = airPos(prey), air = facOf(n, 'ufo').find((f) => f.alive);
  let home = air ? air.tile : null, bd = Infinity;
  const consider = (tile) => { const d = Math.hypot(tile.x - q.x, tile.y - q.y); if (d < bd) { bd = d; home = tile; } };
  if (!home) {
    for (const f of n.facilities) if (f.alive) consider(f.tile);
    for (const c of n.cities) if (!c.ruined && c.pop > 0) consider(c.tile);
  }
  if (!home) return false;
  n.drones--;
  const g = { id: G.pid++, kind: 'guard', lv: 0, att: n.id, tgt: -1, prey: prey.id, tile: home,
    fx: home.x, fy: home.y, bx: home.x, by: home.y, tx: home.x, ty: home.y,
    delay: 0, flight: 1, t: 0, launched: true, done: false, wob: rnd(0, 6.28) };
  G.projectiles.push(g);
  Bus.emit('scramble', g);
  return true;
}
function moveGuard(g, dt) {
  const n = G.nations[g.att];
  if (!n.alive) { g.done = true; return; }
  g.bx = g.fx; g.by = g.fy; // 上一步的位置（画面插值用）
  if (g.fade !== undefined) { // 自毁中：顺着原方向滑行一小段，淡出后消失
    g.fade -= dt;
    g.fx += Math.cos(g.dir || 0) * GUARD.speed * 0.5 * dt; g.fy += Math.sin(g.dir || 0) * GUARD.speed * 0.5 * dt;
    if (g.fade <= 0) { g.done = true; Bus.emit('guardGone', g); }
    return;
  }
  let prey = G.projectiles.find((p) => p.id === g.prey && !p.done);
  if (!prey) { // 目标被别的打下了 / 已经落地：找下一架还没人盯的
    const busy = new Set(G.projectiles.filter((o) => o.kind === 'guard' && !o.done && o.fade === undefined && o !== g).map((o) => o.prey));
    prey = G.projectiles.find((p) => p.kind === 'drone' && p.tgt === n.id && p.launched && !p.done && !busy.has(p.id) && nearHome(p, n) && p.delay + p.flight - p.t > 1.5);
    if (prey) g.prey = prey.id;
  }
  // 没有目标，或者追得离起飞点太远：在空中自毁（起飞就已经消耗，不返航）
  if (!prey || hexDist(pixelToHex(g.fx, g.fy), g.tile) > GUARD.leash) { g.fade = 0.6; return; }
  const to = airPos(prey), dx = to.x - g.fx, dy = to.y - g.fy, d = Math.hypot(dx, dy), step = GUARD.speed * dt;
  if (d > 0) { const k = Math.min(1, step / d); g.fx += dx * k; g.fy += dy * k; g.dir = Math.atan2(dy, dx); }
}


// ---------- 拦截：锁定 → 空中迎击 ----------
// 拦截开启时，每枚拦截弹锁定一个来袭目标（先到先锁）。
// 只锁定已经接近或飞入本国领土的目标：地面投影在本国领土上，或距离落点不超过 3 格
function nearHome(p, n) {
  const u = clamp((p.t - p.delay) / p.flight, 0, 1);
  const h = pixelToHex(lerp(p.fx, p.tx, u), lerp(p.fy, p.ty, u));
  if (h.c < 0 || h.r < 0 || h.c >= CFG.MAP_COLS || h.r >= CFG.MAP_ROWS) return false;
  return G.world.T(h.c, h.r).owner === n.id || hexDist(h, p.tile) <= CFG.LOCK_RANGE;
}
function assignLocks(n) {
  const active = n.netT > 0 && n.netCharges > 0;
  let locked = 0, bigInbound = false;
  const free = [];
  for (const p of G.projectiles) {
    if (p.tgt !== n.id || !p.launched || p.done || p.engaged || p.unstop) continue;
    if (!active) { p.locked = false; continue; }
    if (p.kind !== 'drone') bigInbound = true;
    if (p.locked) locked++; else if (nearHome(p, n)) free.push(p);
  }
  if (!active || !free.length) return;
  // 优先级：核弹 > 导弹 > 无人机；有更大的威胁正在飞来时，拦截弹不去打无人机
  const rank = (p) => (p.kind === 'drone' ? 2 : p.kind === 'conv' ? 1 : 0);
  free.sort((a, b) => rank(a) - rank(b) || (a.delay + a.flight - a.t) - (b.delay + b.flight - b.t));
  if (bigInbound) for (let i = free.length - 1; i >= 0; i--) if (free[i].kind === 'drone') free.splice(i, 1);
  for (const p of free) {
    if (locked >= n.netCharges) break;
    p.locked = true; p.lockSimT = G.t; locked++;
    Bus.emit('lock', p);
  }
}
function engage(p) {
  const tgt = G.nations[p.tgt];
  if (!tgt.alive || tgt.netCharges <= 0) { p.locked = false; return; }
  tgt.netCharges--;
  if (chance(netChance(tgt) * (p.kind === 'drone' ? DRONE.netMul : 1) * (G.nations[p.att].mods.evade || 1))) {
    tgt.stats.intercepted++;
    p.done = true;
    Bus.emit('intercept', p);
  } else {
    p.locked = false;
    Bus.emit('netMiss', p);
  }
}
// 自动拦截：只要有来袭、拦截弹没在工作，就自动开启
function autoNet(n) {
  if (n.netT > 0 && n.netCharges > 0) return;
  if (G.projectiles.some((p) => p.tgt === n.id && p.launched && !p.done && !p.engaged && !p.unstop && isThreat(p))) useNet(n);
}

// ---------- 技能 ----------
function useShield(n) {
  if (!n.alive || n.hackT > 0 || n.shieldCd > 0 || n.energy < COSTS.shield) return false;
  n.energy -= COSTS.shield; n.shieldT = SKILLS.shield.dur; n.shieldCd = SKILLS.shield.cd * (n.mods.shieldCd || 1);
  Bus.emit('skill', { n, kind: 'shield' }); return true;
}
const netChance = (n) => (has(n, 'net') ? SKILLS.net.chanceUp : SKILLS.net.chance);
const netMax = (n) => (has(n, 'net') ? SKILLS.net.chargesUp : SKILLS.net.charges);
function useNet(n) {
  if (!n.alive || n.hackT > 0 || n.netCd > 0 || n.energy < COSTS.net) return false;
  n.energy -= COSTS.net; n.netT = SKILLS.net.dur; n.netCd = SKILLS.net.cd;
  n.netCharges = netMax(n);
  Bus.emit('skill', { n, kind: 'net' }); return true;
}
// ---------- 国家大招 ----------
// tgt：需要目标的大招（断网攻击、盾后突刺的后备目标）使用
function ultNeedsTarget(n) { return n.race.id === 'ai'; }
function useUlt(n, tgt) {
  if (!n.alive || n.ultCd > 0) return false;
  const U = n.race.ult, id = n.race.id;
  if (tgt && (!tgt.alive || tgt === n)) tgt = null;
  if (id === 'human') n.overtimeT = U.dur;
  else if (id === 'mole') {
    n.shieldT = Math.max(n.shieldT, SKILLS.shield.dur);
    const foe = G.nations[n.lastAttacker];
    const t2 = foe && foe.alive && foe !== n ? foe : tgt;
    if (t2) { n.conv += 6; n.convCd = 0; launchConv(n, t2, 0, 6); }
  } else if (id === 'octopus') {
    n.harpoonT = U.dur;
    const base = facOf(n, 'sea')[0];
    if (has(n, 'sea') && base && base.alive && !n.subs.length) n.subs.push({ state: 'dock', timer: 0, rockets: 0, tile: base.tile });
    for (const s of n.subs) {
      if (s.state !== 'out') { s.state = 'out'; s.tile = pickSeaTile(base ? base.tile : s.tile); }
      s.rockets = CFG.SEA_CAP;
    }
  } else if (id === 'mushroom') {
    for (const t of G.world.tiles) {
      if (t.owner < 0 || !G.nations[t.owner].alive) continue;
      t.rad = Math.min(1.5, t.rad + (t.owner === n.id ? 0.5 : 0.95));
    }
    n.lastAttack = G.t; // 扬沙算出手（不算隔岸观火），但不直接拉仇恨
  } else if (id === 'ai') {
    if (!tgt) return false;
    tgt.hackT = U.dur; tgt.shieldT = 0; tgt.netT = 0; tgt.netCharges = 0;
    const loot = tgt.bank * 0.3;
    tgt.bank -= loot; n.bank = Math.min(CFG.BANK_CAP, n.bank + loot);
    tgt.anger[n.id] += 15; markHostile(n, tgt); n.lastAttack = G.t;
  } else if (id === 'roach') {
    for (const c of n.cities) { c.ruined = false; c.rebuild = 0; c.pop = Math.max(c.pop, c.basePop * 0.35); }
    for (const f of n.facilities) if (!f.alive) { f.alive = true; f.rebuild = 0; Bus.emit('rebuilt', f); }
  }
  n.ultCd = U.cd; n.stats.ult++;
  news(`${U.icon} ${n.race.emoji}${n.name} 发动大招【${U.name}】${tgt && id === 'ai' ? ' → ' + tgt.race.emoji + tgt.name : ''}`);
  Bus.emit('ult', { n, tgt });
  return true;
}

function rebuildCity(n, c) {
  if (!n.alive || !c.ruined || c.rebuild > 0 || n.energy < COSTS.rebuild) return false;
  n.energy -= COSTS.rebuild; c.rebuild = CFG.REBUILD_TIME;
  c.pop = Math.max(c.pop, 0.3);
  n.stats.rebuilt++;
  Bus.emit('skill', { n, kind: 'rebuild', city: c }); return true;
}
function rebuildFac(n, f) {
  if (!n.alive || f.alive || f.rebuild > 0 || n.bank < COSTS.facility) return false;
  n.bank -= COSTS.facility; f.rebuild = CFG.REBUILD_TIME;
  Bus.emit('skill', { n, kind: 'rebuildFac', fac: f }); return true;
}
// 一键重建：先修城市（能量），再修设施（预算）
function rebuildAll(n) {
  let k = 0;
  const cities = n.cities.filter((c) => c.ruined && c.rebuild <= 0).sort((a, b) => b.basePop - a.basePop);
  for (const c of cities) if (rebuildCity(n, c)) k++;
  for (const f of n.facilities) if (!f.alive && f.rebuild <= 0 && rebuildFac(n, f)) k++;
  return k > 0;
}
function incomingFor(n) {
  return G.projectiles.filter((p) => p.tgt === n.id && p.launched && !p.done)
    .map((p) => ({ p, left: p.delay + p.flight - p.t }))
    .sort((a, b) => a.left - b.left);
}
// 自动重建（玩家）：始终给护盾留够能量，不和手动护盾抢
function autoRebuild(n) {
  const ruined = n.cities.filter((c) => c.ruined && c.rebuild <= 0).sort((a, b) => b.basePop - a.basePop);
  for (const c of ruined) {
    if (n.energy < COSTS.rebuild + COSTS.shield) break;
    rebuildCity(n, c);
  }
  for (const f of n.facilities) if (!f.alive && f.rebuild <= 0) rebuildFac(n, f);
}
// 自动防御（AI）：少量来袭用拦截，大量来袭或核包裹多时开护盾
function autoDefend(n) {
  const inc = incomingFor(n);
  const soon = inc.filter((x) => x.left < 4);
  if (soon.length) {
    const nukes = soon.filter((x) => x.p.kind !== 'conv' && x.p.kind !== 'drone').length;
    const drones = soon.filter((x) => x.p.kind === 'drone').length;
    const heavy = inc.filter((x) => isThreat(x.p)).length > netMax(n) || nukes >= 2 || drones >= 10;
    if (heavy && n.shieldT <= 0) useShield(n);
  }
  if (!n.isPlayer || n.autoNet) autoNet(n);
  if (!inc.length && n.energy > COSTS.rebuild + COSTS.shield) rebuildAll(n);
}
