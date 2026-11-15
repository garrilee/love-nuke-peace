// ===================== 渲染·WebGL 特效层（PixiJS）=====================
// 粒子、火焰、爆炸、飞弹尾迹、小摩托这些“数量多”的东西交给显卡合批绘制；地图、城市、标签仍用 Canvas 2D。
// 三层画布从下到上：#game（地图、城市、设施）→ #fxgl（本层）→ #top（标签、标记、文字、屏幕暗角和闪光）。
// PixiJS 从网上动态加载；加载失败或设备不支持 WebGL 时 Gl.on 保持 false，所有特效退回 Canvas 2D 画法。
'use strict';

const Gl = {
  on: false,
  SRC: 'https://unpkg.com/pixi.js@7.4.2/dist/pixi.min.js',
  NP: 10, // 每条尾迹的采样点数

  load() {
    if (/[?&]nogl\b/.test(location.search)) return; // 调试：网址加 ?nogl 强制用 Canvas 2D
    if (window.PIXI) { this.init(); return; }
    const s = document.createElement('script');
    s.src = this.SRC; s.async = true;
    s.onload = () => this.init();
    document.head.appendChild(s);
  },

  init() {
    try {
      const P = window.PIXI, game = Render.canvas;
      const mk = (id) => { const c = document.createElement('canvas'); c.id = id; c.className = 'overlayCanvas'; return c; };
      this.view = mk('fxgl'); this.topCanvas = mk('top');
      this.renderer = new P.Renderer({ view: this.view, width: Math.max(1, Render.w), height: Math.max(1, Render.h), resolution: Render.dpr, backgroundAlpha: 0, antialias: false, powerPreference: 'high-performance' });
      // 加色混合时不写透明度：这层画布叠在地图上时就是真正的“加亮”，而不是盖住下面的画面
      const gl = this.renderer.gl;
      this.renderer.state.blendModes[P.BLEND_MODES.ADD] = [gl.ONE, gl.ONE, gl.ZERO, gl.ONE];
      this.stage = new P.Container(); this.world = new P.Container(); this.stage.addChild(this.world);
      // 图层顺序（从下到上）：地面光 → 尾迹 → 弹头光 → 小摩托 → 冲击波线条 → 火球/光芒 → 烟 → 火星
      this.L = {};
      const add = (name, blend) => { const l = this.spriteLayer(blend); this.L[name] = l; this.world.addChild(l.c); return l; };
      add('ground', P.BLEND_MODES.ADD);
      this.initTrails();
      add('head', P.BLEND_MODES.ADD);
      add('unit', P.BLEND_MODES.NORMAL);
      this.lines = new P.Graphics(); this.lines.blendMode = P.BLEND_MODES.ADD; this.world.addChild(this.lines);
      add('air', P.BLEND_MODES.ADD);
      add('smoke', P.BLEND_MODES.NORMAL);
      add('glow', P.BLEND_MODES.ADD);
      this.texCache = new Map();
      game.after(this.view, this.topCanvas);
      this.topCtx = this.topCanvas.getContext('2d');
      this.resize();
      this.on = true;
    } catch (e) {
      console.warn('WebGL 特效层不可用，使用 Canvas 2D：', e);
      this.off();
    }
  },
  // 出错时整层关掉，退回 Canvas 2D
  off() {
    this.on = false;
    for (const c of [this.view, this.topCanvas]) if (c && c.parentNode) c.parentNode.removeChild(c);
  },
  resize() {
    if (!this.renderer) return;
    const w = Math.max(1, Render.w), h = Math.max(1, Render.h), d = Render.dpr;
    this.renderer.resolution = d;
    this.renderer.resize(w, h);
    for (const c of [this.view, this.topCanvas]) { c.style.width = w + 'px'; c.style.height = h + 'px'; }
    this.topCanvas.width = w * d; this.topCanvas.height = h * d;
  },

  // ---------- 贴图层：用法和 ctx.drawImage 一样（每帧重新提交），内部复用 Sprite 对象，由显卡合批 ----------
  spriteLayer(blend) {
    const P = window.PIXI;
    return {
      c: new P.Container(), pool: [], n: 0, shown: 0,
      get(tex, a) {
        let s = this.pool[this.n];
        if (!s) { s = new P.Sprite(tex); s.blendMode = blend; this.pool.push(s); this.c.addChild(s); }
        this.n++;
        s.texture = tex; s.visible = true; s.alpha = a;
        return s;
      },
      // 左上角 (x, y)，宽 w 高 h
      img(tex, x, y, w, h, a) {
        if (a <= 0.004) return;
        const s = this.get(tex, a);
        s.anchor.set(0, 0); s.rotation = 0; s.position.set(x, y); s.width = w; s.height = h;
      },
      // 以 (x, y) 为锚点旋转；ax, ay 为锚点在图内的比例位置
      rot(tex, x, y, w, h, a, ang, ax, ay) {
        if (a <= 0.004) return;
        const s = this.get(tex, a);
        s.anchor.set(ax, ay); s.rotation = ang; s.position.set(x, y); s.width = w; s.height = h;
      },
      end() { for (let i = this.n; i < this.shown; i++) this.pool[i].visible = false; this.shown = this.n; this.n = 0; },
    };
  },
  // 画布（预先画好的光斑等）→ 显卡贴图，每张画布只上传一次
  tex(canvas) {
    let t = this.texCache.get(canvas);
    if (!t) { t = window.PIXI.Texture.from(canvas); this.texCache.set(canvas, t); }
    return t;
  },
  // 按名字缓存的自绘贴图：paint(cx) 在 w×h（世界单位）的范围内画，K 为每单位像素数
  made(key, w, h, K, paint) {
    let t = this.texCache.get(key);
    if (!t) {
      const c = document.createElement('canvas'); c.width = Math.ceil(w * K); c.height = Math.ceil(h * K);
      const cx = c.getContext('2d'); cx.scale(K, K); paint(cx);
      t = window.PIXI.Texture.from(c); this.texCache.set(key, t);
    }
    return t;
  },

  // ---------- 尾迹：所有飞弹的尾迹合成一张网格，一次画完。每条尾迹是一条由细到粗、由透明到亮的光带 ----------
  initTrails() {
    const P = window.PIXI;
    const vert = `
      precision mediump float;
      attribute vec2 aPos; attribute vec2 aUv; attribute vec4 aCol;
      uniform mat3 projectionMatrix; uniform mat3 translationMatrix;
      varying vec2 vUv; varying vec4 vCol;
      void main() { vUv = aUv; vCol = aCol; gl_Position = vec4((projectionMatrix * translationMatrix * vec3(aPos, 1.0)).xy, 0.0, 1.0); }`;
    // 横向：中间一条亮芯 + 两侧柔和的光晕；越靠近弹头芯越白
    const frag = `
      precision mediump float;
      varying vec2 vUv; varying vec4 vCol;
      void main() {
        float d = abs(vUv.y * 2.0 - 1.0);
        float soft = 1.0 - smoothstep(0.0, 1.0, d);
        float core = 1.0 - smoothstep(0.0, 0.38, d);
        float a = vCol.a * (core * 0.85 + soft * soft * 0.3);
        vec3 c = mix(vCol.rgb, vec3(1.0), core * core * vUv.x * 0.7);
        gl_FragColor = vec4(c * a, a);
      }`;
    this.trailShader = P.Shader.from(vert, frag, {});
    this.trailCap = 0; this.trailN = 0;
    this.growTrails(128);
  },
  growTrails(cap) {
    const P = window.PIXI, NP = this.NP, V = cap * NP * 2;
    const pos = new Float32Array(V * 2), uv = new Float32Array(V * 2), col = new Float32Array(V * 4), idx = new Uint16Array(cap * (NP - 1) * 6);
    if (this.tPos) { pos.set(this.tPos); col.set(this.tCol); }
    for (let t = 0; t < cap; t++) {
      for (let i = 0; i < NP; i++) {
        const v = (t * NP + i) * 2, f = i / (NP - 1);
        uv[v * 2] = f; uv[v * 2 + 1] = 0; uv[v * 2 + 2] = f; uv[v * 2 + 3] = 1;
        if (i < NP - 1) { const k = (t * (NP - 1) + i) * 6; idx[k] = v; idx[k + 1] = v + 1; idx[k + 2] = v + 2; idx[k + 3] = v + 1; idx[k + 4] = v + 3; idx[k + 5] = v + 2; }
      }
    }
    this.tPos = pos; this.tCol = col; this.trailCap = cap;
    const geom = new P.Geometry().addAttribute('aPos', pos, 2).addAttribute('aUv', uv, 2).addAttribute('aCol', col, 4).addIndex(idx);
    const old = this.trailMesh;
    this.trailMesh = new P.Mesh(geom, this.trailShader);
    this.trailMesh.blendMode = P.BLEND_MODES.ADD;
    if (old) { const i = this.world.getChildIndex(old); this.world.removeChild(old); old.destroy(); this.world.addChildAt(this.trailMesh, i); }
    else this.world.addChild(this.trailMesh);
  },
  // pts：NP 个 {x, y}，从尾到头；w：弹头处亮芯的宽度；cols：每个点的 r,g,b（0～1）依次排列，长度 NP*3；alpha：弹头处的亮度
  trail(pts, w, cols, alpha) {
    if (this.trailN >= this.trailCap) { if (this.trailCap >= 2048) return; this.growTrails(this.trailCap * 2); }
    const NP = this.NP, pos = this.tPos, col = this.tCol, base = this.trailN * NP * 2;
    for (let i = 0; i < NP; i++) {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(NP - 1, i + 1)], p = pts[i];
      let nx = -(b.y - a.y), ny = b.x - a.x;
      const len = Math.hypot(nx, ny) || 1, f = i / (NP - 1);
      const hw = w * 1.4 * (0.3 + 0.7 * f); // 网格比亮芯宽，留给光晕
      nx = nx / len * hw; ny = ny / len * hw;
      const v = (base + i * 2) * 2, c = (base + i * 2) * 4, al = alpha * f;
      pos[v] = p.x + nx; pos[v + 1] = p.y + ny; pos[v + 2] = p.x - nx; pos[v + 3] = p.y - ny;
      col[c] = col[c + 4] = cols[i * 3]; col[c + 1] = col[c + 5] = cols[i * 3 + 1]; col[c + 2] = col[c + 6] = cols[i * 3 + 2]; col[c + 3] = col[c + 7] = al;
    }
    this.trailN++;
  },

  // ---------- 每帧 ----------
  // 开始一帧：镜头和 2D 画布保持一致（屏幕坐标 = (世界坐标 − 镜头) × 缩放 + 屏幕中心 + 震动）
  begin(camX, camY, pz, sx, sy) {
    this.world.scale.set(pz);
    this.world.position.set(Render.w / 2 + sx - camX * pz, Render.h / 2 + sy - camY * pz);
    this.trailN = 0;
    this.lines.clear();
    // 上层 2D 画布：清空，套上同样的镜头
    const c = this.topCtx;
    c.setTransform(Render.dpr, 0, 0, Render.dpr, 0, 0);
    c.clearRect(0, 0, Render.w, Render.h);
    c.save();
    c.translate(Render.w / 2 + sx, Render.h / 2 + sy); c.scale(pz, pz); c.translate(-camX, -camY);
    return c;
  },
  end() {
    try {
      for (const k in this.L) this.L[k].end();
      const g = this.trailMesh.geometry;
      g.getBuffer('aPos').update(); g.getBuffer('aCol').update();
      this.trailMesh.size = this.trailN * (this.NP - 1) * 6;
      this.trailMesh.visible = this.trailN > 0;
      this.renderer.render(this.stage);
    } catch (e) {
      console.warn('WebGL 特效层出错，退回 Canvas 2D：', e);
      this.off();
    }
  },
};
