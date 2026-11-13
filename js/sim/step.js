// ===================== 模拟·步进：每步推进、各国经济与生产、地块与随机事件 =====================
'use strict';

// ---------- 主步进 ----------
function simStep(dt) {
  if (G.over) return;
  G.t += dt;
  for (const n of G.nations) if (n.alive) stepNation(n, dt);
  if (G.boss && G.boss.alive) stepBoss(G.boss, dt);
  stepDims();
  stepProjectiles(dt);
  stepAir(dt);
  for (const n of G.nations) if (n.alive) scramble(n, dt);
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
  pickResearch(n);
  if (!techDone(n)) {
    n.techPts += prod * n.alloc.tech * (n.mods.tech || 1) * sophonMul(n) * dt; // 二选一还没选时，科研点照样积累
    const tech = curTech(n);
    if (tech && n.techPts >= tech.cost) {
      n.techPts -= tech.cost; grantTech(n, tech.id); n.research = null;
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
  n.bank = Math.min(CFG.BANK_CAP, n.bank + prod * n.alloc.nuke * CFG.NUKE_MUL * heatEff(n) * midnightProd() * dt);
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
    else if (st < slots + 1 && st < CFG.STOCK_CAP) { item = 'parcel'; cost = pc; }
    else if (has(n, 'pad') && pad) { item = 'rocket'; cost = COSTS.rocket * (n.mods.rocket || 1); }
    else if (has(n, 'sea') && seaBase && n.subs.length < CFG.MAX_SEA) { item = 'sea'; cost = COSTS.sea * (n.mods.sea || 1); }
    else if (ufoBase && ufoTotal < CFG.MAX_UFO && !has(n, 'pad')) { item = 'ufo'; cost = COSTS.ufo; } // 有投送站后不再造飞机
    else if (!n.isPlayer && dead) { item = 'fac'; cost = COSTS.facility; }
    else if (st < CFG.STOCK_CAP) { item = 'parcel'; cost = pc; }
    // 给导弹、小摩托生产线留出下一件的钱，它们才能准点开工（发射按钮的圆环也不会转满后卡住）
    const reserve = (n.conv < CONV.stockCap && n.convBuildT < 1 ? CONV.cost : 0) + (n.drones < DRONE.stockCap && n.droneBuildT < 1 ? DRONE.cost : 0);
    if (!item || n.bank - reserve < cost) return;
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
    news('🕛 午夜钟声敲响！全球进入“午夜狂欢”：包裹威力 ×1.25，人口不再加速恢复，所有仓库清仓甩卖！');
    Bus.emit('banner', '🕛 午夜狂欢');
    Bus.emit('midnight');
    G.escLevel = 0;
  }
  if (G.midnight) { // 末日升级：午夜后每 2 分钟核弹威力再上升
    const lvl = Math.floor((G.t - CFG.MIDNIGHT) / CFG.ESC_EVERY);
    if (lvl > (G.escLevel || 0) && nukeMul() > CFG.ESC_START) {
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
    if (G.t < x.intelCd || x.race.boss) continue; // 三体人本来就是公开的威胁，不走情报点名
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
