// ===================== 模拟·核心：事件总线、开局、通用工具 =====================
'use strict';

const Bus = {
  h: {},
  on(type, fn) { (this.h[type] = this.h[type] || []).push(fn); },
  emit(type, data) { (this.h[type] || []).forEach((fn) => fn(data)); },
};

let G = null;

// 每个国家占一个“席位”：raceIds[i] 国家类型（可以重复），owners[i] 玩家连接 id（AI 为 null），names[i] 自定义国家名
// mp（联机）：房主传 { players: [{race, id, name}], me }，由这里排好席位；
//             客户端传房主发来的 { seed, raceIds, owners, names, me }，生成一模一样的世界
function newGame(playerRaceId, aiCount, diff = 'normal', mp = null, survival = false) {
  let raceIds = mp && mp.raceIds, owners = mp && mp.owners, names = mp && mp.names, seed = mp && mp.seed;
  if (!raceIds) {
    const humans = mp ? mp.players : [{ race: playerRaceId, id: 'local', name: '' }];
    aiCount = clamp(aiCount, 0, MAX_NATIONS - humans.length - (survival ? 1 : 0));
    // AI 先用没人选的国家，不够时再重复
    const unused = shuffle(RACES.map((r) => r.id).filter((id) => !humans.some((h) => h.race === id)));
    const ai = [];
    const notHuman = RACES.filter((r) => !humans.some((h) => h.race === r.id));
    for (let k = 0; k < aiCount; k++) ai.push(k < unused.length ? unused[k] : pick(notHuman.length ? notHuman : RACES).id);
    if (survival) ai.push(BOSS.id); // 生存模式：三体人降临
    const seats = shuffle([...humans.map((h) => ({ race: h.race, id: h.id, name: h.name || '' })), ...ai.map((race) => ({ race, id: null, name: '' }))]);
    raceIds = seats.map((s) => s.race); owners = seats.map((s) => s.id); names = seats.map((s) => s.name);
    seed = (Math.random() * 1e9) | 0;
  }
  const world = generateWorld(seed, raceIds, owners.map((o) => o !== null && o !== undefined));
  setSeed(seed ^ 0x5bd1e995);
  const persKeys = shuffle(Object.keys(PERSONALITIES));
  const nations = world.nations;
  nations.forEach((n, i) => {
    Object.assign(n, {
      alive: true,
      pers: n.isPlayer ? null : persKeys[i % persKeys.length],
      alloc: { tech: 0.5, nuke: 0.3, def: 0.2 },
      techPts: 0, techIdx: 0,
      bank: 0, energy: 40,
      parcels: { 1: CFG.START_PARCELS, 2: 0, 3: 0, 4: 0, 5: 0 },
      ufoReady: Math.max(2, Math.min(CFG.MAX_UFO, CFG.START_PARCELS)), ufoReturn: [], // 开局飞机数和开局核包裹数一致，5 个都能一起投出去
      conv: 3, convCd: 0, drones: DRONE.keepMin, droneCd: 0, droneBuildT: 0, autoScramble: true, scrambleT: 0,
      heat: CFG.HEAT_START, lastAttack: -999, intelUntil: -1, intelCd: -1, hostileAt: {},
      subs: [],
      anger: nations.map(() => rnd(5, 20)),
      shieldT: 0, shieldCd: 0, netT: 0, netCd: 0, netCharges: 0,
      lastHit: -99, lastAttacker: -1, retaliate: null, lastStrike: -99,
      aiNext: rnd(1, 3),
      autoNet: true, autoRebuild: true,
      ultCd: ULT_FIRST, overtimeT: 0, harpoonT: 0, hackT: 0,
      stats: { dronesSent: 0, dogKills: 0, ult: 0, sent: 0, delivered: 0, caused: 0, lost: 0, intercepted: 0, rebuilt: 0, peakPop: 0 },
    });
    n.anger[i] = -1e9;
    n.mods = n.race.mods;
    n.isPlayer = owners[i] !== null && owners[i] !== undefined; // 不依赖地图生成的标记，避免新旧脚本混用时没有真人
    n.netId = mp ? owners[i] : null;
    const custom = mp && cleanName(names[i]);
    if (custom) n.name = custom; // 联机自定义国家名
  });
  G = {
    t: 0, speed: 1, world, nations, projectiles: [],
    player: mp ? nations.find((n) => n.netId === mp.me) : nations.find((n) => n.isPlayer),
    mp: !!mp, seed, raceIds, owners, names,
    over: null, midnight: false, nextEvent: rnd(60, 90), pid: 0,
    selTarget: -1, scale: 1, legs: { pad: true, sea: true, ufo: true },
    newsQueue: [], diff: DIFFS[diff] || DIFFS.normal,
  };
  G.boss = bossOf(); G.dims = [];
  if (G.boss) setupBoss(G.boss);
  news(`${fmtDate(0)}：世界和平，一切安好。暂时。`);
  if (G.boss) news(`👽 ${G.boss.name}降临：它的科技远超所有国家。开局 ${BOSS_CFG.chaosFirst / 60} 分钟后，它每 ${BOSS_CFG.chaosEvery} 秒会进入一次乱纪元，那是反击的窗口。`);
  return G;
}

// ---------- 工具 ----------
const techIndex = (id) => TECHS.findIndex((t) => t.id === id);
const has = (n, id) => n.techIdx > techIndex(id);
function bestLevel(n) {
  let lv = 0;
  for (let k = 1; k <= 5; k++) if (has(n, 'lv' + k)) lv = k;
  return lv;
}
const totalPop = (n) => n.cities.reduce((s, c) => s + c.pop, 0);
const stock = (n) => n.parcels[1] + n.parcels[2] + n.parcels[3] + n.parcels[4] + n.parcels[5];
const facOf = (n, type) => n.facilities.filter((f) => f.type === type);
const multiK = (n) => (has(n, 'multi') ? 3 : 1);
function fmtDate(t) {
  const m = Math.floor(t);
  return `${1945 + Math.floor(m / 12)}年${(m % 12) + 1}月`;
}
function news(text) { G.newsQueue.push(text); Bus.emit('news', text); }
// 弱势加成：人口低于存活国家平均值时，产出最多 ×2.5
function underdog(n) {
  if (G.midnight) return 1; // 午夜狂欢：弱势加成取消
  const alive = G.nations.filter((x) => x.alive);
  if (alive.length < 2) return 1;
  const avg = alive.reduce((s, x) => s + totalPop(x), 0) / alive.length;
  const ratio = avg > 0 ? totalPop(n) / avg : 1;
  return clamp(1 + (1 - ratio) * 2, 1, CFG.UNDERDOG_MAX);
}
// 军工效率：冷工厂 ×0.4，满热 ×1.4
const heatEff = (n) => CFG.HEAT_MIN + (CFG.HEAT_MAX - CFG.HEAT_MIN) * n.heat;
function production(n) {
  let p = 0;
  for (const c of n.cities) p += c.pop * (c.ruined ? CFG.RUIN_PROD : 1);
  if (isChaos(n)) return 0; // 三体乱纪元：停产
  return (p * CFG.PROD_PER_POP + CFG.PROD_BASE) * underdog(n) * (n.mods.prod || 1)
    * (n.overtimeT > 0 ? 1.7 : 1)              // 卷王大招：加班
    * (n.isPlayer ? 1 : G.diff.prod);        // AI 难度
}
const sendCount = (D, scale) => (D <= 0 ? 0 : scale === 0 ? 1 : scale === 1 ? Math.ceil(D / 2) : D);
