// ===================== AI：脾气决定一切 =====================
'use strict';

// 威胁度：人口占比、包裹库存、是否被情报点名
function threatOf(x, maxPop) {
  return (totalPop(x) / Math.max(1, maxPop)) * 30 + stock(x) * 0.8 + (x.intelUntil > G.t ? 120 : 0);
}

// AI 打你的理由：告诉玩家“为什么挨打”
function whyTarget(n, tgt, kind) {
  if (kind === 'revenge') return '报复你刚才的攻击';
  if (tgt.intelUntil > G.t) return `情报显示你${tgt.intelWhy || '在憋大招'}`;
  const idle = G.t - Math.max(tgt.lastAttack, 60);
  if (G.t > 90 && idle > CFG.BYSTANDER_AFTER) return `你 ${Math.round(idle)} 秒没出手，被当成隔岸观火`;
  if (G.t - (n.hostileAt[tgt.id] ?? -999) < 40) return '你最近打过它，它在记仇';
  if (kind === 'midnight') return '午夜狂欢，大家都在围攻强者';
  const alive = G.nations.filter((x) => x.alive);
  if (alive.length > 2 && alive.every((x) => x === tgt || totalPop(x) < totalPop(tgt))) return '你人口最多，成了出头鸟';
  return '看你不顺眼很久了（怒气累积）';
}
function hitPlayer(n, tgt, kind, line = true) {
  if (!tgt || !tgt.isPlayer) return;
  if (line) Bus.emit('leader', { n, text: n.race.lines[kind === 'revenge' ? 'hit' : 'launch'], to: tgt.id });
  Bus.emit('targeted', { n, tgt, why: whyTarget(n, tgt, kind) });
}
// AI 用大招：每个国家的大招在合适的时机放
function aiUlt(n, tgt, when) {
  if (n.ultCd > 0 || G.t < ULT_FIRST || !chance(G.diff.ult)) return false;
  const id = n.race.id;
  const ok = (id === 'human' && when === 'think')
    || (id === 'mushroom' && when === 'think' && chance(0.4))
    || (id === 'roach' && when === 'think' && (totalPop(n) < n.stats.peakPop * 0.55 || n.cities.filter((c) => c.ruined).length >= 2))
    || (id === 'mole' && when === 'danger')
    || ((id === 'octopus' || id === 'ai') && when === 'fire')
    || (id === 'trisolaris' && when === 'think' && tgt && totalPop(tgt) > 25);
  return ok ? useUlt(n, tgt) : false;
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
      if (!sent && n.drones >= 3) sent = launchDrones(n, tgt, Math.ceil(n.drones * 0.6)); // 再不行就放无人机
      if (sent) hitPlayer(n, tgt, 'revenge');
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
  if (techDone(n)) n.alloc = { tech: 0.1, nuke: 0.6, def: 0.3 };

  // 大量来袭：刀盾先放大招（免费护盾 + 回敬）
  const inc = incomingFor(n);
  if (inc.filter((x) => x.left < 4 && x.p.kind !== 'conv' && x.p.kind !== 'drone').length >= 2 && n.shieldT <= 0) aiUlt(n, null, 'danger');
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
    let s = n.anger[x.id] + threatOf(x, maxPop) + rnd(0, 15);
    if (x.race.boss) s += BOSS_CFG.hate + (isChaos(x) ? BOSS_CFG.chaosHate : 0); // 三体人：大家的共同威胁，乱纪元时围攻
    if (n.race.boss) s += Math.max(0, BOSS_CFG.neighborHate - capDist(n, x) * 2); // 三体人：压迫周边，离得越近越先打
    if (s > best) { best = s; tgt = x; }
  }
  if (!tgt) return;
  aiUlt(n, tgt, 'think');
  const aggro = P.aggro * G.diff.aggro * (n.race.boss ? BOSS_CFG.aggro : 1);
  const D = deliverable(n, { pad: true, sea: true, ufo: true });
  // 常规导弹骚扰：便宜、频繁；佛系不主动，记仇只打仇人
  if (n.convCd <= 0 && n.conv >= 2 && G.t > 40 && n.pers !== 'zen') {
    let ct = tgt;
    if (n.pers === 'grudge') ct = n.lastAttacker >= 0 && G.nations[n.lastAttacker].alive ? G.nations[n.lastAttacker] : null;
    const p = G.midnight ? 0.6 : 0.12 * Math.max(0.5, aggro);
    if (ct && chance(p) && launchConv(n, ct, chance(0.3) ? 2 : 1)) hitPlayer(n, ct, 'conv', false);
  }
  // 无人机骚扰：攒够一群就放出去，拆对手的发射点、消耗对手的防空；佛系不主动，记仇只打仇人
  if (n.droneCd <= 0 && n.drones >= 8 && G.t > 45 && n.pers !== 'zen') {
    let dt = tgt;
    if (n.pers === 'grudge') dt = n.lastAttacker >= 0 && G.nations[n.lastAttacker].alive ? G.nations[n.lastAttacker] : null;
    const p = G.midnight ? 0.5 : 0.2 * Math.max(0.5, aggro);
    if (dt && chance(p) && launchDrones(n, dt, Math.ceil(n.drones * rnd(0.5, 1)))) hitPlayer(n, dt, 'drone', false);
  }
  // 不许一直按兵不动：超过一段时间没出手、手里有弹药，就必须打一轮（佛系也一样，只是打得少）
  const myIdle = G.t - Math.max(n.lastAttack, 60);
  if (G.t > 90 && myIdle > G.diff.idle) {
    let sent = D > 0 ? launch(n, tgt, n.pers === 'zen' ? 0 : 1, { pad: true, sea: true, ufo: true }) : 0;
    if (!sent && n.convCd <= 0) sent = launchConv(n, tgt, 1);
    if (!sent && n.drones >= 3) sent = launchDrones(n, tgt, Math.ceil(n.drones / 2));
    if (sent) { hitPlayer(n, tgt, 'idle'); return; }
  }
  if (D <= 0 || G.t - n.lastStrike < 8) return;

  let fire = false, scale = 1, kind = 'think';
  if (tgt.race.boss && isChaos(tgt)) { fire = true; scale = 2; } // 三体乱纪元：倾巢而出
  else if (G.midnight) { // 午夜：一半时间围攻最强的国家（不再补刀最弱的，避免躺赢），其余时间各打各的
    fire = true; scale = 2; kind = 'midnight';
    if (chance(0.5)) tgt = G.nations.filter((x) => x.alive && x !== n).sort((a, b) => threatOf(b, maxPop) - threatOf(a, maxPop))[0] || tgt;
  }
  else if (tgt.intelUntil > G.t && D >= 2) { fire = true; scale = D >= 6 ? 2 : 1; } // 情报点名：先下手为强
  else if (n.pers === 'crazy' && G.t > P.start && chance(0.08 * G.diff.aggro)) { fire = true; scale = rndi(0, 2); tgt = pick(G.nations.filter((x) => x.alive && x !== n)); }
  else if (n.pers === 'grudge' && n.lastAttacker >= 0 && G.nations[n.lastAttacker].alive && D >= 2) { fire = chance(0.35); scale = 2; tgt = G.nations[n.lastAttacker]; }
  else if (G.t > P.start && D >= 2 && chance(0.35 * aggro)) { fire = true; scale = D >= 8 || n.race.boss ? 2 : 1; }

  if (fire) {
    if (D >= 3) aiUlt(n, tgt, 'fire'); // 鱼叉、赛博朋克：开火前先放大招
    const sent = launch(n, tgt, scale, { pad: true, sea: true, ufo: true });
    if (sent) hitPlayer(n, tgt, kind);
  }
}
