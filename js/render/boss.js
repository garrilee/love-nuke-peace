// ===================== 渲染·三体人：降维打击（预警圈、二维化展开、二维化痕迹）、乱纪元 =====================
'use strict';

Object.assign(Render, {
  // 地块上的二维化痕迹：被压进二维画布的深紫黑色平面 + 发光的青紫色网格，随时间褪去
  drawFlat(ctx, z, T) {
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
    ctx.save();
    for (const t of W.tiles) {
      if (!t.flat) continue;
      const a = flatAlpha(t);
      if (a <= 0) { t.flat = 0; continue; }
      const s = CFG.HEX * 2;
      if (!this.visibleRect(t.x - s, t.y - s, s * 2, s * 2)) continue;
      const core = t.flat >= 1;
      // 深紫黑色的“画布”
      ctx.fillStyle = core ? `rgba(18,6,38,${0.82 * a})` : `rgba(48,14,80,${0.45 * a})`;
      this.hexPath(ctx, t.x, t.y, CFG.HEX + 0.4); ctx.fill();
      // 发光网格：横纹 + 斜纹，轻微流动
      const flow = Math.sin(T * 2 + t.phase) * 0.15 + 0.85;
      ctx.strokeStyle = core ? `rgba(150,110,255,${0.55 * a * flow})` : `rgba(190,90,255,${0.28 * a * flow})`;
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      for (let k = -2; k <= 2; k++) { ctx.moveTo(t.x - CFG.HEX * 0.75, t.y + k * 3.6); ctx.lineTo(t.x + CFG.HEX * 0.75, t.y + k * 3.6); }
      if (core) for (let k = -1; k <= 1; k++) { ctx.moveTo(t.x + k * 6 - 4, t.y - CFG.HEX * 0.7); ctx.lineTo(t.x + k * 6 + 4, t.y + CFG.HEX * 0.7); }
      ctx.stroke();
      if (core) { // 青色描边，像被裁下来的画格
        ctx.strokeStyle = `rgba(80,230,255,${0.35 * a})`; ctx.lineWidth = 0.8;
        this.hexPath(ctx, t.x, t.y, CFG.HEX - 0.6); ctx.stroke();
      }
    }
    ctx.restore();
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
  // 乱纪元：三体人国土忽明忽暗的橙红色闪烁
  drawChaos(ctx, z, T) {
    const b = G.boss;
    if (!b || !b.alive || !isChaos(b) || !this.nationPaths[b.id]) return;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = `rgba(255,110,40,${0.1 + 0.08 * Math.sin(T * 9)})`; ctx.fill(this.nationPaths[b.id]);
    ctx.restore();
    this.drawGlow(ctx, b.id, 'target', 0.5 + 0.5 * Math.abs(Math.sin(T * 6)));
  },
});
