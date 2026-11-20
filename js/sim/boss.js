// ===================== 模拟·三体人（生存模式的高阶文明）：智子封锁、乱纪元、降维打击 =====================
'use strict';

// 两国首都之间的距离（格）
const capDist = (a, b) => hexDist((a.cities.find((c) => c.isCapital) || a.cities[0]).tile, (b.cities.find((c) => c.isCapital) || b.cities[0]).tile);
const bossOf = () => (G && G.nations.find((n) => n.race.boss)) || null;
const isChaos = (n) => !!(n && n.chaosT > 0);
// 智子封锁：三体人活着时，其他国家科技速度变慢
function sophonMul(n) {
  const b = G.boss;
  return b && b.alive && n !== b ? BOSS_CFG.sophon : 1;
}
// 受到的伤害倍率：三体人恒纪元时有高阶防御（伤害打折），乱纪元期间防御瘫痪、伤害加重
// 扩张模式里各国城市更多、火力更足，三体人乱纪元时不再额外增伤
const takenMul = (owner) => (isChaos(owner) ? (G.expand ? CFG.EXPAND.chaosDmg : BOSS_CFG.chaosDmg) : owner.mods.armor || 1);

// 开局：科技、人口已在种族数值里；这里设科技进度、大招冷却、乱纪元计时、对真人玩家的敌意
function setupBoss(n) {
  for (const id of BOSS_CFG.startTechs) grantTech(n, id);
  n.ultCd = BOSS_CFG.firstUlt * tScale();
  n.chaosT = 0; n.chaosNext = BOSS_CFG.chaosFirst * tScale(); n.chaosWarned = false;
  n.pers = 'hot'; // 好战
  for (const x of G.nations) if (x.isPlayer) n.anger[x.id] = BOSS_CFG.playerAnger;
}

// 三体人的核包裹按“波次”打：对一个国家开打后的 6 秒内算同一波，之后 35 秒内不再对它发射核包裹（导弹、小摩托照常）。
// 否则它每隔 8 秒就来一发，对方的护盾（持续 8 秒、冷却 30 秒）只挡得住第一发，前期被盯上的国家必死
const bossLimited = (n, x) => { const dt = G.t - ((n.waveAt || (n.waveAt = {}))[x.id] ?? -999); return dt > BOSS_CFG.waveLen * tScale() && dt < BOSS_CFG.waveGap * tScale(); }; // 快速局：间隔减半
// 主动出手时：首选目标还在两波之间，就改打怒气最高的另一个国家（火力分散到各国）
function bossTarget(n, tgt) {
  if (!bossLimited(n, tgt)) return tgt;
  let best = null, bs = -Infinity;
  for (const x of G.nations) {
    if (!x.alive || allied(x, n) || bossLimited(n, x)) continue;
    const s = n.anger[x.id] + Math.max(0, BOSS_CFG.neighborHate - capDist(n, x) * 2) + rnd(0, 15);
    if (s > bs) { bs = s; best = x; }
  }
  return best || tgt;
}
function bossLaunch(n, tgt, scale) {
  if (bossLimited(n, tgt)) return 0;
  const sent = launch(n, tgt, scale, { pad: true, sea: true, ufo: true });
  if (sent && G.t - (n.waveAt[tgt.id] ?? -999) >= BOSS_CFG.waveGap * tScale()) { // 新的一波：记下开始时间，消一些怒气
    n.waveAt[tgt.id] = G.t;
    n.anger[tgt.id] = Math.max(0, n.anger[tgt.id] - BOSS_CFG.waveCalm);
  }
  return sent;
}

// ---------- 堡垒国：护盾常驻，周期性“换班”时失效一小段时间 ----------
const fortOpen = (n) => !!(n && n.mods.fortress && n.fortDown > 0);
function stepFort(n, dt) {
  const F = FORT_CFG;
  if (n.fortDown > 0) { // 换班中：没有护盾
    n.fortDown -= dt; n.shieldT = 0;
    if (n.fortDown <= 0) { n.fortDown = 0; n.fortNext = F.up * tScale(); n.fortWarned = false; news(`🏰 ${n.race.emoji}${n.name} 换班结束，护盾重新升起`); }
    return;
  }
  n.fortNext -= dt;
  n.shieldT = n.hackT > 0 ? 0 : Math.max(n.shieldT, 3); // 护盾一直开着（被断网时照样瘫痪）
  const warn = Math.round(F.warn * tScale()), down = Math.round(F.down * tScale());
  if (!n.fortWarned && n.fortNext <= warn) { n.fortWarned = true; Bus.emit('banner', `🏰 ${warn} 秒后堡垒国换班：护盾将失效 ${down} 秒，准备集中火力！`); }
  if (n.fortNext <= 0) {
    n.fortDown = down; n.shieldT = 0;
    news(`🏰 ${n.race.emoji}${n.name} 正在换班：${down} 秒内没有护盾`);
    Bus.emit('banner', `🏰 堡垒国换班！${down} 秒内没有护盾`);
  }
}

// ---------- 乱纪元：周期性进入，生产停止、护盾和拦截失效 ----------
function stepBoss(n, dt) {
  if (n.chaosT > 0) {
    n.chaosT = Math.max(0, n.chaosT - dt);
    n.shieldT = 0; n.netT = 0; n.netCharges = 0;
    if (n.chaosT <= 0) {
      n.chaosNext = BOSS_CFG.chaosEvery * tScale(); n.chaosWarned = false;
      news(`🌞 ${n.race.emoji}${n.name} 回到恒纪元，防御恢复`);
    }
    return;
  }
  n.chaosNext -= dt;
  const warn = Math.round(BOSS_CFG.chaosWarn * tScale()), dur = BOSS_CFG.chaosDur; // 快速局：预警减半；持续时间不减（本来就只有 12 秒，再减就打不到了）
  if (!n.chaosWarned && n.chaosNext <= warn) {
    n.chaosWarned = true;
    Bus.emit('banner', `🌪 ${warn} 秒后三体进入乱纪元：准备集中火力！`);
  }
  if (n.chaosNext <= 0) {
    n.chaosT = dur;
    n.shieldT = 0; n.netT = 0; n.netCharges = 0;
    news(`🌪 ${n.race.emoji}${n.name} 进入乱纪元：${dur} 秒内停产，护盾和拦截失效，受到伤害 ×${BOSS_CFG.chaosDmg}`);
    Bus.emit('banner', `🌪 三体进入乱纪元！${dur} 秒内防御瘫痪`);
  }
}

// ---------- 降维打击：预警后从中心向外展开，核心区全灭，外延区按距离衰减 ----------
// 这个落点会让目标国损失多少人口（按核心区全灭、外延区按距离衰减估算，不算护盾）
function dimLoss(tgt, center) {
  const B = BOSS_CFG;
  let loss = 0;
  for (const c of tgt.cities) {
    const d = hexDist(center, c.tile);
    if (d <= B.dimCore) loss += c.pop;
    else if (d <= B.dimOuter) loss += c.pop * lerp(B.outerLoss[0], B.outerLoss[1], (d - B.dimCore) / (B.dimOuter - B.dimCore));
  }
  return loss;
}
// 选落点：打偏一些，重创但不灭国。在目标国周围找一个预计损失落在 dimLoss 范围内（约四到六成人口）的位置，
// 而且打完之后剩下的人口要明显高于灭国线；有多个就随机挑一个（每次打的方位不同）。
// 实在找不到（国家已经很小）：挑预计损失最接近范围下限的位置
function dimCenter(tgt) {
  const B = BOSS_CFG, pop = totalPop(tgt);
  if (pop <= 0 || !tgt.cities.length) return null;
  const [lo, hi] = B.dimLoss, ok = [];
  let best = null, bd = Infinity;
  for (const t of G.world.tiles) {
    if (!tgt.cities.some((c) => hexDist(t, c.tile) <= B.dimOuter)) continue; // 至少要波及一座城市
    const loss = dimLoss(tgt, t), f = loss / pop;
    if (f >= lo && f <= hi && pop - loss >= CFG.DEATH_POP * 2) ok.push(t);
    const d = Math.abs(f - lo) + (pop - loss < CFG.DEATH_POP * 2 ? 1 : 0); // 会打到灭国线附近的位置排到最后
    if (f > 0.05 && d < bd) { bd = d; best = t; }
  }
  return ok.length ? pick(ok) : best;
}
// 降维打击打谁：和普通攻击一样看仇恨、威胁和距离（优先打掉正在围攻它的邻国），但对真人玩家留两条保护：
// 不连续两次打同一个国家；真人玩家的分数打七折（积极反击的玩家不会被反复点名）
function pickDimTarget(n) {
  let c = G.nations.filter((x) => x.alive && !allied(x, n) && totalPop(x) > 25);
  if (!c.length) c = G.nations.filter((x) => x.alive && !allied(x, n));
  const narrow = (f) => { const r = c.filter(f); if (r.length) c = r; };
  narrow((x) => x.id !== n.lastDimTgt);
  const maxPop = Math.max(1, ...G.nations.map((x) => (x.alive ? totalPop(x) : 0)));
  let best = null, bs = -Infinity;
  for (const x of c) {
    const sc = (n.anger[x.id] + threatOf(x, maxPop) + Math.max(0, BOSS_CFG.neighborHate - capDist(n, x) * 2) + rnd(0, 15)) * (x.isPlayer ? BOSS_CFG.dimPlayerWeight : 1);
    if (sc > bs) { bs = sc; best = x; }
  }
  return best;
}
function startDim(n, tgt) {
  const center = tgt && tgt.alive ? dimCenter(tgt) : null;
  if (!center) return false;
  n.dimCount = (n.dimCount || 0) + 1; n.lastDimTgt = tgt.id;
  const d = { att: n.id, tgt: tgt.id, tile: center.idx, t0: G.t, done: new Set() };
  (G.dims = G.dims || []).push(d);
  Bus.emit('dimStrike', d);
  Bus.emit('banner', `🌀 降维打击锁定 ${tgt.race.emoji}${tgt.name}：${BOSS_CFG.dimWarn} 秒后二维化展开！`);
  tgt.anger[n.id] += 40; markHostile(n, tgt); n.lastAttack = G.t;
  return true;
}
// 二维化痕迹：记录压平的时间，渲染时随时间褪去（核心区保持到可以重建后再褪，外延区很快褪去）
function markFlat(t, core) {
  if (core) { t.flat = 1; t.flatAt = G.t; }
  else if (t.flat !== 1 || flatAlpha(t) < 0.5) { t.flat = 0.5; t.flatAt = G.t; }
}
function flatAlpha(t) {
  if (!t.flat) return 0;
  const age = G.t - t.flatAt, B = BOSS_CFG;
  if (t.flat >= 1) return age < B.flatHold ? 1 : Math.max(0, 1 - (age - B.flatHold) / B.flatFade);
  return Math.max(0, 1 - age / B.flatFadeOuter);
}
// 当前展开半径（格）：预警期间为 -1
function dimRadius(d) {
  const el = G.t - d.t0 - BOSS_CFG.dimWarn;
  if (el < 0) return -1;
  return Math.min(BOSS_CFG.dimOuter, (el / BOSS_CFG.dimSpread) * BOSS_CFG.dimOuter);
}
function stepDims() {
  if (!G.dims || !G.dims.length) return;
  const W = G.world, B = BOSS_CFG;
  for (const d of G.dims) {
    const r = dimRadius(d);
    if (r < 0) continue;
    const att = G.nations[d.att], center = W.tiles[d.tile], losses = new Map();
    if (!d.braced) { // 二维化展开的一刻：范围内的 AI 国家开护盾（外延区损失减半）
      d.braced = true;
      for (const x of G.nations) if (x.alive && !x.isPlayer && x !== att && x.cities.some((c) => hexDist(c.tile, center) <= B.dimOuter)) useShield(x);
    }
    for (const t of W.tiles) {
      if (d.done.has(t.idx)) continue;
      const dist = hexDist(t, center);
      if (dist > r) continue;
      d.done.add(t.idx);
      if (t.owner !== d.att) markFlat(t, dist <= B.dimCore); // 三体人自己的国土不受影响
      const core = dist <= B.dimCore, u = core ? 0 : (dist - B.dimCore) / (B.dimOuter - B.dimCore);
      if (t.city && t.city.pop > 0) {
        const c = t.city, owner = G.nations[c.nation];
        if (owner === att || !owner.alive) continue;
        let frac = core ? 1 : lerp(B.outerLoss[0], B.outerLoss[1], u) * (owner.shieldT > 0 ? 0.5 : 1);
        const loss = c.pop * Math.min(1, frac);
        c.pop -= loss;
        if (core) { c.pop = 0; c.ruined = true; c.rebuild = 0; c.flatUntil = G.t + B.noRebuild; }
        else if (c.pop < c.basePop * 0.35) { c.ruined = true; c.rebuild = 0; }
        losses.set(owner.id, (losses.get(owner.id) || 0) + loss);
        Bus.emit('cityHit', { city: c, loss });
      }
      if (t.fac && t.fac.alive) {
        const f = t.fac, owner = G.nations[f.nation];
        if (owner === att) continue;
        const p = core ? 1 : lerp(B.outerFac[0], B.outerFac[1], u) * (owner.shieldT > 0 ? 0.5 : 1);
        if (chance(p)) { knockFacility(f, owner); if (core) f.flatUntil = G.t + B.noRebuild; }
      }
    }
    if (losses.size) {
      applyLosses(losses, att, 1);
      for (const x of G.nations) if (x.alive && totalPop(x) < CFG.DEATH_POP) eliminate(x);
    }
  }
  G.dims = G.dims.filter((d) => G.t - d.t0 < BOSS_CFG.dimWarn + BOSS_CFG.dimSpread + 0.5);
}
