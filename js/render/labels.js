// ===================== 渲染·标签：国名、人口/核弹数、首都标牌、攻击者标记 =====================
'use strict';

Object.assign(Render, {
  // 首都上空的标识：自己的国家是金色的「你」+ 光柱 + 地面波纹；联机时其他真人玩家是国家颜色的「玩家」小旗
  drawMarkers(ctx, z, T) {
    const k = 1 / Math.max(0.5, z);   // 标识大小基本不随缩放变化
    for (const n of G.nations) {
      if (!n.alive) continue;
      const me = n === G.player, human = G.mp && n.isPlayer;
      if (!me && !human) continue;
      const cap = (n.cities.find((c) => c.isCapital) || n.cities[0]).tile;
      const x = cap.x, y = cap.y, col = me ? '#ffd27a' : n.color;
      const H = (me ? 64 : 46) * k;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      // 地面波纹
      const ph = (T * 0.7 + n.id * 0.37) % 1;
      for (let i = 0; i < 2; i++) {
        const f = (ph + i * 0.5) % 1, r = (7 + f * (me ? 26 : 18)) * k;
        ctx.strokeStyle = rgba(col, (1 - f) * (me ? 0.9 : 0.6));
        ctx.lineWidth = (me ? 2 : 1.4) * k;
        ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.6, 0, 0, Math.PI * 2); ctx.stroke();
      }
      // 光柱
      const g = ctx.createLinearGradient(0, y - H, 0, y);
      g.addColorStop(0, rgba(col, 0)); g.addColorStop(1, rgba(col, me ? 0.65 : 0.4));
      ctx.fillStyle = g;
      ctx.fillRect(x - (me ? 2 : 1.2) * k, y - H, (me ? 4 : 2.4) * k, H);
      ctx.restore();
      // 悬浮的标牌：上下轻轻浮动
      const bob = Math.sin(T * 2.6 + n.id) * 3 * k;
      const text = me ? `★ ${n.name}  👥${fmtPop(totalPop(n))} ☢${stock(n)}` : '👤 玩家'; // 我方：人口和核弹数直接写在标牌里
      const font = `bold ${Math.round((me ? 15 : 11) * k * (me ? this.nameScale(n.name) : 1))}px "Microsoft YaHei", sans-serif`;
      const label = this.labelImage('marker:' + n.id, text, font, '#1a0d00', 0, '', 'middle');
      ctx.save();
      const bw = label.width + 14 * k, bh = (me ? 24 : 18) * k;
      const by = y - H - bh / 2 + bob;
      ctx.shadowColor = col; ctx.shadowBlur = me ? 18 : 10;
      ctx.fillStyle = me ? 'rgba(255,200,90,0.95)' : rgba(n.color, 0.9);
      this.roundRect(ctx, x - bw / 2, by - bh / 2, bw, bh, bh / 2); ctx.fill();
      ctx.beginPath(); // 指向首都的小三角
      ctx.moveTo(x - 5 * k, by + bh / 2 - 1); ctx.lineTo(x + 5 * k, by + bh / 2 - 1); ctx.lineTo(x, by + bh / 2 + 7 * k); ctx.closePath(); ctx.fill();
      ctx.shadowBlur = 0;
      if (me) { ctx.strokeStyle = 'rgba(255,255,240,0.9)'; ctx.lineWidth = 1.2 * k; this.roundRect(ctx, x - bw / 2, by - bh / 2, bw, bh, bh / 2); ctx.stroke(); }
      ctx.drawImage(label.c, x + label.x, by + 0.5 * k + label.y, label.w, label.h);
      ctx.restore();
    }
  },
  // 长国家名在地图上用小一点的字（最小约 65%），避免标签伸出屏幕
  nameScale(name) { return clamp(12 / ((name || '').length + 2), 0.65, 1); },
  roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  },

  // 最近 2 分钟攻击过你的国家：名字下方一个红色「⚔ 最近攻击过你」标牌，刚挨打时闪烁，时间越久越淡
  drawAttackerBadge(ctx, n, c, z) {
    const ago = attackedAgo(n, G.player), k = 1 / Math.max(0.6, z);
    const fresh = ago < 8, alpha = fresh ? 0.75 + 0.25 * Math.sin(this.time * 12) : clamp(1 - (ago - 8) / (CFG.ATTACKER_MARK - 8) * 0.55, 0.45, 1);
    const text = '⚔ 最近攻击过你';
    const font = `bold ${Math.round(11 * k)}px "Microsoft YaHei", sans-serif`;
    const label = this.labelImage('attacker', text, font, '#fff', 0, '', 'middle');
    ctx.save();
    const w = label.width + 12 * k, h = 17 * k, y = c.y + 8 * k; // 在人口 / 核弹数下面
    ctx.globalAlpha = alpha;
    ctx.shadowColor = '#ff2a1a'; ctx.shadowBlur = fresh ? 16 : 8;
    ctx.fillStyle = 'rgba(150,12,8,0.9)';
    this.roundRect(ctx, c.x - w / 2, y - h / 2, w, h, h / 2); ctx.fill();
    ctx.shadowBlur = 0; ctx.strokeStyle = 'rgba(255,120,100,0.9)'; ctx.lineWidth = 1 * k; ctx.stroke();
    ctx.drawImage(label.c, c.x + label.x, y + 0.5 * k + label.y, label.w, label.h);
    ctx.restore();
    ctx.textBaseline = 'alphabetic';
  },

  // Keep one bitmap per label owner; state and scale changes replace it.
  labelImage(key, text, font, color, blur = 0, shadow = '', baseline = 'alphabetic') {
    const scale = this.labelScale;
    let e = this.labelCache.get(key);
    if (e && e.text === text && e.font === font && e.color === color && e.blur === blur && e.shadow === shadow && e.baseline === baseline && e.scale === scale) return e;
    const measure = this.labelMeasure || (this.labelMeasure = new OffscreenCanvas(1, 1).getContext('2d'));
    measure.font = font; measure.textAlign = 'center'; measure.textBaseline = baseline;
    const m = measure.measureText(text), pad = (blur * 2 + 2) / scale;
    const x = Math.floor((-m.actualBoundingBoxLeft - pad) * scale) / scale;
    const y = Math.floor((-m.actualBoundingBoxAscent - pad) * scale) / scale;
    const w = Math.ceil((m.actualBoundingBoxRight + pad - x) * scale);
    const h = Math.ceil((m.actualBoundingBoxDescent + pad - y) * scale);
    const canvas = new OffscreenCanvas(w, h), cx = canvas.getContext('2d');
    cx.scale(scale, scale); cx.translate(-x, -y);
    cx.font = font; cx.textAlign = 'center'; cx.textBaseline = baseline;
    cx.fillStyle = color;
    if (blur) { cx.shadowColor = shadow; cx.shadowBlur = blur; }
    cx.fillText(text, 0, 0);
    if (e) e.c.close();
    e = { c: canvas.transferToImageBitmap(), x, y, w: w / scale, h: h / scale, width: m.width, text, font, color, blur, shadow, baseline, scale };
    this.labelCache.set(key, e);
    return e;
  },

  drawLabels(ctx, z) {
    for (const n of G.nations) {
      const c = this.nationCenters[n.id];
      if (!c) continue;
      if (n === G.player && n.alive) continue; // 我方：名字写在首都上空的金色标牌里
      const font = `bold ${Math.round(16 / Math.max(0.8, z) * this.nameScale(n.name))}px "Microsoft YaHei", sans-serif`;
      if (recentAttacker(n)) this.drawAttackerBadge(ctx, n, c, z);
      let text = n.race.emoji + ' ' + n.name + (n.alive ? '' : '（已核平）');
      let color = rgba(n.alive ? n.color : '#888888', n.alive ? 0.35 : 0.3), blur = 0, shadow = '';
      if (n.id === G.target && n.alive) {
        text = '🎯 ' + (G.mp && n.isPlayer ? '👤 ' : '') + n.race.emoji + ' ' + n.name;
        color = '#ffb0a0'; blur = 10; shadow = '#ff3020';
      } else if (G.mp && n.isPlayer && n.alive) {
        text = '👤 ' + n.race.emoji + ' ' + n.name;
        color = rgba(n.color, 0.95); blur = 8; shadow = n.color;
      }
      const label = this.labelImage('nation:' + n.id, text, font, color, blur, shadow);
      ctx.drawImage(label.c, c.x + label.x, c.y - 26 + label.y, label.w, label.h);
    }
    // 每个国家名字下方：人口和核弹库存（我方的写在首都上空的金色标牌里）
    const sk = 1 / Math.max(0.8, z), sf = `bold ${Math.round(11 * sk)}px "Microsoft YaHei", sans-serif`;
    for (const n of G.nations) {
      const c = this.nationCenters[n.id];
      if (!c || !n.alive || n === G.player) continue;
      const me = false, tg = n.id === G.target;
      const color = me ? 'rgba(255,215,130,0.95)' : tg ? 'rgba(255,190,170,0.95)' : 'rgba(235,240,255,0.8)';
      const label = this.labelImage('stats:' + n.id, `👥${fmtPop(totalPop(n))}  ☢${stock(n)}`, sf, color, 3, 'rgba(0,0,0,0.9)');
      ctx.drawImage(label.c, c.x + label.x, (me ? c.y - 14 : c.y - 10) + label.y, label.w, label.h);
    }
    if (z > 0.95) {
      const font = `${Math.round(10 / Math.min(z, 1.6))}px "Microsoft YaHei", sans-serif`;
      for (const c of G.world.cities) {
        const color = c.ruined ? 'rgba(255,120,100,0.7)' : 'rgba(255,240,210,0.75)';
        const label = this.labelImage('city:' + c.id, c.name, font, color);
        ctx.drawImage(label.c, c.tile.x + label.x, c.tile.y + 18 + label.y, label.w, label.h);
      }
    }
  },
});
