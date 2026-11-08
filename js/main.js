// ===================== 主循环与输入 =====================
'use strict';

let lastFrame = 0, simAcc = 0, running = false;

function setSpeed(s) { if (G) G.speed = s; }

// ---------- 目标 ----------
function setTarget(id) {
  const t = G.nations[id];
  if (!t || !t.alive || t.isPlayer) return;
  G.target = id;
  SFX.click();
  UI.refreshStrike();
}

// ---------- 开火：按指定数量向当前目标发射 ----------
function playerFire(ammo, count) {
  const p = G.player, tgt = G.nations[G.target];
  if (!tgt || !tgt.alive || !p.alive || count <= 0) return 0;
  // 常规导弹还在装填：先记下，装填完自动发射（单击、蓄力、梭哈都适用）
  if (ammo === 'conv' && p.convCd > 0) {
    Fire.pendingConv = Math.max(Fire.pendingConv || 0, count);
    UI.banner(`💥 装填中，${count} 枚导弹将在装填完成后发射`);
    return 0;
  }
  const sent = ammo === 'conv' ? launchConv(p, tgt, 0, count) : launch(p, tgt, 0, G.legs, count);
  if (sent) UI.banner(ammo === 'conv' ? `💥 发射 ${sent} 枚常规导弹 → ${tgt.race.emoji}${tgt.name}` : `☢ 已投送 ${sent} 个核包裹 → ${tgt.race.emoji}${tgt.name}`);
  UI.refreshStrike();
  return sent;
}
// 国家大招（Q）：需要目标的大招对当前目标释放
function playerUlt() {
  const p = G.player, tgt = G.nations[G.target];
  if (!p.alive || p.ultCd > 0) return false;
  if (ultNeedsTarget(p) && !(tgt && tgt.alive)) { UI.banner('🎯 先选择大招目标（Tab 或点击地图上的敌国）'); return false; }
  return useUlt(p, tgt && tgt.alive ? tgt : null);
}
const fireMax = (ammo) => (ammo === 'conv' ? G.player.conv : deliverable(G.player, G.legs));

// ---------- 长按蓄力 / 梭哈 ----------
// 单击发 1 个；按住超过 0.2 秒开始蓄力，数量越涨越快，最多到可发射上限；松开发射
const Fire = {
  charging: null,   // { ammo, start, count }
  allin: null,      // { ammo, start }
  countAt(t) {      // t：按住的秒数
    if (t < 0.2) return 1;
    const s = t - 0.2;
    return 1 + Math.floor(s * 3 + s * s * 2.5);
  },
  progressAt(t) {   // 当前这一格的进度（圆环）
    if (t < 0.2) return t / 0.2 * 0.3;
    const s = t - 0.2, v = s * 3 + s * s * 2.5;
    return v - Math.floor(v);
  },
  begin(ammo) {
    if (this.charging || fireMax(ammo) <= 0 || !G.nations[G.target] || !G.nations[G.target].alive) {
      if (!G.nations[G.target] || !G.nations[G.target].alive) UI.banner('🎯 先选择打击目标（Tab 或点击地图上的敌国）');
      return;
    }
    this.charging = { ammo, start: performance.now(), count: 1 };
    $('fire-' + ammo).classList.add('charging');
  },
  release(fire = true) {
    const c = this.charging;
    if (!c) return;
    this.charging = null;
    $('fire-' + c.ammo).classList.remove('charging');
    this.syncIdle();
    if (fire) playerFire(c.ammo, c.count);
  },
  beginAllIn(ammo) {
    if (this.allin || fireMax(ammo) <= 0) return;
    this.allin = { ammo, start: performance.now() };
  },
  endAllIn() {
    if (!this.allin) return;
    $('allin-' + this.allin.ammo).querySelector('.fill').style.height = '0';
    this.allin = null;
  },
  tick() {
    const now = performance.now();
    if (this.pendingConv && G.player.convCd <= 0) { const n = Math.min(this.pendingConv, G.player.conv); this.pendingConv = 0; playerFire('conv', n); }
    if (this.charging) {
      const c = this.charging, t = (now - c.start) / 1000;
      const max = fireMax(c.ammo);
      c.count = Math.max(1, Math.min(max, this.countAt(t)));
      const full = c.count >= max;
      this.ring(c.ammo, full ? 1 : this.progressAt(t), c.count);
    }
    if (this.allin) {
      const a = this.allin, k = Math.min(1, (now - a.start) / 400);
      $('allin-' + a.ammo).querySelector('.fill').style.height = k * 100 + '%';
      if (k >= 1) { const ammo = a.ammo; this.endAllIn(); playerFire(ammo, fireMax(ammo)); }
    }
  },
  ring(ammo, frac, num) {
    const el = $('fire-' + ammo);
    el.querySelector('.prog').style.strokeDashoffset = String(170 * (1 - frac));
    $('num-' + ammo).textContent = num;
  },
  syncIdle() {
    for (const ammo of ['nuke', 'conv']) {
      if (this.charging && this.charging.ammo === ammo) continue;
      this.ring(ammo, 0, fireMax(ammo) > 0 ? 1 : 0);
    }
  },
  bindFire(btn, ammo) {
    btn.onpointerdown = (e) => { if (e.button !== 0 || btn.disabled) return; try { btn.setPointerCapture(e.pointerId); } catch (_) {} this.begin(ammo); };
    btn.onpointerup = () => this.release(true);
    btn.onpointercancel = () => this.release(false);
    btn.oncontextmenu = (e) => { e.preventDefault(); this.release(false); };
  },
  bindAllIn(btn, ammo) {
    btn.onpointerdown = (e) => { if (e.button !== 0 || btn.disabled) return; try { btn.setPointerCapture(e.pointerId); } catch (_) {} this.beginAllIn(ammo); };
    btn.onpointerup = () => this.endAllIn();
    btn.onpointercancel = () => this.endAllIn();
  },
};
const chooserOpen = () => !$('chooser').classList.contains('hidden');

function startGame(raceId, aiCount, diff = 'normal', tutorial = true) {
  SFX.init();
  SFX.setMuted(Store.get('muted', false));
  FX.reset();
  Render.resetScorch();
  newGame(raceId, aiCount, diff);
  G.tutorial = tutorial;
  Render.buildBase();
  UI.initHUD();
  Render.fit(); // HUD 显示后再适配，小屏时要量出底部操作栏的高度
  for (const t of G.newsQueue) UI.addFeed(t);
  G.target = -1;
  Fire.charging = null; Fire.allin = null; Fire.pendingConv = 0;
  SFX.music(true);
  running = true;
}

function frame(ts) {
  const real = clamp((ts - lastFrame) / 1000 || 0, 0, 0.1);
  lastFrame = ts;
  if (running && G) {
    let spd = G.speed;
    // 有包裹飞向你时锁定 1×
    if (spd > 1 && G.player.alive && incomingFor(G.player).length) spd = 1;
    const slow = FX.slowmo > 0 ? 0.3 : 1;
    if (FX.slowmo > 0) FX.slowmo -= real;
    const simDt = G.over ? 0 : real * spd * slow;
    simAcc += simDt;
    while (simAcc >= CFG.SIM_DT) { simStep(CFG.SIM_DT); simAcc -= CFG.SIM_DT; }
    G.interp = simAcc; // 供渲染插值，飞弹在两次逻辑步之间也能平滑移动
    FX.update(G.speed === 0 ? 0 : real * slow);
    Fire.tick();
    UI.tick(real);
  }
  Render.draw(real);
  requestAnimationFrame(frame);
}

// ---------- 事件 ----------
Bus.on('news', (t) => { if (running) UI.addFeed(t); });
Bus.on('leader', ({ n, text }) => UI.leader(n, text));
Bus.on('banner', (t) => UI.banner(t));
Bus.on('midnight', () => SFX.bell());
Bus.on('intel', (x) => {
  if (!x.isPlayer) return;
  UI.banner('🕵 你的动向已被各国情报机构察觉！准备迎接围攻');
  UI.tip('intel', `🕵 你被情报<b>点名</b>：你${x.intelWhy}。接下来 ${CFG.INTEL_FOCUS} 秒你是各国的首要目标，准备好护盾。`, { cd: 30 });
});
// 被 AI 盯上：告诉玩家原因（每个国家 40 秒内只提示一次）
Bus.on('targeted', ({ n, why }) => UI.tip('tg' + n.id, `🎯 <b style="color:${n.color}">${n.race.emoji}${n.name}</b> 盯上了你：${why}`, { cd: 40, life: 5 }));
Bus.on('ult', ({ n, tgt }) => {
  const U = n.race.ult;
  if (n.isPlayer) UI.banner(`${U.icon} ${U.name}！`);
  else if (tgt && tgt.isPlayer) { UI.banner(`${U.icon} ${n.name} 对你发动【${U.name}】`); UI.leader(n, n.race.lines.launch); }
  else if (n.race.id === 'mushroom') UI.tip('ultdust' + n.id, `🌪 ${n.race.emoji}${n.name} 发动【扬沙】：你的人口暂时停止增长`, { cd: 60, life: 5 });
});
Bus.on('eliminated', (n) => {
  Render.buildBase();
  if (G.selTarget === n.id) G.selTarget = -1;
  if (G.target === n.id) {
    G.target = -1;
    Fire.release(false); Fire.endAllIn();
    if (n !== G.player) UI.banner(`🎯 目标 ${n.name} 已被核平，请选择新目标`);
  }
  UI.leader(n, n.race.lines.dead);
});
Bus.on('gameover', (kind) => {
  SFX.music(false);
  setTimeout(() => UI.showEnd(kind), 2500);
});
Bus.on('tech', ({ n, tech }) => {
  if (!n.isPlayer) return;
  UI.banner(`🔬 解锁：${tech.name}`);
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
        onMapClick(t);
        if (e.pointerType !== 'mouse') { // 触屏：轻点后显示 2.5 秒地块信息
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
    zoomAt(e.clientX, e.clientY, Render.cam.zoom * (e.deltaY < 0 ? 1.12 : 1 / 1.12));
  }, { passive: false });
  cv.addEventListener('contextmenu', (e) => e.preventDefault());

  window.addEventListener('keydown', (e) => {
    if (!running || !G || G.over) return;
    if (e.target.tagName === 'INPUT' && e.target.type !== 'range' && e.target.type !== 'checkbox') return;
    const k = e.key.toLowerCase();
    if (e.code === 'Space') { e.preventDefault(); G.speed = G.speed === 0 ? (G.prevSpeed || 1) : (G.prevSpeed = G.speed, 0); }
    else if (e.key === 'Tab') { e.preventDefault(); if (chooserOpen()) UI.closeChooser(); else UI.openChooser(); }
    else if (k === 'f' || k === 'c') { // 按住 F / C 蓄力；Shift 梭哈
      if (e.repeat) return;
      const ammo = k === 'f' ? 'nuke' : 'conv';
      if (e.shiftKey) playerFire(ammo, fireMax(ammo));
      else Fire.begin(ammo);
    }
    else if (k === 'escape') { if (Fire.charging) Fire.release(false); else UI.closeChooser(); }
    else if (chooserOpen() && k >= '1' && k <= '9') {
      const t = UI.chooserTargets()[+k - 1];
      if (t) { setTarget(t.id); UI.closeChooser(); }
    }
    else if (k === 'b') useShield(G.player);
    else if (k === 'q') playerUlt();
    else if (k === 'n') useNet(G.player);
    else if (k === 'r') rebuildAll(G.player);
    else if (k === '=' || k === '+') G.speed = Math.min(3, G.speed + 1);
    else if (k === '-') G.speed = Math.max(0, G.speed - 1);
  });
  window.addEventListener('keyup', (e) => {
    const k = e.key.toLowerCase();
    if (!Fire.charging) return;
    if ((k === 'f' && Fire.charging.ammo === 'nuke') || (k === 'c' && Fire.charging.ammo === 'conv')) Fire.release(true);
  });
  window.addEventListener('blur', () => { Fire.release(false); Fire.endAllIn(); });
}

function onMapClick(tile) {
  if (!tile) return;
  const p = G.player;
  if (tile.owner === p.id) {
    if (tile.city && tile.city.ruined) { if (rebuildCity(p, tile.city)) SFX.click(); return; }
    if (tile.fac && !tile.fac.alive) { if (rebuildFac(p, tile.fac)) SFX.click(); return; }
    return;
  }
  if (tile.owner >= 0 && G.nations[tile.owner].alive) setTarget(tile.owner); // 点击敌国直接设为目标
}

// ---------- 启动 ----------
window.addEventListener('DOMContentLoaded', () => {
  Render.init($('game'));
  FX.init();
  setupInput();
  UI.initStart(startGame);
  requestAnimationFrame(frame);
});
