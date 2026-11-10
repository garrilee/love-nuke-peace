// ===================== 渲染·飞行物：火箭、飞机、小摩托、导弹、锁定波纹 =====================
'use strict';

Object.assign(Render, {
  progressRing(ctx, x, y, r, k, color, z) {
    ctx.strokeStyle = 'rgba(255,255,255,0.15)'; ctx.lineWidth = 2 / z;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = color;
    ctx.beginPath(); ctx.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k); ctx.stroke();
  },

  arcTo(p, u, tx, ty) {
    const mx = (p.fx + tx) / 2, my = (p.fy + ty) / 2;
    const d = Math.hypot(tx - p.fx, ty - p.fy);
    const conv = p.kind === 'conv'; // 常规导弹：弹道低平；每发弧线高度略有不同
    const h = p.arcH || (conv ? 0.16 : 0.45);
    const cx = mx, cy = my - (d * h + (conv ? 8 : 30));
    const a = (1 - u) * (1 - u), b = 2 * (1 - u) * u, c = u * u;
    return { x: a * p.fx + b * cx + c * tx, y: a * p.fy + b * cy + c * ty };
  },
  // 分弹头：分离前和母弹走同一条轨迹，分离后平滑地拐向自己的目标
  arcPoint(p, u) {
    if (p.mirvOf === undefined) return this.arcTo(p, u, p.tx, p.ty);
    const lead = this.arcTo(p, u, p.bx, p.by);
    const S = CFG.MIRV_SPLIT;
    if (u <= S) return lead;
    const own = this.arcTo(p, u, p.tx, p.ty);
    let k = clamp((u - S) / 0.3, 0, 1); k = k * k * (3 - 2 * k);
    return { x: lerp(lead.x, own.x, k), y: lerp(lead.y, own.y, k) };
  },

  // 投射物当前位置（与绘制使用同一条轨迹）
  // 渲染用的进度：逻辑每 0.1 秒才走一步，这里补上两步之间已经过去的时间，飞行才平滑
  renderU(p) {
    return clamp((p.t + (G.interp || 0) - p.delay) / p.flight, 0, 1);
  },
  projPos(p) {
    const u = this.renderU(p);
    if (p.kind === 'guard') return { x: p.fx, y: p.fy };
    return p.kind === 'ufo' ? this.planePos(p, u) : p.kind === 'drone' ? this.dronePos(p, u) : this.arcPoint(p, u);
  },
  // 被拦截弹锁定：目标周围一圈圈向外扩散的波纹 + 柔和呼吸的光点
  drawLock(ctx, p, z, T) {
    const pos = this.projPos(p);
    const age = T - (p.lockT || T);                 // 刚锁定时波纹从小到大出现
    const intro = Math.min(1, age / 0.3);
    const ph = (T * 1.6 + p.id * 0.37) % 1;
    for (let k = 0; k < 2; k++) {
      const f = (ph + k * 0.5) % 1;
      ctx.strokeStyle = `rgba(130,235,255,${(1 - f) * 0.85 * intro})`;
      ctx.lineWidth = 1.4 / Math.max(0.6, z);
      ctx.beginPath(); ctx.arc(pos.x, pos.y, 4 + f * 12 * intro, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.globalAlpha = (0.45 + 0.35 * Math.sin(T * 7 + p.id)) * intro;
    ctx.drawImage(FX.S.cyan, pos.x - 7, pos.y - 7, 14, 14);
    ctx.globalAlpha = 1;
  },

  drawProjectiles(ctx, z, T) {
    const S = FX.S;
    // 同屏飞弹很多时（大齐射）简化低级包裹的尾迹：省掉外层光晕、少洒火花；4、5 级照旧华丽
    this.lod = G.projectiles.length > 80;
    ctx.globalCompositeOperation = 'lighter';
    for (const p of G.projectiles) {
      if (!p.launched) continue;
      if (p.locked && !p.engaged) {
        if (p.lockT === undefined) p.lockT = T;
        this.drawLock(ctx, p, z, T);
      } else p.lockT = undefined;
      const u = this.renderU(p);
      const col = G.nations[p.att].color;
      if (p.kind === 'conv') {
        const u0 = Math.max(0, u - 0.2), steps = 6;
        ctx.lineWidth = 1.1 / Math.max(0.6, z);
        const tail = this.arcPoint(p, u0), headPt = this.arcPoint(p, u);
        if (Math.abs(tail.x - headPt.x) + Math.abs(tail.y - headPt.y) > 0.01) {
          const g = ctx.createLinearGradient(tail.x, tail.y, headPt.x, headPt.y);
          g.addColorStop(0, 'rgba(255,230,170,0)'); g.addColorStop(1, 'rgba(255,230,170,0.7)');
          ctx.strokeStyle = g;
          ctx.beginPath(); ctx.moveTo(tail.x, tail.y);
          for (let i = 1; i <= steps; i++) { const pt = this.arcPoint(p, u0 + (u - u0) * (i / steps)); ctx.lineTo(pt.x, pt.y); }
          ctx.stroke();
        }
        const h = this.arcPoint(p, u);
        ctx.globalAlpha = 0.9; ctx.drawImage(S.warm, h.x - 4, h.y - 4, 8, 8);
        ctx.globalAlpha = 1;
      } else if (p.kind === 'rocket') {
        // 分弹头在分离前不单独画（和母弹重合），母弹到达分离点时爆出一团光
        if (p.mirvOf !== undefined && u < CFG.MIRV_SPLIT) continue;
        if (p.mirvLead && !p.splitFx && u >= CFG.MIRV_SPLIT) { p.splitFx = true; const q = this.arcPoint(p, u); FX.mirvSplit(q.x, q.y, p.lv); }
        this.drawRocketTrail(ctx, p, u, col, z, T);
        // 目标点预示圈（最后 3 秒）
        const left = p.delay + p.flight - p.t - (G.interp || 0);
        if (p.lv >= 5 && !p.cine && left < 0.55) { p.cine = true; FX.startCine(p); }
        if (p.unstop) { // 一叉入魂：紫色光环，无法拦截
          const q = this.arcPoint(p, u), r = (6 + 2 * Math.sin(T * 10 + p.id)) / Math.max(0.7, z);
          ctx.strokeStyle = 'rgba(200,130,255,0.85)'; ctx.lineWidth = 1.2 / z;
          ctx.beginPath(); ctx.arc(q.x, q.y, r, 0, Math.PI * 2); ctx.stroke();
        }
        if (left < 3) {
          ctx.strokeStyle = `rgba(255,80,60,${0.5 + 0.4 * Math.sin(T * 14)})`; ctx.lineWidth = 1 / z;
          ctx.beginPath(); ctx.arc(p.tx, p.ty, 5 + left * 3, 0, Math.PI * 2); ctx.stroke();
        }
      } else if (p.kind === 'drone') {
        this.drawDrone(ctx, p, u, col, z);
      } else if (p.kind === 'guard') {
        this.drawGuard(ctx, p, col, z);
      } else {
        this.drawPlane(ctx, p, u, col, z);
      }
    }
    ctx.globalCompositeOperation = 'source-over';
  },

  // 无人机：贴地直飞，左右轻轻摆动
  dronePos(p, u) {
    const dx = p.tx - p.fx, dy = p.ty - p.fy, d = Math.hypot(dx, dy) || 1;
    const off = Math.sin(u * Math.PI * 7 + (p.wob || 0)) * 2.5 * Math.sin(u * Math.PI);
    return { x: p.fx + dx * u - (dy / d) * off, y: p.fy + dy * u + (dx / d) * off };
  },
  // 纸飞机（俯视）：两侧白色机翼、中间国家颜色的机身、几道折痕；尾部是平直的后缘，不是箭头的缺口。
  // 飞的时候机翼轻轻扇动，像纸在飘
  drawDrone(ctx, p, u, col, z) {
    const pos = this.dronePos(p, u);
    if (!this.visibleRect(pos.x - 14, pos.y - 14, 28, 28)) return;
    const back = this.dronePos(p, Math.max(0, u - 0.035));
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = rgba(col, 0.3); ctx.lineWidth = 0.7 / Math.max(0.6, z);
    ctx.beginPath(); ctx.moveTo(back.x, back.y); ctx.lineTo(pos.x, pos.y); ctx.stroke();
    this.drawPaperPlane(ctx, pos.x, pos.y, Math.atan2(pos.y - back.y, pos.x - back.x), col, z, p.wob);
  },
  // 升空拦截的小摩托：同样的纸飞机，外面一圈青色光环，表示在执行拦截
  drawGuard(ctx, p, col, z) {
    const k = clamp((G.interp || 0) / CFG.SIM_DT, 0, 1);
    const x = lerp(p.bx, p.fx, k), y = lerp(p.by, p.fy, k);
    if (!this.visibleRect(x - 14, y - 14, 28, 28)) return;
    const ang = Math.hypot(p.fx - p.bx, p.fy - p.by) > 0.01 ? Math.atan2(p.fy - p.by, p.fx - p.bx) : (p._ang || 0);
    p._ang = ang;
    // 自毁：慢慢缩小变淡，不会突然消失
    const land = p.fade !== undefined ? clamp(p.fade / 0.6, 0.1, 1) : 1;
    ctx.globalCompositeOperation = 'lighter';
    if (p.fade === undefined) { // 追击中：青色光环
      ctx.strokeStyle = `rgba(120,235,255,${0.55 + 0.25 * Math.sin(this.time * 8 + p.id)})`; ctx.lineWidth = 0.9 / Math.max(0.6, z);
      ctx.beginPath(); ctx.arc(x, y, 7 / Math.max(0.75, z) + 1.5, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.save(); ctx.globalAlpha = land;
    this.drawPaperPlane(ctx, x, y, ang, col, z * (1 / (0.5 + 0.5 * land)), p.wob);
    ctx.restore();
  },
  drawPaperPlane(ctx, x, y, ang, col, z, wob) {
    const k = (1 / Math.max(0.75, z) + 0.3) * 1.05;
    const flap = 1 + 0.12 * Math.sin(this.time * 5 + (wob || 0) * 3); // 机翼扇动
    ctx.save();
    ctx.translate(x, y); ctx.rotate(ang); ctx.scale(k, k);
    ctx.globalCompositeOperation = 'source-over';
    ctx.lineJoin = 'round';
    const w = 5.6 * flap, b = 1.5;
    ctx.strokeStyle = 'rgba(255,255,255,0.95)'; ctx.lineWidth = 0.45;
    // 左翼（亮）、右翼（稍暗），中间机身用国家颜色
    ctx.fillStyle = '#f2fbff';
    ctx.beginPath(); ctx.moveTo(7, 0); ctx.lineTo(-5, -w); ctx.lineTo(-5, -b); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#cfe3ee';
    ctx.beginPath(); ctx.moveTo(7, 0); ctx.lineTo(-5, b); ctx.lineTo(-5, w); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.moveTo(7, 0); ctx.lineTo(-5, -b); ctx.lineTo(-5, b); ctx.closePath(); ctx.fill(); ctx.stroke();
    // 中线折痕
    ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 0.4;
    ctx.beginPath(); ctx.moveTo(7, 0); ctx.lineTo(-5, 0); ctx.stroke();
    ctx.restore();
    ctx.globalCompositeOperation = 'lighter';
  },

  // 火箭尾迹：包裹等级越高越华丽
  //   1~2 级：国家颜色细尾迹；3 级：加外层光晕和火花；4 级：流动彩虹；5 级东风：金白双层长尾 + 脉动光环
  drawRocketTrail(ctx, p, u, col, z, T) {
    const S = FX.S, lv = p.lv || 1;
    const len = lv >= 5 ? 0.45 : 0.18 + lv * 0.05;
    const steps = lv >= 3 ? 12 : 9, u0 = Math.max(p.mirvOf !== undefined ? CFG.MIRV_SPLIT - 0.05 : 0, u - len);
    const w = (1.1 + lv * 0.22) / Math.max(0.6, z);   // 等级越高略粗，但不过分
    const rgb = this.rgbStr(col);
    const pts = [];
    for (let i = 0; i <= steps; i++) pts.push(this.arcPoint(p, u0 + (u - u0) * (i / steps)));
    const colorAt = (f, a) => {
      if (lv >= 5) return `rgba(255,${200 + Math.round(55 * f)},${120 + Math.round(135 * f)},${a.toFixed(3)})`;
      if (lv === 4) return `hsla(${Math.round(T * 160 + f * steps * 22 + p.id * 40) % 360},100%,65%,${a.toFixed(3)})`;
      return `rgba(${rgb},${a.toFixed(3)})`;
    };
    // 尾迹分成 3 段，每段一笔：颜色/透明度用沿途渐变，越靠近弹头越粗越亮
    const bands = (wMul, aMul, from = 0) => {
      for (let b = 0; b < 3; b++) {
        const i0 = Math.max(from, Math.floor(steps * b / 3)), i1 = Math.floor(steps * (b + 1) / 3);
        if (i1 <= i0) continue;
        const A = pts[i0], B = pts[i1];
        if (Math.abs(A.x - B.x) + Math.abs(A.y - B.y) < 0.01) continue;
        const f0 = i0 / steps, f1 = i1 / steps;
        const g = ctx.createLinearGradient(A.x, A.y, B.x, B.y);
        g.addColorStop(0, colorAt(f0, f0 * aMul)); g.addColorStop(1, colorAt(f1, f1 * aMul));
        ctx.strokeStyle = g; ctx.lineWidth = w * wMul * (0.35 + 0.65 * (f0 + f1) / 2);
        ctx.beginPath(); ctx.moveTo(A.x, A.y);
        for (let i = i0 + 1; i <= i1; i++) ctx.lineTo(pts[i].x, pts[i].y);
        ctx.stroke();
      }
    };
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    if (lv >= 4 || (lv === 3 && !this.lod)) bands(lv >= 5 ? 2.8 : 2.1, lv >= 5 ? 0.22 : 0.16); // 外层光晕
    bands(1, 0.95);                                                   // 主尾迹
    if (lv >= 3) {                                                    // 白色内芯
      const i0 = Math.floor(steps / 2), A = pts[i0], B = pts[steps];
      if (Math.abs(A.x - B.x) + Math.abs(A.y - B.y) > 0.01) {
        const g = ctx.createLinearGradient(A.x, A.y, B.x, B.y);
        g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(255,255,255,0.8)');
        ctx.strokeStyle = g; ctx.lineWidth = Math.max(0.6, w * 0.35);
        ctx.beginPath(); ctx.moveTo(A.x, A.y);
        for (let i = i0 + 1; i <= steps; i++) ctx.lineTo(pts[i].x, pts[i].y);
        ctx.stroke();
      }
    }
    ctx.lineCap = 'butt';
    // 弹头
    const h = pts[steps], hs = 7 + lv * 1.6;
    ctx.globalAlpha = 0.95; ctx.drawImage(S.white, h.x - hs * 0.55, h.y - hs * 0.55, hs * 1.1, hs * 1.1);
    ctx.globalAlpha = 0.65;
    ctx.drawImage(lv === 4 ? FX.hue[Math.floor(T * 8 + p.id) % 12] : lv >= 5 ? S.warm : S.orange, h.x - hs, h.y - hs, hs * 2, hs * 2);
    ctx.globalAlpha = 1;
    if (lv >= 5) { // 东风：脉动光环
      const r = (5 + 2.5 * Math.sin(T * 9 + p.id)) / Math.max(0.7, z);
      ctx.strokeStyle = `rgba(255,230,160,${0.55 + 0.3 * Math.sin(T * 9 + p.id)})`; ctx.lineWidth = 1.2 / z;
      ctx.beginPath(); ctx.arc(h.x, h.y, r, 0, Math.PI * 2); ctx.stroke();
    }
    // 火花：3 级以上沿途洒落
    if (lv >= 3 && Math.random() < 0.18 * (lv - 2) * (this.lod && lv < 4 ? 0.3 : 1)) {
      const spr = lv === 4 ? FX.hue[Math.floor(Math.random() * 12)] : lv >= 5 ? S.warm : S.orange;
      const vr = (lo, hi) => lo + Math.random() * (hi - lo); // 纯视觉随机，不影响游戏逻辑的随机序列
      FX.part({ x: h.x, y: h.y, vx: vr(-14, 14), vy: vr(-6, 18), life: vr(0.4, 0.8), size: vr(1.2, 2.4), sprite: spr, grav: 25, drag: 1.5 });
    }
  },

  rgbStr(col) {
    const m = this._rgb || (this._rgb = new Map());
    if (!m.has(col)) m.set(col, hexToRgb(col).join(','));
    return m.get(col);
  },

  // 飞机：略带弧度的航线、双道尾迹、机翼航行灯
  planePos(p, u) {
    const dx = p.tx - p.fx, dy = p.ty - p.fy, d = Math.hypot(dx, dy) || 1;
    const bend = Math.sin(u * Math.PI) * d * 0.12;
    return { x: p.fx + dx * u - (dy / d) * bend, y: p.fy + dy * u + (dx / d) * bend };
  },
  drawPlane(ctx, p, u, col, z) {
    const pos = this.planePos(p, u), ahead = this.planePos(p, Math.min(1, u + 0.01));
    const ang = Math.atan2(ahead.y - pos.y, ahead.x - pos.x);
    // 尾迹
    const u0 = Math.max(0, u - 0.22), steps = 14;
    ctx.globalCompositeOperation = 'lighter';
    // Both trails share samples and stroke styles; draw each pair in one path.
    const a2 = ang + Math.PI / 2, dx = Math.cos(a2) * 2.2, dy = Math.sin(a2) * 2.2;
    let prev = this.planePos(p, u0);
    for (let i = 1; i <= steps; i++) {
      const q = this.planePos(p, u0 + (u - u0) * (i / steps));
      ctx.strokeStyle = `rgba(220,235,255,${(i / steps) * 0.45})`;
      ctx.lineWidth = (0.6 + (1 - i / steps) * 1.6) / Math.max(0.6, z);
      ctx.beginPath();
      ctx.moveTo(prev.x - dx, prev.y - dy); ctx.lineTo(q.x - dx, q.y - dy);
      ctx.moveTo(prev.x + dx, prev.y + dy); ctx.lineTo(q.x + dx, q.y + dy);
      ctx.stroke();
      prev = q;
    }
    ctx.globalAlpha = 0.5;
    ctx.drawImage(FX.sprite('p' + col, ...hexToRgb(col)), pos.x - 12, pos.y - 12, 24, 24);
    ctx.globalAlpha = 1;
    // 机身
    ctx.save();
    ctx.translate(pos.x, pos.y); ctx.rotate(ang);
    ctx.globalCompositeOperation = 'source-over';
    ctx.shadowColor = col; ctx.shadowBlur = 8;
    ctx.fillStyle = '#e9f2ff';
    ctx.beginPath();
    ctx.moveTo(7, 0);            // 机头
    ctx.lineTo(2, -1.1);
    ctx.lineTo(0, -6.5);         // 左翼
    ctx.lineTo(-2.2, -6.5);
    ctx.lineTo(-1.5, -1.2);
    ctx.lineTo(-5, -1);
    ctx.lineTo(-6.5, -3.2);      // 左尾翼
    ctx.lineTo(-7.5, -3.2);
    ctx.lineTo(-6.8, 0);
    ctx.lineTo(-7.5, 3.2);       // 右尾翼
    ctx.lineTo(-6.5, 3.2);
    ctx.lineTo(-5, 1);
    ctx.lineTo(-1.5, 1.2);
    ctx.lineTo(-2.2, 6.5);       // 右翼
    ctx.lineTo(0, 6.5);
    ctx.lineTo(2, 1.1);
    ctx.closePath(); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = col; ctx.fillRect(-3, -0.7, 6, 1.4);
    // 航行灯：左红右绿，闪烁
    if (Math.sin(this.time * 8 + p.id) > 0) {
      ctx.fillStyle = '#ff4040'; ctx.fillRect(-1.6, -6.8, 1.4, 1.4);
      ctx.fillStyle = '#40ff70'; ctx.fillRect(-1.6, 5.4, 1.4, 1.4);
    }
    ctx.restore();
    ctx.globalCompositeOperation = 'lighter';
  },
});
