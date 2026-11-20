// ===================== 渲染·WebGL 画法：整帧画面 =====================
// Gl.on 时由 Render.draw 调用 Render.glDraw。画的内容、顺序和 Canvas 2D 画法（base / units / labels / boss / fx）一一对应，
// 预先画好的缓存图（底图、国土、发光国境、城市灯光、标牌、文字……）两套画法共用，这里只是把“贴图”和“画线”交给显卡。
'use strict';

const hexNum = (col) => parseInt(col.slice(1), 16); // '#rrggbb' → 0xrrggbb
// 上淡下亮的竖直渐变（光柱用），白色，用的时候染色
Gl.fadeUp = function () {
  return this.made('fadeUp', 1, 1, 64, (cx) => {
    const g = cx.createLinearGradient(0, 0, 0, 1);
    g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(255,255,255,1)');
    cx.fillStyle = g; cx.fillRect(0, 0, 1, 1);
  });
};
// 圆弧：从 a0 画到 a1（Graphics 的 arc 会从上一个点连线过来，所以先移到起点）
Gl.arc = function (g, x, y, r, a0, a1) { g.moveTo(x + Math.cos(a0) * r, y + Math.sin(a0) * r); g.arc(x, y, r, a0, a1); };
// 虚线圆：n 段短弧，off 为旋转偏移（弧度）
Gl.dashCircle = function (g, x, y, r, dash, gap, off) {
  const step = (dash + gap) / r, n = Math.max(8, Math.floor(Math.PI * 2 / step)), da = Math.PI * 2 / n, on = da * dash / (dash + gap);
  for (let i = 0; i < n; i++) this.arc(g, x, y, r, off + i * da, off + i * da + on);
};

Object.assign(Render, {
  glDraw(camX, camY, pz, sx, sy, z, T) {
    Gl.begin(camX, camY, pz, sx, sy);
    const L = Gl.L, g = Gl.g;
    // 底图和焦痕
    Gl.mapSprite(Gl.baseSpr, this.base);
    Gl.mapSprite(Gl.terrSpr, this.terr);
    Gl.syncScorch(this.scorch);

    this.glNations(z, T);
    // 辐射尘
    if (this.updateDust(T)) Gl.touch(this.dust);
    Gl.mapSprite(Gl.dustSpr, this.dust, this.dustAny ? this.dustAlpha(T) : 0);
    if (G.boss) { this.glFlat(T); this.glChaos(T); }
    FX.glGround();
    FX.glFires();
    this.glCities(z, T);
    this.glFacilities(z, T);
    const dark = FX.cineDark(); // 东风镜头：先压暗地面，飞弹和光柱在上面
    if (dark > 0) { const v = this.view; L.dark.rect(v.left, v.top, v.right - v.left, v.bottom - v.top, 0x000000, 0.62 * dark); }
    if (G.dims && G.dims.length) this.glDims(z, T);
    this.glProjectiles(z, T);
    FX.glAir();
    FX.glCinePillar(z);
    this.drawLabels(null, z);
    this.drawMarkers(null, z, T);
    this.drawChaosBadge(null, z);
    this.glCrate(z, T);
    FX.glTexts(z);
    FX.glCombos(z);
    if (this.hoverTile) {
      const p = hexCorners(this.hoverTile.x, this.hoverTile.y, CFG.HEX), flat = [];
      for (const q of p) flat.push(q[0], q[1]);
      g.mark.lineStyle(1.2 / z, 0xffffff, 0.7); g.mark.drawPolygon(flat);
    }
    // 屏幕层
    const w = this.w, h = this.h;
    L.scr.img(Gl.tex(this.vignette('black')), 0, 0, w, h, 1);
    if (G.player.alive && incomingFor(G.player).some((x) => isThreat(x.p))) L.scr.img(Gl.tex(this.vignette('red')), 0, 0, w, h, 0.18 + 0.12 * Math.sin(T * 7));
    FX.glScreen(w, h);
    Gl.end();
  },

  // ---------- 国土：我方底色和金色国境、目标的红色国境、护盾、断网 ----------
  glFill(layer, id, color, alpha) {
    const m = this.fillImage(id, color);
    if (m && alpha > 0 && this.visibleRect(m.x, m.y, m.w, m.h)) layer.img(Gl.tex(m.c), m.x, m.y, m.w, m.h, alpha);
  },
  glGlow(id, kind, alpha, dx = 0) {
    const m = this.glowImage(id, kind);
    if (m && this.visibleRect(m.x, m.y, m.w, m.h)) Gl.L.fillAdd.img(Gl.tex(m.c), m.x + dx, m.y, m.w, m.h, alpha);
  },
  glNations(z, T) {
    const L = Gl.L, me = G.player;
    if (me.alive && this.nationPaths[me.id]) {
      const pulse = 0.5 + 0.5 * Math.sin(T * 2.2);
      this.glFill(L.fill, me.id, me.color, 0.13 + 0.05 * pulse);
      this.glGlow(me.id, 'me', 0.7 + 0.3 * pulse);
    }
    const tg = G.nations[G.target];
    if (tg && tg.alive && this.borderPaths[tg.id]) {
      const pulse = 0.5 + 0.5 * Math.sin(T * 4);
      this.glFill(L.fill, tg.id, 'rgb(255,50,40)', 0.07 + 0.05 * pulse);
      this.glGlow(tg.id, 'target', 0.7 + 0.3 * pulse);
    }
    for (const n of G.nations) {
      if (!this.nationPaths[n.id] || !n.alive) continue;
      if (G.selTarget === n.id) this.glFill(L.fill, n.id, '#ff3b3b', 0.08 + 0.05 * Math.sin(T * 5));
      if (n.hackT > 0) this.glGlow(n.id, 'hack', 0.5 + 0.4 * (Math.sin(T * 23) > 0 ? 1 : 0), (Math.random() - 0.5) * 1.5); // 断网：青色虚线国境乱闪
      if (n.shieldT > 0) { // 护盾：覆盖全国的能量罩，快结束时闪烁
        const fade = n.shieldT < 2 ? (Math.sin(T * 20) > 0 ? 1 : 0.4) : 1;
        this.glFill(L.fillAdd, n.id, 'rgb(90,200,255)', (0.16 + 0.06 * Math.sin(T * 6)) * fade);
        this.glGlow(n.id, 'shield', fade);
      }
    }
  },

  // ---------- 三体人：二维化地块、乱纪元 ----------
  glFlat(T) {
    this.markFlats();
    const H = CFG.HEX, L = Gl.L.flat;
    for (const t of G.world.tiles) {
      if (!t.flat) continue;
      const a = flatAlpha(t);
      if (a <= 0) { t.flat = 0; continue; }
      if (!this.visibleRect(t.x - H * 2, t.y - H * 2, H * 4, H * 4)) continue;
      Gl.put(L, this.flatStamp(t.flat >= 1), t.x, t.y, a * (0.93 + 0.07 * Math.sin(T * 2 + t.phase)));
    }
  },
  glChaos(T) {
    const b = G.boss;
    if (!b || !b.alive || !isChaos(b) || !this.nationPaths[b.id]) return;
    this.glFill(Gl.L.fillAdd, b.id, 'rgb(255,110,40)', 0.1 + 0.08 * Math.sin(T * 9));
    this.glGlow(b.id, 'target', 0.5 + 0.5 * Math.abs(Math.sin(T * 6)));
  },
  // 降维打击：预警时两圈红紫色虚线闪烁，展开时一道紫红色电光冲击环向外推
  glDims(z, T) {
    const px = HEX_W, B = BOSS_CFG, g = Gl.g.dim, lines = Gl.lines;
    for (const d of G.dims || []) {
      const c = G.world.tiles[d.tile], r = dimRadius(d);
      if (r < 0) {
        const left = B.dimWarn - (G.t - d.t0), blink = 0.55 + 0.45 * Math.sin(T * (8 + (10 - left) * 1.5));
        g.lineStyle(0); g.beginFill(0x5a003c, 0.12 + 0.08 * blink); g.drawCircle(c.x, c.y, B.dimCore * px); g.endFill();
        const off = T * 30 / (B.dimCore * px);
        g.lineStyle(7 / z, 0xff2a8a, 0.22 * blink); Gl.dashCircle(g, c.x, c.y, B.dimCore * px, 8 / z, 6 / z, off);   // 光晕
        g.lineStyle(2.6 / z, 0xff3c8c, 0.9 * blink); Gl.dashCircle(g, c.x, c.y, B.dimCore * px, 8 / z, 6 / z, off);
        g.lineStyle(1.8 / z, 0xbe50ff, 0.7 * blink); Gl.dashCircle(g, c.x, c.y, B.dimOuter * px, 8 / z, 6 / z, off * 0.5);
        const font = `bold ${Math.round(18 / Math.max(0.7, z))}px "Microsoft YaHei", sans-serif`;
        const label = this.labelImage('dim:' + d.t0, `🌀 降维打击 ${Math.ceil(left)}`, font, '#ffe0f0', 7, 'rgba(255,30,120,0.95)');
        Gl.put(Gl.L.label, label, c.x, c.y - B.dimCore * px - 6);
      } else if (r < B.dimOuter) {
        if (!d.focused) { d.focused = true; this.focusOn(c.x, c.y); SFX.dimSpread(); } // 二维化展开的一刻：镜头推近
        const R = Math.max(0.5, r) * px;
        // 冲击环后方的紫色余辉：几圈由宽到窄的淡紫色环叠出渐变
        for (let i = 0; i < 4; i++) { lines.lineStyle(10, 0xaa28ff, 0.10 + i * 0.05); lines.drawCircle(c.x, c.y, Math.max(1, R - 34 + i * 10)); }
        // 主环 + 电光锯齿
        lines.lineStyle(9 / z, 0xff3ab0, 0.3); lines.drawCircle(c.x, c.y, R);
        lines.lineStyle(4 / z, 0xff5ac8, 0.95); lines.drawCircle(c.x, c.y, R);
        lines.lineStyle(1.4 / z, 0x8cf0ff, 0.9);
        const segs = 72;
        for (let i = 0; i <= segs; i++) {
          const ang = (i / segs) * Math.PI * 2, jit = (Math.random() - 0.5) * 7;
          const x = c.x + Math.cos(ang) * (R + jit), y = c.y + Math.sin(ang) * (R + jit);
          if (i) lines.lineTo(x, y); else lines.moveTo(x, y);
        }
        FX.shake = Math.max(FX.shake || 0, 2.5); // 展开时屏幕轻微震动
      }
    }
  },

  // ---------- 城市：灯光、废墟火光、黑烟、人口环 ----------
  glRing(g, x, y, r, k, color, z) { // 进度环
    g.lineStyle(2 / z, 0xffffff, 0.15); g.drawCircle(x, y, r);
    if (k > 0.001) { g.lineStyle(2 / z, color, 1); Gl.arc(g, x, y, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, k)); }
  },
  glCities(z, T) {
    const S = FX.S, L = Gl.L.ground, g = Gl.g.low, tx = (c) => Gl.tex(c);
    const white = tx(S.white), red = tx(S.red), orange = tx(S.orange), warm = tx(S.warm);
    // 公路灯带：两端城市都亮着才亮
    if (this.cityLightsEnabled) for (const K of this.links || []) {
      const a = Math.min(this.cityLit(K.a), this.cityLit(K.b), 1) * 0.42;
      if (a < 0.03 || !K.img || !this.visibleRect(K.img.x, K.img.y, K.img.w, K.img.h)) continue;
      L.img(tx(K.img.c), K.img.x, K.img.y, K.img.w, K.img.h, a * (0.85 + 0.15 * Math.sin(T * 1.7 + K.a.id)));
    }
    for (const c of G.world.cities) {
      const b = this.cityLit(c), x = c.tile.x, y = c.tile.y;
      if (this.cityLightsEnabled) {
        // 每盏灯记住开/关状态：熄灭的一瞬间闪一下白光再消失
        let lit = 0;
        for (const K of c.lights) {
          const on = K.rank <= b;
          if (K.on === undefined) { K.on = on; K.chg = -99; }
          if (K.on !== on) { K.on = on; K.chg = T; }
          if (on) { lit++; continue; }
          const since = T - K.chg;
          if (since < 0.7) { const k = 1 - since / 0.7, s = 6 * K.s * (1 + since); L.img(white, x + K.x - s / 2, y + K.y - s / 2, s, s, k * k); }
        }
        if (lit) {
          const img = this.cityLights(c, b, lit);
          if (this.visibleRect(x - img.r, y - img.r, img.r * 2, img.r * 2)) L.img(tx(img.c), x - img.r, y - img.r, img.r * 2, img.r * 2, 0.9 + 0.1 * Math.sin(T * 2.3 + c.id));
        }
      }
      if (c.ruined) { // 废墟：中心一团摇曳的火光 + 零星余火
        const alive = G.nations[c.nation].alive;
        const fl = 0.6 + 0.4 * Math.sin(T * 9 + c.id) * Math.sin(T * 5.3 + c.id * 2);
        L.img(red, x - 18, y - 13, 36, 26, (alive ? 0.32 : 0.14) * fl);
        L.img(orange, x - 7, y - 8, 14, 14, (alive ? 0.45 : 0.2) * fl);
        for (let i = 0; i < c.lights.length; i += 4) {
          const K = c.lights[i];
          L.img(red, x + K.x - 2.5, y + K.y - 2.5, 5, 5, 0.25 + 0.25 * Math.sin(T * 5 + K.ph * 3));
        }
        continue;
      }
      if (!this.cityLightsEnabled) continue;
      const core = CFG.HEX * (1.6 + Math.sqrt(b) * 1.2) * (c.isCapital ? 1.25 : 1);
      if (this.visibleRect(x - core / 2, y - core / 2, core, core)) L.img(warm, x - core / 2, y - core / 2, core, core, 0.22 + 0.1 * b);
    }
    // 黑烟：废墟和人口低于一半的城市
    const smoke = tx(S.smokeLight || S.white), LS = Gl.L.low;
    for (const c of G.world.cities) {
      const n = G.nations[c.nation];
      if (!n.alive || c.basePop <= 0) continue;
      const f = c.ruined ? 0 : c.pop / c.basePop;
      if (f > 0.5) continue;
      const x = c.tile.x, y = c.tile.y;
      if (!this.visibleRect(x - 20, y - 50, 40, 60)) continue;
      const k = c.ruined ? 1 : (0.5 - f) * 2, puffs = c.ruined ? 5 : 3;
      for (let i = 0; i < puffs; i++) {
        const ph = ((T * 0.22 + i / puffs + c.id * 0.137) % 1);
        const px = x + Math.sin(ph * 5 + c.id) * 3 + ph * 8, py = y - 4 - ph * 34, s = 7 + ph * 18;
        LS.img(smoke, px - s / 2, py - s / 2, s, s, (1 - ph) * 0.55 * k);
      }
    }
    for (const c of G.world.cities) {
      const n = G.nations[c.nation], x = c.tile.x, y = c.tile.y;
      if (!this.visibleRect(x - 12, y - 12, 24, 24)) continue;
      if (n.alive && c.basePop > 0) { // 人口环：受损才显示，越少越红
        const f = clamp(c.pop / c.basePop, 0, 1);
        if (f < 0.97) {
          const r = 9.5, lw = 1.8 / Math.max(0.8, z);
          g.lineStyle(lw, 0x000000, 0.55); g.drawCircle(x, y, r);
          if (f > 0.01) { g.lineStyle(lw, c.settling ? 0x7fd6ff : f > 0.6 ? 0x7dff8a : f > 0.3 ? 0xffc23d : 0xff4a3a, 1); Gl.arc(g, x, y, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * f); }
        }
      }
      if (c.isCapital && n.alive) {
        g.lineStyle(0); g.beginFill(hexNum(n.color), 1);
        g.drawPolygon([x, y - 4, x + 3, y, x, y + 4, x - 3, y]); g.endFill();
      }
      if (c.rebuild > 0) this.glRing(g, x, y, 9, 1 - c.rebuild / rebuildTime(n), 0x7dffb0, z);
    }
  },

  // ---------- 设施和潜航器 ----------
  glFacilities(z, T) {
    const g = Gl.g.low, L = Gl.L.fac;
    for (const f of G.world.facilities) {
      const n = G.nations[f.nation], x = f.tile.x, y = f.tile.y;
      if (!this.visibleRect(x - 14, y - 14, 28, 28)) continue;
      if (!f.alive) { // 宕机：红叉
        g.lineStyle(1.5 / z, 0xff503c, 0.6);
        g.moveTo(x - 4, y - 4); g.lineTo(x + 4, y + 4); g.moveTo(x + 4, y - 4); g.lineTo(x - 4, y + 4);
        if (f.rebuild > 0) this.glRing(g, x, y, 8, 1 - f.rebuild / rebuildTime(n), 0x7dffb0, z);
        continue;
      }
      Gl.put(L, this.facPlate(f.type, n.color, z), x, y);
      if (f.type === 'pad' && f.missiles > 0) {
        g.lineStyle(0); g.beginFill(0xffffff, 1);
        for (let i = 0; i < f.missiles; i++) g.drawRect(x - 4 + i * 3, y + 6, 2, 2);
        g.endFill();
      }
    }
    const p = G.player; // 玩家潜航器（敌方不可见）
    if (p.alive) for (const s of p.subs) {
      if (s.state !== 'out') continue;
      const pl = this.plate('sub', '', [-6.5, -4.5, 13, 7.5], 10, (cx) => {
        cx.shadowColor = '#6cf'; cx.shadowBlur = 10; cx.fillStyle = '#9be8ff';
        cx.beginPath(); cx.ellipse(0, 0, 6, 2.2, 0, 0, Math.PI * 2); cx.fill();
        cx.fillRect(-1, -4, 2, 3);
      });
      Gl.put(L, pl, s.tile.x, s.tile.y + Math.sin(T * 1.5 + s.tile.phase) * 1.5);
    }
  },

  // ---------- 飞行物 ----------
  glPaper(x, y, ang, col, z, wob, alpha) {
    const k = this.paperScale(z), tex = Gl.made('paper:' + col, 13, 12.2, 8, (cx) => { cx.translate(5.5, 6.1); this.paintPaper(cx, col); });
    Gl.L.unit.rot(tex, x, y, 13 * k, 12.2 * k * this.paperFlap(wob), alpha, ang, 5.5 / 13, 0.5);
  },
  glProjectiles(z, T) {
    const S = FX.S, lines = Gl.lines, H = Gl.L.head, n = Gl.NP, cols = this.trailCols, zk = Math.max(0.6, z);
    const solid = (r, g, b) => { for (let i = 0; i < n; i++) { cols[i * 3] = r; cols[i * 3 + 1] = g; cols[i * 3 + 2] = b; } };
    const line = this._lpts || (this._lpts = Array.from({ length: n }, () => ({ x: 0, y: 0 })));
    this.lod = G.projectiles.length > 80;
    for (const p of G.projectiles) {
      if (!p.launched) continue;
      if (p.locked && !p.engaged) { // 被拦截弹锁定：向外扩散的波纹 + 呼吸的光点
        if (p.lockT === undefined) p.lockT = T;
        const pos = this.projPos(p), intro = Math.min(1, (T - p.lockT) / 0.3), ph = (T * 1.6 + p.id * 0.37) % 1;
        for (let k = 0; k < 2; k++) {
          const f = (ph + k * 0.5) % 1;
          lines.lineStyle(1.4 / zk, 0x82ebff, (1 - f) * 0.85 * intro); lines.drawCircle(pos.x, pos.y, 4 + f * 12 * intro);
        }
        H.img(Gl.tex(S.cyan), pos.x - 7, pos.y - 7, 14, 14, (0.45 + 0.35 * Math.sin(T * 7 + p.id)) * intro);
      } else p.lockT = undefined;
      const u = this.renderU(p);
      const toMe = G.player && p.tgt === G.player.id && G.player.alive && p.kind !== 'guard';
      const col = toMe ? '#ff3b30' : G.nations[p.att].color;
      if (p.kind === 'conv') { // 常规导弹：一条暖色光带 + 弹头光点
        const pts = this.trailPts(p, Math.max(0, u - 0.2), u);
        solid(1, 0.9, 0.67);
        Gl.trail(pts, 1.1 / zk, cols, 0.7);
        H.img(Gl.tex(S.warm), pts[n - 1].x - 4, pts[n - 1].y - 4, 8, 8, 0.9);
      } else if (p.kind === 'rocket') {
        // 分弹头在分离前不单独画（和母弹重合），母弹到达分离点时爆出一团光
        if (p.mirvOf !== undefined && u < CFG.MIRV_SPLIT) continue;
        if (p.mirvLead && !p.splitFx && u >= CFG.MIRV_SPLIT) { p.splitFx = true; const q = this.arcPoint(p, u); FX.mirvSplit(q.x, q.y, p.lv); }
        const h = this.glRocketTrail(p, u, col, z, T);
        this.trailExtras(null, p, h, p.lv || 1, z, T);
        const left = p.delay + p.flight - p.t - (G.interp || 0);
        if (p.lv >= 5 && !p.cine && left < 0.55) { p.cine = true; FX.startCine(p); }
        if (p.unstop) { lines.lineStyle(1.2 / z, 0xc882ff, 0.85); lines.drawCircle(h.x, h.y, (6 + 2 * Math.sin(T * 10 + p.id)) / Math.max(0.7, z)); } // 一叉入魂：紫色光环
        if (left < 3) { lines.lineStyle(1 / z, 0xff503c, 0.5 + 0.4 * Math.sin(T * 14)); lines.drawCircle(p.tx, p.ty, 5 + left * 3); } // 目标点预示圈
      } else if (p.kind === 'drone') {
        const pos = this.dronePos(p, u);
        if (!this.visibleRect(pos.x - 14, pos.y - 14, 28, 28)) continue;
        const back = this.dronePos(p, Math.max(0, u - 0.035)), c = hexToRgb(col);
        for (let i = 0; i < n; i++) { const f = i / (n - 1); line[i].x = lerp(back.x, pos.x, f); line[i].y = lerp(back.y, pos.y, f); }
        solid(c[0] / 255, c[1] / 255, c[2] / 255);
        Gl.trail(line, 0.9 / zk, cols, 0.45);
        this.glPaper(pos.x, pos.y, Math.atan2(pos.y - back.y, pos.x - back.x), col, z, p.wob, 1);
      } else if (p.kind === 'guard') { // 升空拦截的小摩托：外面一圈青色光环
        const k = clamp((G.interp || 0) / CFG.SIM_DT, 0, 1), x = lerp(p.bx, p.fx, k), y = lerp(p.by, p.fy, k);
        if (!this.visibleRect(x - 14, y - 14, 28, 28)) continue;
        const ang = Math.hypot(p.fx - p.bx, p.fy - p.by) > 0.01 ? Math.atan2(p.fy - p.by, p.fx - p.bx) : (p._ang || 0);
        p._ang = ang;
        const land = p.fade !== undefined ? clamp(p.fade / 0.6, 0.1, 1) : 1; // 自毁：慢慢缩小变淡
        if (p.fade === undefined) { lines.lineStyle(0.9 / zk, 0x78ebff, 0.55 + 0.25 * Math.sin(T * 8 + p.id)); lines.drawCircle(x, y, 7 / Math.max(0.75, z) + 1.5); }
        this.glPaper(x, y, ang, col, z * (1 / (0.5 + 0.5 * land)), p.wob, land);
      } else this.glPlane(p, u, col, z);
    }
    this.glIncomingMarks(z, T);
  },
  // 飞机：双道尾迹、机翼航行灯
  glPlane(p, u, col, z) {
    const n = Gl.NP, cols = this.trailCols, U = Gl.L.unit, P = window.PIXI;
    const pos = this.planePos(p, u), ahead = this.planePos(p, Math.min(1, u + 0.01));
    const ang = Math.atan2(ahead.y - pos.y, ahead.x - pos.x), u0 = Math.max(0, u - 0.22);
    const a2 = ang + Math.PI / 2, dx = Math.cos(a2) * 2.2, dy = Math.sin(a2) * 2.2;
    const pts = this._ppts || (this._ppts = Array.from({ length: n }, () => ({ x: 0, y: 0 })));
    for (let i = 0; i < n; i++) { cols[i * 3] = 0.86; cols[i * 3 + 1] = 0.92; cols[i * 3 + 2] = 1; }
    for (const s of [-1, 1]) {
      for (let i = 0; i < n; i++) { const q = this.planePos(p, u0 + (u - u0) * (i / (n - 1))); pts[i].x = q.x + dx * s; pts[i].y = q.y + dy * s; }
      Gl.trail(pts, 1.1 / Math.max(0.6, z), cols, 0.45);
    }
    Gl.L.head.img(Gl.tex(FX.sprite('p' + col, ...hexToRgb(col))), pos.x - 12, pos.y - 12, 24, 24, 0.5);
    const pl = this.planePlate(col);
    U.rot(Gl.tex(pl.c), pos.x, pos.y, pl.w, pl.h, 1, ang, -pl.x / pl.w, -pl.y / pl.h);
    if (Math.sin(this.time * 8 + p.id) > 0) { // 航行灯：左红右绿，闪烁
      const c = Math.cos(ang), s = Math.sin(ang);
      for (const [ly, tint] of [[-6.1, 0xff4040], [6.1, 0x40ff70]]) U.rot(P.Texture.WHITE, pos.x + c * -0.9 - s * ly, pos.y + s * -0.9 + c * ly, 1.4, 1.4, 1, ang, 0.5, 0.5, tint);
    }
  },
  // 来袭落点：同一座城市只画一个红色瞄准圈，旁边写来袭数量和最快到达的秒数
  glIncomingMarks(z, T) {
    const me = G.player;
    if (!me || !me.alive) return;
    const marks = new Map();
    for (const p of G.projectiles) {
      if (!p.launched || p.done || p.tgt !== me.id || (p.kind !== 'rocket' && p.kind !== 'ufo' && p.kind !== 'conv')) continue;
      const left = p.delay + p.flight - p.t - (G.interp || 0), key = p.tile.idx;
      const m = marks.get(key) || { x: p.tile.x, y: p.tile.y, n: 0, left: Infinity, nuke: false };
      m.n++; m.left = Math.min(m.left, left); m.nuke = m.nuke || p.kind !== 'conv';
      marks.set(key, m);
    }
    if (!marks.size) return;
    const k = 1 / Math.max(0.7, z), g = Gl.g.mark;
    for (const m of marks.values()) {
      const urgent = m.left < 3, pulse = 0.55 + 0.45 * Math.sin(T * (urgent ? 16 : 7));
      const r = (11 + (urgent ? 0 : 2 * pulse)) * k, col = m.nuke ? 0xff3c30 : 0xffaa3c;
      g.lineStyle(1.6 * k, col, 0.6 + 0.4 * pulse);
      g.drawCircle(m.x, m.y, r);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { g.moveTo(m.x + dx * r * 0.55, m.y + dy * r * 0.55); g.lineTo(m.x + dx * r * 1.35, m.y + dy * r * 1.35); }
      const txt = `${m.nuke ? '☢' : '💥'}${m.n > 1 ? '×' + m.n : ''} ${Math.max(0, m.left).toFixed(m.left < 3 ? 1 : 0)}s`;
      Gl.putText(Gl.L.label, Gl.txt(txt, Math.round(11 * k), 'bold', m.nuke ? 'rgb(255,60,48)' : 'rgb(255,170,60)', 3 * k, '', 0, 'left'), m.x + r + 3 * k, m.y - r * 0.6, 1);
    }
  },

  // ---------- 空投补给箱 ----------
  glCrate(z, T) {
    const c = G.crate;
    if (!c || c.until <= G.t) return;
    const t = G.world.tiles[c.tile], d = CRATES[c.kind], k = 1 / Math.max(0.7, z), col = hexNum(d.color);
    const left = clamp((c.until - G.t) / (c.until - c.t0), 0, 1), bob = Math.sin(T * 3) * 2 * k;
    const x = t.x, y = t.y - 6 * k + bob, R = 15 * k, A = Gl.L.labelAdd, g = Gl.g.mark;
    A.img(Gl.fadeUp(), x - 5 * k, y - 90 * k, 10 * k, 90 * k, 0.5, col); // 从天而降的光柱
    // 闪烁的光晕：一团忽明忽暗的光 + 三圈向外扩散的光圈
    const blink = 0.5 + 0.5 * Math.sin(T * 9), gs = (70 + 26 * blink) * k;
    A.img(Gl.tex(FX.S.white), x - gs / 2, y - gs / 2, gs, gs, 0.35 + 0.45 * blink);
    for (let i = 0; i < 3; i++) {
      const ph = (T * 0.8 + i / 3) % 1;
      g.lineStyle((3 - ph * 2) * k, i === 0 ? 0xffffff : col, (1 - ph) * 0.9); g.drawCircle(x, y, (14 + ph * 46) * k);
    }
    // 箱子：深色底 + 奖励图标
    const box = this.plate('crate:' + c.kind, '' + k, [-R, -R, R * 2, R * 2], 16, (cx) => {
      cx.shadowColor = d.color; cx.shadowBlur = 16; cx.fillStyle = 'rgba(10,16,28,0.92)';
      this.roundRect(cx, -R, -R, R * 2, R * 2, 5 * k); cx.fill();
      cx.shadowBlur = 0; cx.strokeStyle = d.color; cx.lineWidth = 2 * k; cx.stroke();
      cx.font = `${Math.round(19 * k)}px "Microsoft YaHei", sans-serif`; cx.textAlign = 'center'; cx.textBaseline = 'middle';
      cx.fillStyle = d.color; cx.fillText(d.icon, 0, 1 * k);
    });
    Gl.put(Gl.L.label, box, x, y);
    g.lineStyle(2.6 * k, 0xffffff, 1); Gl.arc(g, x, y, R + 5 * k, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * left); // 倒计时圈
    // 箱子在画面外：屏幕边缘一个闪烁的箭头指过去
    const v = this.view;
    if (t.x < v.left || t.x > v.right || t.y < v.top || t.y > v.bottom) {
      const m = 26 * k, ax = clamp(t.x, v.left + m, v.right - m), ay = clamp(t.y, v.top + m * 3, v.bottom - m), ang = Math.atan2(t.y - ay, t.x - ax);
      const pin = this.plate('cratePin:' + c.kind, '' + k, [-14 * k, -14 * k, 28 * k, 28 * k], 0, (cx) => {
        cx.fillStyle = 'rgba(10,16,28,0.9)'; cx.strokeStyle = d.color; cx.lineWidth = 2 * k;
        cx.beginPath(); cx.arc(0, 0, 13 * k, 0, Math.PI * 2); cx.fill(); cx.stroke();
        cx.font = `${Math.round(14 * k)}px "Microsoft YaHei", sans-serif`; cx.textAlign = 'center'; cx.textBaseline = 'middle';
        cx.fillStyle = d.color; cx.fillText(d.icon, 0, 1 * k);
      });
      const al = 0.6 + 0.4 * blink, ca = Math.cos(ang), sa = Math.sin(ang);
      Gl.put(Gl.L.label, pin, ax, ay, al);
      const pt = (lx, ly) => [ax + ca * lx - sa * ly, ay + sa * lx + ca * ly];
      g.lineStyle(0); g.beginFill(0xffffff, al);
      g.drawPolygon([...pt(22 * k, 0), ...pt(15 * k, -5 * k), ...pt(15 * k, 5 * k)]); g.endFill();
    }
  },
});

// ---------- 特效里原来用 2D 画的部分：伤害数字、东风光柱、屏幕闪光 ----------
Object.assign(FX, {
  glTexts(zoom) {
    const L = Gl.L.text;
    for (const t of this.texts) {
      const k = t.age / t.life;
      if (t.big) { // 大伤害数字：先放大弹出再回落，停留后上浮淡出
        const a = t.age, s = a < 0.12 ? 0.5 + a / 0.12 * 0.9 : a < 0.3 ? 1.4 - (a - 0.12) / 0.18 * 0.4 : 1;
        const px = Math.max(4, Math.round(t.size / Math.max(0.7, zoom)));
        const e = Gl.txt(t.str, px, 900, t.color, Math.max(2, px * 0.14), t.color, t.glow || 0, 'center');
        Gl.putText(L, e, t.x, t.y - Math.max(0, a - 0.3) * 10, a < 1.6 ? 1 : Math.max(0, 1 - (a - 1.6) / 1.0), s);
        continue;
      }
      const e = Gl.txt(t.str, Math.round((12 * t.scale) / Math.max(0.7, zoom)), 'bold', t.color, 3 / zoom, '', 0, 'center');
      Gl.putText(L, e, t.x, t.y - k * 24, 1 - k * k);
    }
  },
  glCombos(zoom) {
    const now = Render.time, L = Gl.L.text;
    for (const [vid, c] of this.combo) {
      const age = now - c.last;
      if (age > 1.8) { this.combo.delete(vid); continue; }
      if (c.hits < 2 && !c.dim) continue; // 单发的伤害已经有爆心大数字
      const cen = Render.nationCenters[vid];
      if (!cen) continue;
      const k = this.involves(c.att, new Set([vid])) ? 1 : 0.6, st = this.dmgStyle(c.total);
      const pop = Math.max(0, 1 - (now - c.bump) / 0.18) * 0.35; // 每次累加时跳一下
      const px = Math.max(4, Math.round((st.size + 6) * k / Math.max(0.7, zoom)));
      const str = c.dim ? `🌀 -${fmtPop(c.total)}` : `-${fmtPop(c.total)}`;
      const e = Gl.txt(str, px, 900, c.dim ? '#e8b8ff' : st.color, Math.max(2, px * 0.14), c.dim ? '#c040ff' : st.color, st.glow + 6, 'center');
      Gl.putText(L, e, cen.x, cen.y - 44 / Math.max(0.8, zoom), age < 1.2 ? 1 : 1 - (age - 1.2) / 0.6, 1 + pop);
    }
  },
  // 东风镜头的光柱和收缩的瞄准环
  glCinePillar(z) {
    const c = this.cine;
    if (!c || c.boom >= 0) return;
    const pre = Math.min(1, c.age / 0.35), T = Render.time, P = Gl.L.pillar;
    const H = 700, w = (2.5 + 5 * pre + Math.sin(T * 40) * 0.8) / Math.max(0.6, z);
    const tex = Gl.made('pillar', 1, 1, 64, (cx) => {
      const g = cx.createLinearGradient(0, 0, 0, 1);
      g.addColorStop(0, 'rgba(255,240,200,0)'); g.addColorStop(0.7, 'rgba(255,235,180,0.35)'); g.addColorStop(1, 'rgba(255,255,240,0.9)');
      cx.fillStyle = g; cx.fillRect(0, 0, 1, 1);
    });
    P.img(tex, c.x - w, c.y - H, w * 2, H, pre);
    P.img(tex, c.x - w * 4, c.y - H, w * 8, H, 0.25 * pre);
    P.img(Gl.tex(this.S.warm), c.x - 40, c.y - 28, 80, 56, 0.8 * pre);
    const rr = 10 + 50 * (1 - pre) + 4 * Math.sin(T * 12);
    Gl.lines.lineStyle(1.5 / z, 0xffdc8c, 0.9 * pre); Gl.lines.drawEllipse(c.x, c.y, rr, rr * 0.62);
  },
  glScreen(w, h) {
    const S = Gl.L.scr, A = Gl.L.scrAdd;
    if (G && G.midnight) { // 午夜狂欢：画面整体偏红，四周脉动的血色暗角
      S.rect(0, 0, w, h, 0x5a0000, 0.07);
      S.img(Gl.tex(Render.vignette('midnight')), 0, 0, w, h, 0.16 + 0.1 * (0.5 + 0.5 * Math.sin(Render.time * 1.3)));
    }
    if (this.midFlash > 0.01) S.rect(0, 0, w, h, 0xff1e14, 0.4 * this.midFlash * this.midFlash);
    const ck = this.cineDark(); // 东风镜头：电影黑边
    if (ck > 0) { const bh = h * 0.085 * ck; S.rect(0, 0, w, bh, 0x000000, 1); S.rect(0, h - bh, w, bh, 0x000000, 1); }
    if (this.tint > 0.01) A.rect(0, 0, w, h, 0xff6e28, this.tint * 0.5); // 爆炸后整个画面被火光染成橙红
    if (this.flash > 0.01) { const c = this.flashColor.split(','); S.rect(0, 0, w, h, (c[0] << 16) | (c[1] << 8) | +c[2], Math.min(1, this.flash)); }
    if (this.whiteout > 0) S.rect(0, 0, w, h, 0xffffff, Math.min(1, this.whiteout));
  },
});
