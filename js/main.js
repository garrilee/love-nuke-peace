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

function startGame(raceId, aiCount) {
  SFX.init();
  FX.reset();
  Render.resetScorch();
  newGame(raceId, aiCount);
  Render.buildBase();
  Render.fit();
  UI.initHUD();
  for (const t of G.newsQueue) UI.addFeed(t);
  G.target = -1;
  Fire.charging = null; Fire.allin = null; Fire.pendingConv = 0;
  SFX.music(true);
  running = true;
}

function frame(ts) {
  const real = Math.min(0.1, (ts - lastFrame) / 1000 || 0);
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
Bus.on('intel', (x) => { if (x.isPlayer) UI.banner('🕵 你的动向已被各国情报机构察觉！准备迎接围攻'); });
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
  let down = null, dragging = false;
  cv.addEventListener('mousedown', (e) => { if (e.button === 0 || e.button === 1) { down = { x: e.clientX, y: e.clientY, cx: Render.cam.x, cy: Render.cam.y }; dragging = false; } });
  window.addEventListener('mousemove', (e) => {
    if (down) {
      const dx = e.clientX - down.x, dy = e.clientY - down.y;
      if (Math.abs(dx) + Math.abs(dy) > 5) dragging = true;
      if (dragging) {
        Render.cam.x = clamp(down.cx - dx / Render.cam.zoom, 0, WORLD_W);
        Render.cam.y = clamp(down.cy - dy / Render.cam.zoom, 0, WORLD_H);
      }
    }
    if (G && e.target === cv) {
      const t = Render.tileAt(e.clientX, e.clientY);
      Render.hoverTile = t;
      UI.tooltip(t, e.clientX, e.clientY);
    } else UI.tooltip(null);
  });
  window.addEventListener('mouseup', (e) => {
    if (down && !dragging && e.target === cv && G) onMapClick(Render.tileAt(e.clientX, e.clientY));
    down = null;
  });
  cv.addEventListener('wheel', (e) => {
    e.preventDefault();
    const before = Render.screenToWorld(e.clientX, e.clientY);
    const z = clamp(Render.cam.zoom * (e.deltaY < 0 ? 1.12 : 1 / 1.12), 0.4, 3.5);
    Render.cam.zoom = z;
    const after = Render.screenToWorld(e.clientX, e.clientY);
    Render.cam.x += before.x - after.x; Render.cam.y += before.y - after.y;
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
