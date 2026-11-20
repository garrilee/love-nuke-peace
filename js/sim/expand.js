// ===================== 模拟·国家扩张：占领相邻的空地和已灭亡国家的土地 =====================
// 只在 G.expand 开启时生效（单人生存模式）。全自动：每隔一小段时间占一块和本国相邻的无主陆地，离首都近的优先。
//   - 无主陆地 = 没人占过的陆地，或者已被核平的国家留下的土地；活着的国家的土地不能占；辐射太重的地要等散掉
//   - 每占满一定数量的新地块，轮流获得一座新城市 / 一个新投送站
//   - 占到灭亡国家的城市废墟或设施所在的地块：直接接收，自动重建
'use strict';

const freeLand = (t) => G.world.isLand(t) && (t.owner < 0 || !G.nations[t.owner].alive);
const capitalOf = (n) => (n.cities.find((c) => c.isCapital) || n.cities[0] || {}).tile || null;

function stepExpand(dt) {
  if (!G.expand) return;
  const E = CFG.EXPAND;
  for (const n of G.nations) {
    if (!n.alive) continue;
    // 人口越多扩得越快，被打残了就慢下来
    n.expandT = (n.expandT || 0) + dt * clamp(totalPop(n) / Math.max(1, n.startPop), E.rateMin, E.rateMax) * (n.mods.expand || 1); // mods.expand：个别国家扩得更快
    if (n.expandT < E.every) continue;
    n.expandT = expandOnce(n) ? 0 : E.every * 0.6; // 暂时没有地可占：过一会儿再看
  }
}

// 占一块地；成功返回 true
function expandOnce(n) {
  const W = G.world, E = CFG.EXPAND, home = capitalOf(n);
  if (!home) return false;
  let best = null, bs = Infinity;
  for (const t of W.tiles) {
    if (t.owner !== n.id) continue;
    for (const v of W.nb(t)) {
      if (!freeLand(v) || v.rad > E.radMax) continue;
      const s = hexDist(home, v) + rnd(0, 1.5) - (v.city || v.fac ? 2 : 0); // 有城市废墟或设施的地块更值得先占
      if (s < bs) { bs = s; best = v; }
    }
  }
  if (!best) return false;
  claimTile(n, best);
  n.grabbed = (n.grabbed || 0) + 1;
  if (n.grabbed % E.gainEvery === 0) { // 攒够一批新地：城市和投送站轮流来，放不下就换另一种
    n.gains = (n.gains || 0) + 1;
    if (n.gains % 2 === 1) { addCity(n) || addPad(n); } else { addPad(n) || addCity(n); }
  }
  Bus.emit('territory', { n, tile: best });
  return true;
}

function claimTile(n, t) {
  const old = t.owner >= 0 ? G.nations[t.owner] : null, E = CFG.EXPAND;
  t.owner = n.id;
  if (t.city && old) { // 接收灭亡国家的城市：按废墟接手，自动重建；规模打折，不再是首都
    const c = t.city;
    old.cities = old.cities.filter((x) => x !== c);
    c.nation = n.id; c.isCapital = false; c.ruined = true; c.rebuild = 0; c.pop = 0; c.flatUntil = 0;
    c.basePop *= E.absorbBase;
    n.cities.push(c);
    news(`🏳 ${n.race.emoji}${n.name} 接管了 ${old.name} 的废墟「${c.name}」`);
    Bus.emit('cityAdded', { n, city: c });
  }
  if (t.fac && old) { // 接收设施：按宕机接手，自动修复
    const f = t.fac;
    old.facilities = old.facilities.filter((x) => x !== f);
    f.nation = n.id; f.alive = false; f.rebuild = 0; f.missiles = 0; f.flatUntil = 0;
    n.facilities.push(f);
  }
}

// 新城市：建在自己的平原、森林或沙漠上，离别的城市至少 3 格（实在没地方就 2 格）；开始时人很少，慢慢长
function addCity(n) {
  const W = G.world, E = CFG.EXPAND;
  if (n.cities.length >= E.maxCities) return false;
  const ok = (t) => t.owner === n.id && !t.city && !t.fac && (t.terrain === 'plain' || t.terrain === 'forest' || t.terrain === 'desert');
  let pool = [];
  for (let md = 3; md >= 2 && !pool.length; md--) pool = W.tiles.filter((t) => ok(t) && W.cities.every((c) => hexDist(c.tile, t) >= md));
  if (!pool.length) return false;
  const t = pick(pool), k = n.cities.length;
  const basePop = rnd(13, 20) * (n.mods.pop || 1) * E.cityBase;
  const city = { id: W.cities.length, nation: n.id, tile: t, name: `${n.name}${['新城', '新港', '新镇', '新市', '新堡', '新岭'][k % 6]}`, pop: E.cityStart, basePop,
    injured: 0, injuredTimer: 0, ruined: false, rebuild: 0, isCapital: false, lights: [] };
  for (let i = 0, m = Math.round(10 + basePop * 0.9); i < m; i++) { // 城市灯光点
    const a = rand() * Math.PI * 2, d = Math.pow(rand(), 0.7) * CFG.HEX * 1.15;
    city.lights.push({ x: Math.cos(a) * d, y: Math.sin(a) * d * 0.85, s: rnd(0.6, 1.5), ph: rand() * 6.28, rank: rand() });
  }
  t.city = city; W.cities.push(city); n.cities.push(city);
  news(`🏗 ${n.race.emoji}${n.name} 在新占的土地上建起了「${city.name}」`);
  Bus.emit('cityAdded', { n, city });
  return true;
}

// 新投送站：离城市至少 2 格
function addPad(n) {
  const W = G.world, E = CFG.EXPAND;
  if (facOf(n, 'pad').length >= E.maxPads) return false;
  const pool = W.tiles.filter((t) => t.owner === n.id && !t.city && !t.fac && t.terrain !== 'ice' && n.cities.every((c) => hexDist(c.tile, t) >= 2));
  if (!pool.length) return false;
  const t = pick(pool);
  const f = { id: W.facilities.length, nation: n.id, tile: t, type: 'pad', alive: true, missiles: 0, rebuild: 0 };
  t.fac = f; W.facilities.push(f); n.facilities.push(f);
  news(`🚀 ${n.race.emoji}${n.name} 在新占的土地上建了一座投送站`);
  Bus.emit('facAdded', { n, fac: f });
  return true;
}
