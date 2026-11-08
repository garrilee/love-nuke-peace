// ===================== 地图生成：大陆、国家、城市、设施 =====================
'use strict';

function generateWorld(seed, raceIds, humanRaceIds) {
  const humans = [].concat(humanRaceIds);
  setSeed(seed);
  const fbm = makeNoise(seed * 7 + 1);
  const fbm2 = makeNoise(seed * 13 + 5);
  const C = CFG.MAP_COLS, R = CFG.MAP_ROWS;
  const tiles = [];
  const elev = [];
  for (let r = 0; r < R; r++) {
    for (let c = 0; c < C; c++) {
      const p = hexToPixel(c, r);
      const nx = c / C - 0.5, ny = r / R - 0.5;
      let e = fbm(c * (4.2 / C), r * (3.06 / R), 5);
      const fall = Math.sqrt(nx * nx * 1.1 + ny * ny * 1.6);
      e = e - fall * 0.55;
      elev.push(e);
      tiles.push({ c, r, x: p.x, y: p.y, idx: r * C + c, elev: e, terrain: 'ocean', owner: -1, rad: 0, scorch: 0, city: null, fac: null, phase: rand() * 6.28 });
    }
  }
  // 陆地比例固定 ~46%
  const sorted = elev.slice().sort((a, b) => a - b);
  const seaLevel = sorted[Math.floor(sorted.length * 0.54)];
  const deepLevel = sorted[Math.floor(sorted.length * 0.30)];
  const landVals = sorted.filter((v) => v > seaLevel);
  const mountLevel = landVals[Math.floor(landVals.length * 0.88)];
  for (const t of tiles) {
    const lat = Math.abs(t.r / (R - 1) - 0.5) * 2;
    if (t.elev <= seaLevel) { t.terrain = t.elev < deepLevel ? 'deep' : 'ocean'; continue; }
    const moist = fbm2(t.c * 0.12, t.r * 0.12, 3);
    if (lat > 0.86) t.terrain = 'ice';
    else if (t.elev > mountLevel) t.terrain = 'mountain';
    else if (moist < 0.42 && lat < 0.6) t.terrain = 'desert';
    else if (moist > 0.56) t.terrain = 'forest';
    else t.terrain = 'plain';
  }
  const T = (c, r) => tiles[r * C + c];
  const isLand = (t) => t.terrain !== 'ocean' && t.terrain !== 'deep';
  const nb = (t) => neighborsOf(t.c, t.r).map(([c, r]) => T(c, r));
  for (const t of tiles) t.coastal = isLand(t) && nb(t).some((n) => !isLand(n));

  // 连通分量
  const comp = new Int32Array(tiles.length).fill(-1);
  const compSize = [];
  for (const t of tiles) {
    if (!isLand(t) || comp[t.idx] >= 0) continue;
    const id = compSize.length; let n = 0;
    const q = [t]; comp[t.idx] = id;
    while (q.length) { const u = q.pop(); n++; for (const v of nb(u)) if (isLand(v) && comp[v.idx] < 0) { comp[v.idx] = id; q.push(v); } }
    compSize.push(n);
  }

  // 国家种子：最远点采样
  const N = raceIds.length;
  const cand = tiles.filter((t) => isLand(t) && t.terrain !== 'ice' && t.terrain !== 'mountain' && compSize[comp[t.idx]] >= 30 &&
    t.c > 1 && t.c < C - 2 && t.r > 1 && t.r < R - 2);
  const seeds = [pick(cand)];
  while (seeds.length < N) {
    let best = null, bd = -1;
    for (const t of cand) {
      const d = Math.min(...seeds.map((s) => hexDist(s, t)));
      const score = d + rand() * 2;
      if (score > bd) { bd = score; best = t; }
    }
    seeds.push(best);
  }

  // 均衡 BFS 扩张领土
  const landCount = tiles.filter(isLand).length;
  const cap = Math.floor(landCount / (N + 0.6));
  const fronts = seeds.map((s) => [s]);
  const sizes = new Array(N).fill(1);
  seeds.forEach((s, i) => { s.owner = i; });
  let grew = true;
  while (grew) {
    grew = false;
    for (let i = 0; i < N; i++) {
      if (sizes[i] >= cap) continue;
      const f = fronts[i];
      // 每轮扩张若干格
      let steps = 3;
      while (steps-- > 0 && f.length) {
        const k = Math.floor(rand() * Math.min(f.length, 6));
        const u = f[k];
        const free = nb(u).filter((v) => isLand(v) && v.owner < 0);
        if (!free.length) { f.splice(k, 1); continue; }
        const v = pick(free);
        v.owner = i; sizes[i]++; f.push(v); grew = true;
      }
    }
  }

  // 城市与设施
  const cities = [], facilities = [];
  const nations = [];
  for (let i = 0; i < N; i++) {
    const race = RACES.find((r) => r.id === raceIds[i]);
    const own = tiles.filter((t) => t.owner === i);
    const names = shuffle(race.cities.slice());
    const nCities = 5;
    const placed = [];
    const capital = seeds[i];
    placed.push(capital);
    for (let md = 3; md >= 2 && placed.length < nCities; md--) {
      for (const t of shuffle(own.filter((t) => t.terrain === 'plain' || t.terrain === 'forest' || t.terrain === 'desert'))) {
        if (placed.length >= nCities) break;
        if (placed.every((p) => hexDist(p, t) >= md)) placed.push(t);
      }
    }
    const popMul = race.mods.pop || 1;
    const nation = {
      id: i, race, name: race.name, color: race.color, isPlayer: humans.includes(race.id),
      cities: [], facilities: [],
    };
    placed.forEach((t, k) => {
      const pop = (k === 0 ? 28 : rnd(13, 20)) * popMul;
      const city = { id: cities.length, nation: i, tile: t, name: names[k % names.length] + (k >= names.length ? '二' : ''), pop, basePop: pop, injured: 0, injuredTimer: 0, ruined: false, rebuild: 0, isCapital: k === 0, lights: null };
      t.city = city; cities.push(city); nation.cities.push(city);
    });
    // 设施
    const used = new Set(placed);
    const okFac = (t) => !used.has(t) && t.terrain !== 'ice' && [...used].every((u) => hexDist(u, t) >= 2);
    const place = (type, filter) => {
      let pool = shuffle(own.filter((t) => okFac(t) && filter(t)));
      if (!pool.length) pool = shuffle(own.filter((t) => !used.has(t)));
      if (!pool.length) return null;
      const t = pool[0];
      const f = { id: facilities.length, nation: i, tile: t, type, alive: true, missiles: 0, rebuild: 0 };
      t.fac = f; used.add(t); facilities.push(f); nation.facilities.push(f);
      return f;
    };
    // 先放海底仓（占住海岸）和机场，再把投送站撒满国土
    if (own.some((t) => t.coastal)) place('sea', (t) => t.coastal);
    place('ufo', (t) => t.terrain === 'plain' || t.terrain === 'desert' || t.terrain === 'forest');
    for (let k = 0; k < CFG.PADS_PER_NATION; k++) place('pad', (t) => t.terrain !== 'ice');
    nations.push(nation);
  }

  // 城市灯光点（预计算）
  for (const city of cities) {
    const n = Math.round(10 + city.basePop * 0.9);
    city.lights = [];
    for (let k = 0; k < n; k++) {
      const a = rand() * Math.PI * 2;
      const d = Math.pow(rand(), 0.7) * CFG.HEX * (city.isCapital ? 1.5 : 1.15);
      city.lights.push({ x: Math.cos(a) * d, y: Math.sin(a) * d * 0.85, s: rnd(0.6, 1.5), ph: rand() * 6.28, rank: rand() });
    }
  }

  return { tiles, cities, facilities, nations, T, isLand, nb, windAngle: rnd(0, Math.PI * 2) };
}
