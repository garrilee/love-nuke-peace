// ===================== 渲染·WebGL 层（PixiJS）：基础设施 =====================
// Gl.on 为 true 时，整个画面由这一层画在 #fxgl 画布上（见 glscene.js 的 Render.glDraw）；#game 画布只负责接收鼠标和触摸。
// PixiJS 从网上动态加载；加载失败、设备不支持 WebGL 或运行中出错时 Gl.on 为 false，画面退回 Canvas 2D（Render.draw）。
// 这里提供三样东西，用法都是“每帧重新提交”：
//   贴图层 Gl.L.xxx.img(...)：相当于 ctx.drawImage，内部复用 Sprite，由显卡合批
//   线条层 Gl.g.xxx：PIXI.Graphics，每帧清空重画（圆环、准星这类数量不多的线条）
//   尾迹 Gl.trail(...)：所有飞弹尾迹合成一张网格一次画完
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
      const P = window.PIXI, ADD = P.BLEND_MODES.ADD, NORMAL = P.BLEND_MODES.NORMAL;
      this.view = document.createElement('canvas'); this.view.id = 'fxgl'; this.view.className = 'overlayCanvas';
      this.renderer = new P.Renderer({ view: this.view, width: Math.max(1, Render.w), height: Math.max(1, Render.h), resolution: Render.dpr, backgroundColor: 0x01040a, backgroundAlpha: 1, antialias: true, powerPreference: 'high-performance' });
      this.stage = new P.Container(); this.world = new P.Container(); this.screen = new P.Container();
      this.stage.addChild(this.world, this.screen);
      this.texCache = new Map(); this.textCache = new Map();
      this.L = {}; this.g = {};
      const sprite = (blend) => { const s = new P.Sprite(P.Texture.EMPTY); s.blendMode = blend; s.visible = false; this.world.addChild(s); return s; };
      const layer = (name, blend, parent = this.world) => { const l = this.spriteLayer(blend); this.L[name] = l; parent.addChild(l.c); };
      const gfx = (name, blend) => { const g = new P.Graphics(); g.blendMode = blend; this.g[name] = g; this.world.addChild(g); };
      // 图层顺序（从下到上）
      this.baseSpr = sprite(NORMAL); this.scorchSpr = sprite(NORMAL);   // 底图、焦痕
      layer('fill', NORMAL); layer('fillAdd', ADD);                     // 国土底色；国境发光、护盾
      this.dustSpr = sprite(ADD);                                       // 辐射尘
      layer('flat', NORMAL);                                            // 二维化地块
      layer('ground', ADD);                                             // 地面光、余火、城市灯光
      layer('low', NORMAL);                                             // 城市黑烟
      gfx('low', NORMAL);                                               // 人口环、首都标记、进度环、宕机红叉
      layer('fac', NORMAL);                                             // 设施、潜航器
      layer('dark', NORMAL);                                            // 东风镜头压暗
      gfx('dim', NORMAL);                                               // 降维打击预警圈
      this.initTrails();                                                // 飞弹尾迹
      layer('head', ADD); layer('unit', NORMAL);                        // 弹头光；小摩托、飞机
      gfx('lines', ADD);                                                // 冲击波、锁定圈、曳光弹
      layer('air', ADD);                                                // 火球和光芒
      this.fb = new P.Container(); this.world.addChild(this.fb);        // 着色器火球（4、5 级核弹）
      layer('smoke', NORMAL); layer('glow', ADD);                       // 烟；火星
      layer('pillar', ADD);                                             // 东风光柱
      gfx('mark', NORMAL);                                              // 来袭准星、标记波纹、空投光圈、悬停框
      layer('labelAdd', ADD); layer('label', NORMAL); layer('text', NORMAL); // 标牌和文字
      layer('scr', NORMAL, this.screen); layer('scrAdd', ADD, this.screen);  // 屏幕层：暗角、闪光
      this.lines = this.g.lines;
      this.initPost();
      Render.canvas.after(this.view);
      this.resize();
      this.on = true;
    } catch (e) {
      console.warn('WebGL 层不可用，使用 Canvas 2D：', e);
      this.off();
    }
  },
  // 出错时整层关掉，退回 Canvas 2D
  off() {
    this.on = false;
    if (this.view && this.view.parentNode) this.view.parentNode.removeChild(this.view);
  },
  resize() {
    if (!this.renderer) return;
    const w = Math.max(1, Render.w), h = Math.max(1, Render.h);
    this.renderer.resolution = Render.dpr;
    this.renderer.resize(w, h);
    if (this.bloomRT) { this.bloomRT.resize(w, h); this.bloomSpr.width = w; this.bloomSpr.height = h; }
    this.view.style.width = w + 'px'; this.view.style.height = h + 'px';
  },

  // ---------- 贴图层 ----------
  spriteLayer(blend) {
    const P = window.PIXI;
    return {
      c: new P.Container(), pool: [], n: 0, shown: 0,
      get(tex, a, tint) {
        let s = this.pool[this.n];
        if (!s) { s = new P.Sprite(tex); s.blendMode = blend; this.pool.push(s); this.c.addChild(s); }
        this.n++;
        s.texture = tex; s.visible = true; s.alpha = a; s.tint = tint === undefined ? 0xffffff : tint;
        return s;
      },
      // 左上角 (x, y)，宽 w 高 h，透明度 a，可选染色 tint
      img(tex, x, y, w, h, a, tint) {
        if (a <= 0.004) return;
        const s = this.get(tex, a, tint);
        s.anchor.set(0, 0); s.rotation = 0; s.position.set(x, y); s.width = w; s.height = h;
      },
      // 以 (x, y) 为锚点旋转；ax, ay 为锚点在图内的比例位置
      rot(tex, x, y, w, h, a, ang, ax, ay, tint) {
        if (a <= 0.004) return;
        const s = this.get(tex, a, tint);
        s.anchor.set(ax, ay); s.rotation = ang; s.position.set(x, y); s.width = w; s.height = h;
      },
      // 纯色矩形
      rect(x, y, w, h, color, a) { this.img(P.Texture.WHITE, x, y, w, h, a, color); },
      end() { for (let i = this.n; i < this.shown; i++) this.pool[i].visible = false; this.shown = this.n; this.n = 0; },
    };
  },

  // ---------- 贴图管理 ----------
  // 画布或位图（预先画好的光斑、标牌等）→ 显卡贴图，每个只上传一次
  tex(src) {
    let t = this.texCache.get(src);
    if (!t) { t = window.PIXI.Texture.from(src); this.texCache.set(src, t); }
    return t;
  },
  // 画布内容变了：重新上传
  touch(src) { const t = this.texCache && this.texCache.get(src); if (t) t.baseTexture.update(); },
  // 画布或位图不再使用：释放贴图
  drop(src) {
    const t = this.texCache && this.texCache.get(src);
    if (t) { this.texCache.delete(src); t.destroy(true); }
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
  // 文字贴图（带黑色描边，可选发光）。px 字号（世界单位），align 'center' | 'left'。
  // 返回 { t 贴图, w, h 世界尺寸, ox, oy 贴图左上角相对文字基线锚点的偏移 }；最近用过的 400 条留在缓存里
  txt(str, px, weight, fill, strokeW, glowColor, glowBlur, align) {
    const scale = Render.labelScale, key = str + '|' + px + '|' + weight + '|' + fill + '|' + strokeW + '|' + glowColor + '|' + glowBlur + '|' + align + '|' + scale;
    let e = this.textCache.get(key);
    if (e) { this.textCache.delete(key); this.textCache.set(key, e); return e; }
    const font = `${weight} ${px}px "Microsoft YaHei", sans-serif`;
    const m = this.measure || (this.measure = document.createElement('canvas').getContext('2d'));
    m.font = font; m.textAlign = align;
    const mt = m.measureText(str), pad = strokeW / 2 + (glowBlur * 2 + 2) / scale;
    const ox = -mt.actualBoundingBoxLeft - pad, oy = -mt.actualBoundingBoxAscent - pad;
    const w = mt.actualBoundingBoxRight + pad - ox, h = mt.actualBoundingBoxDescent + pad - oy;
    const c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w * scale)); c.height = Math.max(1, Math.ceil(h * scale));
    const cx = c.getContext('2d');
    cx.scale(scale, scale); cx.translate(-ox, -oy);
    cx.font = font; cx.textAlign = align; cx.lineJoin = 'round';
    if (strokeW > 0) { cx.lineWidth = strokeW; cx.strokeStyle = 'rgba(0,0,0,0.85)'; cx.strokeText(str, 0, 0); }
    if (glowBlur > 0) { cx.shadowColor = glowColor; cx.shadowBlur = glowBlur; }
    cx.fillStyle = fill; cx.fillText(str, 0, 0);
    e = { t: window.PIXI.Texture.from(c), w: c.width / scale, h: c.height / scale, ox, oy };
    this.textCache.set(key, e);
    if (this.textCache.size > 400) { const k = this.textCache.keys().next().value; this.textCache.get(k).t.destroy(true); this.textCache.delete(k); }
    return e;
  },
  // 把文字贴到某一层：(x, y) 是文字基线锚点，k 为放大倍数
  putText(layer, e, x, y, a, k = 1) { layer.img(e.t, x + e.ox * k, y + e.oy * k, e.w * k, e.h * k, a); },
  // 2D 缓存里的一块标牌 / 标签位图（{ c, x, y, w, h }）贴到某一层
  put(layer, pl, x, y, a = 1) { layer.img(this.tex(pl.c), x + pl.x, y + pl.y, pl.w, pl.h, a); },
  // 铺满整个世界的大图（底图、焦痕、辐射尘）
  mapSprite(spr, src, a = 1) {
    if (spr._src !== src) { if (spr._src) this.drop(spr._src); spr._src = src; spr.texture = this.tex(src); spr.width = WORLD_W; spr.height = WORLD_H; }
    spr.visible = a > 0; spr.alpha = a;
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

  // ---------- 后期效果：泛光、冲击波扭曲、着色器火球 ----------
  initPost() {
    const P = window.PIXI, ADD = P.BLEND_MODES.ADD;
    // 泛光：把高亮的几层（尾迹、弹头、火球、火星、光柱）单独画到一张低分辨率的图上，模糊后加亮叠回画面
    this.bright = new Set([this.L.head.c, this.L.air.c, this.fb, this.L.glow.c, this.L.pillar.c, this.g.lines]);
    this.bloomRT = P.RenderTexture.create({ width: Math.max(1, Render.w), height: Math.max(1, Render.h), resolution: 0.3 });
    this.bloomSpr = new P.Sprite(this.bloomRT);
    const blur = new P.BlurFilter(9, 3, 0.3); blur.blendMode = ADD;
    this.bloomSpr.filters = [blur]; this.bloomSpr.alpha = 0.7;
    this.screen.addChildAt(this.bloomSpr, 0);
    // 冲击波扭曲：整幅画面过一遍着色器，冲击环扫过的地方像隔着热浪一样被向外推开。最多同时 6 道
    this.waves = new Float32Array(24); this.waveN = 0;
    this.shockFilter = new P.Filter(undefined, `
      precision mediump float;
      varying vec2 vTextureCoord;
      uniform sampler2D uSampler; uniform highp vec4 inputSize; uniform highp vec4 outputFrame; // 精度要和顶点着色器里的声明一致
      uniform vec4 uWaves[6]; // 屏幕坐标 x, y；半径；强度（像素）
      void main() {
        vec2 px = vTextureCoord * inputSize.xy + outputFrame.xy, off = vec2(0.0);
        for (int i = 0; i < 6; i++) {
          vec4 w = uWaves[i];
          if (w.z <= 0.0) continue;
          vec2 d = px - w.xy; d.y /= 0.62;          // 冲击环是压扁的椭圆
          float dist = length(d), band = w.z * 0.16 + 10.0, t = (dist - w.z) / band;
          if (abs(t) < 1.0) { float k = 1.0 - t * t; off += normalize(d + 0.0001) * k * k * w.w * (t < 0.0 ? 1.0 : 0.6); }
        }
        gl_FragColor = texture2D(uSampler, vTextureCoord - off * inputSize.zw);
      }`, { uWaves: this.waves });
    // 着色器火球：一张方片，火焰纹理由噪声实时算出，白热的核心向外变橙红再冷却成暗红
    this.fbVert = `
      precision mediump float;
      attribute vec2 aPos;
      uniform mat3 projectionMatrix; uniform mat3 translationMatrix;
      varying vec2 vP;
      void main() { vP = aPos; gl_Position = vec4((projectionMatrix * translationMatrix * vec3(aPos, 1.0)).xy, 0.0, 1.0); }`;
    this.fbFrag = `
      precision mediump float;
      varying vec2 vP;
      uniform float uAge; uniform float uTime; uniform float uSeed; uniform float uRainbow;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
      }
      float fbm(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { v += a * noise(p); p = p * 2.03 + 7.1; a *= 0.5; } return v; }
      void main() {
        float r = length(vP);
        if (r > 1.0) discard;
        // 火焰向外翻滚：噪声沿半径方向流动
        vec2 q = vP * 2.6 + uSeed;
        float n = fbm(q - normalize(vP + 0.0001) * uTime * 0.9 + vec2(0.0, -uTime * 0.5));
        float grow = min(1.0, uAge * 5.0);                       // 开头迅速膨胀
        float cool = pow(1.0 - uAge, 1.3);                       // 之后慢慢冷却
        float body = smoothstep(1.0, 0.15, r / (0.35 + 0.65 * grow) + (0.5 - n) * 0.9);
        float I = body * (0.55 + 1.1 * n) * (0.25 + 1.6 * cool);
        vec3 c = mix(vec3(0.45, 0.04, 0.0), vec3(1.0, 0.42, 0.08), smoothstep(0.05, 0.45, I));
        c = mix(c, vec3(1.0, 0.86, 0.45), smoothstep(0.45, 0.85, I));
        c = mix(c, vec3(1.0), smoothstep(0.85, 1.35, I));
        if (uRainbow > 0.5) { // 4 级：边缘带一圈流动的彩虹色
          float h = atan(vP.y, vP.x) / 6.2832 + uTime * 0.25 + n * 0.4;
          vec3 rb = 0.55 + 0.45 * cos(6.2832 * (h + vec3(0.0, 0.33, 0.67)));
          c = mix(c, rb, smoothstep(0.35, 0.9, r) * 0.6 * (1.0 - smoothstep(0.85, 1.3, I)));
        }
        float a = smoothstep(0.02, 0.3, I) * smoothstep(1.0, 0.8, r) * min(1.0, cool * 3.0);
        gl_FragColor = vec4(c * a, a);
      }`;
    this.fbGeom = new P.Geometry().addAttribute('aPos', [-1, -1, 1, -1, 1, 1, -1, 1], 2).addIndex([0, 1, 2, 0, 2, 3]);
    this.fbPool = []; this.fbN = 0;
  },
  // 一个火球：中心 (x, y)，半径 R，age 0～1，seed 让每个火球纹理不同
  fireball(x, y, R, age, seed, rainbow) {
    const P = window.PIXI;
    let m = this.fbPool[this.fbN];
    if (!m) {
      m = new P.Mesh(this.fbGeom, P.Shader.from(this.fbVert, this.fbFrag, { uAge: 0, uTime: 0, uSeed: 0, uRainbow: 0 }));
      m.blendMode = P.BLEND_MODES.ADD; this.fbPool.push(m); this.fb.addChild(m);
    }
    this.fbN++;
    m.visible = true; m.position.set(x, y); m.scale.set(R, R * 0.86);
    const u = m.shader.uniforms; u.uAge = age; u.uTime = Render.time; u.uSeed = seed; u.uRainbow = rainbow ? 1 : 0;
  },
  // 一道冲击波扭曲：世界坐标 (x, y)，世界半径 rad，强度（屏幕像素）
  shock(x, y, rad, strength) {
    if (this.waveN >= 6 || strength < 0.3) return;
    const i = this.waveN++ * 4, pz = this.world.scale.x;
    this.waves[i] = this.world.position.x + x * pz; this.waves[i + 1] = this.world.position.y + y * pz;
    this.waves[i + 2] = Math.max(1, rad * pz); this.waves[i + 3] = strength;
  },

  // ---------- 每帧 ----------
  // 开始一帧：镜头（屏幕坐标 = (世界坐标 − 镜头) × 缩放 + 屏幕中心 + 震动）
  begin(camX, camY, pz, sx, sy) {
    this.world.scale.set(pz);
    this.world.position.set(Render.w / 2 + sx - camX * pz, Render.h / 2 + sy - camY * pz);
    this.trailN = 0; this.fbN = 0; this.waveN = 0;
    for (const k in this.g) this.g[k].clear();
  },
  end() {
    for (const k in this.L) this.L[k].end();
    const g = this.trailMesh.geometry;
    g.getBuffer('aPos').update(); g.getBuffer('aCol').update();
    this.trailMesh.size = this.trailN * (this.NP - 1) * 6;
    this.trailMesh.visible = this.trailN > 0;
    for (let i = this.fbN; i < this.fbPool.length; i++) this.fbPool[i].visible = false;
    const fancy = FX.quality > 0.6; // 掉帧降画质时先关掉后期效果
    // 泛光：只画高亮的几层到低分辨率图上
    this.bloomSpr.visible = fancy;
    if (fancy) {
      const kids = this.world.children;
      for (const k of kids) { k._keep = k.renderable; k.renderable = k._keep && (k === this.trailMesh || this.bright.has(k)); }
      this.world.filters = null;
      this.renderer.render(this.world, { renderTexture: this.bloomRT, clear: true });
      for (const k of kids) k.renderable = k._keep;
    }
    // 冲击波扭曲：有冲击波时整幅画面过一遍着色器
    if (fancy && this.waveN > 0) {
      for (let i = this.waveN * 4; i < 24; i++) this.waves[i] = 0;
      this.world.filterArea = this.renderer.screen;
      this.world.filters = [this.shockFilter];
    } else this.world.filters = null;
    this.renderer.render(this.stage);
  },
};
