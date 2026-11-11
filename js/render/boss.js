// ===================== 渲染·三体人：降维打击（预警圈、二维化展开、二维化痕迹）、乱纪元 =====================
'use strict';

Object.assign(Render, {
  // 地块上的二维化痕迹：核心区像被压平的白色平面，外延区淡一些
  drawFlat(ctx, z, T) {
    const W = G.world;
    // 联机客户端不跑模拟：按展开半径在本地标出二维化的地块
    for (const d of G.dims || []) {
      const r = dimRadius(d);
      if (r < 0) continue;
      const c0 = W.tiles[d.tile];
      for (const t of W.tiles) {
        const dist = hexDist(t, c0);
        if (dist <= r && t.owner !== d.att) t.flat = Math.max(t.flat || 0, dist <= BOSS_CFG.dimCore ? 1 : 0.5);
      }
    }
    ctx.save();
    for (const t of W.tiles) {
      if (!t.flat) continue;
      const s = CFG.HEX * 2;
      if (!this.visibleRect(t.x - s, t.y - s, s * 2, s * 2)) continue;
      ctx.fillStyle = t.flat >= 1 ? 'rgba(222,230,246,0.42)' : 'rgba(205,215,235,0.18)';
      this.hexPath(ctx, t.x, t.y, CFG.HEX + 0.4); ctx.fill();
      if (t.flat >= 1) { // 压平后的细密横纹
        ctx.strokeStyle = 'rgba(120,135,170,0.35)'; ctx.lineWidth = 0.6;
        ctx.beginPath();
        for (let k = -2; k <= 2; k++) { ctx.moveTo(t.x - CFG.HEX * 0.7, t.y + k * 3.2); ctx.lineTo(t.x + CFG.HEX * 0.7, t.y + k * 3.2); }
        ctx.stroke();
      }
    }
    ctx.restore();
  },
  // 进行中的降维打击：预警时两圈虚线闪烁，展开时一道发光的白色波前向外推
  drawDims(ctx, z, T) {
    const px = HEX_W; // 相邻地块中心的距离
    for (const d of G.dims || []) {
      const c = G.world.tiles[d.tile], r = dimRadius(d);
      ctx.save();
      if (r < 0) {
        const left = BOSS_CFG.dimWarn - (G.t - d.t0), blink = 0.55 + 0.45 * Math.sin(T * (8 + (10 - left) * 1.5));
        ctx.setLineDash([8 / z, 6 / z]); ctx.lineDashOffset = -T * 30;
        ctx.lineWidth = 2.4 / z; ctx.strokeStyle = `rgba(255,255,255,${0.85 * blink})`;
        ctx.beginPath(); ctx.arc(c.x, c.y, BOSS_CFG.dimCore * px, 0, Math.PI * 2); ctx.stroke();
        ctx.lineWidth = 1.6 / z; ctx.strokeStyle = `rgba(180,200,255,${0.6 * blink})`;
        ctx.beginPath(); ctx.arc(c.x, c.y, BOSS_CFG.dimOuter * px, 0, Math.PI * 2); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = `rgba(230,238,255,${0.06 + 0.05 * blink})`;
        ctx.beginPath(); ctx.arc(c.x, c.y, BOSS_CFG.dimCore * px, 0, Math.PI * 2); ctx.fill();
        const font = `bold ${Math.round(18 / Math.max(0.7, z))}px "Microsoft YaHei", sans-serif`;
        const label = this.labelImage('dim:' + d.t0, `🌀 降维打击 ${Math.ceil(left)}`, font, '#ffffff', 6, 'rgba(60,90,255,0.95)');
        ctx.drawImage(label.c, c.x + label.x, c.y - BOSS_CFG.dimCore * px - 6 + label.y, label.w, label.h);
      } else if (r < BOSS_CFG.dimOuter) {
        const R = Math.max(0.5, r) * px;
        ctx.globalCompositeOperation = 'lighter';
        const g = ctx.createRadialGradient(c.x, c.y, Math.max(0, R - 26), c.x, c.y, R + 4);
        g.addColorStop(0, 'rgba(255,255,255,0)');
        g.addColorStop(0.8, 'rgba(200,220,255,0.35)');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(c.x, c.y, R + 4, 0, Math.PI * 2); ctx.fill();
        ctx.lineWidth = 3 / z; ctx.strokeStyle = 'rgba(255,255,255,0.9)';
        ctx.shadowColor = '#8fb0ff'; ctx.shadowBlur = 14;
        ctx.beginPath(); ctx.arc(c.x, c.y, R, 0, Math.PI * 2); ctx.stroke();
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
