// ===================== 特效：发光、蘑菇云、冲击波、烟花 =====================
'use strict';

const FX = {
  parts: [], rings: [], balls: [], texts: [], glows: [], columns: [], capGlows: [], rays: [], groundFlash: [], fires: [], cine: null, midFlash: 0,
  flash: 0, flashColor: '255,255,255', whiteout: 0, shake: 0, shakeHold: 0, slowmo: 0, punch: 0, tint: 0,
  sprites: {},

  sprite(key, r, g, b, kind = 'glow') {
    const id = key + kind;
    if (this.sprites[id]) return this.sprites[id];
    const s = 64, c = document.createElement('canvas'); c.width = c.height = s;
    const x = c.getContext('2d');
    const gr = x.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    if (kind === 'glow') {
      gr.addColorStop(0, `rgba(${r},${g},${b},1)`);
      gr.addColorStop(0.25, `rgba(${r},${g},${b},0.55)`);
      gr.addColorStop(0.6, `rgba(${r},${g},${b},0.12)`);
      gr.addColorStop(1, `rgba(${r},${g},${b},0)`);
    } else { // smoke：中心更实，边缘柔和
      gr.addColorStop(0, `rgba(${r},${g},${b},0.9)`);
      gr.addColorStop(0.55, `rgba(${r},${g},${b},0.6)`);
      gr.addColorStop(1, `rgba(${r},${g},${b},0)`);
    }
    x.fillStyle = gr; x.fillRect(0, 0, s, s);
    return (this.sprites[id] = c);
  },

  init() {
    this.S = {
      white: this.sprite('w', 255, 255, 255),
      warm: this.sprite('warm', 255, 214, 140),
      orange: this.sprite('or', 255, 130, 40),
      red: this.sprite('red', 255, 60, 30),
      cyan: this.sprite('cy', 120, 220, 255),
      green: this.sprite('gr', 120, 255, 110),
      smoke: this.sprite('sm', 70, 62, 58, 'smoke'),
      smokeLight: this.sprite('sl', 120, 108, 100, 'smoke'),
      dust: this.sprite('du', 170, 140, 80, 'smoke'),
    };
    this.hue = [];
    for (let h = 0; h < 12; h++) {
      const [r, g, b] = hslToRgb(h / 12, 1, 0.6);
      this.hue.push(this.sprite('h' + h, r, g, b));
    }
    Bus.on('launch', (p) => this.onLaunch(p));
    Bus.on('explode', (e) => this.onExplode(e));
    Bus.on('convExplode', (e) => this.onConvExplode(e));
    Bus.on('shieldBlock', (p) => this.onShieldBlock(p));
    Bus.on('netMiss', (p) => { const q = Render.projPos(p); this.text(q.x, q.y - 10, '拦截失败', '#ff8a7a', 0.8); });
    Bus.on('intercept', (p) => this.onIntercept(p));
    Bus.on('fizzle', (p) => this.onFizzle(p));
    Bus.on('cityHit', (e) => this.text(e.city.tile.x, e.city.tile.y - 10, '-' + fmtPop(e.loss), '#ff6b5b', 1));
    Bus.on('facDown', (f) => this.text(f.tile.x, f.tile.y - 8, '宕机', '#ffaa55', 0.9));
    Bus.on('ult', (e) => this.onUlt(e));
    Bus.on('midnight', () => { this.midFlash = 1; });
  },
  reset() { this.fires = []; this.cine = null; this.midFlash = 0; this.parts = []; this.rings = []; this.balls = []; this.texts = []; this.glows = []; this.columns = []; this.capGlows = []; this.rays = []; this.groundFlash = []; this.flash = this.whiteout = this.shake = this.shakeHold = this.slowmo = this.punch = this.tint = 0; },

  part(o) {
    this.parts.push(Object.assign({ vx: 0, vy: 0, life: 1, age: 0, size: 4, grow: 0, alpha: 1, add: true, drag: 0, grav: 0, delay: 0, fire: 0 }, o));
  },
  text(x, y, str, color, scale = 1) { this.texts.push({ x, y, str, color, age: 0, life: 1.8, scale }); },

  involvesPlayer(p) { return G.player && (p.att === G.player.id || p.tgt === G.player.id); },

  // 常规导弹爆炸：小火球、小冲击环、碎块和黑烟，没有蘑菇云
  onConvExplode({ tile, att }) {
    const x = tile.x + rnd(-3, 3), y = tile.y + rnd(-3, 3), R = HEX_W * 0.9;
    const near = att.isPlayer || tile.owner === (G.player && G.player.id);
    if (near) this.flash = Math.max(this.flash, 0.06);
    SFX.blast(near);
    Render.addScorch(x, y, R * 0.6, 0);
    if (G.world.isLand(tile)) this.addFire(x, y, 10 + Math.random() * 6, 0.6);
    this.balls.push({ x, y, R: R * 0.55, age: 0, life: 0.9 });
    this.rings.push({ x, y, R: R * 1.8, age: 0, life: 0.55, w: 1.5, fast: true });
    this.groundFlash.push({ x, y, R: R * 1.6, age: 0, life: 0.35 });
    this.glows.push({ x, y, R: R * 0.6, age: 0, life: 2.5 });
    for (let i = 0; i < 14; i++) {
      const a = rand() * Math.PI * 2, v = rnd(25, 70);
      this.part({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.6 - rnd(15, 45), life: rnd(0.5, 1.1), size: rnd(1.5, 3), sprite: this.S.orange, grav: 60, drag: 1.2 });
    }
    for (let i = 0; i < 6; i++) {
      this.part({ x: x + rnd(-4, 4), y: y + rnd(-3, 3), vx: rnd(-6, 6), vy: rnd(-22, -10), life: rnd(1.2, 1.8), size: R * 0.25, grow: R * 0.3, sprite: this.S.smoke, add: false, alpha: 0.55, drag: 0.8, delay: 0.1, fire: 1 });
    }
  },

  // 分弹头分离：空中一团闪光 + 小冲击环 + 向四周散开的火花
  mirvSplit(x, y, lv) {
    const vr = (lo, hi) => lo + Math.random() * (hi - lo);
    this.part({ x, y, life: 0.35, size: 14 + lv * 3, grow: 30, sprite: this.S.white });
    this.rings.push({ x, y, R: HEX_W * (1 + lv * 0.25), age: 0, life: 0.45, w: 1.4, fast: true });
    for (let i = 0; i < 10 + lv * 3; i++) {
      const a = Math.random() * Math.PI * 2, v = vr(25, 60);
      this.part({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.7, life: vr(0.3, 0.7), size: vr(1.2, 2.2),
        sprite: lv === 4 ? this.hue[i % 12] : lv >= 5 ? this.S.warm : this.S.cyan, drag: 2 });
    }
  },

  // 护盾挡下常规导弹：空中一圈青色涟漪 + 火花
  onShieldBlock(p) {
    const x = p.tx, y = p.ty - 22;
    this.rings.push({ x, y, R: HEX_W * 1.6, age: 0, life: 0.6, w: 2, shield: true });
    this.part({ x, y, life: 0.35, size: 14, grow: 18, sprite: this.S.cyan });
    for (let i = 0; i < 10; i++) {
      const a = rand() * Math.PI * 2, v = rnd(20, 50);
      this.part({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.6, life: rnd(0.4, 0.8), size: rnd(1.5, 2.5), sprite: this.S.cyan, drag: 2 });
    }
    if (chance(0.35)) this.text(x, y - 8, '护盾', '#8fe8ff', 0.8);
    if (this.involvesPlayer(p)) SFX.intercept();
  },

  onLaunch(p) {
    if (p.kind === 'conv') {
      this.part({ x: p.fx, y: p.fy, life: 0.3, size: 8, grow: 12, sprite: this.S.warm });
      return;
    }
    for (let i = 0; i < 6; i++) this.part({ x: p.fx + rnd(-3, 3), y: p.fy + rnd(-2, 2), vx: rnd(-8, 8), vy: rnd(-6, 2), life: rnd(1, 2), size: rnd(4, 8), grow: 6, sprite: this.S.smokeLight, add: false, alpha: 0.5, drag: 1 });
    this.part({ x: p.fx, y: p.fy, life: 0.5, size: 16, grow: 20, sprite: this.S.warm });
    if (this.involvesPlayer(p)) SFX.launch();
  },

  onExplode({ tile, lv, att }) {
    const P = PARCELS[lv], s = P.fx, x = tile.x, y = tile.y;
    const R = (P.r + 0.7) * HEX_W;
    const near = att.isPlayer || tile.owner === (G.player && G.player.id);
    // 闪光 + 震屏 + 镜头冲击 + 屏幕染色
    this.flash = Math.max(this.flash, Math.min(0.95, 0.25 + s * 0.16) * (near ? 1 : 0.6));
    this.tint = Math.max(this.tint, Math.min(0.45, 0.1 + s * 0.08) * (near ? 1 : 0.5));
    if (lv >= 3) setTimeout(() => { this.flash = Math.max(this.flash, 0.5); }, 220); // 二段闪
    // 震屏只在“短时间内多枚核包裹接连爆炸”时触发（或者 5 级东风），并且有冷却，避免晃眼
    const now = performance.now() / 1000;
    this.recentNukes = (this.recentNukes || []).filter((t) => now - t < 2.5);
    this.recentNukes.push(now);
    const cluster = this.recentNukes.length;
    if (this.lastShakeAt === undefined) this.lastShakeAt = -1e9;
    if (P.ultimate || (cluster >= CFG.SHAKE_CLUSTER && now - this.lastShakeAt > CFG.SHAKE_COOLDOWN)) {
      this.lastShakeAt = now;
      const amp = P.ultimate ? 26 : Math.min(18, 5 + cluster * 2.2);
      this.shake = Math.max(this.shake, amp);
      this.shakeHold = Math.max(this.shakeHold, 0.35);
      this.punch = Math.max(this.punch, P.ultimate ? 0.08 : 0.04);
    }
    // 光芒四射
    this.rays.push({ x, y, R: R * (2.6 + s * 0.4), age: 0, life: 0.7 + s * 0.12, n: 10 + lv * 3, rot: rand() * 6.28 });
    // 地面被瞬间照亮
    this.groundFlash.push({ x, y, R: R * (3 + s * 0.6), age: 0, life: 0.5 + s * 0.1 });
    // 飞溅的碎块
    for (let i = 0; i < 10 + lv * 6; i++) {
      const a = rand() * Math.PI * 2, v = rnd(40, 110) * (0.7 + s * 0.3);
      this.part({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.55 - rnd(30, 80), life: rnd(1, 2), size: rnd(1.5, 3), sprite: this.S.smoke, add: false, alpha: 0.9, grav: 90, drag: 0.6 });
    }
    if (P.ultimate) { this.whiteout = 1.3; this.slowmo = 2.2; }
    SFX.boom(s, near);
    Render.addScorch(x, y, R * 1.15, lv);
    this.igniteArea(tile, P.r, lv);
    if (P.ultimate && this.cine) this.cine.boom = this.cine.age;

    // 火球
    this.balls.push({ x, y, R: R * 0.75, age: 0, life: 2.2 + s * 0.5 });
    // 冲击波
    const nRing = lv >= 3 ? 2 : 1;
    for (let i = 0; i < nRing; i++) this.rings.push({ x, y, R: R * (2.2 + i * 0.9), age: -i * 0.25, life: 1.3 + s * 0.2, w: 2 + s * 1.5, rainbow: P.rainbow });
    // 贴地的快速冲击环（更薄更亮）
    this.rings.push({ x, y, R: R * (3.2 + s * 0.3), age: 0, life: 0.9 + s * 0.1, w: 1 + s * 0.6, fast: true });
    // 地面余光
    this.glows.push({ x, y, R: R * 1.1, age: 0, life: 6 + s * 2 });
    // 火星
    const nE = Math.round(14 + s * 14);
    for (let i = 0; i < nE; i++) {
      const a = rand() * Math.PI * 2, v = rnd(20, 70) * (0.6 + s * 0.4);
      this.part({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.6 - rnd(10, 40), life: rnd(0.8, 1.8), size: rnd(2, 4), sprite: this.S.orange, grav: 40, drag: 1.2 });
    }
    // 地面尘环
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2;
      this.part({ x: x + Math.cos(a) * R * 0.3, y: y + Math.sin(a) * R * 0.2, vx: Math.cos(a) * R * 0.9, vy: Math.sin(a) * R * 0.5, life: 1.6 + s * 0.25, size: R * 0.25, grow: R * 0.25, sprite: this.S.smoke, add: false, alpha: 0.45, drag: 1.4, delay: 0.15 });
    }
    this.mushroom(x, y, R, s, lv, P);
    if (P.ultimate) this.text(x, y - R * 2.8 - 20, '东风到', '#ffffff', 1.8);
  },

  // 增强版蘑菇云：火柱 → 翻滚的云帽（内部火光）→ 冷凝裙边 → 逐渐冷却成烟
  mushroom(x, y, R, s, lv, P) {
    const H = R * (2.2 + s * 0.12), capW = R * (1.25 + s * 0.06), life = CFG.SMOKE_LIFE + s * CFG.SMOKE_LIFE_PER;
    const capY = y - H;
    // 火柱光（加色）
    this.columns.push({ x, y, top: capY, w: R * 0.45, age: -0.15, life: 2.6 + s * 0.4 });
    // 云帽中心的火光
    this.capGlows.push({ x, y: capY, R: capW * 1.25, age: -0.35, life: life * 0.55, rise: H * 0.12 });
    // 茎：底粗顶细，带火
    const nStem = 12 + Math.round(s * 2);
    for (let i = 0; i < nStem; i++) {
      const f = i / (nStem - 1);
      const w = R * (0.34 - 0.14 * f);
      this.part({ x: x + rnd(-1, 1) * w * 0.3, y: y - H * 0.92 * f, vy: -H * 0.035, vx: rnd(-2, 2),
        life: life * (0.75 + 0.25 * f), size: w, grow: R * 0.05, sprite: f < 0.15 ? this.S.smoke : this.S.smokeLight,
        add: false, alpha: 0.75, delay: 0.15 + f * 0.55, fire: 1, drag: 0.5 });
    }
    // 地面翻卷的底座
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      this.part({ x: x + Math.cos(a) * R * 0.35, y: y + Math.sin(a) * R * 0.15, vx: Math.cos(a) * R * 0.35, vy: -R * 0.08,
        life: life * 0.8, size: R * 0.32, grow: R * 0.1, sprite: this.S.smoke, add: false, alpha: 0.6, delay: 0.2, fire: 1, drag: 0.9 });
    }
    // 云帽：三层翻滚的环 + 顶部穹顶
    const rings = [[0.25, 8, 0.55], [0.62, 12, 0.5], [0.98, 16, 0.42]];
    let hueI = 0;
    for (const [rr, cnt, sz] of rings) {
      for (let i = 0; i < cnt; i++) {
        const a = (i / cnt) * Math.PI * 2 + rnd(0, 0.4);
        this.part({
          orbit: true, cx: x, cy: capY, ang: a, rad: capW * rr, av: rnd(0.25, 0.4) * (rr > 0.5 ? 1 : -1), rise: H * 0.06,
          life, size: capW * sz * rnd(0.85, 1.15), grow: capW * 0.07, sprite: rr > 0.9 ? this.S.smokeLight : this.S.smoke,
          add: false, alpha: 0.88, delay: 0.45 + rr * 0.35 + rnd(0, 0.15), fire: 1, drag: 0,
          hue: P.rainbow && rr > 0.9 ? (hueI++) % 12 : -1,
        });
      }
    }
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      this.part({ orbit: true, cx: x, cy: capY - capW * 0.22, ang: a, rad: capW * 0.28, av: 0.3, rise: H * 0.07,
        life, size: capW * 0.55, grow: capW * 0.06, sprite: this.S.smokeLight, add: false, alpha: 0.9, delay: 0.55, fire: 1, drag: 0 });
    }
    // 冷凝裙边（2 级以上）
    if (lv >= 2) {
      const n = 14 + lv * 2;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        this.part({ orbit: true, cx: x, cy: y - H * 0.62, ang: a, rad: capW * 0.75, av: 0.15, rise: H * 0.02, expand: capW * 0.35,
          life: 2.2, size: capW * 0.2, grow: capW * 0.18, sprite: this.S.smokeLight, add: false, alpha: 0.4, delay: 0.9, drag: 0 });
      }
    }
  },

  // ---------- 废墟余火：爆炸范围内的陆地会燃烧一段时间，地图越打越像末日 ----------
  addFire(x, y, life, s) {
    this.fires.push({ x, y, age: 0, life, s, ph: Math.random() * 6.28 });
    if (this.fires.length > 360) this.fires.splice(0, this.fires.length - 360);
  },
  igniteArea(tile, r, lv) {
    const vr = (lo, hi) => lo + Math.random() * (hi - lo);
    for (const t of G.world.tiles) {
      const d = hexDist(t, tile);
      if (d > r || !G.world.isLand(t)) continue;
      const n = d === 0 ? 3 : 2;
      for (let i = 0; i < n; i++) this.addFire(t.x + vr(-0.4, 0.4) * HEX_W, t.y + vr(-0.35, 0.35) * HEX_W, vr(22, 40) * (lv >= 3 ? 1.3 : 1), vr(0.7, 1.3) * (1 + lv * 0.08));
    }
  },
  emitEmbers(dt) {
    const vr = (lo, hi) => lo + Math.random() * (hi - lo);
    const wind = Math.cos(G.world.windAngle) * 8;
    for (const f of this.fires) {
      const k = f.age / f.life, it = Math.min(1, f.age / 1.5) * (1 - k);
      if (Math.random() < dt * 0.45 * it) this.part({ x: f.x + vr(-2, 2), y: f.y, vx: wind + vr(-4, 4), vy: vr(-30, -16), life: vr(0.9, 1.6), size: vr(0.9, 1.7), sprite: this.S.orange, grav: -4, drag: 0.6 });
    }
    // 废墟城市：持续冒火星和黑烟（已被核平的国家火势小一些）
    for (const c of G.world.cities) {
      if (!c.ruined) continue;
      const alive = G.nations[c.nation].alive, x = c.tile.x, y = c.tile.y;
      if (Math.random() < dt * (alive ? 2.2 : 0.8)) this.part({ x: x + vr(-6, 6), y: y + vr(-3, 3), vx: wind + vr(-5, 5), vy: vr(-34, -18), life: vr(1, 1.8), size: vr(1, 2), sprite: Math.random() < 0.3 ? this.S.warm : this.S.orange, grav: -4, drag: 0.5 });
      if (Math.random() < dt * (alive ? 0.9 : 0.35)) this.part({ x: x + vr(-5, 5), y: y - 2, vx: wind * 1.5 + vr(-3, 3), vy: vr(-14, -8), life: vr(2.5, 4), size: vr(3, 5), grow: 5, sprite: this.S.smoke, add: false, alpha: 0.28, drag: 0.3 });
    }
  },
  drawFires(ctx) {
    const T = Render.time;
    ctx.globalCompositeOperation = 'lighter';
    for (const f of this.fires) {
      const k = f.age / f.life, it = Math.min(1, f.age / 1.2) * Math.pow(1 - k, 0.6);
      const fl = 0.65 + 0.35 * Math.sin(T * 11 + f.ph) * Math.sin(T * 6.7 + f.ph * 1.7);
      const s = f.s;
      ctx.globalAlpha = 0.4 * it * fl;
      ctx.drawImage(this.S.red, f.x - 7 * s, f.y - 5 * s, 14 * s, 10 * s);
      ctx.globalAlpha = 0.75 * it * fl;
      ctx.drawImage(this.S.orange, f.x - 2.6 * s, f.y - 3.4 * s, 5.2 * s, 5.2 * s);
      ctx.globalAlpha = 0.5 * it * fl * fl;
      ctx.drawImage(this.S.warm, f.x - 1.2 * s, f.y - 2.4 * s, 2.4 * s, 2.4 * s);
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  },

  // ---------- 国家大招特效 ----------
  onUlt({ n, tgt }) {
    const vr = (lo, hi) => lo + Math.random() * (hi - lo);
    const c = Render.nationCenters[n.id] || { x: WORLD_W / 2, y: WORLD_H / 2 };
    const U = n.race.ult, [r, g, b] = hexToRgb(n.color);
    const glow = this.sprite('u' + n.color, r, g, b);
    SFX.ult();
    this.text(c.x, c.y - 4, `${U.icon} ${U.name}`, n.color, 1.6);
    for (const city of n.cities) {
      if (city.pop <= 0 && !city.ruined) continue;
      const x = city.tile.x, y = city.tile.y;
      this.rings.push({ x, y, R: HEX_W * 2.2, age: 0, life: 0.8, w: 1.6, fast: true });
      for (let i = 0; i < 8; i++) this.part({ x: x + vr(-6, 6), y: y + vr(-4, 4), vx: vr(-8, 8), vy: vr(-40, -20), life: vr(0.8, 1.4), size: vr(2, 3.5), sprite: n.race.id === 'roach' ? this.S.warm : glow, grav: -6, drag: 1 });
    }
    if (n.race.id === 'mushroom') { // 扬沙：敌国上空卷起黄沙
      const land = G.world.tiles.filter((t) => t.owner >= 0 && t.owner !== n.id && G.nations[t.owner].alive);
      const wind = Math.cos(G.world.windAngle) * 25;
      for (let i = 0; i < Math.min(120, land.length * 2); i++) {
        const t = land[Math.floor(Math.random() * land.length)];
        this.part({ x: t.x + vr(-8, 8), y: t.y + vr(-6, 6), vx: wind + vr(-6, 6), vy: vr(-6, 2), life: vr(3, 5.5), size: vr(8, 16), grow: 6, sprite: this.S.dust, add: false, alpha: 0.32, drag: 0.4, delay: Math.random() * 0.8 });
      }
    }
    if (n.race.id === 'ai' && tgt) { // 断网：目标国上空的青色乱码
      const tc = Render.nationCenters[tgt.id];
      this.text(tc.x, tc.y - 4, '📡 断网', '#3ef0d0', 1.5);
      for (let i = 0; i < 40; i++) this.part({ x: tc.x + vr(-60, 60), y: tc.y + vr(-40, 40), vx: vr(-90, 90), vy: 0, life: vr(0.3, 0.9), size: vr(1.5, 3), sprite: this.S.cyan, drag: 3, delay: Math.random() * 0.6 });
    }
    if (n.race.id === 'octopus') for (const sub of n.subs) {
      const x = sub.tile.x, y = sub.tile.y;
      this.rings.push({ x, y, R: HEX_W * 1.6, age: 0, life: 0.9, w: 2, shield: true });
    }
  },

  // ---------- 东风镜头：落地前慢放、压暗、天降光柱 ----------
  startCine(p) {
    if (this.cine) return;
    this.cine = { x: p.tx, y: p.ty, pid: p.id, age: 0, boom: -1 };
    this.slowmo = Math.max(this.slowmo, 1.6);
    SFX.riser();
  },
  cineDark() {
    const c = this.cine;
    if (!c) return 0;
    const pre = Math.min(1, c.age / 0.35);
    const post = c.boom >= 0 ? Math.max(0, 1 - (c.age - c.boom) / 0.6) : 1;
    return pre * post;
  },
  drawCineDark(ctx) {
    const k = this.cineDark();
    if (k <= 0) return;
    ctx.save();
    ctx.setTransform(Render.dpr, 0, 0, Render.dpr, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = `rgba(0,0,0,${0.62 * k})`;
    ctx.fillRect(0, 0, Render.w, Render.h);
    ctx.restore();
  },
  drawCinePillar(ctx, z) {
    const c = this.cine;
    if (!c || c.boom >= 0) return;
    const pre = Math.min(1, c.age / 0.35), T = Render.time;
    const H = 700, w = (2.5 + 5 * pre + Math.sin(T * 40) * 0.8) / Math.max(0.6, z);
    const g = ctx.createLinearGradient(0, c.y - H, 0, c.y);
    g.addColorStop(0, 'rgba(255,240,200,0)');
    g.addColorStop(0.7, `rgba(255,235,180,${0.35 * pre})`);
    g.addColorStop(1, `rgba(255,255,240,${0.9 * pre})`);
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = g;
    ctx.fillRect(c.x - w, c.y - H, w * 2, H);
    ctx.globalAlpha = 0.25 * pre; ctx.fillRect(c.x - w * 4, c.y - H, w * 8, H);
    ctx.globalAlpha = 0.8 * pre;
    ctx.drawImage(this.S.warm, c.x - 40, c.y - 28, 80, 56);
    ctx.globalAlpha = 1;
    // 收缩的瞄准环
    const rr = 10 + 50 * (1 - pre) + 4 * Math.sin(T * 12);
    ctx.strokeStyle = `rgba(255,220,140,${0.9 * pre})`; ctx.lineWidth = 1.5 / z;
    ctx.beginPath(); ctx.ellipse(c.x, c.y, rr, rr * 0.62, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
  },

  onIntercept(p) {
    if (this.cine && this.cine.pid === p.id) this.cine.boom = this.cine.age;
    const pos = Render.projPos(p), x = pos.x, y = pos.y;
    for (let i = 0; i < 46; i++) {
      const a = rand() * Math.PI * 2, v = rnd(30, 90);
      this.part({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: rnd(1, 1.8), size: rnd(2.5, 4.5), sprite: this.hue[rndi(0, 11)], grav: 35, drag: 1.5 });
    }
    this.part({ x, y, life: 0.4, size: 30, grow: 30, sprite: this.S.white });
    this.text(x, y - 14, '砰！烟花', '#ffe680', 1);
    if (this.involvesPlayer(p)) SFX.intercept();
  },

  onFizzle(p) {
    for (let i = 0; i < 6; i++) this.part({ x: p.tx, y: p.ty, vx: rnd(-10, 10), vy: rnd(-16, -4), life: 1.6, size: 6, grow: 10, sprite: this.S.smokeLight, add: false, alpha: 0.5, drag: 1 });
    this.text(p.tx, p.ty - 12, '噗…拒收', '#aab', 0.9);
  },

  update(dt) {
    this.flash = Math.max(0, this.flash - dt * 1.8);
    this.whiteout = Math.max(0, this.whiteout - dt);
    // 震屏先保持一小段时间再衰减，更有“余震”感
    if (this.shakeHold > 0) this.shakeHold -= dt;
    else this.shake = Math.max(0, this.shake - dt * Math.max(6, this.shake * 1.6));
    this.punch = Math.max(0, this.punch - dt * 0.12);
    this.tint = Math.max(0, this.tint - dt * 0.35);
    this.midFlash = Math.max(0, this.midFlash - dt * 0.5);
    if (this.cine) { this.cine.age += dt; if ((this.cine.boom >= 0 && this.cine.age - this.cine.boom > 0.6) || this.cine.age > 6) this.cine = null; }
    for (const f of this.fires) f.age += dt;
    this.fires = this.fires.filter((f) => f.age < f.life);
    if (G && dt > 0) this.emitEmbers(dt);
    for (const p of this.parts) {
      if (p.delay > 0) { p.delay -= dt; continue; }
      p.age += dt;
      if (p.orbit) { // 绕云帽中心翻滚，同时缓慢上升、外扩
        const k = p.age / p.life;
        p.ang += p.av * dt;
        p.cy -= p.rise * dt * (1 - k);
        const rad = p.rad + (p.expand || p.rad * 0.25) * Math.min(1, p.age / 2);
        p.x = p.cx + Math.cos(p.ang) * rad;
        p.y = p.cy + Math.sin(p.ang) * rad * 0.32;
        p.size += p.grow * dt;
        continue;
      }
      const dr = Math.exp(-p.drag * dt);
      p.vx *= dr; p.vy = p.vy * dr + p.grav * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.size += p.grow * dt;
    }
    this.parts = this.parts.filter((p) => p.age < p.life);
    for (const arr of [this.rings, this.balls, this.texts, this.glows, this.columns, this.capGlows, this.rays, this.groundFlash]) for (const o of arr) o.age += dt;
    this.rays = this.rays.filter((o) => o.age < o.life);
    this.groundFlash = this.groundFlash.filter((o) => o.age < o.life);
    for (const g of this.capGlows) if (g.age > 0) g.y -= g.rise * dt * Math.max(0, 1 - g.age / g.life);
    this.columns = this.columns.filter((o) => o.age < o.life);
    this.capGlows = this.capGlows.filter((o) => o.age < o.life);
    this.rings = this.rings.filter((o) => o.age < o.life);
    this.balls = this.balls.filter((o) => o.age < o.life);
    this.texts = this.texts.filter((o) => o.age < o.life);
    this.glows = this.glows.filter((o) => o.age < o.life);
  },

  drawGround(ctx) {
    ctx.globalCompositeOperation = 'lighter';
    for (const g of this.glows) {
      const k = 1 - g.age / g.life;
      const fl = 0.85 + Math.sin(g.age * 9 + g.x) * 0.15;
      ctx.globalAlpha = k * 0.7 * fl;
      ctx.drawImage(this.S.red, g.x - g.R, g.y - g.R * 0.7, g.R * 2, g.R * 1.4);
    }
    // 爆心照亮大地
    for (const g of this.groundFlash) {
      const k = g.age / g.life;
      ctx.globalAlpha = Math.pow(1 - k, 2) * 0.9;
      ctx.drawImage(this.S.warm, g.x - g.R, g.y - g.R * 0.75, g.R * 2, g.R * 1.5);
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  },

  drawAir(ctx) {
    // 冲击波
    ctx.globalCompositeOperation = 'lighter';
    for (const r of this.rings) {
      if (r.age < 0) continue;
      const k = r.age / r.life, rad = r.R * (1 - Math.pow(1 - k, r.fast ? 3 : 2.2));
      ctx.lineWidth = r.w * (1 - k) + 0.5;
      if (r.rainbow) ctx.strokeStyle = `hsla(${(r.age * 400) % 360},100%,70%,${(1 - k) * 0.8})`;
      else if (r.shield) ctx.strokeStyle = `rgba(120,230,255,${(1 - k) * 0.95})`;
      else if (r.fast) ctx.strokeStyle = `rgba(255,240,210,${(1 - k) * 0.9})`;
      else ctx.strokeStyle = `rgba(200,230,255,${(1 - k) * 0.75})`;
      ctx.beginPath(); ctx.ellipse(r.x, r.y, rad, rad * 0.62, 0, 0, Math.PI * 2); ctx.stroke();
      if (!r.fast) { // 冲击波内侧的光晕带
        ctx.lineWidth = r.w * 4 * (1 - k);
        ctx.strokeStyle = `rgba(255,200,140,${(1 - k) * 0.12})`;
        ctx.beginPath(); ctx.ellipse(r.x, r.y, rad * 0.97, rad * 0.6, 0, 0, Math.PI * 2); ctx.stroke();
      }
    }
    // 光芒
    for (const r of this.rays) {
      const k = r.age / r.life, a = Math.pow(1 - k, 1.6);
      const len = r.R * (0.4 + 0.6 * Math.min(1, r.age / 0.15));
      for (let i = 0; i < r.n; i++) {
        const ang = r.rot + (i / r.n) * Math.PI * 2 + Math.sin(i * 7.3) * 0.15;
        const L = len * (0.6 + 0.4 * Math.abs(Math.sin(i * 3.7)));
        const w = 0.07;
        const g = ctx.createLinearGradient(r.x, r.y, r.x + Math.cos(ang) * L, r.y + Math.sin(ang) * L * 0.62);
        g.addColorStop(0, `rgba(255,250,230,${0.7 * a})`); g.addColorStop(1, 'rgba(255,200,120,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.moveTo(r.x, r.y);
        ctx.lineTo(r.x + Math.cos(ang - w) * L, r.y + Math.sin(ang - w) * L * 0.62);
        ctx.lineTo(r.x + Math.cos(ang + w) * L, r.y + Math.sin(ang + w) * L * 0.62);
        ctx.closePath(); ctx.fill();
      }
    }
    // 火球
    for (const b of this.balls) {
      const k = b.age / b.life, grow = Math.min(1, b.age / 0.5);
      const R = b.R * (0.3 + 0.7 * grow);
      ctx.globalAlpha = Math.pow(1 - k, 1.5);
      ctx.drawImage(this.S.orange, b.x - R * 1.8, b.y - R * 1.6, R * 3.6, R * 3.2);
      ctx.globalAlpha = Math.pow(1 - k, 3);
      ctx.drawImage(this.S.warm, b.x - R, b.y - R, R * 2, R * 2);
      ctx.globalAlpha = Math.max(0, 1 - k * 4);
      ctx.drawImage(this.S.white, b.x - R * 0.7, b.y - R * 0.7, R * 1.4, R * 1.4);
    }
    // 火柱
    for (const c of this.columns) {
      if (c.age < 0) continue;
      const k = c.age / c.life, grow = Math.min(1, c.age / 0.6);
      const top = lerp(c.y, c.top, grow);
      const g = ctx.createLinearGradient(0, c.y, 0, top);
      const a = Math.pow(1 - k, 1.4);
      g.addColorStop(0, `rgba(255,220,150,${0.75 * a})`);
      g.addColorStop(0.5, `rgba(255,140,50,${0.55 * a})`);
      g.addColorStop(1, `rgba(255,90,30,${0.15 * a})`);
      ctx.globalAlpha = 1; ctx.fillStyle = g;
      const w = c.w * (1 - k * 0.4);
      ctx.beginPath(); ctx.moveTo(c.x - w, c.y); ctx.lineTo(c.x - w * 0.45, top); ctx.lineTo(c.x + w * 0.45, top); ctx.lineTo(c.x + w, c.y); ctx.closePath(); ctx.fill();
    }
    // 云帽内部的火光（画在烟后面，透出来）
    for (const g of this.capGlows) {
      if (g.age < 0) continue;
      const k = g.age / g.life, a = Math.min(1, g.age / 0.3) * Math.pow(1 - k, 1.2);
      ctx.globalAlpha = a * 0.9;
      ctx.drawImage(this.S.orange, g.x - g.R, g.y - g.R * 0.6, g.R * 2, g.R * 1.2);
      ctx.globalAlpha = a * 0.6;
      ctx.drawImage(this.S.warm, g.x - g.R * 0.55, g.y - g.R * 0.3, g.R * 1.1, g.R * 0.6);
    }
    ctx.globalAlpha = 1;
    // 粒子
    // 同屏蘑菇云越多，烟越稀：避免大规模轰炸后整片地图被烟挡住
    const crowd = clamp(1.1 - this.capGlows.length * CFG.SMOKE_CROWD, CFG.SMOKE_MIN_ALPHA, 1);
    for (const p of this.parts) {
      if (p.delay > 0) continue;
      const k = p.age / p.life;
      const fadeIn = Math.min(1, p.age / 0.25);
      // 火光/火星照旧；烟雾从一开始就慢慢变淡，后半程淡得更快
      // 烟雾：前 35% 的寿命保持浓烈（爆炸时的震撼感不变），之后才变淡、变稀
      const late = clamp((k - 0.35) / 0.65, 0, 1);
      const a = p.add ? p.alpha * fadeIn * (1 - k * k)
        : p.alpha * fadeIn * Math.pow(1 - late, 1.4) * lerp(1, crowd, late);
      if (a <= 0.01) continue;
      const s = p.size;
      ctx.globalCompositeOperation = p.add ? 'lighter' : 'source-over';
      ctx.globalAlpha = a;
      ctx.drawImage(p.sprite, p.x - s, p.y - s, s * 2, s * 2);
      if (p.fire) { // 被火光从内部照亮，逐渐冷却成烟
        const fire = Math.max(0, 1 - k * 1.7);
        if (fire > 0) {
          ctx.globalCompositeOperation = 'lighter';
          // 下半部被火光照亮，上半部偏暗
          const under = p.orbit ? clamp(0.5 + (p.y - p.cy) / (s + 1), 0.25, 1) : 1;
          ctx.globalAlpha = fire * 0.8 * under;
          ctx.drawImage(k < 0.1 ? this.S.warm : this.S.orange, p.x - s * 0.85, p.y - s * 0.7, s * 1.7, s * 1.7);
          if (k < 0.08) { ctx.globalAlpha = (1 - k / 0.08) * 0.5; ctx.drawImage(this.S.white, p.x - s * 0.5, p.y - s * 0.5, s, s); }
        }
        if (p.hue >= 0) {
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = 0.35 * (1 - k);
          ctx.drawImage(this.hue[(p.hue + Math.floor(p.age * 6)) % 12], p.x - s, p.y - s, s * 2, s * 2);
        }
      }
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  },

  drawTexts(ctx, zoom) {
    ctx.textAlign = 'center';
    for (const t of this.texts) {
      const k = t.age / t.life;
      ctx.globalAlpha = 1 - k * k;
      ctx.font = `bold ${Math.round((12 * t.scale) / Math.max(0.7, zoom))}px "Microsoft YaHei", sans-serif`;
      ctx.lineWidth = 3 / zoom; ctx.strokeStyle = 'rgba(0,0,0,0.7)';
      ctx.strokeText(t.str, t.x, t.y - k * 24);
      ctx.fillStyle = t.color; ctx.fillText(t.str, t.x, t.y - k * 24);
    }
    ctx.globalAlpha = 1;
  },

  drawScreen(ctx, w, h) {
    // 午夜狂欢：画面整体偏红，四周脉动的血色暗角
    if (G && G.midnight) {
      const T = Render.time, pulse = 0.5 + 0.5 * Math.sin(T * 1.3);
      ctx.fillStyle = 'rgba(90,0,0,0.07)'; ctx.fillRect(0, 0, w, h);
      const rg = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.72);
      rg.addColorStop(0, 'rgba(255,0,0,0)'); rg.addColorStop(1, `rgba(200,10,10,${0.16 + 0.1 * pulse})`);
      ctx.fillStyle = rg; ctx.fillRect(0, 0, w, h);
    }
    if (this.midFlash > 0.01) { ctx.fillStyle = `rgba(255,30,20,${0.4 * this.midFlash * this.midFlash})`; ctx.fillRect(0, 0, w, h); }
    // 东风镜头：电影黑边
    const ck = this.cineDark();
    if (ck > 0) {
      const bh = h * 0.085 * ck;
      ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, bh); ctx.fillRect(0, h - bh, w, bh);
    }
    if (this.tint > 0.01) { // 爆炸后整个画面被火光染成橙红
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = `rgba(255,110,40,${this.tint * 0.5})`;
      ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'source-over';
    }
    if (this.flash > 0.01) {
      ctx.fillStyle = `rgba(${this.flashColor},${this.flash})`;
      ctx.fillRect(0, 0, w, h);
    }
    if (this.whiteout > 0) {
      ctx.fillStyle = `rgba(255,255,255,${Math.min(1, this.whiteout)})`;
      ctx.fillRect(0, 0, w, h);
    }
  },
};

function hslToRgb(h, s, l) {
  const f = (n) => {
    const k = (n + h * 12) % 12, a = s * Math.min(l, 1 - l);
    return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
  };
  return [f(0), f(8), f(4)];
}
