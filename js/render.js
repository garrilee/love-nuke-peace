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
    if (typeof G !== 'undefined' && G && this.base) this.fit(); // 窗口变化时地图重新居中
  },
  fit() {
    // 可视区：避开左右两侧栏、顶栏和底栏；小屏时避开底部操作栏（竖屏）或右侧操作栏（横屏）
    const body = document.body.classList, rc = document.getElementById('rightcol');
    let L = 296, Rt = 296, Tp = 58, Bt = 40;
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
    // 国家领土
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
      this.nationCenters[n.id] = { x: sx / Math.max(1, k), y: sy / Math.max(1, k) };
      x.fillStyle = n.alive ? rgba(n.color, 0.09) : 'rgba(60,60,60,0.25)';
      x.fill(path);
    }
    x.save();
    for (const n of G.nations) {
      const col = n.alive ? n.color : '#555555';
      x.shadowColor = col; x.shadowBlur = n.alive ? 8 : 0;
      x.strokeStyle = rgba(col, n.alive ? 0.85 : 0.5); x.lineWidth = 1.5;
      this.strokeEdges(x, (a, b) => a.owner === n.id && b.owner !== n.id);
    }
    x.restore();
    this.buildLinks();
    this.glowCache = new Map();   // 国界变了，发光层重画
    if (this.cityCache) for (const e of this.cityCache.values()) e.c.close();
    this.cityCache = new Map();
    for (const e of this.labelCache.values()) e.c.close();
    this.labelCache.clear();
    this.base = c;
    if (!this.scorch) {
      this.scorch = document.createElement('canvas');
      this.scorch.width = c.width; this.scorch.height = c.height;
    }
  },
  resetScorch() { this.scorch = null; },
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
    if (e) e.c.close();
    e = { c: cv.transferToImageBitmap(), r, n };
    this.cityCache.set(c.id, e);
    return e;
  },
  // 同一国家相邻城市之间的“公路灯带”：夜景地球上连成一片的灯光
  buildLinks() {
    const W = G.world, seen = new Set();
    const hash = (k) => { const v = Math.sin(k * 12.9898) * 43758.5453; return v - Math.floor(v); };
    if (this.links) for (const L of this.links) if (L.img) L.img.c.close();
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

  draw(dt) {
    this.time += dt;
    const ctx = this.ctx, cam = this.cam, z = cam.zoom, T = this.time;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = '#01040a'; ctx.fillRect(0, 0, this.w, this.h);
    if (!G || !this.base) return;
    const sh = FX.shake;
    const sx = sh ? (Math.random() - 0.5) * sh : 0, sy = sh ? (Math.random() - 0.5) * sh : 0;
    ctx.save();
    ctx.translate(this.w / 2 + sx, this.h / 2 + sy);
    const pz = z * (1 + FX.punch); // 爆炸时镜头猛地一推
    // Reuse glyphs during the brief camera punch instead of rerasterizing every frame.
    this.labelScale = this.dpr * z;
    ctx.scale(pz, pz);
    ctx.translate(-cam.x, -cam.y);
    // Include shake, camera punch and a device-pixel margin for antialiasing.
    const pad = 1 / (this.dpr * pz), v = this.view;
    v.left = cam.x + (-this.w / 2 - sx) / pz - pad;
    v.right = cam.x + (this.w / 2 - sx) / pz + pad;
    v.top = cam.y + (-this.h / 2 - sy) / pz - pad;
    v.bottom = cam.y + (this.h / 2 - sy) / pz + pad;

    ctx.drawImage(this.base, 0, 0, WORLD_W, WORLD_H);
    ctx.drawImage(this.scorch, 0, 0, WORLD_W, WORLD_H);
    const S = FX.S;

    // 我方国土：更亮的底色 + 呼吸发光的金色国境线（发光层预先画好，每帧只调透明度）
    const me = G.player;
    if (me.alive && this.nationPaths[me.id]) {
      const pulse = 0.5 + 0.5 * Math.sin(T * 2.2);
      ctx.fillStyle = rgba(me.color, 0.13 + 0.05 * pulse); ctx.fill(this.nationPaths[me.id]);
      this.drawGlow(ctx, me.id, 'me', 0.7 + 0.3 * pulse);
    }
    // 当前打击目标：红色呼吸国境 + 淡红底色
    const tg = G.nations[G.target];
    if (tg && tg.alive && this.borderPaths[tg.id]) {
      const pulse = 0.5 + 0.5 * Math.sin(T * 4);
      ctx.fillStyle = `rgba(255,50,40,${0.07 + 0.05 * pulse})`; ctx.fill(this.nationPaths[tg.id]);
      this.drawGlow(ctx, tg.id, 'target', 0.7 + 0.3 * pulse);
    }
    // 选目标窗口里悬停预览 / 护盾
    for (const n of G.nations) {
      const path = this.nationPaths[n.id];
      if (!path || !n.alive) continue;
      if (G.selTarget === n.id) {
        ctx.fillStyle = rgba('#ff3b3b', 0.08 + 0.05 * Math.sin(T * 5));
        ctx.fill(path);
      }
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
        ctx.fillStyle = `rgba(90,200,255,${(0.16 + 0.06 * Math.sin(T * 6)) * fade})`; ctx.fill(path);
        ctx.restore();
        this.drawGlow(ctx, n.id, 'shield', fade);
      }
    }

    // 灰尘（辐射）
    ctx.globalCompositeOperation = 'lighter';
    for (const t of G.world.tiles) {
      if (t.rad < 0.03) continue;
      const s = CFG.HEX * 2.4;
      if (!this.visibleRect(t.x - s / 2, t.y - s / 2, s, s)) continue;
      const a = Math.min(0.55, t.rad * 0.35) * (0.8 + 0.2 * Math.sin(T * 2 + t.phase));
      ctx.globalAlpha = a;
      ctx.drawImage(S.green, t.x - s / 2, t.y - s / 2, s, s);
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    FX.drawGround(ctx);
    FX.drawFires(ctx);

    this.drawCities(ctx, z, T);
    this.drawFacilities(ctx, z, T);
    FX.drawCineDark(ctx);   // 东风镜头：先压暗地面，飞弹和光柱在上面
    this.drawProjectiles(ctx, z, T);
    FX.drawAir(ctx);
    FX.drawCinePillar(ctx, z);
    this.drawLabels(ctx, z);
    this.drawMarkers(ctx, z, T);
    FX.drawTexts(ctx, z);

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

  // ---------- 国境发光层缓存：shadowBlur 很贵，只在国界变化时画一次 ----------
  GLOW_STYLE: {
    me: { shadow: '#ffd27a', blur: 20, color: 'rgba(255,215,120,0.95)', w: 3.2, inner: 'rgba(255,255,240,0.9)' },
    target: { shadow: '#ff3020', blur: 18, color: 'rgba(255,70,50,1)', w: 3.2, inner: 'rgba(255,220,210,0.85)' },
    shield: { shadow: '#66ccff', blur: 14, color: 'rgba(150,235,255,0.9)', w: 3.5, inner: null },
  },
  drawGlow(ctx, id, kind, alpha) {
    const key = kind + ':' + id;
    let g = this.glowCache.get(key);
    if (!g) { g = this.buildGlow(id, kind); this.glowCache.set(key, g); }
    if (!g || !this.visibleRect(g.x, g.y, g.w, g.h)) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = alpha;
    ctx.drawImage(g.c, g.x, g.y, g.w, g.h);
    ctx.restore();
  },
  buildGlow(id, kind) {
    const tiles = G.world.tiles.filter((t) => t.owner === id);
    if (!tiles.length) return null;
    const st = this.GLOW_STYLE[kind], pad = 30, K = 2;   // K：缓存分辨率（每个世界像素 2 个像素）
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const t of tiles) { x0 = Math.min(x0, t.x); y0 = Math.min(y0, t.y); x1 = Math.max(x1, t.x); y1 = Math.max(y1, t.y); }
    x0 -= CFG.HEX + pad; y0 -= CFG.HEX + pad; x1 += CFG.HEX + pad; y1 += CFG.HEX + pad;
    const c = document.createElement('canvas');
    c.width = Math.ceil((x1 - x0) * K); c.height = Math.ceil((y1 - y0) * K);
    const x = c.getContext('2d');
    x.scale(K, K); x.translate(-x0, -y0);
    x.lineJoin = 'round';
    x.shadowColor = st.shadow; x.shadowBlur = st.blur * K;
    x.strokeStyle = st.color; x.lineWidth = st.w;
    x.stroke(this.borderPaths[id]); x.stroke(this.borderPaths[id]); // 描两遍，光晕更饱满
    if (st.inner) { x.shadowBlur = 0; x.strokeStyle = st.inner; x.lineWidth = 1; x.stroke(this.borderPaths[id]); }
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
    (this.vigCache = this.vigCache || {})[kind] = { key, c };
    return c;
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
    for (const c of G.world.cities) {
      const n = G.nations[c.nation];
      const x = c.tile.x, y = c.tile.y;
      if (c.isCapital && n.alive) {
        ctx.fillStyle = n.color;
        ctx.beginPath(); ctx.moveTo(x, y - 4); ctx.lineTo(x + 3, y); ctx.lineTo(x, y + 4); ctx.lineTo(x - 3, y); ctx.closePath(); ctx.fill();
      }
      if (c.rebuild > 0) this.progressRing(ctx, x, y, 9, 1 - c.rebuild / 20, '#7dffb0', z);
    }
  },

  drawFacilities(ctx, z, T) {
    for (const f of G.world.facilities) {
      const n = G.nations[f.nation];
      const x = f.tile.x, y = f.tile.y;
      if (!f.alive) {
        ctx.strokeStyle = 'rgba(255,80,60,0.6)'; ctx.lineWidth = 1.5 / z;
        ctx.beginPath(); ctx.moveTo(x - 4, y - 4); ctx.lineTo(x + 4, y + 4); ctx.moveTo(x + 4, y - 4); ctx.lineTo(x - 4, y + 4); ctx.stroke();
        if (f.rebuild > 0) this.progressRing(ctx, x, y, 8, 1 - f.rebuild / 20, '#7dffb0', z);
        continue;
      }
      ctx.save();
      ctx.shadowColor = n.color; ctx.shadowBlur = 8;
      ctx.strokeStyle = n.color; ctx.fillStyle = rgba(n.color, 0.25); ctx.lineWidth = 1.4 / z;
      ctx.beginPath();
      if (f.type === 'pad') { ctx.moveTo(x, y - 6); ctx.lineTo(x + 5, y + 4); ctx.lineTo(x - 5, y + 4); ctx.closePath(); }
      else if (f.type === 'ufo') { ctx.ellipse(x, y + 1, 7, 2.8, 0, 0, Math.PI * 2); ctx.moveTo(x + 3.5, y); ctx.arc(x, y, 3.5, 0, Math.PI, true); }
      else if (f.type === 'sea') { ctx.moveTo(x - 6, y + 2); ctx.quadraticCurveTo(x - 3, y - 3, x, y + 2); ctx.quadraticCurveTo(x + 3, y - 3, x + 6, y + 2); }
      ctx.fill(); ctx.stroke();
      ctx.restore();
      if (f.type === 'pad' && f.missiles > 0) {
        ctx.fillStyle = '#fff';
        for (let i = 0; i < f.missiles; i++) ctx.fillRect(x - 4 + i * 3, y + 6, 2, 2);
      }
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
      const text = me ? `★ ${n.name}` : '👤 玩家';
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
    const w = label.width + 12 * k, h = 17 * k, y = c.y - 6 * k;
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
    if (z > 0.95) {
      const font = `${Math.round(10 / Math.min(z, 1.6))}px "Microsoft YaHei", sans-serif`;
      for (const c of G.world.cities) {
        const color = c.ruined ? 'rgba(255,120,100,0.7)' : 'rgba(255,240,210,0.75)';
        const label = this.labelImage('city:' + c.id, c.name, font, color);
        ctx.drawImage(label.c, c.tile.x + label.x, c.tile.y + 18 + label.y, label.w, label.h);
      }
    }
  },
};
