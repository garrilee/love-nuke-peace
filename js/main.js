// ===================== 主循环与输入 =====================
'use strict';

let lastFrame = 0, lastDraw = 0, simAcc = 0, running = false;

// 联机时只有房主能调速度，并且不能暂停（暂停会卡住所有人）
function setSpeed(s) { if (G && (!G.mp || (Net.role === 'host' && s > 0))) G.speed = s; }

// ---------- 目标 ----------
function setTarget(id) {
  const t = G.nations[id];
  if (!t || !t.alive || t === G.player) return;
  G.target = id;
  SFX.click();
  UI.refreshStrike();
}

// ---------- 开火：按指定数量向当前目标发射 ----------
const AMMO = {
  nuke:  { name: '核包裹',   unit: '个', icon: '☢' },
  conv:  { name: '常规导弹', unit: '枚', icon: '💥' },
  drone: { name: '小摩托',   unit: '架', icon: '' },
};
function playerFire(ammo, count) {
  const p = G.player, tgt = G.nations[G.target];
  if (!tgt || !tgt.alive || !p.alive || count <= 0) return 0;
  // 导弹装填中 / 小摩托起飞间隔中：不能发（按钮是灰的），不排队
  const cd = ammo === 'conv' ? p.convCd : ammo === 'drone' ? p.droneCd : 0;
  if (cd > 0) return 0;
  let sent = Act.do({ a: 'fire', ammo, count, tgt: tgt.id });
  if (sent === null) sent = Math.min(count, fireMax(ammo)); // 联机客户端：命令已发给房主，按预计数量提示
  const A = AMMO[ammo];
  if (sent) UI.banner(`${A.icon ? A.icon + ' ' : ''}${ammo === 'nuke' ? '已投送' : ammo === 'drone' ? '放飞' : '发射'} ${sent} ${A.unit}${A.name} → ${tgt.race.emoji}${tgt.name}`);
  UI.refreshStrike();
  return sent;
}
// 国家大招（Q）：需要目标的大招对当前目标释放
function playerUlt() {
  const p = G.player, tgt = G.nations[G.target];
  if (!p.alive || p.ultCd > 0) return false;
  if (ultNeedsTarget(p) && !(tgt && tgt.alive)) { UI.banner('🎯 先选择大招目标（Tab 或点击地图上的敌国）'); return false; }
  return Act.do({ a: 'ult', tgt: tgt && tgt.alive ? tgt.id : -1 });
}

// ---------- 玩家操作：单机/房主直接执行；联机客户端发给房主执行 ----------
const Act = {
  do(cmd) {
    if (Net.role === 'client') { Net.send({ type: 'cmd', cmd }); if (cmd.a === 'alloc') Net.allocHold = performance.now() + 1500; return null; }
    return execCmd(G.player, cmd);
  },
};
function execCmd(n, c) {
  if (!n || !n.alive || !c) return 0;
  const tgt = G.nations[c.tgt];
  switch (c.a) {
    case 'fire':
      if (!tgt) return 0;
      if (c.ammo === 'conv') return launchConv(n, tgt, 0, c.count | 0);
      if (c.ammo === 'drone') return launchDrones(n, tgt, c.count | 0);
      return launch(n, tgt, 0, G.legs, c.count | 0);
    case 'shield': return useShield(n);
    case 'net': return useNet(n);
    case 'ult': return useUlt(n, tgt && tgt.alive ? tgt : null);
    case 'rebuildAll': return rebuildAll(n);
    case 'rebuildCity': { const ct = G.world.cities[c.id]; return ct && ct.nation === n.id ? rebuildCity(n, ct) : false; }
    case 'rebuildFac': { const f = G.world.facilities[c.id]; return f && f.nation === n.id ? rebuildFac(n, f) : false; }
    case 'alloc': {
      const v = c.v || {}, t = +v.tech || 0, k = +v.nuke || 0, d = +v.def || 0, s = t + k + d;
      if (s > 0 && t >= 0 && k >= 0 && d >= 0) n.alloc = { tech: t / s, nuke: k / s, def: d / s };
      return 1;
    }
    case 'toggle': if (['autoNet', 'autoRebuild', 'autoCiws', 'autoScramble'].includes(c.k)) n[c.k] = !!c.v; return 1;
  }
  return 0;
}
// 一次最多能发多少：核包裹看运载，导弹一次最多 5 枚，小摩托不限
const fireMax = (ammo) => {
  const p = G.player;
  if (ammo === 'conv') return Math.min(p.conv, CONV.perLaunch);
  if (ammo === 'drone') return p.drones;
  return deliverable(p, G.legs);
};

// ---------- 单击发射 ----------
// 每种武器一个档位键，点一下切换每次发射的数量（0 = 全部），档位会记住
const FIRE_LEVELS = { nuke: [1, 3, 5, 0], conv: [2, 5], drone: [5, 10, 0] };
const Fire = {
  lvl: {},
  shown: {},        // 圆环当前画到的位置（平滑跟随）
  mode: {},         // 圆环当前显示的是生产进度还是冷却
  init() {
    for (const ammo in FIRE_LEVELS) this.lvl[ammo] = clamp(Store.get('fireLvl-' + ammo, 0) | 0, 0, FIRE_LEVELS[ammo].length - 1);
  },
  level(ammo) { return FIRE_LEVELS[ammo][this.lvl[ammo] || 0]; },
  lvText(ammo) { const v = this.level(ammo); return v ? '×' + v : '全部'; },
  cycle(ammo) {
    this.lvl[ammo] = ((this.lvl[ammo] || 0) + 1) % FIRE_LEVELS[ammo].length;
    Store.set('fireLvl-' + ammo, this.lvl[ammo]);
    SFX.click();
    this.syncIdle();
    UI.refreshStrike();
  },
  cooling(ammo) { const p = G.player; return ammo === 'conv' ? p.convCd > 0 : ammo === 'drone' ? p.droneCd > 0 : false; },
  // 能不能点：有库存就能点（不够档位的数量就有几个发几个）；冷却中不行
  canFire(ammo) {
    return G.player.alive && !this.cooling(ammo) && fireMax(ammo) >= 1;
  },
  btns(ammo) { return [$('fire-' + ammo), $('pfire-' + ammo)].filter(Boolean); },
  // 点一下发射：all = 全部（Shift）；tgtId：地图浮窗里的按钮打浮窗上的国家（同时设为目标）
  tap(ammo, tgtId, all = false) {
    const tid = tgtId !== undefined ? tgtId : G.target, t = G.nations[tid];
    if (!t || !t.alive || t === G.player) { UI.banner('🎯 先选择打击目标（Tab 或点击地图上的敌国）'); return; }
    if (!this.canFire(ammo)) return;
    if (tid !== G.target) setTarget(tid);
    const v = this.level(ammo), max = fireMax(ammo), n = all || !v ? max : Math.min(v, max);
    const sent = playerFire(ammo, n);
    if (sent > 0) this.flash(ammo, '−' + sent);
  },
  // 点击反馈：按钮缩一下，上方飘出数量
  flash(ammo, text) {
    for (const b of this.btns(ammo)) {
      if (!b.offsetParent) continue;
      b.classList.remove('tapped'); void b.offsetWidth; b.classList.add('tapped');
      const f = document.createElement('span');
      f.className = 'fly'; f.textContent = text;
      b.appendChild(f);
      setTimeout(() => f.remove(), 800);
    }
  },
  // 圆环：下一个的生产进度（转满一圈库存 +1）；导弹装填 / 小摩托起飞间隔中显示冷却
  // 逻辑每 0.1 秒才走一步，这里用 G.interp 补上两步之间流逝的时间，圆环每帧都在动
  progress(ammo) {
    const p = G.player, dt = G.speed > 0 ? (G.interp || 0) : 0;
    const timer = (left, total) => clamp(1 - (left - dt) / total, 0, 1);
    if (ammo === 'conv') {
      if (p.convCd > 0) return [timer(p.convCd, CONV.cd), 'cool']; // 冷却也是顺时针转满，不倒着转
      return [p.conv >= CONV.stockCap || p.convBuildT <= 0 ? 1 : timer(p.convBuildT, CONV.buildTime), 'build'];
    }
    if (ammo === 'drone') {
      if (p.droneCd > 0) return [timer(p.droneCd, DRONE.cd), 'cool'];
      return [p.drones >= DRONE.stockCap || p.droneBuildT <= 0 ? 1 : timer(p.droneBuildT, DRONE.buildTime), 'build'];
    }
    const lv = bestLevel(p);
    if (!lv) return [0, 'build'];
    return [stock(p) >= 30 ? 1 : clamp(p.bank / PARCELS[Math.min(lv, 4)].cost, 0, 1), 'build'];
  },
  tick(real = 0) {
    const p = G.player;
    if (!p.alive) return;
    for (const ammo of ['nuke', 'conv', 'drone']) {
      const [target, mode] = this.progress(ammo);
      let v = this.shown[ammo];
      // 换了显示内容（生产 ↔ 冷却），或者转满一圈又从头开始：直接跳过去，不倒着转回去
      if (v === undefined || mode !== this.mode[ammo] || target < v - 0.2) v = target;
      else v += (target - v) * Math.min(1, real * 14); // 其余时候平滑跟随，消掉逻辑步的台阶感
      this.shown[ammo] = v; this.mode[ammo] = mode;
      // 每帧更新能不能点：冷却一结束、库存一够就立刻亮起来
      const tg = G.nations[G.target], can = this.canFire(ammo);
      const dMain = !(tg && tg.alive && tg !== p) || !can, mainBtn = $('fire-' + ammo), popBtn = $('pfire-' + ammo);
      if (mainBtn && mainBtn.disabled !== dMain) mainBtn.disabled = dMain;
      if (popBtn && popBtn.disabled !== !can) popBtn.disabled = !can;
      for (const el of this.btns(ammo)) {
        setStyle(el.querySelector('.prog'), 'strokeDashoffset', (170 * (1 - v)).toFixed(1));
        el.classList.toggle('cool', mode === 'cool');
      }
    }
  },
  syncIdle() {
    for (const ammo of ['nuke', 'conv', 'drone']) {
      setText($('lvl-' + ammo), this.lvText(ammo));
      setText($('plv-' + ammo), this.lvText(ammo));
    }
  },
  bind(btn, ammo, getTgt) {
    btn.onclick = () => { if (!btn.disabled) this.tap(ammo, getTgt ? getTgt() : undefined); };
  },
};
const chooserOpen = () => !$('chooser').classList.contains('hidden');

function startGame(raceId, aiCount, diff = 'normal', tutorial = true, mp = null) {
  SFX.init();
  SFX.setMuted(Store.get('muted', false));
  FX.reset();
  Render.resetScorch();
  newGame(raceId, aiCount, diff, mp);
  G.tutorial = tutorial;
  document.body.classList.toggle('mp', G.mp);
  document.body.classList.toggle('mphost', G.mp && Net.role === 'host');
  Render.buildBase();
  UI.initHUD();
  Render.fit(); // HUD 显示后再适配，小屏时要量出底部操作栏的高度
  for (const t of G.newsQueue) UI.addFeed(t);
  G.target = -1;
  Fire.shown = {}; Fire.mode = {};
  SFX.music(true);
  running = true;
}

// 推进模拟（单机和房主）：dt 为真实时间
function simAdvance(real) {
  let spd = G.speed;
  // 单机：有包裹飞向你时锁定 1×（联机时大家共用一个速度，不锁）
  if (!G.mp && spd > 1 && G.player.alive && incomingFor(G.player).some((x) => isThreat(x.p))) spd = 1;
  simAcc += G.over ? 0 : real * spd;
  while (simAcc >= CFG.SIM_DT) { simStep(CFG.SIM_DT); simAcc -= CFG.SIM_DT; }
  G.interp = simAcc; // 供渲染插值，飞弹在两次逻辑步之间也能平滑移动
}

function frame(ts) {
  const real = clamp((ts - lastFrame) / 1000 || 0, 0, 0.1);
  lastFrame = ts;
  if (running && G) {
    // 联机时不能暂停/加速，也不放慢镜头（慢镜头会拖慢所有人的世界）
    const slow = !G.mp && FX.slowmo > 0 ? 0.3 : 1;
    if (FX.slowmo > 0) FX.slowmo -= real;
    if (Net.role === 'client') Net.clientAdvance(real);
    else { simAdvance(real * slow); if (Net.role === 'host') Net.hostTick(real); }
    Net.lastFrameAt = performance.now();
    FX.update(!G.mp && G.speed === 0 ? 0 : real * slow);
    Fire.tick(real);
    UI.tick(real);
  }
  // 高刷新率屏幕（120/144Hz）上把绘制限制在约 60 帧；结算画面盖住地图时不画
  if (ts - lastDraw >= 13 && !(G && G.over && !$('end').classList.contains('hidden'))) {
    Render.draw((ts - lastDraw) / 1000 > 0.1 ? real : Math.min(0.1, (ts - lastDraw) / 1000));
    lastDraw = ts;
  }
  requestAnimationFrame(frame);
}

// ---------- 事件 ----------
Bus.on('news', (t) => { if (running) UI.addFeed(t); });
Bus.on('leader', ({ n, text, to }) => { if (to === undefined || to === G.player.id) UI.leader(n, text); });
Bus.on('banner', (t) => UI.banner(t));
Bus.on('midnight', () => SFX.bell());
Bus.on('dogfight', ({ a, b }) => {
  if (a.att === G.player.id || b.att === G.player.id) UI.tip('dogfight', `${PAPER} <b>空战！</b>不同国家的小摩托在空中相遇会互相攻击；敌方小摩托飞进国土时，你库存里的小摩托会自动<b>升空拦截</b>（最多 2 架，起飞就消耗，追到底）。`, { tutorial: true, life: 9 });
});
Bus.on('ciws', ({ n, hit }) => { if (n === G.player && hit) UI.tip('ciws', '🔫 <b>近防炮</b>自动打下了一架小摩托。它和护盾共用能量，但能量不够开护盾时会自动停火。', { tutorial: true }); });
Bus.on('intel', (x) => {
  if (x !== G.player) return;
  UI.banner('🕵 你的动向已被各国情报机构察觉！准备迎接围攻');
  UI.tip('intel', `🕵 你被情报<b>点名</b>：你${x.intelWhy}。接下来 ${CFG.INTEL_FOCUS} 秒你是各国的首要目标，准备好护盾。`, { cd: 30 });
});
// 被 AI 盯上：告诉玩家原因（每个国家 40 秒内只提示一次）
Bus.on('targeted', ({ n, tgt, why }) => tgt === G.player && UI.tip('tg' + n.id, `🎯 <b style="color:${n.color}">${n.race.emoji}${n.name}</b> 盯上了你：${why}`, { cd: 40, life: 5 }));
Bus.on('ult', ({ n, tgt }) => {
  const U = n.race.ult;
  if (n === G.player) UI.banner(`${U.icon} ${U.name}！`);
  else if (tgt && tgt === G.player) { UI.banner(`${U.icon} ${n.name} 对你发动【${U.name}】`); UI.leader(n, n.race.lines.launch); }
  else if (n.race.id === 'mushroom') UI.tip('ultdust' + n.id, `🌪 ${n.race.emoji}${n.name} 发动【扬沙】：你的人口暂时停止增长`, { cd: 60, life: 5 });
});
Bus.on('eliminated', (n) => {
  Render.buildBase();
  if (G.selTarget === n.id) G.selTarget = -1;
  if (UI.popId === n.id) UI.closeMapPop();
  if (G.target === n.id) {
    G.target = -1;
    if (n !== G.player) UI.banner(`🎯 目标 ${n.name} 已被核平，请选择新目标`);
  }
  if (n === G.player && G.mp) setTimeout(() => UI.banner('💀 你已被核平，正在观战'), 1500);
  UI.leader(n, n.race.lines.dead);
});
Bus.on('gameover', (kind) => {
  SFX.music(false);
  setTimeout(() => UI.showEnd(kind), 2500);
});
Bus.on('tech', ({ n, tech }) => {
  if (n !== G.player) return;
  UI.banner(`🔬 解锁：${tech.name}`);
  UI.addFeed(`你解锁了【${tech.name}】：${tech.desc}`);
});

// ---------- 输入 ----------
function setupInput() {
  const cv = Render.canvas;
  // 指针输入：鼠标拖拽平移、滚轮缩放；触屏单指平移、双指捏合缩放、轻点选目标
  const pts = new Map();
  let down = null, dragging = false, pinch = null, tipTimer = 0;
  const zoomAt = (sx, sy, z) => {
    const before = Render.screenToWorld(sx, sy);
    Render.cam.zoom = clamp(z, 0.3, 3.5);
    const after = Render.screenToWorld(sx, sy);
    Render.cam.x = clamp(Render.cam.x + before.x - after.x, 0, WORLD_W);
    Render.cam.y = clamp(Render.cam.y + before.y - after.y, 0, WORLD_H);
  };
  const pinchInfo = () => {
    const [a, b] = [...pts.values()];
    return { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  };
  cv.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0 && e.button !== 1) return;
    try { cv.setPointerCapture(e.pointerId); } catch (_) {}
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size > 1) UI.closeMapPop();
    if (pts.size === 1) { down = { x: e.clientX, y: e.clientY, cx: Render.cam.x, cy: Render.cam.y }; dragging = false; }
    else if (pts.size === 2) { const pi = pinchInfo(); pinch = { d: pi.d, zoom: Render.cam.zoom }; dragging = true; down = null; }
    $('leftcol').classList.remove('open');
  });
  cv.addEventListener('pointermove', (e) => {
    if (pts.has(e.pointerId)) pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && pts.size >= 2) {
      const pi = pinchInfo();
      zoomAt(pi.x, pi.y, pinch.zoom * pi.d / pinch.d);
      if (pinch.px !== undefined) { // 双指同时平移
        Render.cam.x = clamp(Render.cam.x - (pi.x - pinch.px) / Render.cam.zoom, 0, WORLD_W);
        Render.cam.y = clamp(Render.cam.y - (pi.y - pinch.py) / Render.cam.zoom, 0, WORLD_H);
      }
      pinch.px = pi.x; pinch.py = pi.y;
      return;
    }
    if (down) {
      const dx = e.clientX - down.x, dy = e.clientY - down.y;
      if (Math.abs(dx) + Math.abs(dy) > (e.pointerType === 'mouse' ? 5 : 10)) dragging = true;
      if (dragging) {
        UI.closeMapPop();
        Render.cam.x = clamp(down.cx - dx / Render.cam.zoom, 0, WORLD_W);
        Render.cam.y = clamp(down.cy - dy / Render.cam.zoom, 0, WORLD_H);
      }
    }
    if (G && e.pointerType === 'mouse') {
      const t = Render.tileAt(e.clientX, e.clientY);
      Render.hoverTile = t;
      UI.tooltip(t, e.clientX, e.clientY);
    }
  });
  const up = (e) => {
    if (!pts.has(e.pointerId)) return;
    pts.delete(e.pointerId);
    if (pts.size < 2) pinch = null;
    if (pts.size === 0) {
      if (down && !dragging && G && e.type === 'pointerup') {
        const t = Render.tileAt(e.clientX, e.clientY);
        const popped = onMapClick(t, e.clientX, e.clientY);
        if (e.pointerType !== 'mouse' && !popped) { // 触屏：轻点后显示 2.5 秒地块信息（弹出国家浮窗时不显示）
          Render.hoverTile = t; UI.tooltip(t, e.clientX, e.clientY);
          clearTimeout(tipTimer); tipTimer = setTimeout(() => { UI.tooltip(null); Render.hoverTile = null; }, 2500);
        }
      }
      down = null;
    }
  };
  cv.addEventListener('pointerup', up);
  cv.addEventListener('pointercancel', up);
  cv.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') { UI.tooltip(null); Render.hoverTile = null; } });
  cv.addEventListener('wheel', (e) => {
    e.preventDefault();
    UI.closeMapPop();
    zoomAt(e.clientX, e.clientY, Render.cam.zoom * (e.deltaY < 0 ? 1.12 : 1 / 1.12));
  }, { passive: false });
  cv.addEventListener('contextmenu', (e) => e.preventDefault());

  window.addEventListener('keydown', (e) => {
    if (!running || !G || G.over) return;
    if (e.target.tagName === 'INPUT' && e.target.type !== 'range' && e.target.type !== 'checkbox') return;
    const k = e.key.toLowerCase();
    if (e.code === 'Space') { e.preventDefault(); if (!G.mp) G.speed = G.speed === 0 ? (G.prevSpeed || 1) : (G.prevSpeed = G.speed, 0); }
    else if (e.key === 'Tab') { e.preventDefault(); if (chooserOpen()) UI.closeChooser(); else UI.openChooser(); }
    else if (k === 'f' || k === 'c' || k === 'd') { // F / C / D 发射核包裹 / 导弹 / 小摩托（数量按档位）；Shift 全部发射
      if (e.repeat) return;
      const ammo = k === 'f' ? 'nuke' : k === 'c' ? 'conv' : 'drone';
      Fire.tap(ammo, UI.popOpen() ? UI.popId : undefined, e.shiftKey); // 地图浮窗开着：打浮窗上的国家
    }
    else if (k === 'escape') { if (UI.popOpen()) UI.closeMapPop(); else UI.closeChooser(); }
    else if (chooserOpen() && k >= '1' && k <= '9') {
      const t = UI.chooserTargets()[+k - 1];
      if (t) { setTarget(t.id); UI.closeChooser(); }
    }
    else if (k === 'b') Act.do({ a: 'shield' });
    else if (k === 'q') playerUlt();
    else if (k === 'n') Act.do({ a: 'net' });
    else if (k === 'r') Act.do({ a: 'rebuildAll' });
    else if (k === '=' || k === '+') setSpeed(Math.min(3, Math.floor(G.speed) + 1));
    else if (k === '-') setSpeed(Math.max(G.mp ? 1 : 0, Math.ceil(G.speed) - 1));
  });
  // 游戏中不弹系统菜单（手机长按地图 / 按钮时的复制、菜单工具条）
  document.addEventListener('contextmenu', (e) => { if (running && !e.target.closest('input, textarea')) e.preventDefault(); });
}

// 返回 true 表示弹出了国家浮窗
function onMapClick(tile, sx, sy) {
  UI.closeMapPop();
  if (!tile) return false;
  const p = G.player;
  if (tile.owner === p.id) {
    if (tile.city && tile.city.ruined) { if (Act.do({ a: 'rebuildCity', id: tile.city.id }) !== false) SFX.click(); return false; }
    if (tile.fac && !tile.fac.alive) { if (Act.do({ a: 'rebuildFac', id: tile.fac.id }) !== false) SFX.click(); return false; }
    return false;
  }
  // 点击其他国家：弹出情报浮窗，点「开始打击」才设为目标；不能打自己
  if (tile.owner >= 0 && G.nations[tile.owner].alive) { UI.openMapPop(G.nations[tile.owner], sx, sy); return UI.popOpen(); }
  return false;
}

// ---------- 启动 ----------
window.addEventListener('DOMContentLoaded', () => {
  Render.init($('game'));
  FX.init();
  setupInput();
  UI.initStart(startGame);
  requestAnimationFrame(frame);
});
