// ===================== 渲染：夜景地球风格的六边形世界 =====================
'use strict';

const EDGE_CORNERS = [[0, 1], [5, 0], [4, 5], [3, 4], [2, 3], [1, 2]]; // E NE NW W SW SE
const TERRAIN_COLOR = {
  deep: [4, 10, 22], ocean: [8, 26, 48], plain: [26, 38, 26], forest: [16, 32, 24],
  desert: [44, 38, 24], mountain: [42, 42, 50], ice: [70, 84, 98],
};

const Render = {
  canvas: null, ctx: null, dpr: 1, w: 0, h: 0,
  cam: { x: WORLD_W / 2, y: WORLD_H / 2, zoom: 1 },
  base: null, scorch: null, BS: 2,
  nationPaths: [], nationCenters: [],
  hoverTile: null, time: 0,
  cityLightsEnabled: true,
  labelCache: new Map(),
  view: { left: 0, top: 0, right: 0, bottom: 0 },

  init(canvas) {
    this.canvas = canvas; this.ctx = canvas.getContext('2d');
    this.resize();
    window.addEventListener('resize', () => this.resize());
  },
  resize() {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = window.innerWidth; this.h = window.innerHeight;
    // 小屏布局：宽度 ≤ 900 或高度 ≤ 520（手机横竖屏）
    const compact = this.w <= 900 || this.h <= 520;
    document.body.classList.toggle('compact', compact);
    document.body.classList.toggle('portrait', compact && this.h > this.w);
    this.canvas.width = this.w * this.dpr; this.canvas.height = this.h * this.dpr;
    this.canvas.style.width = this.w + 'px'; this.canvas.style.height = this.h + 'px';
    if (typeof Gl !== 'undefined') Gl.resize();
    if (typeof G !== 'undefined' && G && this.base) this.fit(); // 窗口变化时地图重新居中
  },
  fit() {
    // 可视区：避开左右两侧栏、顶栏和底栏；小屏时避开底部操作栏（竖屏）或右侧操作栏（横屏）
    const body = document.body.classList, rc = document.getElementById('rightcol');
    let L = body.contains('foldL') ? 4 : 296, Rt = body.contains('foldR') ? 4 : 296, Tp = 58, Bt = 40;
    if (body.contains('portrait')) { L = Rt = 4; Tp = 50; Bt = (rc && rc.offsetHeight || 170) + 34; }
    else if (body.contains('compact')) { L = 4; Rt = (rc && rc.offsetWidth || 200) + 10; Tp = 46; Bt = 28; }
    document.documentElement.style.setProperty('--dockH', (body.contains('portrait') && rc ? rc.offsetHeight : 0) + 'px');
    const aw = Math.max(120, this.w - L - Rt), ah = Math.max(120, this.h - Tp - Bt);
    const portrait = body.contains('portrait');
    // 竖屏：地图按高度放大一些，横向可以拖动查看，开局对准自己的国家
    this.cam.zoom = portrait ? Math.min(ah / WORLD_H, (aw / WORLD_W) * 2.4) : Math.min(aw / WORLD_W, ah / WORLD_H);
    const cx = L + aw / 2, cy = Tp + ah / 2;
    const focus = portrait && G && G.player && this.nationCenters[G.player.id]
      ? { x: clamp(this.nationCenters[G.player.id].x, aw / 2 / this.cam.zoom, WORLD_W - aw / 2 / this.cam.zoom), y: WORLD_H / 2 }
      : { x: WORLD_W / 2, y: WORLD_H / 2 };
    this.cam.x = focus.x - (cx - this.w / 2) / this.cam.zoom;
    this.cam.y = focus.y - (cy - this.h / 2) / this.cam.zoom;
  },
  screenToWorld(sx, sy) {
    return { x: (sx - this.w / 2) / this.cam.zoom + this.cam.x, y: (sy - this.h / 2) / this.cam.zoom + this.cam.y };
  },
  tileAt(sx, sy) {
    const p = this.screenToWorld(sx, sy);
    const h = pixelToHex(p.x, p.y);
    if (h.c < 0 || h.r < 0 || h.c >= CFG.MAP_COLS || h.r >= CFG.MAP_ROWS) return null;
    return G.world.T(h.c, h.r);
  },

  // ---------- 静态底图 ----------
  buildBase() {
    const W = G.world, BS = this.BS;
    const c = document.createElement('canvas');
    c.width = WORLD_W * BS; c.height = WORLD_H * BS;
    const x = c.getContext('2d');
    x.scale(BS, BS);
    x.fillStyle = '#030812'; x.fillRect(0, 0, WORLD_W, WORLD_H);
    const fbm = makeNoise(12345);
    for (const t of W.tiles) {
      const [r, g, b] = TERRAIN_COLOR[t.terrain];
      const n = (fbm(t.c * 0.4, t.r * 0.4, 2) - 0.5) * 18;
      x.fillStyle = `rgb(${clamp(r + n, 0, 255) | 0},${clamp(g + n, 0, 255) | 0},${clamp(b + n * 1.2, 0, 255) | 0})`;
      this.hexPath(x, t.x, t.y, CFG.HEX + 0.6); x.fill();
    }
    // 网格
    x.strokeStyle = 'rgba(255,255,255,0.035)'; x.lineWidth = 0.6;
    for (const t of W.tiles) { this.hexPath(x, t.x, t.y, CFG.HEX); x.stroke(); }
    // 山地高光
    for (const t of W.tiles) if (t.terrain === 'mountain') {
      x.fillStyle = 'rgba(255,255,255,0.06)';
      x.beginPath(); x.moveTo(t.x - 6, t.y + 4); x.lineTo(t.x, t.y - 6); x.lineTo(t.x + 6, t.y + 4); x.closePath(); x.fill();
    }
    // 海岸线发光
    x.save();
    x.shadowColor = 'rgba(90,190,255,0.9)'; x.shadowBlur = 6;
    x.strokeStyle = 'rgba(110,200,255,0.35)'; x.lineWidth = 1.1;
    this.strokeEdges(x, (a, b) => W.isLand(a) && !W.isLand(b));
    x.restore();
    // 国家领土画在单独的一层上（扩张时领土会变，只重画这一层）
    if (this.terr) Gl.drop(this.terr);
    this.terr = document.createElement('canvas');
    this.terr.width = c.width; this.terr.height = c.height;
    this.buildTerritory();
    this.buildLinks();
    for (const e of this.plateCache.values()) this.freeBmp(e.c);
    this.plateCache.clear();
    this.dustAt = -9;
    if (this.cityCache) for (const e of this.cityCache.values()) this.freeBmp(e.c);
    this.cityCache = new Map();
    for (const e of this.labelCache.values()) this.freeBmp(e.c);
    this.labelCache.clear();
    this.base = c;
    if (!this.scorch) {
      this.scorch = document.createElement('canvas');
      this.scorch.width = c.width; this.scorch.height = c.height;
    }
  },
  // 领土层：各国的底色和国境线，连同国土路径、中心点、发光和填色缓存。开局画一次，之后领土变了才重画
  buildTerritory() {
    const W = G.world, BS = this.BS, x = this.terr.getContext('2d');
    x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, this.terr.width, this.terr.height);
    x.setTransform(BS, 0, 0, BS, 0, 0);
    this.nationPaths = []; this.nationCenters = []; this.borderPaths = [];
    for (const n of G.nations) {
      const path = new Path2D();
      let sx = 0, sy = 0, k = 0;
      for (const t of W.tiles) if (t.owner === n.id) {
        const pts = hexCorners(t.x, t.y, CFG.HEX + 0.5);
        path.moveTo(pts[0][0], pts[0][1]);
        for (let i = 1; i < 6; i++) path.lineTo(pts[i][0], pts[i][1]);
        path.closePath(); sx += t.x; sy += t.y; k++;
      }
      this.nationPaths[n.id] = path;
      this.borderPaths[n.id] = this.edgePath((a, b) => a.owner === n.id && b.owner !== n.id);
      // 标签的位置：有地时取国土中心；地被占光了（灭亡后被瓜分）就留在原处
      if (k || !this.nationCenters[n.id]) this.nationCenters[n.id] = k ? { x: sx / k, y: sy / k } : (this.lastCenters && this.lastCenters[n.id]) || { x: 0, y: 0 };
      x.fillStyle = n.alive ? rgba(n.color, 0.09) : 'rgba(60,60,60,0.25)';
      x.fill(path);
    }
    this.lastCenters = this.nationCenters.slice();
    x.save();
    for (const n of G.nations) {
      const col = n.alive ? n.color : '#555555';
      x.shadowColor = col; x.shadowBlur = n.alive ? 5 : 0;
      x.strokeStyle = rgba(col, n.alive ? 0.8 : 0.45); x.lineWidth = 1;
      x.stroke(this.borderPaths[n.id]);
    }
    x.restore();
    for (const m of [this.glowCache, this.fillCache]) if (m) for (const e of m.values()) if (e) Gl.drop(e.c);
    this.glowCache = new Map();   // 国界变了，发光层重画
    this.fillCache = new Map();
    this.terrDirty = false; this.terrAt = this.time;
    Gl.touch(this.terr);
  },
  resetScorch() { this.scorch = null; },
  // 释放一张缓存位图（连同它在显卡上的贴图）
  freeBmp(c) { Gl.drop(c); c.close(); },
  linkImage(dots) {
    if (!dots.length) return null;
    const pad = 4, K = 2;
    const xs = dots.map((d) => d.x), ys = dots.map((d) => d.y);
    const x0 = Math.min(...xs) - pad, y0 = Math.min(...ys) - pad, x1 = Math.max(...xs) + pad, y1 = Math.max(...ys) + pad;
    const c = new OffscreenCanvas(Math.ceil((x1 - x0) * K), Math.ceil((y1 - y0) * K));
    const x = c.getContext('2d');
    x.globalCompositeOperation = 'lighter'; x.scale(K, K);
    for (const d of dots) {
      const s = 3 * d.s;
      x.globalAlpha = 0.65 + 0.35 * Math.sin(d.ph);
      x.drawImage(FX.S.warm, d.x - x0 - s / 2, d.y - y0 - s / 2, s, s);
    }
    // Immutable light textures avoid repeatedly snapshotting canvas sources.
    return { c: c.transferToImageBitmap(), x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  },
  // 一座城当前亮着的灯，画成一张小图（按亮灯数量缓存）
  cityLights(c, b, n) {
    let e = this.cityCache.get(c.id);
    if (e && e.n === n) return e;
    const r = CFG.HEX * 1.8, K = 3, size = Math.ceil(r * 2 * K);
    const cv = new OffscreenCanvas(size, size);
    const x = cv.getContext('2d');
    x.globalCompositeOperation = 'lighter';
    x.scale(K, K);
    for (const L of c.lights) {
      if (L.rank > b) continue;
      const s = 3.2 * L.s;
      x.globalAlpha = 0.6 + 0.3 * Math.abs(Math.sin(L.ph)); // 每盏灯亮度略有不同
      x.drawImage(FX.S.warm, r + L.x - s / 2, r + L.y - s / 2, s, s);
    }
    if (e) this.freeBmp(e.c);
    e = { c: cv.transferToImageBitmap(), r, n };
    this.cityCache.set(c.id, e);
    return e;
  },
  // 同一国家相邻城市之间的“公路灯带”：夜景地球上连成一片的灯光
  buildLinks() {
    const W = G.world, seen = new Set();
    const hash = (k) => { const v = Math.sin(k * 12.9898) * 43758.5453; return v - Math.floor(v); };
    if (this.links) for (const L of this.links) if (L.img) this.freeBmp(L.img.c);
    this.links = [];
    for (const n of G.nations) {
      const cs = W.cities.filter((c) => c.nation === n.id);
      for (const a of cs) {
        const near = cs.filter((b) => b !== a).sort((p, q) => hexDist(a.tile, p.tile) - hexDist(a.tile, q.tile)).slice(0, 2);
        for (const b of near) {
          const key = Math.min(a.id, b.id) + '-' + Math.max(a.id, b.id);
          if (seen.has(key)) continue;
          seen.add(key);
          const dx = b.tile.x - a.tile.x, dy = b.tile.y - a.tile.y, d = Math.hypot(dx, dy);
          if (d > HEX_W * 9) continue;
          const bend = (hash(a.id * 31 + b.id) - 0.5) * 0.3 * d, nx = -dy / d, ny = dx / d;
          const cnt = Math.floor(d / 6), dots = [];
          for (let k = 2; k < cnt - 1; k++) {
            const u = k / cnt, off = bend * Math.sin(Math.PI * u) + (hash(k * 7 + a.id) - 0.5) * 3;
            dots.push({ x: a.tile.x + dx * u + nx * off, y: a.tile.y + dy * u + ny * off, ph: hash(k + b.id * 3) * 6.28, s: 0.7 + hash(k * 3 + a.id) * 0.8 });
          }
          this.links.push({ a, b, dots, img: this.linkImage(dots) });
        }
      }
    }
  },
  hexPath(x, cx, cy, size) {
    const pts = hexCorners(cx, cy, size);
    x.beginPath(); x.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < 6; i++) x.lineTo(pts[i][0], pts[i][1]);
    x.closePath();
  },
  // 只包含国境线（不含国内六边形的边）的路径
  edgePath(test) {
    const W = G.world, path = new Path2D();
    for (const t of W.tiles) {
      const dirs = (t.r & 1) ? NB_ODD : NB_EVEN;
      const pts = hexCorners(t.x, t.y, CFG.HEX);
      dirs.forEach(([dc, dr], i) => {
        const nc = t.c + dc, nr = t.r + dr;
        const nb = (nc < 0 || nr < 0 || nc >= CFG.MAP_COLS || nr >= CFG.MAP_ROWS) ? { owner: -2 } : W.T(nc, nr);
        if (!test(t, nb)) return;
        const [a, b] = EDGE_CORNERS[i];
        path.moveTo(pts[a][0], pts[a][1]); path.lineTo(pts[b][0], pts[b][1]);
      });
    }
    return path;
  },
  strokeEdges(x, test) {
    const W = G.world;
    x.beginPath();
    for (const t of W.tiles) {
      const dirs = (t.r & 1) ? NB_ODD : NB_EVEN;
      const pts = hexCorners(t.x, t.y, CFG.HEX);
      dirs.forEach(([dc, dr], i) => {
        const nc = t.c + dc, nr = t.r + dr;
        if (nc < 0 || nr < 0 || nc >= CFG.MAP_COLS || nr >= CFG.MAP_ROWS) return;
        const nb = W.T(nc, nr);
        if (!test(t, nb)) return;
        const [a, b] = EDGE_CORNERS[i];
        x.moveTo(pts[a][0], pts[a][1]); x.lineTo(pts[b][0], pts[b][1]);
      });
    }
    x.stroke();
  },
  addScorch(wx, wy, R, lv) {
    if (!this.scorch) return;
    if (Gl.on) Gl.scorch(wx, wy, R, lv); // WebGL 画法另有一张焦痕贴图，同步盖一个印（下面照常画到 2D 画布，退回时用）
    const x = this.scorch.getContext('2d');
    x.save(); x.scale(this.BS, this.BS);
    const g = x.createRadialGradient(wx, wy, 0, wx, wy, R);
    g.addColorStop(0, 'rgba(8,5,4,0.75)');
    g.addColorStop(0.5, 'rgba(30,16,10,0.45)');
    g.addColorStop(1, 'rgba(30,16,10,0)');
    x.fillStyle = g; x.beginPath(); x.ellipse(wx, wy, R, R * 0.8, 0, 0, Math.PI * 2); x.fill();
    for (let i = 0; i < 6 + lv * 3; i++) {
      const a = Math.random() * 6.28, d = Math.random() * R * 0.7;
      x.fillStyle = 'rgba(0,0,0,0.35)';
      x.beginPath(); x.arc(wx + Math.cos(a) * d, wy + Math.sin(a) * d * 0.8, Math.random() * 3 + 1, 0, 6.28); x.fill();
    }
    x.restore();
  },

  // ---------- 每帧 ----------
  visibleRect(x, y, w, h) {
    const v = this.view;
    return x <= v.right && x + w >= v.left && y <= v.bottom && y + h >= v.top;
  },

  // 大事件镜头（东风、降维打击）：推近 0.15 秒、停 0.3 秒、0.45 秒拉回；6 秒内不重复，避免后期镜头晃个不停
  focusOn(x, y) {
    if (this.time - (this.fpT0 ?? -99) < 6) return;
    this.fpT0 = this.time; this.fpX = x; this.fpY = y;
  },
  focusW() {
    const t = this.time - (this.fpT0 ?? -99);
    if (t < 0 || t > 0.9) return 0;
    if (t < 0.15) { const k = t / 0.15; return 1 - (1 - k) * (1 - k); }
    if (t < 0.45) return 1;
    const k = (t - 0.45) / 0.45; return 1 - k * k * (3 - 2 * k);
  },
  draw(dt) {
    this.time += dt;
    const ctx = this.ctx, cam = this.cam, z = cam.zoom, T = this.time;
    const ready = G && this.base && this.w >= 2 && this.h >= 2; // 窗口被最小化或隐藏时画布尺寸为 0：不画
    const sh = FX.shake;
    const sx = sh ? (Math.random() - 0.5) * sh : 0, sy = sh ? (Math.random() - 0.5) * sh : 0;
    const fp = this.focusW(); // 大事件：镜头朝事件点推近半秒再拉回
    const camX = fp ? lerp(cam.x, this.fpX, fp * 0.55) : cam.x, camY = fp ? lerp(cam.y, this.fpY, fp * 0.55) : cam.y;
    const pz = z * (1 + FX.punch) * (1 + 0.28 * fp); // 爆炸时镜头猛地一推
    // Reuse glyphs during the brief camera punch instead of rerasterizing every frame.
    this.labelScale = this.dpr * z;
    // Include shake, camera punch and a device-pixel margin for antialiasing.
    const pad = 1 / (this.dpr * pz), v = this.view;
    v.left = camX + (-this.w / 2 - sx) / pz - pad;
    v.right = camX + (this.w / 2 - sx) / pz + pad;
    v.top = camY + (-this.h / 2 - sy) / pz - pad;
    v.bottom = camY + (this.h / 2 - sy) / pz + pad;
    if (ready && this.terrDirty && T - (this.terrAt || 0) > 1.2) this.buildTerritory(); // 领土变了：最多每 1.2 秒重画一次领土层
    // WebGL 层可用：整帧交给它画（glscene.js）；出错就关掉它，这一帧起退回下面的 Canvas 2D 画法
    if (ready && Gl.on) {
      try { this.glDraw(camX, camY, pz, sx, sy, z, T); return; }
      catch (e) { console.warn('WebGL 层出错，退回 Canvas 2D：', e); Gl.off(); }
    }
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = '#01040a'; ctx.fillRect(0, 0, this.w, this.h);
    if (!ready) return;
    ctx.save();
    ctx.translate(this.w / 2 + sx, this.h / 2 + sy);
    ctx.scale(pz, pz);
    ctx.translate(-camX, -camY);

    ctx.drawImage(this.base, 0, 0, WORLD_W, WORLD_H);
    ctx.drawImage(this.terr, 0, 0, WORLD_W, WORLD_H);
    ctx.drawImage(this.scorch, 0, 0, WORLD_W, WORLD_H);

    // 我方国土：更亮的底色 + 呼吸发光的金色国境线（发光层预先画好，每帧只调透明度）
    const me = G.player;
    if (me.alive && this.nationPaths[me.id]) {
      const pulse = 0.5 + 0.5 * Math.sin(T * 2.2);
      this.fillNation(ctx, me.id, me.color, 0.13 + 0.05 * pulse);
      this.drawGlow(ctx, me.id, 'me', 0.7 + 0.3 * pulse);
    }
    // 当前打击目标：红色呼吸国境 + 淡红底色
    const tg = G.nations[G.target];
    if (tg && tg.alive && this.borderPaths[tg.id]) {
      const pulse = 0.5 + 0.5 * Math.sin(T * 4);
      this.fillNation(ctx, tg.id, 'rgb(255,50,40)', 0.07 + 0.05 * pulse);
      this.drawGlow(ctx, tg.id, 'target', 0.7 + 0.3 * pulse);
    }
    // 选目标窗口里悬停预览 / 护盾
    for (const n of G.nations) {
      const path = this.nationPaths[n.id];
      if (!path || !n.alive) continue;
      if (G.selTarget === n.id) this.fillNation(ctx, n.id, '#ff3b3b', 0.08 + 0.05 * Math.sin(T * 5));
      if (n.hackT > 0) { // 断网：青色虚线国境乱闪
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        ctx.setLineDash([6 / z, 5 / z]); ctx.lineDashOffset = -T * 40;
        ctx.strokeStyle = `rgba(62,240,208,${0.5 + 0.4 * (Math.sin(T * 23) > 0 ? 1 : 0)})`; ctx.lineWidth = 2.5 / z;
        ctx.translate((Math.random() - 0.5) * 1.5, 0);
        ctx.stroke(this.borderPaths[n.id]);
        ctx.restore();
      }
      if (n.shieldT > 0) { // 护盾：覆盖全国的能量罩，快结束时闪烁
        const fade = n.shieldT < 2 ? (Math.sin(T * 20) > 0 ? 1 : 0.4) : 1;
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        this.fillNation(ctx, n.id, 'rgb(90,200,255)', (0.16 + 0.06 * Math.sin(T * 6)) * fade);
        ctx.restore();
        this.drawGlow(ctx, n.id, 'shield', fade);
      }
    }

    this.drawDust(ctx, T);
    if (G.boss) { this.drawFlat(ctx, z, T); this.drawChaos(ctx, z, T); }
    FX.drawGround(ctx);
    FX.drawFires(ctx);

    this.drawCities(ctx, z, T);
    this.drawFacilities(ctx, z, T);
    FX.drawCineDark(ctx);   // 东风镜头：先压暗地面，飞弹和光柱在上面
    if (G.dims && G.dims.length) this.drawDims(ctx, z, T);
    this.drawProjectiles(ctx, z, T);
    FX.drawAir(ctx);
    FX.drawCinePillar(ctx, z);
    this.drawLabels(ctx, z);
    this.drawMarkers(ctx, z, T);
    this.drawChaosBadge(ctx, z);
    this.drawCrate(ctx, z, T);
    FX.drawTexts(ctx, z);
    FX.drawCombos(ctx, z);

    if (this.hoverTile) {
      ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 1.2 / z;
      this.hexPath(ctx, this.hoverTile.x, this.hoverTile.y, CFG.HEX); ctx.stroke();
    }
    ctx.restore();

    // ---- 屏幕层 ----
    const w = this.w, h = this.h;
    ctx.drawImage(this.vignette('black'), 0, 0, w, h);
    if (G.player.alive && incomingFor(G.player).some((x) => isThreat(x.p))) {
      ctx.globalAlpha = 0.18 + 0.12 * Math.sin(T * 7);
      ctx.drawImage(this.vignette('red'), 0, 0, w, h);
      ctx.globalAlpha = 1;
    }
    FX.drawScreen(ctx, w, h);
  },

  // ---------- 灰尘（辐射）层：后期有几百个地块带辐射，光斑每 0.25 秒画到一张小图上，每帧只贴这一张图 ----------
  drawDust(ctx, T) {
    this.updateDust(T);
    if (!this.dustAny) return;
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = this.dustAlpha(T);
    ctx.drawImage(this.dust, 0, 0, WORLD_W, WORLD_H);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  },
  dustAlpha(T) { return 0.82 + 0.12 * Math.sin(T * 2); }, // 整层缓慢明暗起伏
  // 到时间就重画辐射尘小图；返回这次有没有重画
  updateDust(T) {
    if (!this.dust || this.dust.width !== Math.ceil(WORLD_W) || this.dust.height !== Math.ceil(WORLD_H)) { // 地图大小变了：换一张
      if (this.dust) Gl.drop(this.dust);
      this.dust = document.createElement('canvas');
      this.dust.width = Math.ceil(WORLD_W); this.dust.height = Math.ceil(WORLD_H);
    }
    if (!(T - this.dustAt >= 0.25 || T < this.dustAt)) return false;
    {
      this.dustAt = T;
      const x = this.dust.getContext('2d'), s = CFG.HEX * 2.4;
      x.globalCompositeOperation = 'source-over'; x.globalAlpha = 1;
      x.clearRect(0, 0, this.dust.width, this.dust.height);
      x.globalCompositeOperation = 'lighter';
      this.dustAny = false;
      for (const t of G.world.tiles) {
        if (t.rad < 0.03) continue;
        this.dustAny = true;
        x.globalAlpha = Math.min(0.55, t.rad * 0.35);
        x.drawImage(FX.S.green, t.x - s / 2, t.y - s / 2, s, s);
      }
    }
    return true;
  },

  // ---------- 国土填色缓存：整块国土预先画成一张纯色图，每帧只调透明度贴上（每帧填充上百个六边形很慢） ----------
  fillNation(ctx, id, color, alpha) {
    const m = this.fillImage(id, color);
    if (!m || alpha <= 0 || !this.visibleRect(m.x, m.y, m.w, m.h)) return;
    const a = ctx.globalAlpha;
    ctx.globalAlpha = a * alpha;
    ctx.drawImage(m.c, m.x, m.y, m.w, m.h);
    ctx.globalAlpha = a;
  },
  fillImage(id, color) {
    const key = id + ':' + color;
    let m = this.fillCache.get(key);
    if (m === undefined) {
      m = null;
      const b = this.nationBox(id, 2);
      if (b) {
        const K = 2, c = document.createElement('canvas');
        c.width = Math.ceil(b.w * K); c.height = Math.ceil(b.h * K);
        const x = c.getContext('2d');
        x.scale(K, K); x.translate(-b.x, -b.y);
        x.fillStyle = color; x.fill(this.nationPaths[id]);
        m = { c, x: b.x, y: b.y, w: b.w, h: b.h };
      }
      this.fillCache.set(key, m);
    }
    return m;
  },
  // 一个国家国土的外接矩形（世界坐标，四周留 pad）
  nationBox(id, pad) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const t of G.world.tiles) if (t.owner === id) { x0 = Math.min(x0, t.x); y0 = Math.min(y0, t.y); x1 = Math.max(x1, t.x); y1 = Math.max(y1, t.y); }
    if (x0 === Infinity) return null;
    const m = CFG.HEX + pad;
    return { x: x0 - m, y: y0 - m, w: x1 - x0 + m * 2, h: y1 - y0 + m * 2 };
  },

  // ---------- 国境发光层缓存：shadowBlur 很贵，只在国界变化时画一次 ----------
  GLOW_STYLE: {
    me: { shadow: '#ffd27a', blur: 12, color: 'rgba(255,215,120,0.9)', w: 1.6, inner: 'rgba(255,255,240,0.85)' },
    target: { shadow: '#ff3020', blur: 12, color: 'rgba(255,70,50,0.95)', w: 1.6, inner: 'rgba(255,220,210,0.8)' },
    shield: { shadow: '#66ccff', blur: 10, color: 'rgba(150,235,255,0.85)', w: 1.6, inner: null },
    hack: { shadow: '#3ef0d0', blur: 4, color: 'rgba(62,240,208,0.95)', w: 2, inner: null, dash: [6, 5] }, // 断网：青色虚线（WebGL 画法用）
  },
  glowImage(id, kind) {
    const key = kind + ':' + id;
    let g = this.glowCache.get(key);
    if (g === undefined) { g = this.buildGlow(id, kind); this.glowCache.set(key, g); }
    return g;
  },
  drawGlow(ctx, id, kind, alpha) {
    const g = this.glowImage(id, kind);
    if (!g || !this.visibleRect(g.x, g.y, g.w, g.h)) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = alpha;
    ctx.drawImage(g.c, g.x, g.y, g.w, g.h);
    ctx.restore();
  },
  buildGlow(id, kind) {
    const box = this.nationBox(id, 30);
    if (!box) return null;
    const st = this.GLOW_STYLE[kind], K = 2;   // K：缓存分辨率（每个世界像素 2 个像素）
    const x0 = box.x, y0 = box.y, x1 = box.x + box.w, y1 = box.y + box.h;
    const c = document.createElement('canvas');
    c.width = Math.ceil((x1 - x0) * K); c.height = Math.ceil((y1 - y0) * K);
    const x = c.getContext('2d');
    x.scale(K, K); x.translate(-x0, -y0);
    x.lineJoin = 'round';
    x.shadowColor = st.shadow; x.shadowBlur = st.blur * K;
    x.strokeStyle = st.color; x.lineWidth = st.w;
    if (st.dash) x.setLineDash(st.dash);
    x.stroke(this.borderPaths[id]); x.stroke(this.borderPaths[id]); // 描两遍，光晕更饱满
    if (st.inner) { x.shadowBlur = 0; x.strokeStyle = st.inner; x.lineWidth = 0.6; x.stroke(this.borderPaths[id]); }
    return { c, x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  },

  // ---------- 屏幕暗角缓存 ----------
  vignette(kind) {
    const key = kind + this.w + 'x' + this.h;
    if (this.vigCache && this.vigCache[kind] && this.vigCache[kind].key === key) return this.vigCache[kind].c;
    const w = this.w, h = this.h, c = document.createElement('canvas');
    c.width = Math.ceil(w / 2); c.height = Math.ceil(h / 2); // 暗角很柔和，半分辨率就够
    const x = c.getContext('2d'); x.scale(0.5, 0.5);
    const inner = kind === 'black' ? 0.35 : kind === 'red' ? 0.4 : 0.3, outer = kind === 'red' ? 0.7 : kind === 'black' ? 0.75 : 0.72;
    const g = x.createRadialGradient(w / 2, h / 2, Math.min(w, h) * inner, w / 2, h / 2, Math.max(w, h) * outer);
    const col = kind === 'black' ? '0,0,0' : kind === 'red' ? '255,20,20' : '200,10,10';
    g.addColorStop(0, `rgba(${col},0)`); g.addColorStop(1, `rgba(${col},${kind === 'black' ? 0.6 : 1})`);
    x.fillStyle = g; x.fillRect(0, 0, w, h);
    if (this.vigCache && this.vigCache[kind]) Gl.drop(this.vigCache[kind].c);
    (this.vigCache = this.vigCache || {})[kind] = { key, c };
    return c;
  },

  // 黑烟：废墟和人口低于一半的城市，一缕缕往上飘、慢慢散开
  drawSmoke(ctx, z, T) {
    const S = FX.S;
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
        ctx.globalAlpha = (1 - ph) * 0.55 * k;
        ctx.drawImage(S.smokeLight || S.white, px - s / 2, py - s / 2, s, s);
      }
    }
    ctx.globalAlpha = 1;
  },
  // 城市亮度：人口越少灯越少；废墟为 0
  cityLit(c) { return c.ruined || c.basePop <= 0 ? 0 : clamp(c.pop / c.basePop, 0, 1.4); },
  drawCities(ctx, z, T) {
    const S = FX.S;
    ctx.globalCompositeOperation = 'lighter';
    // 公路灯带：两端城市都亮着才亮（每条灯带预先画成一张图）
    if (this.cityLightsEnabled) for (const L of this.links || []) {
      const a = Math.min(this.cityLit(L.a), this.cityLit(L.b), 1) * 0.42;
      if (a < 0.03 || !L.img || !this.visibleRect(L.img.x, L.img.y, L.img.w, L.img.h)) continue;
      ctx.globalAlpha = a * (0.85 + 0.15 * Math.sin(T * 1.7 + L.a.id));
      ctx.drawImage(L.img.c, L.img.x, L.img.y, L.img.w, L.img.h);
    }
    for (const c of G.world.cities) {
      const b = this.cityLit(c);
      const x = c.tile.x, y = c.tile.y;
      if (this.cityLightsEnabled) {
        // 每盏灯记住开/关状态：熄灭的一瞬间闪一下白光再消失——轰炸后能清楚看到"一片片灭掉"
        let lit = 0;
        for (const L of c.lights) {
          const on = L.rank <= b;
          if (L.on === undefined) { L.on = on; L.chg = -99; }
          if (L.on !== on) { L.on = on; L.chg = T; }
          if (on) { lit++; continue; }
          const since = T - L.chg;
          if (since < 0.7) { const k = 1 - since / 0.7; ctx.globalAlpha = k * k; const s = 6 * L.s * (1 + since); ctx.drawImage(S.white, x + L.x - s / 2, y + L.y - s / 2, s, s); }
        }
        if (lit) { // 亮着的灯：整座城一张缓存图，整体轻微闪烁
          const img = this.cityLights(c, b, lit);
          if (this.visibleRect(x - img.r, y - img.r, img.r * 2, img.r * 2)) {
            ctx.globalAlpha = 0.9 + 0.1 * Math.sin(T * 2.3 + c.id);
            ctx.drawImage(img.c, x - img.r, y - img.r, img.r * 2, img.r * 2);
          }
        }
      }
      if (c.ruined) { // 废墟：中心一团摇曳的火光 + 零星余火
        const alive = G.nations[c.nation].alive;
        const fl = 0.6 + 0.4 * Math.sin(T * 9 + c.id) * Math.sin(T * 5.3 + c.id * 2);
        ctx.globalAlpha = (alive ? 0.32 : 0.14) * fl;
        ctx.drawImage(S.red, x - 18, y - 13, 36, 26);
        ctx.globalAlpha = (alive ? 0.45 : 0.2) * fl;
        ctx.drawImage(S.orange, x - 7, y - 8, 14, 14);
        for (let i = 0; i < c.lights.length; i += 4) {
          const L = c.lights[i];
          ctx.globalAlpha = 0.25 + 0.25 * Math.sin(T * 5 + L.ph * 3);
          ctx.drawImage(S.red, x + L.x - 2.5, y + L.y - 2.5, 5, 5);
        }
        continue;
      }
      if (!this.cityLightsEnabled) continue;
      const core = CFG.HEX * (1.6 + Math.sqrt(b) * 1.2) * (c.isCapital ? 1.25 : 1);
      if (!this.visibleRect(x - core / 2, y - core / 2, core, core)) continue;
      ctx.globalAlpha = 0.22 + 0.1 * b;
      ctx.drawImage(S.warm, x - core / 2, y - core / 2, core, core);
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    this.drawSmoke(ctx, z, T);
    for (const c of G.world.cities) {
      const n = G.nations[c.nation];
      const x = c.tile.x, y = c.tile.y;
      if (n.alive && c.basePop > 0) { // 人口环：受损才显示，越少越红
        const f = clamp(c.pop / c.basePop, 0, 1);
        if (f < 0.97 && this.visibleRect(x - 12, y - 12, 24, 24)) {
          const r = 9.5, lw = 1.8 / Math.max(0.8, z);
          ctx.lineWidth = lw; ctx.strokeStyle = 'rgba(0,0,0,0.55)';
          ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
          ctx.strokeStyle = c.settling ? '#7fd6ff' : f > 0.6 ? '#7dff8a' : f > 0.3 ? '#ffc23d' : '#ff4a3a'; // 建设中的新城市：青色进度环
          if (f > 0.01) { ctx.beginPath(); ctx.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * f); ctx.stroke(); }
        }
      }
      if (c.isCapital && n.alive) {
        ctx.fillStyle = n.color;
        ctx.beginPath(); ctx.moveTo(x, y - 4); ctx.lineTo(x + 3, y); ctx.lineTo(x, y + 4); ctx.lineTo(x - 3, y); ctx.closePath(); ctx.fill();
      }
      if (c.rebuild > 0) this.progressRing(ctx, x, y, 9, 1 - c.rebuild / rebuildTime(n), '#7dffb0', z);
    }
  },

  // 发光的设施图标：按「类型 + 国家颜色」预先画好，每帧只贴图
  facPlate(type, color, z) {
    return this.plate('fac:' + type + color, '' + z, [-8, -7, 16, 12], 8, (cx) => {
      cx.shadowColor = color; cx.shadowBlur = 8;
      cx.strokeStyle = color; cx.fillStyle = rgba(color, 0.25); cx.lineWidth = 1.4 / z;
      cx.beginPath();
      if (type === 'pad') { cx.moveTo(0, -6); cx.lineTo(5, 4); cx.lineTo(-5, 4); cx.closePath(); }
      else if (type === 'ufo') { cx.ellipse(0, 1, 7, 2.8, 0, 0, Math.PI * 2); cx.moveTo(3.5, 0); cx.arc(0, 0, 3.5, 0, Math.PI, true); }
      else if (type === 'sea') { cx.moveTo(-6, 2); cx.quadraticCurveTo(-3, -3, 0, 2); cx.quadraticCurveTo(3, -3, 6, 2); }
      cx.fill(); cx.stroke();
    });
  },
  drawFacilities(ctx, z, T) {
    let dead = null;
    for (const f of G.world.facilities) {
      const n = G.nations[f.nation];
      const x = f.tile.x, y = f.tile.y;
      if (!this.visibleRect(x - 14, y - 14, 28, 28)) continue;
      if (!f.alive) { (dead || (dead = [])).push(f); continue; }
      const pl = this.facPlate(f.type, n.color, z);
      ctx.drawImage(pl.c, x + pl.x, y + pl.y, pl.w, pl.h);
      if (f.type === 'pad' && f.missiles > 0) {
        ctx.fillStyle = '#fff';
        for (let i = 0; i < f.missiles; i++) ctx.fillRect(x - 4 + i * 3, y + 6, 2, 2);
      }
    }
    if (dead) { // 宕机的设施：所有红叉一笔画完
      ctx.strokeStyle = 'rgba(255,80,60,0.6)'; ctx.lineWidth = 1.5 / z;
      ctx.beginPath();
      for (const f of dead) { const x = f.tile.x, y = f.tile.y; ctx.moveTo(x - 4, y - 4); ctx.lineTo(x + 4, y + 4); ctx.moveTo(x + 4, y - 4); ctx.lineTo(x - 4, y + 4); }
      ctx.stroke();
      for (const f of dead) if (f.rebuild > 0) this.progressRing(ctx, f.tile.x, f.tile.y, 8, 1 - f.rebuild / rebuildTime(G.nations[f.nation]), '#7dffb0', z);
    }
    // 玩家潜航器（敌方不可见）
    const p = G.player;
    if (p.alive) for (const s of p.subs) {
      if (s.state !== 'out') continue;
      const x = s.tile.x, y = s.tile.y + Math.sin(T * 1.5 + s.tile.phase) * 1.5;
      ctx.save(); ctx.shadowColor = '#6cf'; ctx.shadowBlur = 10;
      ctx.fillStyle = '#9be8ff';
      ctx.beginPath(); ctx.ellipse(x, y, 6, 2.2, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillRect(x - 1, y - 4, 2, 3);
      ctx.restore();
    }
  },

};
