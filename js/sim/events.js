// ===================== 模拟·全球事件：每隔一段时间弹出一个事件，各国投票或各自二选一 =====================
// 流程：事件开始 → AI 立刻表态，真人玩家在限时内选择（超时算默认选项）→ 到时间或所有真人都选完后结算。
// G.gev = { key, t0, deadline, tgt（投票类事件针对的国家 id，没有为 -1）, votes: { 国家 id: 'a' | 'b' } }
'use strict';

const GEV = {
  first: 100,          // 第一次全球事件：开局 100 秒后
  every: [110, 150],   // 之后每隔 110～150 秒一次
  wait: 15,            // 真人玩家有 15 秒做选择
};
// kind：vote 多数通过才生效；pick 每个国家各自二选一；auto 没有选择、直接生效
// a / b：两个选项的名字和说明；def：真人超时的默认选项；ai(n, ev)：AI 怎么选
const GEVENTS = [
  {
    key: 'sanction', kind: 'vote', icon: '⚖', name: '联合国制裁',
    target: (alive) => alive.slice().sort((x, y) => totalPop(y) - totalPop(x))[0],
    desc: (t) => `人口第一的 ${t.name} 被提请制裁：通过后它的产出 -30%，持续 45 秒。`,
    a: ['赞成制裁', '削弱领先者'], b: ['反对', '不干涉'], def: 'b',
    ai: (n, ev) => (n.id === ev.tgt ? 'b' : n.race.boss ? 'b' : chance(0.8) ? 'a' : 'b'),
    pass: (ev, t) => { t.sanctionUntil = G.t + 45 * tScale(); return `制裁通过：${t.race.emoji}${t.name} 产出 -30%，持续 ${Math.round(45 * tScale())} 秒`; },
    fail: (ev, t) => `制裁被否决：${t.race.emoji}${t.name} 逃过一劫`,
  },
  {
    key: 'aid', kind: 'vote', icon: '🚑', name: '人道救援',
    target: (alive) => alive.slice().sort((x, y) => totalPop(x) - totalPop(y))[0],
    desc: (t) => `人口最少的 ${t.name} 请求救援：通过后它的每座城市恢复 15% 人口、废墟立刻修好；每个投赞成的国家出 8 点预算。`,
    a: ['赞成救援', '出 8 预算，扶一把最弱的'], b: ['反对', '一毛不拔'], def: 'b',
    ai: (n, ev) => (n.id === ev.tgt ? 'a' : n.race.boss ? 'b' : chance(n.pers === 'zen' || n.pers === 'steady' ? 0.7 : 0.35) ? 'a' : 'b'),
    pass: (ev, t) => {
      for (const c of t.cities) { c.ruined = false; c.rebuild = 0; c.pop = Math.min(c.basePop, c.pop + c.basePop * 0.15); }
      for (const n of G.nations) if (n.alive && n !== t && ev.votes[n.id] === 'a') n.bank = Math.max(0, n.bank - 8);
      return `救援通过：${t.race.emoji}${t.name} 的城市恢复了 15% 人口`;
    },
    fail: (ev, t) => `救援被否决：${t.race.emoji}${t.name} 只能自求多福`,
  },
  {
    key: 'treaty', kind: 'vote', icon: '🕊', name: '限核倡议',
    target: () => null,
    desc: () => '有国家提议限制核弹当量：通过后所有核弹威力 -30%，持续 45 秒。',
    a: ['赞成限核', '大家都轻一点'], b: ['反对', '照常开打'], def: 'b',
    ai: (n) => (n.race.boss ? 'b' : n.pers === 'zen' || n.pers === 'steady' ? 'a' : n.pers === 'grudge' ? (chance(0.5) ? 'a' : 'b') : 'b'),
    pass: () => { G.treatyUntil = G.t + 45 * tScale(); return `限核倡议通过：核弹威力 -30%，持续 ${Math.round(45 * tScale())} 秒`; },
    fail: () => '限核倡议被否决：该怎么炸还怎么炸',
  },
  {
    key: 'arms', kind: 'pick', icon: '🧳', name: '黑市军火商',
    desc: () => '军火商上门推销，二选一。',
    a: ['买核弹', '花 25 能量，换 3 个当前最高级的核包裹'], b: ['买防御', '白送 40 能量，护盾冷却清零'], def: 'b',
    ai: (n) => (n.race.boss || n.pers === 'hot' || n.pers === 'crazy' ? 'a' : 'b'),
    apply: (n, v) => {
      if (v === 'a') { if (n.energy >= 25) { n.energy -= 25; const lv = Math.max(1, bestLevel(n)); n.parcels[lv] = Math.min(CFG.STOCK_CAP, n.parcels[lv] + 3); } }
      else { n.energy = Math.min(CFG.ENERGY_CAP, n.energy + 40); n.shieldCd = 0; }
    },
    done: (ev) => `黑市军火商收摊：${count(ev, 'a')} 国买了核弹，${count(ev, 'b')} 国买了防御`,
  },
  {
    key: 'summit', kind: 'pick', icon: '🔬', name: '科研峰会',
    desc: () => '各国受邀交流技术。共享的国家越多，共享者收益越高；但只要有人共享，窃取者拿得更多。',
    a: ['共享', '至少两国共享：各得 60 科研点；只有你共享：10 点'], b: ['窃取', '有人共享：得 80 科研点；没人共享：0'], def: 'a',
    ai: (n) => (n.race.boss || n.pers === 'hot' || n.pers === 'crazy' || n.pers === 'grudge' ? 'b' : 'a'),
    resolve: (ev) => {
      const share = count(ev, 'a');
      for (const n of G.nations) {
        if (!n.alive || !ev.votes[n.id]) continue;
        const pts = ev.votes[n.id] === 'a' ? (share >= 2 ? 60 : 10) : (share >= 1 ? 80 : 0);
        if (techDone(n)) n.energy = Math.min(CFG.ENERGY_CAP, n.energy + pts * 0.5); else n.techPts += pts;
      }
      return `科研峰会结束：${share} 国共享，${count(ev, 'b')} 国窃取`;
    },
  },
  {
    key: 'storm', kind: 'auto', icon: '🌞', name: '太阳风暴',
    run: () => {
      const d = 25 * tScale();
      for (const n of G.nations) if (n.alive) { n.netT = 0; n.netCharges = 0; n.netCd = Math.max(n.netCd, d); }
      return `太阳风暴来袭：所有国家的拦截系统瘫痪 ${Math.round(d)} 秒`;
    },
  },
];
const gevDef = (key) => GEVENTS.find((e) => e.key === key);
const count = (ev, v) => Object.values(ev.votes).filter((x) => x === v).length;

function stepGlobalEvents() {
  if (G.nextGev === undefined) G.nextGev = GEV.first * tScale();
  const ev = G.gev;
  if (!ev) {
    if (G.t < G.nextGev) return;
    G.nextGev = G.t + rnd(...GEV.every) * tScale();
    const alive = G.nations.filter((n) => n.alive), normal = alive.filter((n) => !n.race.boss);
    if (alive.length < 3) return; // 只剩两个国家：不再有全球事件
    let def = pick(GEVENTS.filter((e) => e.key !== G.lastGev));
    G.lastGev = def.key;
    if (def.kind === 'auto') { const msg = def.run(); news(`${def.icon} ${msg}`); Bus.emit('banner', `${def.icon} ${msg}`); return; }
    const tgt = def.target ? def.target(normal) : null;
    if (def.kind === 'vote' && def.target && !tgt && def.key !== 'treaty') return;
    G.gev = { key: def.key, t0: G.t, deadline: G.t + GEV.wait, tgt: tgt ? tgt.id : -1, votes: {} };
    for (const n of alive) if (!n.isPlayer) G.gev.votes[n.id] = def.ai(n, G.gev);
    news(`${def.icon} 全球事件【${def.name}】：${def.desc(tgt)}`);
    Bus.emit('gevent', G.gev.key);
    return;
  }
  // 到时间，或所有活着的真人都选完了：结算
  const humans = G.nations.filter((n) => n.alive && n.isPlayer);
  if (G.t < ev.deadline && humans.some((n) => !ev.votes[n.id])) return;
  resolveGlobalEvent(ev);
}
function voteGlobalEvent(n, v) {
  const ev = G.gev;
  if (!ev || !n.alive || ev.votes[n.id] || (v !== 'a' && v !== 'b')) return 0;
  ev.votes[n.id] = v;
  return 1;
}
function resolveGlobalEvent(ev) {
  const def = gevDef(ev.key), tgt = G.nations[ev.tgt];
  for (const n of G.nations) if (n.alive && !ev.votes[n.id]) ev.votes[n.id] = def.def; // 超时：默认选项
  let msg;
  if (def.kind === 'vote') {
    if (tgt && !tgt.alive) msg = `${def.name}：对象已经不在了，议案作废`;
    else { const yes = count(ev, 'a'), no = count(ev, 'b'); msg = (yes > no ? def.pass(ev, tgt) : def.fail(ev, tgt)) + `（${yes} 票赞成，${no} 票反对）`; }
  } else if (def.resolve) msg = def.resolve(ev);
  else { for (const n of G.nations) if (n.alive) def.apply(n, ev.votes[n.id]); msg = def.done(ev); }
  G.gev = null;
  news(`${def.icon} ${msg}`);
  Bus.emit('banner', `${def.icon} ${msg}`);
}
