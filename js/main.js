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
  drone: { name: '小摩托',   unit: '架', icon: '', base: 5 }, // 小摩托：单击就放飞 5 架，按住从 5 往上加，方便蜂群
};
function playerFire(ammo, count) {
  const p = G.player, tgt = G.nations[G.target];
  if (!tgt || !tgt.alive || !p.alive || count <= 0) return 0;
  // 导弹装填中 / 小摩托起飞间隔中：先记下，好了自动发射
  const cd = ammo === 'conv' ? p.convCd : ammo === 'drone' ? p.droneCd : 0;
  if (cd > 0) {
    Fire.pending[ammo] = Math.max(Fire.pending[ammo] || 0, count);
    if (ammo === 'conv') UI.banner(`💥 装填中，${count} 枚导弹将在装填完成后发射`);
    return 0;
  }
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

// ---------- 长按蓄力 ----------
// 单击发 1 个（小摩托 5 架）；按住 0.2 秒后开始蓄力：前 5 个匀速（每 0.3 秒 +1，方便精确控制），
// 之后从当前速度平滑地继续加速，按住约 2.4 秒一定到上限；圆环过半变红。松开发射，Esc 取消
const Fire = {
  charging: null,   // { ammo, start, count, pid, tgt }
  pending: {},      // 冷却中按下的数量，冷却结束自动发射
  HOLD: 0.2, STEP: 0.3, LIN: 5, FULL: 2.4,
  // v：连续的"已加的数量"（0 = 1 个），用来算数量和圆环。base：起始数量（小摩托为 5）
  // 匀速段结束后，加速段从同样的速度接着往上加（速度连续，圆环不会顿一下再猛冲）
  valueAt(t, max, base = 1) {
    const v0 = Math.min(base, max) - 1;
    if (t < this.HOLD || max <= 1) return v0;
    const a = 1 / this.STEP, lin = Math.max(this.LIN, base) - 1;
    const tl = this.HOLD + Math.max(0, lin - v0) / a;          // 匀速段结束的时刻
    if (t <= tl || max - 1 <= lin) return Math.min(max - 1, v0 + (t - this.HOLD) * a);
    const T = Math.max(0.2, this.FULL - tl), s = t - tl;
    const b = Math.max(0, (max - 1 - lin - a * T) / (T * T));  // 让 FULL 秒时正好到上限
    return Math.min(max - 1, lin + a * s + b * s * s);
  },
  countAt(t, max, base) { return clamp(1 + Math.floor(this.valueAt(t, max, base) + 1e-6), 1, Math.max(1, max)); },
  progressAt(t, max, base) { return max <= 1 ? 1 : clamp(this.valueAt(t, max, base) / (max - 1), 0, 1); },
  base(ammo) { return AMMO[ammo].base || 1; },
  btns(ammo) { return [$('fire-' + ammo), $('pfire-' + ammo)].filter(Boolean); },
  begin(ammo, pid = -1, tgtId) {
    const tid = tgtId !== undefined ? tgtId : G.target, t = G.nations[tid];
    if (this.charging || fireMax(ammo) <= 0 || !t || !t.alive || t === G.player) {
      if (!t || !t.alive) UI.banner('🎯 先选择打击目标（Tab 或点击地图上的敌国）');
      return;
    }
    // 按下时锁定上限：蓄力中生产线又造出新的，也不会让圆环往回跳
    this.charging = { ammo, start: performance.now(), count: Math.min(this.base(ammo), fireMax(ammo)), pid, tgt: tid, max: fireMax(ammo) };
    for (const b of this.btns(ammo)) b.classList.add('charging');
  },
  release(fire = true) {
    const c = this.charging;
    if (!c) return;
    // 松手时按实际按住的时长重新算数量（画面掉帧时也不会少算）
    const max = Math.min(c.max, fireMax(c.ammo));
    c.count = this.countAt((performance.now() - c.start) / 1000, max, this.base(c.ammo));
    this.charging = null;
    for (const b of this.btns(c.ammo)) b.classList.remove('charging', 'hot');
    this.syncIdle();
    if (!fire) return;
    if (c.tgt !== G.target) setTarget(c.tgt); // 在地图浮窗里发射：同时设为打击目标
    playerFire(c.ammo, c.count);
  },
  tick() {
    const p = G.player;
    for (const ammo of ['conv', 'drone']) {
      const cd = ammo === 'conv' ? p.convCd : p.droneCd;
      if (this.pending[ammo] && cd <= 0) { const n = Math.min(this.pending[ammo], fireMax(ammo)); this.pending[ammo] = 0; if (n > 0) playerFire(ammo, n); }
    }
    if (this.charging) {
      const c = this.charging, t = (performance.now() - c.start) / 1000, max = Math.min(c.max, fireMax(c.ammo));
      c.count = this.countAt(t, max, this.base(c.ammo));
      const frac = this.progressAt(t, max, this.base(c.ammo));
      this.ring(c.ammo, frac, c.count);
      for (const b of this.btns(c.ammo)) b.classList.toggle('hot', frac >= 0.5);
    }
  },
  ring(ammo, frac, num) {
    for (const el of this.btns(ammo)) {
      setStyle(el.querySelector('.prog'), 'strokeDashoffset', (170 * (1 - frac)).toFixed(1));
      setText(el.querySelector('.num'), num);
    }
  },
  syncIdle() {
    for (const ammo of ['nuke', 'conv', 'drone']) {
      if (this.charging && this.charging.ammo === ammo) continue;
      const m = fireMax(ammo);
      this.ring(ammo, 0, m > 0 ? Math.min(this.base(ammo), m) : 0);
    }
  },
  // 松开一定发射：手机长按会触发系统菜单（contextmenu）、系统手势会取消触摸（pointercancel），
  // 这些都不能当成"取消"；想取消请按 Esc。getTgt：地图浮窗里的按钮打浮窗上的国家
  bindFire(btn, ammo, getTgt) {
    btn.onpointerdown = (e) => {
      if (e.button !== 0 || btn.disabled) return;
      try { btn.setPointerCapture(e.pointerId); } catch (_) {}
      this.begin(ammo, e.pointerId, getTgt ? getTgt() : undefined);
    };
    btn.onpointerup = () => this.release(true);
    btn.onpointercancel = () => this.release(true);
    btn.oncontextmenu = (e) => e.preventDefault();
  },
  // 兜底：按钮在按住期间被禁用、或者松手时指针不在按钮上，都由窗口收到的 pointerup 来发射
  onWindowUp(e) {
    if (this.charging && this.charging.pid === e.pointerId) this.release(true);
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
  Fire.charging = null; Fire.pending = {};
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
    Fire.tick();
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
    Fire.release(false);
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
    else if (k === 'f' || k === 'c' || k === 'd') { // 按住 F / C / D 蓄力（核包裹 / 导弹 / 小摩托）；Shift 一次全发
      if (e.repeat) return;
      const ammo = k === 'f' ? 'nuke' : k === 'c' ? 'conv' : 'drone';
      const tid = UI.popOpen() ? UI.popId : undefined; // 地图浮窗开着：打浮窗上的国家
      if (e.shiftKey) { if (tid !== undefined) setTarget(tid); playerFire(ammo, fireMax(ammo)); }
      else Fire.begin(ammo, -1, tid);
    }
    else if (k === 'escape') { if (Fire.charging) Fire.release(false); else if (UI.popOpen()) UI.closeMapPop(); else UI.closeChooser(); }
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
  window.addEventListener('keyup', (e) => {
    const k = e.key.toLowerCase();
    if (!Fire.charging) return;
    if ({ f: 'nuke', c: 'conv', d: 'drone' }[k] === Fire.charging.ammo) Fire.release(true);
  });
  window.addEventListener('blur', () => Fire.release(false));
  window.addEventListener('pointerup', (e) => Fire.onWindowUp(e));
  window.addEventListener('pointercancel', (e) => Fire.onWindowUp(e));
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
