// ===================== 模拟：经济、发货、爆炸、技能 =====================
'use strict';

const Bus = {
  h: {},
  on(type, fn) { (this.h[type] = this.h[type] || []).push(fn); },
  emit(type, data) { (this.h[type] || []).forEach((fn) => fn(data)); },
};

let G = null;

// mp：联机参数 { humans: [国家 id], ids: {国家 id: 玩家连接 id}, seed?, raceIds? }
//   房主不传 seed/raceIds（随机生成）；客户端用房主发来的 seed + raceIds 生成一模一样的世界
function newGame(playerRaceId, aiCount, diff = 'normal', mp = null) {
  const humans = mp ? mp.humans : [playerRaceId];
  let raceIds = mp && mp.raceIds, seed = mp && mp.seed;
  if (!raceIds) {
    const others = shuffle(RACES.map((r) => r.id).filter((id) => !humans.includes(id))).slice(0, aiCount);
    raceIds = shuffle([...humans, ...others]);
    seed = (Math.random() * 1e9) | 0;
  }
  const world = generateWorld(seed, raceIds, humans);
  setSeed(seed ^ 0x5bd1e995);
  const persKeys = shuffle(Object.keys(PERSONALITIES));
  const nations = world.nations;
  nations.forEach((n, i) => {
    Object.assign(n, {
      alive: true,
      pers: n.isPlayer ? null : persKeys[i % persKeys.length],
      alloc: { tech: 0.5, nuke: 0.3, def: 0.2 },
      techPts: 0, techIdx: 0,
      bank: 0, energy: 40,
      parcels: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      ufoReady: 2, ufoReturn: [],
      conv: 3, convCd: 0,
      heat: CFG.HEAT_START, lastAttack: -999, intelUntil: -1, intelCd: -1, hostileAt: {},
      subs: [],
      anger: nations.map(() => rnd(5, 20)),
      shieldT: 0, shieldCd: 0, netT: 0, netCd: 0, netCharges: 0,
      lastHit: -99, lastAttacker: -1, retaliate: null, lastStrike: -99,
      aiNext: rnd(1, 3),
      autoNet: true, autoRebuild: true,
      ultCd: ULT_FIRST, overtimeT: 0, harpoonT: 0, hackT: 0,
      stats: { ult: 0, sent: 0, delivered: 0, caused: 0, lost: 0, intercepted: 0, rebuilt: 0, peakPop: 0 },
    });
    n.anger[i] = -1e9;
    n.mods = n.race.mods;
    n.isPlayer = humans.includes(n.race.id); // 不依赖地图生成的标记，避免新旧脚本混用时没有真人
    n.netId = mp && mp.ids ? mp.ids[n.race.id] : null;
    const custom = mp && mp.names && cleanName(mp.names[n.race.id]);
    if (custom) n.name = custom; // 联机自定义国家名
  });
  G = {
    t: 0, speed: 1, world, nations, projectiles: [],
    player: nations.find((n) => n.race.id === playerRaceId),
    mp: !!mp, seed, raceIds,
    over: null, midnight: false, nextEvent: rnd(60, 90), pid: 0,
    selTarget: -1, scale: 1, legs: { pad: true, sea: true, ufo: true },
    newsQueue: [], diff: DIFFS[diff] || DIFFS.normal,
  };
  news(`${fmtDate(0)}：世界和平，一切安好。暂时。`);
  return G;
}

// ---------- 工具 ----------
const techIndex = (id) => TECHS.findIndex((t) => t.id === id);
const has = (n, id) => n.techIdx > techIndex(id);
function bestLevel(n) {
  let lv = 0;
  for (let k = 1; k <= 5; k++) if (has(n, 'lv' + k)) lv = k;
  return lv;
}
const totalPop = (n) => n.cities.reduce((s, c) => s + c.pop, 0);
const stock = (n) => n.parcels[1] + n.parcels[2] + n.parcels[3] + n.parcels[4] + n.parcels[5];
const facOf = (n, type) => n.facilities.filter((f) => f.type === type);
const multiK = (n) => (has(n, 'multi') ? 3 : 1);
function fmtDate(t) {
  const m = Math.floor(t);
  return `${1945 + Math.floor(m / 12)}年${(m % 12) + 1}月`;
}
function news(text) { G.newsQueue.push(text); Bus.emit('news', text); }
// 弱势加成：人口低于存活国家平均值时，产出最多 ×2.5
function underdog(n) {
  if (G.midnight) return 1; // 午夜狂欢：弱势加成取消
  const alive = G.nations.filter((x) => x.alive);
  if (alive.length < 2) return 1;
  const avg = alive.reduce((s, x) => s + totalPop(x), 0) / alive.length;
  const ratio = avg > 0 ? totalPop(n) / avg : 1;
  return clamp(1 + (1 - ratio) * 2, 1, CFG.UNDERDOG_MAX);
}
// 军工效率：冷工厂 ×0.4，满热 ×1.4
const heatEff = (n) => CFG.HEAT_MIN + (CFG.HEAT_MAX - CFG.HEAT_MIN) * n.heat;
function production(n) {
  let p = 0;
  for (const c of n.cities) p += c.pop * (c.ruined ? CFG.RUIN_PROD : 1);
  return (p * CFG.PROD_PER_POP + CFG.PROD_BASE) * underdog(n)
    * (n.overtimeT > 0 ? 1.6 : 1)              // 卷王大招：加班
    * (n.isPlayer ? 1 : G.diff.prod);        // AI 难度
}
const sendCount = (D, scale) => (D <= 0 ? 0 : scale === 0 ? 1 : scale === 1 ? Math.ceil(D / 2) : D);

// ---------- 主步进 ----------
function simStep(dt) {
  if (G.over) return;
  G.t += dt;
  for (const n of G.nations) if (n.alive) stepNation(n, dt);
  stepProjectiles(dt);
  stepTiles(dt);
  stepEvents();
  for (const n of G.nations) if (n.alive && !n.isPlayer) aiStep(n, dt);
  for (const n of G.nations) {
    if (!n.alive || !n.isPlayer) continue;
    if (n.autoNet) autoNet(n);
    if (n.autoRebuild) autoRebuild(n);
  }
  checkEnd();
}

function stepNation(n, dt) {
  const prod = production(n);
  // 科技
  if (n.techIdx < TECHS.length) {
    n.techPts += prod * n.alloc.tech * (n.mods.tech || 1) * dt;
    const tech = TECHS[n.techIdx];
    if (n.techPts >= tech.cost) {
      n.techPts -= tech.cost; n.techIdx++;
      Bus.emit('tech', { n, tech });
      if (tech.id === 'lv5') news(`${n.race.emoji}${n.name} 解锁了【终极核平·东风】，全世界的投送员都瑟瑟发抖`);
    }
  } else {
    n.energy += prod * n.alloc.tech * 0.5 * dt;
  }
  // 军工热度：向“当前核武分配对应的目标热度”缓慢靠拢；升温慢、降温快
  const heatTarget = clamp(n.alloc.nuke / CFG.HEAT_FULL_AT, 0, 1);
  const heatRate = (heatTarget > n.heat ? 1 / CFG.HEAT_UP : 1 / CFG.HEAT_DOWN) * dt;
  n.heat = clamp(n.heat + clamp(heatTarget - n.heat, -heatRate, heatRate), 0, 1);
  n.bank = Math.min(CFG.BANK_CAP, n.bank + prod * n.alloc.nuke * CFG.NUKE_MUL * heatEff(n) * (G.midnight ? 3 : 1) * dt);
  n.energy = Math.min(CFG.ENERGY_CAP, n.energy + (prod * n.alloc.def + CFG.ENERGY_BASE) * dt);
  autoBuild(n);

  // 人口
  for (const c of n.cities) {
    const d = c.tile.rad;
    if (c.rebuild > 0) {
      c.rebuild -= dt;
      if (c.rebuild <= 0) {
        c.rebuild = 0; c.ruined = false;
        c.pop = Math.max(c.pop, c.basePop * CFG.REBUILD_POP);
        Bus.emit('rebuilt', c);
      }
    }
    if (c.ruined || c.pop <= 0) continue;
    const deficit = G.midnight ? 0 : Math.max(0, 1 - c.pop / c.basePop);
    let g = CFG.GROWTH * (1 + deficit * CFG.RECOVER_GROWTH) * (n.mods.growth || 1);
    if (n.mods.dustLove) g *= 1 + d * 0.4;
    else if (!n.mods.dustImmune) { g *= Math.max(0, 1 - d); c.pop -= c.pop * d * 0.0015 * dt; }
    c.pop = Math.min(c.basePop * CFG.POP_CAP_MUL, c.pop + c.pop * g * dt);
  }
  n.stats.peakPop = Math.max(n.stats.peakPop, totalPop(n));

  // 设施修复
  for (const f of n.facilities) {
    if (f.rebuild > 0) {
      f.rebuild -= dt;
      if (f.rebuild <= 0) { f.rebuild = 0; f.alive = true; Bus.emit('rebuilt', f); }
    }
  }
  // 无人机返航
  const ufoAlive = facOf(n, 'ufo').some((f) => f.alive);
  n.ufoReturn = n.ufoReturn.filter((tm) => {
    if (G.t >= tm) { if (ufoAlive) n.ufoReady++; return false; }
    return true;
  });
  // 潜航器
  const seaBase = facOf(n, 'sea')[0];
  for (const s of n.subs) {
    s.timer -= dt;
    if (s.state === 'dock' && s.timer <= 0 && seaBase && seaBase.alive) {
      s.rockets = CFG.SEA_CAP; s.state = 'out'; s.tile = pickSeaTile(seaBase.tile);
    } else if (s.state === 'out' && s.rockets <= 0 && seaBase && seaBase.alive) {
      s.state = 'back'; s.timer = 10;
    } else if (s.state === 'back' && s.timer <= 0) {
      s.state = 'dock'; s.timer = 12; s.tile = seaBase ? seaBase.tile : s.tile;
    }
  }
  // 技能计时
  n.shieldT = Math.max(0, n.shieldT - dt); n.shieldCd = Math.max(0, n.shieldCd - dt);
  n.netT = Math.max(0, n.netT - dt); n.netCd = Math.max(0, n.netCd - dt);
  n.convCd = Math.max(0, n.convCd - dt);
  n.convBuildT = Math.max(0, (n.convBuildT || 0) - dt);
  n.ultCd = Math.max(0, n.ultCd - dt);
  n.overtimeT = Math.max(0, n.overtimeT - dt); n.harpoonT = Math.max(0, n.harpoonT - dt);
  if (n.hackT > 0) { n.hackT = Math.max(0, n.hackT - dt); n.netT = 0; n.netCharges = 0; }
}

function pickSeaTile(from) {
  const W = G.world;
  const pool = W.tiles.filter((t) => !W.isLand(t) && hexDist(t, from) >= 2 && hexDist(t, from) <= 7);
  return pool.length ? pick(pool) : from;
}

function autoBuild(n) {
  // 常规导弹：先保底几枚（核武未解锁时也能用）
  const buildConv = () => { if (n.convBuildT > 0 || n.bank < CONV.cost) return false; n.bank -= CONV.cost; n.conv++; n.convBuildT = CONV.buildTime; return true; };
  if (n.conv < CONV.keepMin) buildConv();
  const lv = bestLevel(n);
  if (!lv) {
    if (n.conv < CONV.stockCap) buildConv();
    return;
  }
  for (let guard = 0; guard < 6; guard++) {
    const st = stock(n);
    const slots = slotCapacity(n, { pad: true, sea: true, ufo: true });
    const buyLv = (lv === 5 && n.parcels[5] < 1) ? 5 : Math.min(lv, 4);
    const pc = PARCELS[buyLv].cost;
    const pad = facOf(n, 'pad').find((f) => f.alive && f.missiles < CFG.PAD_CAP);
    const seaBase = facOf(n, 'sea').find((f) => f.alive);
    const ufoBase = facOf(n, 'ufo').find((f) => f.alive);
    const ufoTotal = n.ufoReady + n.ufoReturn.length;
    const dead = n.facilities.find((f) => !f.alive && f.rebuild <= 0);
    let item = null, cost = 0;
    if (st < slots + 1 && st < 30) { item = 'parcel'; cost = pc; }
    else if (has(n, 'pad') && pad) { item = 'rocket'; cost = COSTS.rocket * (n.mods.rocket || 1); }
    else if (has(n, 'sea') && seaBase && n.subs.length < CFG.MAX_SEA) { item = 'sea'; cost = COSTS.sea * (n.mods.sea || 1); }
    else if (ufoBase && ufoTotal < CFG.MAX_UFO) { item = 'ufo'; cost = COSTS.ufo; }
    else if (!n.isPlayer && dead) { item = 'fac'; cost = COSTS.facility; }
    else if (n.conv < CONV.stockCap && n.convBuildT <= 0) { item = 'conv'; cost = CONV.cost; }
    else if (st < 30) { item = 'parcel'; cost = pc; }
    if (!item || n.bank < cost) return;
    n.bank -= cost;
    if (item === 'conv') { n.conv++; n.convBuildT = CONV.buildTime; }
    else if (item === 'parcel') n.parcels[buyLv]++;
    else if (item === 'rocket') pad.missiles++;
    else if (item === 'sea') n.subs.push({ state: 'dock', timer: 3, rockets: 0, tile: seaBase.tile });
    else if (item === 'ufo') n.ufoReady++;
    else if (item === 'fac') dead.rebuild = 20;
  }
}

// ---------- 发货 ----------
function collectSlots(n, legs) {
  const k = multiK(n), slots = [];
  if (legs.pad && has(n, 'pad')) {
    for (const f of facOf(n, 'pad')) if (f.alive) for (let i = 0; i < f.missiles; i++) slots.push({ kind: 'rocket', src: f, cap: k, tile: f.tile, flight: rnd(7, 10) });
  }
  if (legs.sea && has(n, 'sea')) {
    for (const s of n.subs) if (s.state === 'out') for (let i = 0; i < s.rockets; i++) slots.push({ kind: 'rocket', src: s, sub: true, cap: k, tile: s.tile, flight: rnd(5, 8) * (n.mods.seaSpeed || 1) });
  }
  if (legs.ufo && facOf(n, 'ufo').some((f) => f.alive)) {
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
function deliverable(n, legs) { return bestLevel(n) ? Math.min(stock(n), slotCapacity(n, legs)) : 0; }

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

// count：指定发射数量（玩家长按蓄力）；不传则按 scale（AI 使用）
function launch(att, tgt, scale, legs, count) {
  if (!att.alive || !tgt.alive || att === tgt) return 0;
  const D = deliverable(att, legs);
  if (D <= 0) return 0;
  let N = count ? Math.min(count, D) : sendCount(D, scale);
  // 火箭（投送站 + 潜航器）优先，飞机补充；同一档里轮流从不同发射点出发——天女散花
  const slots = spreadOrder(collectSlots(att, legs));
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
const convSalvo = (n, scale) => Math.min(n.conv, CONV.salvo[scale]);
function launchConv(att, tgt, scale, count) {
  if (!att.alive || !tgt.alive || att === tgt || att.convCd > 0) return 0;
  const N = count ? Math.min(count, att.conv) : convSalvo(att, scale);
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
    let frac = CONV.dmg * (G.midnight ? 1.5 : 1);
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

function takeParcel(n) {
  for (let lv = 5; lv >= 1; lv--) if (n.parcels[lv] > 0) { n.parcels[lv]--; return lv; }
  return 0;
}

function stepProjectiles(dt) {
  for (const n of G.nations) if (n.alive) assignLocks(n);
  for (const p of G.projectiles) {
    if (p.done) continue;
    p.t += dt;
    if (!p.launched && p.t >= p.delay) { p.launched = true; Bus.emit('launch', p); }
    if (!p.launched) continue;
    const u = (p.t - p.delay) / p.flight;
    // 锁定后约 1 秒迎击（快落地时立刻迎击），让玩家看得到锁定波纹
    if (p.locked && !p.engaged && (G.t - p.lockSimT >= CFG.LOCK_TO_HIT || u >= 0.95)) { p.engaged = true; engage(p); if (p.done) continue; }
    if (u >= 1) { p.done = true; arrive(p); }
  }
  G.projectiles = G.projectiles.filter((p) => !p.done);
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
  let locked = 0;
  const free = [];
  for (const p of G.projectiles) {
    if (p.tgt !== n.id || !p.launched || p.done || p.engaged || p.unstop) continue;
    if (!active) { p.locked = false; continue; }
    if (p.locked) locked++; else if (nearHome(p, n)) free.push(p);
  }
  if (!active || !free.length) return;
  free.sort((a, b) => (a.delay + a.flight - a.t) - (b.delay + b.flight - b.t));
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
  if (chance(netChance(tgt))) {
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
  if (G.projectiles.some((p) => p.tgt === n.id && p.launched && !p.done && !p.engaged && !p.unstop)) useNet(n);
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
      let frac = Math.min(0.97, P.dmg * (R === 0 ? 1 : 1 - (d / (R + 1)) * 0.6) * (G.midnight ? 1.5 : 1));
      if (owner.shieldT > 0) frac *= 1 - (owner.mods.shield || SKILLS.shield.reduce);
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
function markHostile(a, b) { b.hostileAt[a.id] = G.t; }
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
  for (const c of n.cities) { c.pop = 0; c.ruined = true; }
  for (const f of n.facilities) f.alive = false;
  n.subs = []; n.ufoReady = 0;
  news(`💀 ${n.race.emoji}${n.name} 已被核平。领袖遗言：“${n.race.lines.dead}”`);
  Bus.emit('eliminated', n);
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
    for (const c of n.cities) { c.ruined = false; c.rebuild = 0; c.pop = Math.max(c.pop, c.basePop * 0.6); }
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
function rebuildWorst(n) {
  const list = n.cities.filter((c) => c.ruined && c.rebuild <= 0).sort((a, b) => b.basePop - a.basePop);
  return list.length ? rebuildCity(n, list[0]) : false;
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
    const nukes = soon.filter((x) => x.p.kind !== 'conv').length;
    const heavy = inc.length > netMax(n) || nukes >= 2;
    if (heavy && n.shieldT <= 0) useShield(n);
  }
  if (!n.isPlayer || n.autoNet) autoNet(n);
  if (!inc.length && n.energy > COSTS.rebuild + COSTS.shield) rebuildAll(n);
}

// ---------- 地块 ----------
let tileTimer = 0;
function stepTiles(dt) {
  tileTimer += dt;
  if (tileTimer < 0.5) return;
  const k = Math.exp(-tileTimer / 70);
  for (const t of G.world.tiles) if (t.rad > 0.001) t.rad *= k; else t.rad = 0;
  tileTimer = 0;
}

// ---------- 随机事件与阶段 ----------
function stepEvents() {
  if (!G.midnight && G.t >= CFG.MIDNIGHT) {
    G.midnight = true;
    news('🕛 午夜钟声敲响！全球进入“午夜狂欢”：包裹威力 ×1.5，人口不再加速恢复，所有仓库清仓甩卖！');
    Bus.emit('banner', '🕛 午夜狂欢');
    Bus.emit('midnight');
  }
  if (G.t >= (G.nextIntel || 0)) { G.nextIntel = G.t + 5; checkIntel(); }
  if (G.t >= G.nextEvent) {
    G.nextEvent = G.t + rnd(50, 90);
    randomEvent();
  }
}

// 情报：谁在“憋大招”？科技遥遥领先、过早研发出东风、或者库存暴涨，都会被各国察觉并联手针对
function checkIntel() {
  const alive = G.nations.filter((n) => n.alive);
  if (alive.length < 3) return;
  for (const x of alive) {
    if (G.t < x.intelCd) continue;
    const others = alive.filter((o) => o !== x);
    const techLead = x.techIdx - Math.max(...others.map((o) => o.techIdx));
    let why = null;
    if (has(x, 'lv5') && G.t < CFG.INTEL_EARLY_LV5 && others.every((o) => !has(o, 'lv5'))) why = '已经秘密研发出了【东风】';
    else if (techLead >= CFG.INTEL_TECH_LEAD) why = '的科技突飞猛进，正在憋大招';
    else if (stock(x) >= CFG.INTEL_STOCK) why = `正在囤积核包裹（已超过 ${CFG.INTEL_STOCK} 个）`;
    if (!why) continue;
    x.intelWhy = why; x.intelUntil = G.t + CFG.INTEL_FOCUS; x.intelCd = G.t + CFG.INTEL_CD;
    for (const o of others) o.anger[x.id] += 30;
    news(`🕵 情报显示：${x.race.emoji}${x.name} ${why}！各国决定先下手为强`);
    Bus.emit('intel', x);
  }
}

function randomEvent() {
  const alive = G.nations.filter((n) => n.alive);
  if (alive.length < 2) return;
  const r = rand();
  if (r < 0.25) {
    const n = pick(alive.filter((x) => stock(x) > 0) || []);
    if (n) {
      const lv = takeParcel(n);
      const victim = pick(alive);
      const to = pickTargetTile(victim);
      const from = n.cities[0].tile;
      G.projectiles.push({ id: G.pid++, kind: 'rocket', lv, att: n.id, tgt: victim.id, fx: from.x, fy: from.y, tile: to, tx: to.x, ty: to.y, delay: 0, flight: 9, t: 0, launched: false, done: false });
      news(victim === n ? `📦 ${n.name} 的投送员迷路了……包裹正飞向他们自己家` : `📦 ${n.name} 的投送员迷路了，一个包裹正飞向 ${victim.name}`);
      return;
    }
  }
  if (r < 0.45) {
    const [a, b] = shuffle(alive.slice());
    const amt = a.techPts * 0.3;
    a.techPts -= amt; b.techPts += amt;
    news(`🧑‍🔬 ${a.name} 的首席科学家跳槽去了 ${b.name}，理由是“那边食堂好吃”`);
  } else if (r < 0.65) {
    const n = pick(alive);
    n.bank *= 0.6;
    news(`🕊 ${n.name} 爆发大规模和平游行，仓库被游行群众塞满了鲜花`);
  } else if (r < 0.85) {
    for (const n of alive) n.bank = Math.min(CFG.BANK_CAP, n.bank + 40);
    news('🛒 全球购物节开幕！所有国家投送预算 +40');
  } else {
    news('📡 天文台报告：外星人路过地球，看了一眼，加速离开了');
  }
}

function checkEnd() {
  const alive = G.nations.filter((n) => n.alive);
  if (G.mp) { // 联机：有人阵亡不结束，最后剩一个国家、真人全部阵亡或时间到才结束；胜负由各自客户端判定
    if (!alive.length) return endGame('earth');
    if (alive.length === 1) return endGame('last');
    if (G.t > 5 && !alive.some((n) => n.isPlayer)) return endGame('humansDead');
    if (G.t >= CFG.GAME_END) return endGame('time');
    return;
  }
  if (!alive.length) return endGame('earth');
  if (!G.player.alive) return endGame(alive.length === 1 ? 'lose' : 'lose');
  if (alive.length === 1) return endGame('win');
  if (G.t >= CFG.GAME_END) {
    const best = alive.slice().sort((a, b) => finalScore(b) - finalScore(a))[0];
    return endGame(best.isPlayer ? 'survive' : 'loseRank');
  }
}
// 终局综合得分：活着的人口 + 造成的伤亡（只苟着不打，得分不会高）
function finalScore(n) { return totalPop(n) + n.stats.caused * CFG.SCORE_DAMAGE; }
function endGame(kind) {
  if (G.over) return;
  G.over = kind;
  Bus.emit('gameover', kind);
}
