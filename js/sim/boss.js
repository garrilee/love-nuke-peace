// ===================== 模拟·三体人（生存模式的高阶文明）：智子封锁、乱纪元、降维打击 =====================
'use strict';

const bossOf = () => (G && G.nations.find((n) => n.race.boss)) || null;
const isChaos = (n) => !!(n && n.chaosT > 0);
// 智子封锁：三体人活着时，其他国家科技速度变慢
function sophonMul(n) {
  const b = G.boss;
  return b && b.alive && n !== b ? BOSS_CFG.sophon : 1;
}
// 受到的伤害倍率：三体人恒纪元时有高阶防御（伤害打折），乱纪元期间防御瘫痪、伤害加重
const takenMul = (owner) => (isChaos(owner) ? BOSS_CFG.chaosDmg : owner.mods.armor || 1);

// 开局：科技、人口已在种族数值里；这里设科技进度、大招冷却、乱纪元计时、对真人玩家的敌意
function setupBoss(n) {
  n.techIdx = BOSS_CFG.startTech;
  n.ultCd = BOSS_CFG.firstUlt;
  n.chaosT = 0; n.chaosNext = BOSS_CFG.chaosFirst; n.chaosWarned = false;
  n.pers = 'steady';
  for (const x of G.nations) if (x.isPlayer) n.anger[x.id] = BOSS_CFG.playerAnger;
}

// ---------- 乱纪元：周期性进入，生产停止、护盾和拦截失效 ----------
function stepBoss(n, dt) {
  if (n.chaosT > 0) {
    n.chaosT = Math.max(0, n.chaosT - dt);
    n.shieldT = 0; n.netT = 0; n.netCharges = 0;
    if (n.chaosT <= 0) {
      n.chaosNext = BOSS_CFG.chaosEvery; n.chaosWarned = false;
      news(`🌞 ${n.race.emoji}${n.name} 回到恒纪元，防御恢复`);
    }
    return;
  }
  n.chaosNext -= dt;
  if (!n.chaosWarned && n.chaosNext <= BOSS_CFG.chaosWarn) {
    n.chaosWarned = true;
    Bus.emit('banner', `🌪 ${BOSS_CFG.chaosWarn} 秒后三体进入乱纪元：准备集中火力！`);
  }
  if (n.chaosNext <= 0) {
    n.chaosT = BOSS_CFG.chaosDur;
    n.shieldT = 0; n.netT = 0; n.netCharges = 0;
    news(`🌪 ${n.race.emoji}${n.name} 进入乱纪元：${BOSS_CFG.chaosDur} 秒内停产，护盾和拦截失效，受到伤害 ×${BOSS_CFG.chaosDmg}`);
    Bus.emit('banner', `🌪 三体进入乱纪元！${BOSS_CFG.chaosDur} 秒内防御瘫痪`);
  }
}

// ---------- 降维打击：预警后从中心向外展开，核心区全灭，外延区按距离衰减 ----------
// 选落点：目标国人口最密集的位置（以每座城市为候选中心，统计核心区内的人口）
function dimCenter(tgt) {
  let best = null, bs = -1;
  for (const c of tgt.cities) {
    let s = 0;
    for (const c2 of tgt.cities) {
      const d = hexDist(c.tile, c2.tile);
      if (d <= BOSS_CFG.dimOuter) s += c2.pop * (d <= BOSS_CFG.dimCore ? 1 : 0.4);
    }
    if (s > bs) { bs = s; best = c.tile; }
  }
  return best;
}
function startDim(n, tgt) {
  const center = tgt && tgt.alive ? dimCenter(tgt) : null;
  if (!center) return false;
  const d = { att: n.id, tgt: tgt.id, tile: center.idx, t0: G.t, done: new Set() };
  (G.dims = G.dims || []).push(d);
  Bus.emit('dimStrike', d);
  Bus.emit('banner', `🌀 降维打击锁定 ${tgt.race.emoji}${tgt.name}：${BOSS_CFG.dimWarn} 秒后二维化展开！`);
  tgt.anger[n.id] += 40; markHostile(n, tgt); n.lastAttack = G.t;
  return true;
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
    for (const t of W.tiles) {
      if (d.done.has(t.idx)) continue;
      const dist = hexDist(t, center);
      if (dist > r) continue;
      d.done.add(t.idx);
      if (t.owner !== d.att) t.flat = Math.max(t.flat || 0, dist <= B.dimCore ? 1 : 0.5); // 三体人自己的国土不受影响
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
