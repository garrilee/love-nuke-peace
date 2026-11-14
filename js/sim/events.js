// ===================== 模拟·全球事件：地图空投 + 全局天气（不弹窗、不用读字）=====================
// 空投：地图上随机落下一个补给箱，图标就是奖励，谁先点到（AI 按距离和运气）归谁。
//   G.crate = { tile 地块序号, kind 'nuke' | 'energy' | 'tech', t0, until, aiAt AI 来拿的时刻, aiId }
// 天气：直接生效的全局状态，顶栏显示图标和倒计时。
//   G.weather = { key, until }
'use strict';

const GEV = {
  first: 60,           // 第一次事件：开局 60 秒后
  every: [70, 100],    // 之后每隔 70～100 秒一次（空投和天气轮流来）
  crateLife: 20,       // 补给箱在地图上停留 20 秒
  aiGrab: [7, 16],     // AI 最快 7 秒后来拿；离箱子越远越慢
};
// 补给箱：icon 画在地图上，give 发奖励
const CRATES = {
  nuke:   { icon: '☢', color: '#ff6b5b', label: '+3 核包裹', give: (n) => { const lv = Math.max(1, bestLevel(n)); n.parcels[lv] = Math.min(CFG.STOCK_CAP, n.parcels[lv] + 3); } },
  energy: { icon: '⚡', color: '#ffd23a', label: '能量加满', give: (n) => { n.energy = CFG.ENERGY_CAP; n.netE = CFG.NET_E_CAP; n.shieldCd = 0; } },
  tech:   { icon: '🔬', color: '#7fd6ff', label: '+70 科研', give: (n) => { n.techPts += 70; } },
};
// 天气：dur 持续秒数（快速局减半）
const WEATHERS = {
  storm: { icon: '🌞', name: '太阳风暴', effect: '拦截失效', dur: 25, start: () => { for (const n of G.nations) if (n.alive) { n.netT = 0; n.netCharges = 0; } } },
  dust:  { icon: '🌪', name: '沙尘暴', effect: '小摩托停飞', dur: 25 },
  boom:  { icon: '🏭', name: '军备竞赛', effect: '产出 ×1.5', dur: 20 },
  truce: { icon: '🕊', name: '全球停火', effect: '谁都不能发射', dur: 15 },
};
const weatherIs = (key) => !!(G.weather && G.weather.key === key && G.weather.until > G.t);

function stepGlobalEvents() {
  if (G.nextGev === undefined) G.nextGev = GEV.first * tScale();
  // 天气到期
  if (G.weather && G.t >= G.weather.until) { const w = WEATHERS[G.weather.key]; G.weather = null; news(`${w.icon} ${w.name}结束`); }
  // 补给箱：AI 来拿，或者过期消失
  const c = G.crate;
  if (c) {
    const ai = G.nations[c.aiId];
    if (ai && ai.alive && G.t >= c.aiAt) takeCrate(ai);
    else if (G.t >= c.until) { G.crate = null; Bus.emit('crateGone', c.tile); }
  }
  if (G.t < G.nextGev) return;
  G.nextGev = G.t + rnd(...GEV.every) * tScale();
  if (G.nations.filter((n) => n.alive).length < 2) return;
  // 空投和天气轮流来（上一次是空投这次就是天气）；已有箱子或天气时不叠加
  if (G.lastGev !== 'crate' && !G.crate) { G.lastGev = 'crate'; spawnCrate(); }
  else if (!G.weather) { G.lastGev = 'weather'; startWeather(); }
}

function spawnCrate() {
  const W = G.world, alive = G.nations.filter((n) => n.alive);
  // 落点：还活着的国家的国土上、不是城市也不是设施的地块
  const tiles = W.tiles.filter((t) => t.owner >= 0 && G.nations[t.owner].alive && !t.city && !t.fac);
  if (!tiles.length) return;
  const tile = pick(tiles);
  const kind = pick(Object.keys(CRATES).filter((k) => k !== 'tech' || alive.some((n) => !techDone(n))));
  // AI 谁来拿、什么时候来：离得越近越快，再加一点运气；真人玩家至少有 7 秒
  let aiId = -1, aiAt = Infinity;
  for (const n of alive) {
    if (n.isPlayer) continue;
    const at = G.t + GEV.aiGrab[0] + capDist(n, { cities: [{ tile, isCapital: true }] }) * 0.6 + rnd(0, GEV.aiGrab[1] - GEV.aiGrab[0]);
    if (at < aiAt) { aiAt = at; aiId = n.id; }
  }
  G.crate = { tile: tile.idx, kind, t0: G.t, until: G.t + GEV.crateLife, aiAt, aiId };
  news(`📦 空投补给落在 ${G.nations[tile.owner].race.emoji}${G.nations[tile.owner].name} 境内，先到先得`);
  Bus.emit('crate', G.crate);
}
// 领走补给箱（玩家点击，或 AI 到点来拿）
function takeCrate(n) {
  const c = G.crate;
  if (!c || !n || !n.alive) return 0;
  let kind = c.kind;
  if (kind === 'tech' && techDone(n)) kind = 'nuke'; // 科技已经研发完：换成核包裹
  CRATES[kind].give(n);
  G.crate = null;
  news(`📦 ${n.race.emoji}${n.name} 抢到了空投补给（${CRATES[kind].label}）`);
  Bus.emit('crateTaken', { n, kind, tile: G.world.tiles[c.tile] });
  return 1;
}

function startWeather() {
  const key = pick(Object.keys(WEATHERS).filter((k) => k !== G.lastWeather));
  const w = WEATHERS[key];
  G.lastWeather = key;
  G.weather = { key, until: G.t + w.dur * tScale() };
  if (w.start) w.start();
  news(`${w.icon} ${w.name}：${w.effect}，持续 ${Math.round(w.dur * tScale())} 秒`);
  Bus.emit('banner', `${w.icon} ${w.name}：${w.effect}`);
  Bus.emit('weather', key);
}
