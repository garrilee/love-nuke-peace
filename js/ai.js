// ===================== AI：脾气决定一切 =====================
'use strict';

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
  G.nations.forEach((x, i) => { if (x.alive && i !== n.id) n.anger[i] += 0.4 + (pops[i] / maxPop) * 0.4; });

  // 选收件人
  let tgt = null, best = -1e9;
  for (const x of G.nations) {
    if (!x.alive || x === n) continue;
    const s = n.anger[x.id] + rnd(0, 15);
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
  if (D <= 0 || G.t - n.lastStrike < 8) return;

  let fire = false, scale = 1;
  if (G.midnight) { // 午夜：补刀最弱的国家
    fire = true; scale = 2;
    tgt = G.nations.filter((x) => x.alive && x !== n).sort((a, b) => totalPop(a) - totalPop(b))[0] || tgt;
  }
  else if (n.pers === 'crazy' && G.t > P.start && chance(0.08)) { fire = true; scale = rndi(0, 2); tgt = pick(G.nations.filter((x) => x.alive && x !== n)); }
  else if (n.pers === 'grudge' && n.lastAttacker >= 0 && G.nations[n.lastAttacker].alive && D >= 2) { fire = chance(0.35); scale = 2; tgt = G.nations[n.lastAttacker]; }
  else if (G.t > P.start && D >= 2 && chance(0.35 * P.aggro)) { fire = true; scale = D >= 8 ? 2 : 1; }

  if (fire) {
    const sent = launch(n, tgt, scale, { pad: true, sea: true, ufo: true });
    if (sent && tgt.isPlayer) Bus.emit('leader', { n, text: n.race.lines.launch });
  }
}
