// ===================== 模拟：经济、发货、爆炸、技能 =====================
'use strict';

const Bus = {
  h: {},
  on(type, fn) { (this.h[type] = this.h[type] || []).push(fn); },
  emit(type, data) { (this.h[type] || []).forEach((fn) => fn(data)); },
};

let G = null;

// 每个国家占一个“席位”：raceIds[i] 国家类型（可以重复），owners[i] 玩家连接 id（AI 为 null），names[i] 自定义国家名
// mp（联机）：房主传 { players: [{race, id, name}], me }，由这里排好席位；
//             客户端传房主发来的 { seed, raceIds, owners, names, me }，生成一模一样的世界
function newGame(playerRaceId, aiCount, diff = 'normal', mp = null) {
  let raceIds = mp && mp.raceIds, owners = mp && mp.owners, names = mp && mp.names, seed = mp && mp.seed;
  if (!raceIds) {
    const humans = mp ? mp.players : [{ race: playerRaceId, id: 'local', name: '' }];
    aiCount = clamp(aiCount, 0, MAX_NATIONS - humans.length);
    // AI 先用没人选的国家，不够时再重复
    const unused = shuffle(RACES.map((r) => r.id).filter((id) => !humans.some((h) => h.race === id)));
    const ai = [];
    const notHuman = RACES.filter((r) => !humans.some((h) => h.race === r.id));
    for (let k = 0; k < aiCount; k++) ai.push(k < unused.length ? unused[k] : pick(notHuman.length ? notHuman : RACES).id);
    const seats = shuffle([...humans.map((h) => ({ race: h.race, id: h.id, name: h.name || '' })), ...ai.map((race) => ({ race, id: null, name: '' }))]);
    raceIds = seats.map((s) => s.race); owners = seats.map((s) => s.id); names = seats.map((s) => s.name);
    seed = (Math.random() * 1e9) | 0;
  }
  const world = generateWorld(seed, raceIds, owners.map((o) => o !== null && o !== undefined));
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
      parcels: { 1: CFG.START_PARCELS, 2: 0, 3: 0, 4: 0, 5: 0 },
      ufoReady: Math.max(2, Math.min(CFG.MAX_UFO, CFG.START_PARCELS)), ufoReturn: [], // 开局飞机数和开局核包裹数一致，5 个都能一起投出去
      conv: 3, convCd: 0, drones: DRONE.keepMin, droneCd: 0, droneBuildT: 0, ciwsT: 0, autoCiws: true, autoScramble: true, scrambleT: 0,
      heat: CFG.HEAT_START, lastAttack: -999, intelUntil: -1, intelCd: -1, hostileAt: {},
      subs: [],
      anger: nations.map(() => rnd(5, 20)),
      shieldT: 0, shieldCd: 0, netT: 0, netCd: 0, netCharges: 0,
      lastHit: -99, lastAttacker: -1, retaliate: null, lastStrike: -99,
      aiNext: rnd(1, 3),
      autoNet: true, autoRebuild: true,
      ultCd: ULT_FIRST, overtimeT: 0, harpoonT: 0, hackT: 0,
      stats: { dronesSent: 0, ciwsKills: 0, dogKills: 0, ult: 0, sent: 0, delivered: 0, caused: 0, lost: 0, intercepted: 0, rebuilt: 0, peakPop: 0 },
    });
    n.anger[i] = -1e9;
    n.mods = n.race.mods;
    n.isPlayer = owners[i] !== null && owners[i] !== undefined; // 不依赖地图生成的标记，避免新旧脚本混用时没有真人
    n.netId = mp ? owners[i] : null;
    const custom = mp && cleanName(names[i]);
    if (custom) n.name = custom; // 联机自定义国家名
  });
  G = {
    t: 0, speed: 1, world, nations, projectiles: [],
    player: mp ? nations.find((n) => n.netId === mp.me) : nations.find((n) => n.isPlayer),
    mp: !!mp, seed, raceIds, owners, names,
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
    * (n.overtimeT > 0 ? 1.7 : 1)              // 卷王大招：加班
    * (n.isPlayer ? 1 : G.diff.prod);        // AI 难度
}
const sendCount = (D, scale) => (D <= 0 ? 0 : scale === 0 ? 1 : scale === 1 ? Math.ceil(D / 2) : D);

// ---------- 主步进 ----------
function simStep(dt) {
  if (G.over) return;
  G.t += dt;
  for (const n of G.nations) if (n.alive) stepNation(n, dt);
  stepProjectiles(dt);
  stepAir(dt);
  for (const n of G.nations) if (n.alive) { stepCiws(n, dt); scramble(n, dt); }
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
    n.energy += prod * n.alloc.tech * dt; // 科技全部研发完：科技那部分国力全额转成能量
  }
  // 军工热度：向“当前核武分配对应的目标热度”缓慢靠拢；升温慢、降温快
  const heatTarget = clamp(n.alloc.nuke / CFG.HEAT_FULL_AT, 0, 1);
  const heatRate = (heatTarget > n.heat ? 1 / CFG.HEAT_UP : 1 / CFG.HEAT_DOWN) * dt;
  n.heat = clamp(n.heat + clamp(heatTarget - n.heat, -heatRate, heatRate), 0, 1);
  n.bank = Math.min(CFG.BANK_CAP, n.bank + prod * n.alloc.nuke * CFG.NUKE_MUL * heatEff(n) * (G.midnight ? 3 : 1) * dt);
  n.energy = Math.min(CFG.ENERGY_CAP, n.energy + (prod * n.alloc.def + CFG.ENERGY_BASE * (G.midnight ? 2 : 1)) * dt); // 午夜后基础回复翻倍
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
  n.droneCd = Math.max(0, n.droneCd - dt); n.droneBuildT = Math.max(0, n.droneBuildT - dt);
  n.ultCd = Math.max(0, n.ultCd - dt);
  // 进入火箭时代：投送站装好 3 枚火箭，或者研发出投送站 45 秒后
  if (!n.rocketEra && has(n, 'pad')) {
    if (n.padAt === undefined) n.padAt = G.t;
    if (G.t - n.padAt >= 45 || facOf(n, 'pad').reduce((k, f) => k + (f.alive ? f.missiles : 0), 0) >= 3) n.rocketEra = true;
  }
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
  const buildDrone = () => { if (n.droneBuildT > 0 || n.bank < DRONE.cost || n.drones >= DRONE.stockCap) return false; n.bank -= DRONE.cost; n.drones++; n.droneBuildT = DRONE.buildTime; return true; };
  // 导弹、无人机都是独立生产线：没到上限就按节奏一直造（导弹每 4 秒一枚，上限 10；无人机每 3 秒一架，上限 20）
  if (n.conv < CONV.stockCap) buildConv();
  buildDrone();
  const lv = bestLevel(n);
  if (!lv) return;
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
    const loaded = facOf(n, 'pad').reduce((k, f) => k + (f.alive ? f.missiles : 0), 0);
    if (!n.rocketEra && has(n, 'pad') && pad && loaded < 3) { item = 'rocket'; cost = COSTS.rocket * (n.mods.rocket || 1); } // 先把投送站装上火箭，换掉飞机
    else if (st < slots + 1 && st < 30) { item = 'parcel'; cost = pc; }
    else if (has(n, 'pad') && pad) { item = 'rocket'; cost = COSTS.rocket * (n.mods.rocket || 1); }
    else if (has(n, 'sea') && seaBase && n.subs.length < CFG.MAX_SEA) { item = 'sea'; cost = COSTS.sea * (n.mods.sea || 1); }
    else if (ufoBase && ufoTotal < CFG.MAX_UFO && !has(n, 'pad')) { item = 'ufo'; cost = COSTS.ufo; } // 有投送站后不再造飞机
    else if (!n.isPlayer && dead) { item = 'fac'; cost = COSTS.facility; }
    else if (st < 30) { item = 'parcel'; cost = pc; }
    if (!item || n.bank < cost) return;
    n.bank -= cost;
    if (item === 'conv') { n.conv++; n.convBuildT = CONV.buildTime; }
    else if (item === 'drone') { n.drones++; n.droneBuildT = DRONE.buildTime; }
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
  if (!att.alive || !tgt.alive || att === tgt || att.convCd > 0) return 0;
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

// ---------- 无人机 ----------
// 70% 瞄准设施（投送站、机场、海底仓），其余打城市
function pickDroneTile(tgt) {
  const facs = tgt.facilities.filter((f) => f.alive);
  if (facs.length && chance(DRONE.facBias)) return pick(facs).tile;
  return pickTargetTile(tgt);
}
function launchDrones(att, tgt, count) {
  if (!att.alive || !tgt || !tgt.alive || att === tgt || att.droneCd > 0) return 0;
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
    const c = tile.city, owner = G.nations[c.nation], loss = c.pop * DRONE.cityDmg;
    c.pop -= loss;
    losses.set(owner.id, loss);
    Bus.emit('cityHit', { city: c, loss });
  }
  applyLosses(losses, att, 0.3);
  Bus.emit('droneExplode', { tile, att });
  for (const n of G.nations) if (n.alive && totalPop(n) < CFG.DEATH_POP) eliminate(n);
}

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

// 来袭里除去无人机的威胁（警报、红色边框、单机锁 1× 速度用）
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
      frac *= owner.mods.nukeArmor || 1; // 吃土：皮糙肉厚
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
// 核弹威力倍率：午夜 ×1.5，之后每 3 分钟 +15%，最多 ×2.5
function nukeMul() {
  if (!G.midnight) return 1;
  return Math.min(CFG.ESC_MAX, 1.5 + CFG.ESC_STEP * Math.floor((G.t - CFG.MIDNIGHT) / CFG.ESC_EVERY));
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
    const nukes = soon.filter((x) => x.p.kind !== 'conv' && x.p.kind !== 'drone').length;
    const drones = soon.filter((x) => x.p.kind === 'drone').length;
    const heavy = inc.filter((x) => isThreat(x.p)).length > netMax(n) || nukes >= 2 || drones >= 10;
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
    G.escLevel = 0;
  }
  if (G.midnight) { // 末日升级：午夜后每 3 分钟核弹威力再上升
    const lvl = Math.floor((G.t - CFG.MIDNIGHT) / CFG.ESC_EVERY);
    if (lvl > (G.escLevel || 0) && nukeMul() > 1.5) {
      G.escLevel = lvl;
      news(`☢ 末日升级：核弹威力提升到 ×${nukeMul().toFixed(2)}，再拖下去谁都跑不掉`);
      Bus.emit('banner', `☢ 核弹威力 ×${nukeMul().toFixed(2)}`);
    }
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
  // 没有时间限制：打到只剩一个国家才结束
  if (G.mp) { // 联机：有人阵亡不结束（观战），最后剩一个国家或真人全部阵亡才结束；胜负由各自客户端判定
    if (!alive.length) return endGame('earth');
    if (alive.length === 1) return endGame('last');
    if (G.t > 5 && !alive.some((n) => n.isPlayer)) return endGame('humansDead');
    return;
  }
  if (!alive.length) return endGame('earth');
  if (!G.player.alive) return endGame('lose');
  if (alive.length === 1) return endGame('win');
}
// 终局综合得分：活着的人口 + 造成的伤亡（只苟着不打，得分不会高）
function finalScore(n) { return totalPop(n) + n.stats.caused * CFG.SCORE_DAMAGE; }
function endGame(kind) {
  if (G.over) return;
  G.over = kind;
  Bus.emit('gameover', kind);
}
