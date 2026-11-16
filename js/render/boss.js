// ===================== 渲染·三体人：降维打击（预警圈、二维化展开、二维化痕迹）、乱纪元 =====================
'use strict';

Object.assign(Render, {
  // 地块上的二维化痕迹：被压进二维画布的深紫黑色平面 + 发光的青紫色网格，随时间褪去
  drawFlat(ctx, z, T) {
    this.markFlats();
    const W = G.world, H = CFG.HEX;
    for (const t of W.tiles) {
      if (!t.flat) continue;
      const a = flatAlpha(t);
      if (a <= 0) { t.flat = 0; continue; }
      if (!this.visibleRect(t.x - H * 2, t.y - H * 2, H * 4, H * 4)) continue;
      const pl = this.flatStamp(t.flat >= 1);
      ctx.globalAlpha = a * (0.93 + 0.07 * Math.sin(T * 2 + t.phase)); // 轻微的明暗流动
      ctx.drawImage(pl.c, t.x + pl.x, t.y + pl.y, pl.w, pl.h);
    }
    ctx.globalAlpha = 1;
  },
  markFlats() {
    const W = G.world;
    // 联机客户端不跑模拟：按展开半径在本地标出二维化的地块
    for (const d of G.dims || []) {
      const r = dimRadius(d);
      if (r < 0) continue;
      const c0 = W.tiles[d.tile];
      const marked = d.marked || (d.marked = new Set());
      for (const t of W.tiles) {
        if (marked.has(t.idx) || t.owner === d.att) continue;
        const dist = hexDist(t, c0);
        if (dist <= r) { marked.add(t.idx); markFlat(t, dist <= BOSS_CFG.dimCore); }
      }
    }
    if (G.dims) G.dims = G.dims.filter((d) => G.t - d.t0 < BOSS_CFG.dimWarn + BOSS_CFG.dimSpread + 0.5);
  },
  // 一块二维化地块预先画成一张图（核心区、外延区各一张）；一次降维打击会压平几百块，每帧每块只贴一次图
  flatStamp(core) {
    const H = CFG.HEX, box = [-H - 1, -H - 1, H * 2 + 2, H * 2 + 2];
    return this.plate(core ? 'flat:core' : 'flat:outer', '', box, 0, (cx) => {
      // 深紫黑色的“画布”
      cx.fillStyle = core ? 'rgba(18,6,38,0.82)' : 'rgba(48,14,80,0.45)';
      this.hexPath(cx, 0, 0, H + 0.4); cx.fill();
      // 发光网格：横纹 + 斜纹
      cx.strokeStyle = core ? 'rgba(150,110,255,0.5)' : 'rgba(190,90,255,0.25)';
      cx.lineWidth = 0.7;
      cx.beginPath();
      for (let k = -2; k <= 2; k++) { cx.moveTo(-H * 0.75, k * 3.6); cx.lineTo(H * 0.75, k * 3.6); }
      if (core) for (let k = -1; k <= 1; k++) { cx.moveTo(k * 6 - 4, -H * 0.7); cx.lineTo(k * 6 + 4, H * 0.7); }
      cx.stroke();
      if (core) { // 青色描边，像被裁下来的画格
        cx.strokeStyle = 'rgba(80,230,255,0.35)'; cx.lineWidth = 0.8;
        this.hexPath(cx, 0, 0, H - 0.6); cx.stroke();
      }
    });
  },
  // 进行中的降维打击：预警时两圈红紫色虚线闪烁，展开时一道紫红色电光冲击环向外推
  drawDims(ctx, z, T) {
    const px = HEX_W; // 相邻地块中心的距离
    for (const d of G.dims || []) {
      const c = G.world.tiles[d.tile], r = dimRadius(d);
      ctx.save();
      if (r < 0) {
        const left = BOSS_CFG.dimWarn - (G.t - d.t0), blink = 0.55 + 0.45 * Math.sin(T * (8 + (10 - left) * 1.5));
        ctx.fillStyle = `rgba(90,0,60,${0.12 + 0.08 * blink})`;
        ctx.beginPath(); ctx.arc(c.x, c.y, BOSS_CFG.dimCore * px, 0, Math.PI * 2); ctx.fill();
        ctx.setLineDash([8 / z, 6 / z]); ctx.lineDashOffset = -T * 30;
        ctx.shadowColor = '#ff2a8a'; ctx.shadowBlur = 12;
        ctx.lineWidth = 2.6 / z; ctx.strokeStyle = `rgba(255,60,140,${0.9 * blink})`;
        ctx.beginPath(); ctx.arc(c.x, c.y, BOSS_CFG.dimCore * px, 0, Math.PI * 2); ctx.stroke();
        ctx.lineWidth = 1.8 / z; ctx.strokeStyle = `rgba(190,80,255,${0.7 * blink})`;
        ctx.beginPath(); ctx.arc(c.x, c.y, BOSS_CFG.dimOuter * px, 0, Math.PI * 2); ctx.stroke();
        ctx.setLineDash([]); ctx.shadowBlur = 0;
        const font = `bold ${Math.round(18 / Math.max(0.7, z))}px "Microsoft YaHei", sans-serif`;
        const label = this.labelImage('dim:' + d.t0, `🌀 降维打击 ${Math.ceil(left)}`, font, '#ffe0f0', 7, 'rgba(255,30,120,0.95)');
        ctx.drawImage(label.c, c.x + label.x, c.y - BOSS_CFG.dimCore * px - 6 + label.y, label.w, label.h);
      } else if (r < BOSS_CFG.dimOuter) {
        if (!d.focused) { d.focused = true; this.focusOn(c.x, c.y); SFX.dimSpread(); } // 二维化展开的一刻：镜头推近
        const R = Math.max(0.5, r) * px;
        ctx.globalCompositeOperation = 'lighter';
        // 冲击环后方的紫色余辉
        const g = ctx.createRadialGradient(c.x, c.y, Math.max(0, R - 40), c.x, c.y, R + 6);
        g.addColorStop(0, 'rgba(120,20,200,0)');
        g.addColorStop(0.75, 'rgba(170,40,255,0.35)');
        g.addColorStop(1, 'rgba(255,60,160,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(c.x, c.y, R + 6, 0, Math.PI * 2); ctx.fill();
        // 主环 + 电光锯齿
        ctx.shadowColor = '#ff3ab0'; ctx.shadowBlur = 18;
        ctx.lineWidth = 4 / z; ctx.strokeStyle = 'rgba(255,90,200,0.95)';
        ctx.beginPath(); ctx.arc(c.x, c.y, R, 0, Math.PI * 2); ctx.stroke();
        ctx.lineWidth = 1.4 / z; ctx.strokeStyle = 'rgba(140,240,255,0.9)';
        ctx.beginPath();
        const segs = 72;
        for (let i = 0; i <= segs; i++) {
          const ang = (i / segs) * Math.PI * 2, jit = (Math.random() - 0.5) * 7;
          const x = c.x + Math.cos(ang) * (R + jit), y = c.y + Math.sin(ang) * (R + jit);
          if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
        }
        ctx.stroke();
        FX.shake = Math.max(FX.shake || 0, 2.5); // 展开时屏幕轻微震动
      }
      ctx.restore();
    }
  },
  // 空投补给箱：从天而降的光柱、一个发光的箱子，箱子上的大图标就是奖励；外圈是剩余时间
  drawCrate(ctx, z, T) {
    const c = G.crate;
    if (!c || c.until <= G.t) return;
    const t = G.world.tiles[c.tile], d = CRATES[c.kind], k = 1 / Math.max(0.7, z);
    const left = clamp((c.until - G.t) / (c.until - c.t0), 0, 1), bob = Math.sin(T * 3) * 2 * k;
    const x = t.x, y = t.y - 6 * k + bob, R = 15 * k;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createLinearGradient(0, y - 90 * k, 0, y);
    g.addColorStop(0, rgba(d.color, 0)); g.addColorStop(1, rgba(d.color, 0.5));
    ctx.fillStyle = g; ctx.fillRect(x - 5 * k, y - 90 * k, 10 * k, 90 * k);
    // 闪烁的光晕：一团忽明忽暗的光 + 三圈向外扩散的光圈，远远就能看到
    const blink = 0.5 + 0.5 * Math.sin(T * 9), gs = (70 + 26 * blink) * k;
    ctx.globalAlpha = 0.35 + 0.45 * blink;
    ctx.drawImage(FX.S.white, x - gs / 2, y - gs / 2, gs, gs);
    ctx.globalAlpha = 1;
    for (let i = 0; i < 3; i++) {
      const ph = (T * 0.8 + i / 3) % 1;
      ctx.strokeStyle = rgba(i === 0 ? '#ffffff' : d.color, (1 - ph) * 0.9); ctx.lineWidth = (3 - ph * 2) * k;
      ctx.beginPath(); ctx.arc(x, y, (14 + ph * 46) * k, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.shadowColor = d.color; ctx.shadowBlur = 16;
    ctx.fillStyle = 'rgba(10,16,28,0.92)';
    this.roundRect(ctx, x - R, y - R, R * 2, R * 2, 5 * k); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = d.color; ctx.lineWidth = 2 * k; ctx.stroke();
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2.6 * k; // 倒计时圈
    ctx.beginPath(); ctx.arc(x, y, R + 5 * k, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * left); ctx.stroke();
    ctx.font = `${Math.round(19 * k)}px "Microsoft YaHei", sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = d.color; ctx.fillText(d.icon, x, y + 1 * k);
    ctx.restore();
    ctx.textBaseline = 'alphabetic';
    // 箱子在画面外：屏幕边缘一个闪烁的箭头指过去
    const v = this.view;
    if (t.x < v.left || t.x > v.right || t.y < v.top || t.y > v.bottom) {
      const m = 26 * k, ax = clamp(t.x, v.left + m, v.right - m), ay = clamp(t.y, v.top + m * 3, v.bottom - m), ang = Math.atan2(t.y - ay, t.x - ax);
      ctx.save();
      ctx.translate(ax, ay);
      ctx.globalAlpha = 0.6 + 0.4 * blink;
      ctx.fillStyle = 'rgba(10,16,28,0.9)'; ctx.strokeStyle = d.color; ctx.lineWidth = 2 * k;
      ctx.beginPath(); ctx.arc(0, 0, 13 * k, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.font = `${Math.round(14 * k)}px "Microsoft YaHei", sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = d.color; ctx.fillText(d.icon, 0, 1 * k);
      ctx.rotate(ang); ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.moveTo(22 * k, 0); ctx.lineTo(15 * k, -5 * k); ctx.lineTo(15 * k, 5 * k); ctx.closePath(); ctx.fill();
      ctx.restore();
      ctx.textBaseline = 'alphabetic';
    }
  },
  // 点击位置是不是点中了补给箱（世界坐标）
  hitCrate(wx, wy) {
    const c = G.crate;
    if (!c || c.until <= G.t) return false;
    const t = G.world.tiles[c.tile], r = 28 / Math.max(0.7, this.cam.zoom);
    return Math.hypot(wx - t.x, wy - (t.y - 6)) < r;
  },
  // 乱纪元标识：三体人国土上方的大字倒计时 + 剩余时间条；进入前的预警期先显示「N 秒后乱纪元」
  chaosBadge(z) {
    const b = G.boss;
    if (!b || !b.alive) return null;
    const c = this.nationCenters[b.id];
    if (!c) return null;
    const on = isChaos(b);
    if (!on && !(b.chaosNext > 0 && b.chaosNext <= BOSS_CFG.chaosWarn * tScale())) return null;
    const k = 1 / Math.max(0.7, z);
    const text = on ? `🌪 乱纪元 · 剩 ${Math.ceil(b.chaosT)} 秒` : `🌪 ${Math.ceil(b.chaosNext)} 秒后乱纪元`;
    const font = `900 ${Math.round((on ? 28 : 18) * k)}px "Microsoft YaHei", sans-serif`;
    const label = this.labelImage('chaosBadge', text, font, on ? '#fff1d6' : '#ffd9a8', on ? 8 : 5, on ? 'rgba(255,80,10,0.95)' : 'rgba(0,0,0,0.9)');
    return { label, x: c.x, y: c.y - 70 * k, on, k, frac: on ? clamp(b.chaosT / BOSS_CFG.chaosDur, 0, 1) : 0, a: on ? 0.8 + 0.2 * Math.sin(this.time * 10) : 0.9 };
  },
  drawChaosBadge(ctx, z) {
    const B = this.chaosBadge(z);
    if (!B) return;
    this.blit(ctx, B.label, B.x, B.y, B.a);
    if (!B.on) return;
    const w = 170 * B.k, h = 8 * B.k, x = B.x - w / 2, y = B.y + 10 * B.k;
    if (ctx) {
      ctx.fillStyle = 'rgba(0,0,0,0.65)'; ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
      ctx.fillStyle = '#ff7a2a'; ctx.fillRect(x, y, w * B.frac, h);
    } else {
      Gl.L.label.rect(x - 1, y - 1, w + 2, h + 2, 0x000000, 0.65);
      Gl.L.label.rect(x, y, w * B.frac, h, 0xff7a2a, 1);
    }
  },
  // 乱纪元：三体人国土忽明忽暗的橙红色闪烁
  drawChaos(ctx, z, T) {
    const b = G.boss;
    if (!b || !b.alive || !isChaos(b) || !this.nationPaths[b.id]) return;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    this.fillNation(ctx, b.id, 'rgb(255,110,40)', 0.1 + 0.08 * Math.sin(T * 9));
    ctx.restore();
    this.drawGlow(ctx, b.id, 'target', 0.5 + 0.5 * Math.abs(Math.sin(T * 6)));
  },
});
