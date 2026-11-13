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
      if (me) { // 人口条：和其他国家同一个比例
        const maxPop = Math.max(1, ...G.nations.filter((x2) => x2.alive).map(totalPop));
        ctx.save(); ctx.fillStyle = 'rgba(10,6,0,0.7)';
        this.roundRect(ctx, x - bw / 2 + 4 * k, by - bh / 2 - 9 * k, bw - 8 * k, 7 * k, 3.5 * k); ctx.fill(); ctx.restore();
        this.drawPopBar(ctx, n, x, by - bh / 2 - 7.5 * k, bw - 12 * k, 4 * k, maxPop);
      }
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

  // 国家色提亮（和白色混合），在深色底板上更醒目
  tint(hex, f) {
    const v = parseInt(hex.slice(1), 16), mix = (x) => Math.round(x + (255 - x) * f);
    return `rgb(${mix(v >> 16)},${mix((v >> 8) & 255)},${mix(v & 255)})`;
  },
  // 敌国标签：名字 + 人口/核弹数，垫一块半透明深色底板，不和地图颜色混在一起
  // 人口条：长度 = 这个国家人口 ÷ 人口最多的国家
  drawPopBar(ctx, n, cx, y, w, h, maxPop) {
    const f = clamp(totalPop(n) / Math.max(1, maxPop), 0, 1);
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    this.roundRect(ctx, cx - w / 2, y, w, h, h / 2); ctx.fill();
    if (f > 0.005) {
      ctx.fillStyle = n === G.player ? '#ffd27a' : this.tint(n.color, 0.15);
      ctx.shadowColor = n.color; ctx.shadowBlur = 4;
      this.roundRect(ctx, cx - w / 2, y, Math.max(h, w * f), h, h / 2); ctx.fill();
    }
    ctx.restore();
  },
  drawLabels(ctx, z) {
    const maxPop = Math.max(1, ...G.nations.filter((x) => x.alive).map(totalPop));
    const sk = 1 / Math.max(0.8, z), sf = `bold ${Math.round(11 * sk)}px "Microsoft YaHei", sans-serif`;
    for (const n of G.nations) {
      const c = this.nationCenters[n.id];
      if (!c) continue;
      if (n === G.player && n.alive) continue; // 我方：名字写在首都上空的金色标牌里
      const font = `bold ${Math.round(16 / Math.max(0.8, z) * this.nameScale(n.name))}px "Microsoft YaHei", sans-serif`;
      if (recentAttacker(n)) this.drawAttackerBadge(ctx, n, c, z);
      const tg = n.id === G.target && n.alive;
      let text = n.race.emoji + ' ' + n.name + (n.alive ? '' : '（已核平）');
      let color = n.alive ? this.tint(n.color, 0.35) : 'rgba(150,150,150,0.6)', blur = 3, shadow = 'rgba(0,0,0,0.95)';
      if (tg) {
        text = '🎯 ' + (G.mp && n.isPlayer ? '👤 ' : '') + n.race.emoji + ' ' + n.name;
        color = '#ffd0c4'; blur = 8; shadow = '#ff3020';
      } else if (G.mp && n.isPlayer && n.alive) {
        text = '👤 ' + n.race.emoji + ' ' + n.name;
      }
      const label = this.labelImage('nation:' + n.id, text, font, color, blur, shadow);
      const stats = n.alive ? this.labelImage('stats:' + n.id, `👥${fmtPop(totalPop(n))}  ☢${stock(n)}`, sf, tg ? '#ffd0c4' : '#eef3ff', 2, 'rgba(0,0,0,0.9)') : null;
      // 底板：盖住名字、数据和人口条
      const ny = c.y - 26, sy = c.y - 9;
      const barH = n.alive ? 4 * sk : 0, barGap = n.alive ? 3 * sk : 0;
      const top = ny + label.y + 2, bot = (stats ? sy + stats.y + stats.h - 2 : ny + label.y + label.h - 2) + barGap + barH;
      const w = Math.max(label.width, stats ? stats.width : 0, 70 * sk) + 16 * sk, h = bot - top + 4 * sk;
      ctx.save();
      ctx.fillStyle = n.alive ? 'rgba(6,10,18,0.62)' : 'rgba(6,10,18,0.4)';
      this.roundRect(ctx, c.x - w / 2, top - 2 * sk, w, h, Math.min(8 * sk, h / 2)); ctx.fill();
      ctx.strokeStyle = tg ? 'rgba(255,90,60,0.85)' : rgba(n.alive ? n.color : '#888888', 0.7);
      ctx.lineWidth = (tg ? 1.6 : 1) * sk; ctx.stroke();
      ctx.restore();
      ctx.drawImage(label.c, c.x + label.x, ny + label.y, label.w, label.h);
      if (stats) ctx.drawImage(stats.c, c.x + stats.x, sy + stats.y, stats.w, stats.h);
      if (n.alive) this.drawPopBar(ctx, n, c.x, bot - barH, w - 14 * sk, barH, maxPop);
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
