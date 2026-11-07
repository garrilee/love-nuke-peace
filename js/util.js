// ===================== 工具：随机数、噪声、六边形数学 =====================
'use strict';

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let rand = Math.random;
function setSeed(s) { rand = mulberry32(s); }
const rnd = (a, b) => a + rand() * (b - a);
const rndi = (a, b) => Math.floor(rnd(a, b + 1));
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const chance = (p) => rand() < p;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ---- 值噪声 + fbm ----
function makeNoise(seed) {
  const r = mulberry32(seed);
  const perm = new Uint8Array(512);
  const vals = new Float32Array(256);
  for (let i = 0; i < 256; i++) { perm[i] = i; vals[i] = r(); }
  for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); const t = perm[i]; perm[i] = perm[j]; perm[j] = t; }
  for (let i = 0; i < 256; i++) perm[i + 256] = perm[i];
  const h = (x, y) => vals[perm[(perm[x & 255] + y) & 511]];
  const sm = (t) => t * t * (3 - 2 * t);
  function noise(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const u = sm(xf), v = sm(yf);
    const a = h(xi, yi), b = h(xi + 1, yi), c = h(xi, yi + 1), d = h(xi + 1, yi + 1);
    return lerp(lerp(a, b, u), lerp(c, d, u), v);
  }
  return function fbm(x, y, oct = 4) {
    let s = 0, amp = 1, f = 1, norm = 0;
    for (let i = 0; i < oct; i++) { s += noise(x * f, y * f) * amp; norm += amp; amp *= 0.5; f *= 2.03; }
    return s / norm;
  };
}

// ---- 六边形（尖顶，odd-r 偏移坐标）----
const SQRT3 = Math.sqrt(3);
const HEX_W = SQRT3 * CFG.HEX;
const HEX_H = 2 * CFG.HEX;
const MAP_MARGIN = 40;
const WORLD_W = Math.ceil(HEX_W * (CFG.MAP_COLS + 0.5) + MAP_MARGIN * 2);
const WORLD_H = Math.ceil(CFG.HEX * 1.5 * (CFG.MAP_ROWS - 1) + HEX_H + MAP_MARGIN * 2);

function hexToPixel(c, r) {
  return {
    x: MAP_MARGIN + HEX_W * (c + 0.5 * (r & 1)) + HEX_W / 2,
    y: MAP_MARGIN + CFG.HEX * 1.5 * r + CFG.HEX,
  };
}
function offsetToCube(c, r) {
  const x = c - (r - (r & 1)) / 2;
  const z = r;
  return { x, y: -x - z, z };
}
function hexDist(a, b) {
  const A = offsetToCube(a.c, a.r), B = offsetToCube(b.c, b.r);
  return Math.max(Math.abs(A.x - B.x), Math.abs(A.y - B.y), Math.abs(A.z - B.z));
}
const NB_EVEN = [[1, 0], [0, -1], [-1, -1], [-1, 0], [-1, 1], [0, 1]];
const NB_ODD = [[1, 0], [1, -1], [0, -1], [-1, 0], [0, 1], [1, 1]];
function neighborsOf(c, r) {
  const d = (r & 1) ? NB_ODD : NB_EVEN;
  const out = [];
  for (const [dc, dr] of d) {
    const nc = c + dc, nr = r + dr;
    if (nc >= 0 && nr >= 0 && nc < CFG.MAP_COLS && nr < CFG.MAP_ROWS) out.push([nc, nr]);
  }
  return out;
}
function pixelToHex(px, py) {
  const x = px - MAP_MARGIN - HEX_W / 2;
  const y = py - MAP_MARGIN - CFG.HEX;
  const q = (SQRT3 / 3 * x - y / 3) / CFG.HEX;
  const rr = (2 / 3 * y) / CFG.HEX;
  // cube round
  let cx = q, cz = rr, cy = -cx - cz;
  let rx = Math.round(cx), ry = Math.round(cy), rz = Math.round(cz);
  const dx = Math.abs(rx - cx), dy = Math.abs(ry - cy), dz = Math.abs(rz - cz);
  if (dx > dy && dx > dz) rx = -ry - rz; else if (dy > dz) ry = -rx - rz; else rz = -rx - ry;
  const row = rz;
  const col = rx + (row - (row & 1)) / 2;
  return { c: col, r: row };
}
function hexCorners(x, y, size) {
  const pts = [];
  for (let i = 0; i < 6; i++) {
    const a = Math.PI / 180 * (60 * i - 30);
    pts.push([x + size * Math.cos(a), y + size * Math.sin(a)]);
  }
  return pts;
}

// ---- 颜色 ----
function hexToRgb(hex) {
  const v = parseInt(hex.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}
function rgba(hex, a) {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}

function fmtPop(m) {
  if (m >= 10) return m.toFixed(0) + 'M';
  if (m >= 1) return m.toFixed(1) + 'M';
  return Math.round(m * 1000) + 'K';
}
function fmtTime(s) {
  s = Math.max(0, Math.floor(s));
  return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
}
function fmtYield(kt) { return kt >= 1000 ? (kt / 1000).toFixed(kt >= 10000 ? 0 : 1) + 'Mt' : kt + 'kt'; }
