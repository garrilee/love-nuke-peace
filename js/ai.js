// ===================== AI：脾气决定一切 =====================
'use strict';

// 威胁度：人口占比、包裹库存、是否被情报点名
function threatOf(x, maxPop) {
  return (totalPop(x) / Math.max(1, maxPop)) * 30 + stock(x) * 0.8 + (x.intelUntil > G.t ? 120 : 0);
}

function aiStep(n, dt) {
  n.aiNext -= dt;
  // 报复不等思考周期
  if (n.retaliate && G.t >= n.retaliate.at) {
    const tgt = G.nations[n.retaliate.target];
    n.retaliate = null;
    if (tgt && tgt.alive && G.t - n.lastStrike > 6) {
      const scale = n.pers === 'grudge' || n.pers === 'hot' ? 2 : n.pers === 'zen' ? 0 : 1;
      let sent = launch(n, tgt, scale, { pad: true, sea: true, ufo: true });
      if (!sent) sent = launchConv(n, tgt, n.pers === 'zen' ? 0 : 1); // 没有核包裹就先用常规导弹还击
      if (sent && tgt.isPlayer) Bus.emit('leader', { n, text: n.race.lines.hit });
    }
  }
  if (n.aiNext > 0) return;
  const thinkDt = G.t - (n.lastThink ?? G.t); n.lastThink = G.t;
  n.aiNext = rnd(2, 3.2);
  const P = PERSONALITIES[n.pers];

  // 分配
  const recentlyHit = G.t - n.lastHit < 30;
  if (G.t < 120) n.alloc = { tech: 0.6, nuke: 0.25, def: 0.15 };
  else if (recentlyHit) n.alloc = { tech: 0.3, nuke: 0.45, def: 0.25 };
  else n.alloc = { tech: 0.45, nuke: 0.35, def: 0.2 };
  if (n.techIdx >= TECHS.length) n.alloc = { tech: 0.1, nuke: 0.6, def: 0.3 };

  autoDefend(n);

  // 记仇值缓慢累积：看谁都不顺眼，最看不惯人多的
  const pops = G.nations.map((x) => (x.alive ? totalPop(x) : 0));
  const maxPop = Math.max(...pops);
  G.nations.forEach((x, i) => {
    if (!x.alive || i === n.id) return;
    n.anger[i] += 0.4 + (pops[i] / maxPop) * 0.4;
    // 隔岸观火：长时间不出手、坐看别人互殴的国家（AI 和玩家一视同仁），闲得越久越招恨
    const idle = G.t - Math.max(x.lastAttack, 60);
    if (G.t > 90 && idle > CFG.BYSTANDER_AFTER) n.anger[i] += 1.5 + (idle - CFG.BYSTANDER_AFTER) / 20;
    // 停火降温：对方超过一段时间没有攻击我，我对它的怒气按半衰期慢慢回落；怒气设上限
    const quiet = G.t - (n.hostileAt[i] ?? -999);
    if (quiet > CFG.ANGER_COOL_AFTER) n.anger[i] *= Math.pow(0.5, thinkDt / CFG.ANGER_HALF_LIFE);
    n.anger[i] = clamp(n.anger[i], 0, CFG.ANGER_MAX);
  });

  // 选目标：怒气 + 威胁度（出头鸟：人口最多、库存最多的国家最招针对）+ 情报点名
  let tgt = null, best = -1e9;
  for (const x of G.nations) {
    if (!x.alive || x === n) continue;
    const s = n.anger[x.id] + threatOf(x, maxPop) + rnd(0, 15);
    if (s > best) { best = s; tgt = x; }
  }
  if (!tgt) return;
  const D = deliverable(n, { pad: true, sea: true, ufo: true });
  // 常规导弹骚扰：便宜、频繁；佛系不主动，记仇只打仇人
  if (n.convCd <= 0 && n.conv >= 2 && G.t > 40 && n.pers !== 'zen') {
    let ct = tgt;
    if (n.pers === 'grudge') ct = n.lastAttacker >= 0 && G.nations[n.lastAttacker].alive ? G.nations[n.lastAttacker] : null;
    const p = G.midnight ? 0.6 : 0.12 * Math.max(0.5, P.aggro);
    if (ct && chance(p)) launchConv(n, ct, chance(0.3) ? 2 : 1);
  }
  // 不许一直按兵不动：超过一段时间没出手、手里有弹药，就必须打一轮（佛系也一样，只是打得少）
  const myIdle = G.t - Math.max(n.lastAttack, 60);
  if (G.t > 90 && myIdle > CFG.AI_IDLE_FORCE) {
    let sent = D > 0 ? launch(n, tgt, n.pers === 'zen' ? 0 : 1, { pad: true, sea: true, ufo: true }) : 0;
    if (!sent && n.convCd <= 0) sent = launchConv(n, tgt, 1);
    if (sent) { if (tgt.isPlayer) Bus.emit('leader', { n, text: n.race.lines.launch }); return; }
  }
  if (D <= 0 || G.t - n.lastStrike < 8) return;

  let fire = false, scale = 1;
  if (G.midnight) { // 午夜：一半时间围攻最强的国家（不再补刀最弱的，避免躺赢），其余时间各打各的
    fire = true; scale = 2;
    if (chance(0.5)) tgt = G.nations.filter((x) => x.alive && x !== n).sort((a, b) => threatOf(b, maxPop) - threatOf(a, maxPop))[0] || tgt;
  }
  else if (tgt.intelUntil > G.t && D >= 2) { fire = true; scale = D >= 6 ? 2 : 1; } // 情报点名：先下手为强
  else if (n.pers === 'crazy' && G.t > P.start && chance(0.08)) { fire = true; scale = rndi(0, 2); tgt = pick(G.nations.filter((x) => x.alive && x !== n)); }
  else if (n.pers === 'grudge' && n.lastAttacker >= 0 && G.nations[n.lastAttacker].alive && D >= 2) { fire = chance(0.35); scale = 2; tgt = G.nations[n.lastAttacker]; }
  else if (G.t > P.start && D >= 2 && chance(0.35 * P.aggro)) { fire = true; scale = D >= 8 ? 2 : 1; }

  if (fire) {
    const sent = launch(n, tgt, scale, { pad: true, sea: true, ufo: true });
    if (sent && tgt.isPlayer) Bus.emit('leader', { n, text: n.race.lines.launch });
  }
}
