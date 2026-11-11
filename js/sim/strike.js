// ===================== 模拟·进攻：核包裹投送、常规导弹、小摩托、命中与损失 =====================
'use strict';

// ---------- 发货 ----------
function collectSlots(n, legs) {
  const k = multiK(n), slots = [];
  if (legs.pad && has(n, 'pad')) {
    for (const f of facOf(n, 'pad')) if (f.alive) for (let i = 0; i < f.missiles; i++) slots.push({ kind: 'rocket', src: f, cap: k, tile: f.tile, flight: rnd(7, 10) });
  }
  if (legs.sea && has(n, 'sea')) {
    for (const s of n.subs) if (s.state === 'out') for (let i = 0; i < s.rockets; i++) slots.push({ kind: 'rocket', src: s, sub: true, cap: k, tile: s.tile, flight: rnd(5, 8) * (n.mods.seaSpeed || 1) });
  }
  // 飞机只是前期的运载工具：投送站第一次装好火箭（rocketEra）之后就不再派飞机，火箭打完了就等装填；
  // 投送站全被打掉、也没有潜航器时，飞机才重新出来兜底
  const rocketSites = n.rocketEra && ((has(n, 'pad') && facOf(n, 'pad').some((f) => f.alive)) || (has(n, 'sea') && n.subs.length > 0));
  if (legs.ufo && !rocketSites && facOf(n, 'ufo').some((f) => f.alive)) {
    const base = facOf(n, 'ufo').find((f) => f.alive);
    for (let i = 0; i < n.ufoReady; i++) slots.push({ kind: 'ufo', src: base, cap: 1, tile: base.tile, flight: rnd(10, 14) });
  }
  return slots;
}
// 把发射槽按“发射点”轮流排列：每个发射点先出一发，再轮第二发……
function spreadOrder(slots) {
  const tiers = [slots.filter((s) => s.kind !== 'ufo'), slots.filter((s) => s.kind === 'ufo')];
  const out = [];
  for (const tier of tiers) {
    const groups = new Map();
    for (const s of shuffle(tier.slice())) {
      if (!groups.has(s.src)) groups.set(s.src, []);
      groups.get(s.src).push(s);
    }
    const lists = [...groups.values()];
    for (let i = 0; lists.some((l) => i < l.length); i++) for (const l of lists) if (i < l.length) out.push(l[i]);
  }
  return out;
}
// 发射位置在发射点附近随机偏一点，避免多发从同一个像素升起
function jitter(tile) {
  return { x: tile.x + rnd(-0.35, 0.35) * HEX_W, y: tile.y + rnd(-0.3, 0.3) * HEX_W };
}
function slotCapacity(n, legs) { return collectSlots(n, legs).reduce((s, x) => s + x.cap, 0); }
// 核包裹有库存就能发射：装好火箭的投送站、潜航器优先用（分弹头、更快），不够的部分直接从投送站/机场补发
// 1 级包裹不用研发（科技树里已去掉「普通件」，has(n,'lv1') 恒为真），所有国家开局就能投送
function deliverable(n, legs) { return bestLevel(n) && launchSites(n).length ? stock(n) : 0; }
function launchSites(n) {
  if (has(n, 'pad')) { const pads = facOf(n, 'pad').filter((f) => f.alive); if (pads.length) return pads.map((f) => ({ kind: 'rocket', tile: f.tile, flight: () => rnd(7, 10) })); }
  const air = facOf(n, 'ufo').filter((f) => f.alive);
  if (air.length) return air.map((f) => ({ kind: 'ufo', tile: f.tile, flight: () => rnd(10, 14) }));
  return n.cities.filter((c) => !c.ruined && c.pop > 0).map((c) => ({ kind: 'rocket', tile: c.tile, flight: () => rnd(7, 10) }));
}

function pickTargetTile(tgt) {
  const cities = tgt.cities.filter((c) => c.pop > 0.2);
  if (cities.length && chance(0.8)) {
    const c = pick(cities);
    // 偶尔偏一点，投送员也会迷糊
    if (chance(0.3)) {
      const nbs = G.world.nb(c.tile).filter((t) => t.owner === tgt.id);
      if (nbs.length) return pick(nbs);
    }
    return c.tile;
  }
  const own = G.world.tiles.filter((t) => t.owner === tgt.id);
  return own.length ? pick(own) : (cities[0] ? cities[0].tile : G.world.tiles[0]);
}

// count：指定发射数量（玩家点击发射）；不传则按 scale（AI 使用）
function launch(att, tgt, scale, legs, count) {
  if (!att.alive || !tgt.alive || att === tgt) return 0;
  const D = deliverable(att, legs);
  if (D <= 0) return 0;
  let N = count ? Math.min(count, D) : sendCount(D, scale);
  // 火箭（投送站 + 潜航器）优先，飞机补充；同一档里轮流从不同发射点出发——天女散花
  const slots = spreadOrder(collectSlots(att, legs));
  // 现成的运载不够：从投送站（或机场、城市）补发，不消耗运载工具
  const realCap = slots.reduce((k, s) => k + s.cap, 0);
  if (realCap < N) {
    const sites = shuffle(launchSites(att));
    for (let i = 0; i < N - realCap && sites.length; i++) {
      const site = sites[i % sites.length];
      slots.push({ kind: site.kind, src: site, cap: 1, tile: site.tile, flight: site.flight(), free: true });
    }
  }
  // 先给每枚火箭装 1 个包裹，让尽量多的发射点同时升空；发射点不够时才往同一枚火箭里加装（分装包裹）
  const carried = new Map(), leaders = new Map();
  let sent = 0, order = 0;
  const maxCap = slots.reduce((m, s) => Math.max(m, s.cap), 1);
  for (let j = 0; j < maxCap && N > 0; j++) {
    for (const s of slots) {
      if (N <= 0) break;
      if (j >= s.cap) continue;
      const lv = takeParcel(att);
      if (!lv) { N = 0; break; }
      const lead = leaders.get(s);
      let to = pickTargetTile(tgt);
      // 分弹头尽量打不同的地方，分离时才看得出“散开”
      for (let tries = 0; lead && to === lead.tile && tries < 4; tries++) to = pickTargetTile(tgt);
      if (lead) {
        // 分装包裹：和同一枚火箭里的第一个包裹一起升空，飞到中途再分离，各自飞向自己的目标
        lead.mirvLead = true;
        G.projectiles.push({
          id: G.pid++, kind: s.kind, lv, att: att.id, tgt: tgt.id,
          fx: lead.fx, fy: lead.fy, tile: to, tx: to.x, ty: to.y,
          arcH: lead.arcH, delay: lead.delay, flight: lead.flight,
          mirvOf: lead.id, bx: lead.tx, by: lead.ty, unstop: lead.unstop,
          t: 0, launched: false, done: false,
        });
      } else {
        const from = jitter(s.tile);
        const proj = {
          id: G.pid++, kind: s.kind, lv, att: att.id, tgt: tgt.id,
          fx: from.x, fy: from.y, tile: to, tx: to.x, ty: to.y,
          arcH: rnd(0.3, 0.62),                               // 弧线高低不一，尾迹像扇面一样散开
          delay: order * 0.07 + rnd(0, 0.5), flight: s.flight * rnd(0.92, 1.08),
          t: 0, launched: false, done: false, unstop: att.harpoonT > 0,
        };
        G.projectiles.push(proj);
        leaders.set(s, proj);
      }
      carried.set(s, (carried.get(s) || 0) + 1);
      N--; sent++; order++;
    }
  }
  for (const s of carried.keys()) {
    if (s.free) continue; // 补发的不消耗运载工具
    if (s.kind === 'ufo') { att.ufoReady--; att.ufoReturn.push(G.t + s.flight * 2); }
    else if (s.sub) s.src.rockets--;
    else s.src.missiles--;
  }
  if (sent) {
    att.stats.sent += sent;
    att.lastStrike = G.t; att.lastAttack = G.t;
    tgt.anger[att.id] += 12;
    markHostile(att, tgt);
    Bus.emit('launchOrder', { att, tgt, sent });
    news(`${att.race.emoji}${att.name} 向 ${tgt.race.emoji}${tgt.name} 投送了 ${sent} 个包裹`);
  }
  return sent;
}

// ---------- 常规导弹 ----------
const convSalvo = (n, scale) => Math.min(n.conv, CONV.salvo[scale], CONV.perLaunch);
function launchConv(att, tgt, scale, count) {
  if (!att.alive || !tgt.alive || att === tgt || (att.convCd > 0 && !att.isPlayer)) return 0; // 人类玩家没有装填间隔：有库存就能发
  const N = count ? Math.min(count, att.conv, CONV.perLaunch) : convSalvo(att, scale);
  if (N <= 0) return 0;
  // 从投送站或城市发射
  // 投送站、城市、出海的潜航器都能发射常规导弹，轮流使用不同发射点
  const origins = shuffle([
    ...facOf(att, 'pad').filter((f) => f.alive).map((f) => f.tile),
    ...att.cities.filter((c) => !c.ruined && c.pop > 0).map((c) => c.tile),
    ...att.subs.filter((s) => s.state === 'out').map((s) => s.tile),
  ]);
  if (!origins.length) return 0;
  for (let i = 0; i < N; i++) {
    const from = jitter(origins[i % origins.length]), to = pickTargetTile(tgt);
    G.projectiles.push({
      id: G.pid++, kind: 'conv', lv: 0, att: att.id, tgt: tgt.id,
      fx: from.x, fy: from.y, tile: to, tx: to.x, ty: to.y,
      arcH: rnd(0.1, 0.24),
      delay: i * 0.09 + rnd(0, 0.25), flight: rnd(...CONV.flight), t: 0, launched: false, done: false,
    });
  }
  att.conv -= N; att.convCd = CONV.cd; att.lastAttack = G.t;
  att.stats.convSent = (att.stats.convSent || 0) + N;
  tgt.anger[att.id] += 3;
  markHostile(att, tgt);
  Bus.emit('launchOrder', { att, tgt, sent: N, conv: true });
  return N;
}
function convExplode(tile, att) {
  const losses = new Map();
  if (tile.city && tile.city.pop > 0) {
    const c = tile.city, owner = G.nations[c.nation];
    let frac = CONV.dmg * (G.midnight ? 1.5 : 1) * takenMul(owner);
    if (owner.shieldT > 0) frac *= 1 - (owner.mods.shield || SKILLS.shield.reduce);
    const loss = c.pop * frac;
    c.pop -= loss;
    if (c.pop < c.basePop * 0.35) { c.ruined = true; c.rebuild = 0; }
    losses.set(owner.id, loss);
    Bus.emit('cityHit', { city: c, loss });
  }
  if (tile.fac && tile.fac.alive) {
    const f = tile.fac, owner = G.nations[f.nation];
    if (chance(CONV.facChance * (owner.shieldT > 0 ? 0.5 : 1))) knockFacility(f, owner);
  }
  applyLosses(losses, att, 0.5);
  Bus.emit('convExplode', { tile, att });
  for (const n of G.nations) if (n.alive && totalPop(n) < CFG.DEATH_POP) eliminate(n);
}

// ---------- 无人机 ----------
// 70% 瞄准设施（投送站、机场、海底仓），其余打城市
function pickDroneTile(tgt) {
  const facs = tgt.facilities.filter((f) => f.alive);
  if (facs.length && chance(DRONE.facBias)) return pick(facs).tile;
  return pickTargetTile(tgt);
}
function launchDrones(att, tgt, count) {
  if (!att.alive || !tgt || !tgt.alive || att === tgt || (att.droneCd > 0 && !att.isPlayer)) return 0;
  const N = Math.min(count | 0, att.drones);
  if (N <= 0) return 0;
  // 从机场、投送站和城市成群起飞
  const origins = shuffle([
    ...att.facilities.filter((f) => f.alive && f.type !== 'sea').map((f) => f.tile),
    ...att.cities.filter((c) => !c.ruined && c.pop > 0).map((c) => c.tile),
  ]);
  if (!origins.length) return 0;
  for (let i = 0; i < N; i++) {
    const from = jitter(origins[i % origins.length]), to = pickDroneTile(tgt);
    G.projectiles.push({
      id: G.pid++, kind: 'drone', lv: 0, att: att.id, tgt: tgt.id,
      fx: from.x, fy: from.y, tile: to, tx: to.x + rnd(-4, 4), ty: to.y + rnd(-3, 3),
      wob: rnd(0, 6.28), delay: i * 0.12 + rnd(0, 0.4), flight: rnd(...DRONE.flight), t: 0, launched: false, done: false,
    });
  }
  att.drones -= N; att.droneCd = DRONE.cd; att.lastAttack = G.t;
  att.stats.dronesSent += N;
  tgt.anger[att.id] += 2;
  markHostile(att, tgt);
  Bus.emit('launchOrder', { att, tgt, sent: N, drone: true });
  return N;
}
function droneExplode(tile, att) {
  const losses = new Map();
  if (tile.fac && tile.fac.alive) {
    const f = tile.fac, owner = G.nations[f.nation];
    if (chance(DRONE.facChance)) knockFacility(f, owner);
  }
  if (tile.city && tile.city.pop > 0) {
    const c = tile.city, owner = G.nations[c.nation], loss = c.pop * DRONE.cityDmg * takenMul(owner);
    c.pop -= loss;
    losses.set(owner.id, loss);
    Bus.emit('cityHit', { city: c, loss });
  }
  applyLosses(losses, att, 0.3);
  Bus.emit('droneExplode', { tile, att });
  for (const n of G.nations) if (n.alive && totalPop(n) < CFG.DEATH_POP) eliminate(n);
}

const isThreat = (p) => p.kind !== 'drone';

function takeParcel(n) {
  for (let lv = 5; lv >= 1; lv--) if (n.parcels[lv] > 0) { n.parcels[lv]--; return lv; }
  return 0;
}

function stepProjectiles(dt) {
  for (const n of G.nations) if (n.alive) assignLocks(n);
  for (const p of G.projectiles) {
    if (p.done || p.kind === 'guard') continue; // 升空拦截的小摩托单独移动（stepAir）
    p.t += dt;
    if (!p.launched && p.t >= p.delay) { p.launched = true; Bus.emit('launch', p); }
    if (!p.launched) continue;
    const u = (p.t - p.delay) / p.flight;
    if (p.kind === 'drone' && u > 0.5) { // 无人机飞进开着护盾的国土，直接被护盾摧毁
      const tg = G.nations[p.tgt];
      if (tg.alive && tg.shieldT > 0 && nearHome(p, tg)) { p.done = true; tg.stats.blocked = (tg.stats.blocked || 0) + 1; Bus.emit('shieldBlock', p); continue; }
    }
    // 锁定后约 1 秒迎击（快落地时立刻迎击），让玩家看得到锁定波纹
    if (p.locked && !p.engaged && (G.t - p.lockSimT >= CFG.LOCK_TO_HIT || u >= 0.95)) { p.engaged = true; engage(p); if (p.done) continue; }
    if (u >= 1) { p.done = true; arrive(p); }
  }
  G.projectiles = G.projectiles.filter((p) => !p.done);
}

function arrive(p) {
  const att = G.nations[p.att], tgt = G.nations[p.tgt];
  // 护盾：常规导弹全部挡下
  if (tgt.alive && tgt.shieldT > 0 && p.kind === 'conv') {
    tgt.stats.blocked = (tgt.stats.blocked || 0) + 1;
    Bus.emit('shieldBlock', p);
    return;
  }
  if (p.kind === 'conv') { convExplode(p.tile, att); return; }
  if (p.kind === 'drone') { droneExplode(p.tile, att); return; }
  if (!p.unstop && chance(PARCELS[p.lv].fizzle + (att.mods.fizzle || 0))) {
    Bus.emit('fizzle', p);
    if (chance(0.3)) news(`一个包裹被 ${tgt.name} 拒收了，投送员表示很委屈`);
    return;
  }
  att.stats.delivered++;
  explode(p.tile, p.lv, att);
}

function explode(tile, lv, att) {
  const P = PARCELS[lv], R = P.r, W = G.world;
  const losses = new Map();
  for (const t2 of W.tiles) {
    const d = hexDist(t2, tile);
    if (d > R + 1) continue;
    t2.rad = Math.min(1.5, t2.rad + P.fx * 0.22 * (1 - d / (R + 2)));
    if (d > R) continue;
    if (t2.city && t2.city.pop > 0) {
      const c = t2.city, owner = G.nations[c.nation];
      let frac = Math.min(0.97, P.dmg * (R === 0 ? 1 : 1 - (d / (R + 1)) * 0.6) * nukeMul());
      if (owner.shieldT > 0) frac *= 1 - (owner.mods.shield || SKILLS.shield.reduce);
      frac = Math.min(0.97, frac * (owner.mods.nukeArmor || 1) * takenMul(owner)); // 吃土：皮糙肉厚；三体乱纪元：伤害加重
      const loss = c.pop * frac;
      c.pop -= loss;
      if (owner.shieldT <= 0 && ((d === 0 && lv >= 2) || c.pop < c.basePop * 0.35)) { c.ruined = true; c.rebuild = 0; }
      losses.set(owner.id, (losses.get(owner.id) || 0) + loss);
      Bus.emit('cityHit', { city: c, loss });
    }
    if (t2.fac && t2.fac.alive) {
      const f = t2.fac, owner = G.nations[f.nation];
      if (owner.shieldT <= 0) knockFacility(f, owner); // 护盾下设施不会宕机
    }
  }
  applyLosses(losses, att, 1);
  Bus.emit('explode', { tile, lv, att });
  for (const n of G.nations) if (n.alive && totalPop(n) < CFG.DEATH_POP) eliminate(n);
}

// 记录“谁最近一次打了谁”：b.hostileAt[a] = a 最近一次攻击 b 的时间。
// b 对 a 的怒气，只在 a 停手一段时间后才回落（b 自己还在打 a 不影响它冷静下来）
// 核弹威力倍率：午夜 ×1.25，之后每 2 分钟 +10%，最多 ×2.5
function nukeMul() {
  if (!G.midnight) return 1;
  return Math.min(CFG.ESC_MAX, CFG.ESC_START + CFG.ESC_STEP * Math.floor((G.t - CFG.MIDNIGHT) / CFG.ESC_EVERY));
}
// 午夜后的核武产出倍率：×3.5，之后每次末日升级再 +10%（不封顶）
function midnightProd() {
  if (!G.midnight) return 1;
  return CFG.MIDNIGHT_PROD * (1 + CFG.ESC_PROD * Math.floor((G.t - CFG.MIDNIGHT) / CFG.ESC_EVERY));
}
function markHostile(a, b) { b.hostileAt[a.id] = G.t; }
// x 多少秒前攻击过 n（没攻击过返回 Infinity）
const attackedAgo = (x, n) => (n && n.hostileAt && n.hostileAt[x.id] !== undefined ? G.t - n.hostileAt[x.id] : Infinity);
const recentAttacker = (x) => x !== G.player && x.alive && attackedAgo(x, G.player) <= CFG.ATTACKER_MARK;
function knockFacility(f, owner) {
  f.alive = false; f.missiles = 0; f.rebuild = 0;
  if (f.type === 'ufo') owner.ufoReady = 0;
  if (f.type === 'sea') owner.subs = owner.subs.filter((s) => s.state === 'out');
  Bus.emit('facDown', f);
}
// 结算伤亡：统计、复仇基金、怒气、AI 报复
function applyLosses(losses, att, angerMul) {
  for (const [vid, loss] of losses) {
    const v = G.nations[vid];
    v.stats.lost += loss; att.stats.caused += loss;
    v.bank = Math.min(CFG.BANK_CAP, v.bank + loss * CFG.REVENGE_BANK);
    v.energy = Math.min(CFG.ENERGY_CAP, v.energy + loss * CFG.REVENGE_ENERGY);
    v.lastHit = G.t; v.lastAttacker = att.id;
    if (vid !== att.id) {
      v.anger[att.id] += (10 + loss * 1.5) * angerMul;
      if (!v.isPlayer && !v.retaliate) v.retaliate = { target: att.id, at: G.t + rnd(...PERSONALITIES[v.pers].react) * G.diff.react };
    }
  }
}

function eliminate(n) {
  n.alive = false;
  n.diedAt = G.t;
  for (const c of n.cities) { c.pop = 0; c.ruined = true; }
  for (const f of n.facilities) f.alive = false;
  n.subs = []; n.ufoReady = 0;
  news(`💀 ${n.race.emoji}${n.name} 已被核平。领袖遗言：“${n.race.lines.dead}”`);
  Bus.emit('eliminated', n);
}
