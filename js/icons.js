// ===================== 种族徽章图标（SVG）：六边形徽章 + 种族符号 =====================
'use strict';

// 六边形徽章外框：深色底 + 国家色描边 + 内层渐变
function emblemFrame(id, c1, c2, rim) {
  return `<defs>
    <linearGradient id="eg-${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient>
    <radialGradient id="er-${id}" cx="0.5" cy="0.35" r="0.65"><stop offset="0" stop-color="#ffffff" stop-opacity="0.22"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></radialGradient>
  </defs>
  <polygon points="32,2 58,17 58,47 32,62 6,47 6,17" fill="#0a1220" stroke="${rim}" stroke-width="3" stroke-linejoin="round"/>
  <polygon points="32,7 53.5,19.5 53.5,44.5 32,57 10.5,44.5 10.5,19.5" fill="url(#eg-${id})"/>
  <polygon points="32,7 53.5,19.5 53.5,44.5 32,57 10.5,44.5 10.5,19.5" fill="url(#er-${id})"/>`;
}

const RACE_ICON_SVG = {
  // 卷王：挑灯夜读——摊开的书 + 书上燃着的灯焰
  human: `${emblemFrame('human', '#1d4f8f', '#0b1f3d', '#4da3ff')}
    <defs><linearGradient id="fl-human" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff6c2"/><stop offset="0.5" stop-color="#ffc23d"/><stop offset="1" stop-color="#ff7a1a"/></linearGradient></defs>
    <path d="M32 11 C39.5 19 40 26 32 32 C24 26 24.5 19 32 11 Z" fill="url(#fl-human)"/>
    <path d="M32 19 C35 23 35 27 32 29.5 C29 27 29 23 32 19 Z" fill="#fffbe6"/>
    <path d="M13 38 Q22.5 33 31 38 L31 50 Q22.5 45 13 50 Z" fill="#eaf3ff" stroke="#4da3ff" stroke-width="1.6" stroke-linejoin="round"/>
    <path d="M51 38 Q41.5 33 33 38 L33 50 Q41.5 45 51 50 Z" fill="#d4e6ff" stroke="#4da3ff" stroke-width="1.6" stroke-linejoin="round"/>
    <path d="M16.5 41.5 Q22.5 38.8 28 41.5 M16.5 45 Q22.5 42.3 28 45 M36 41.5 Q41.5 38.8 47.5 41.5 M36 45 Q41.5 42.3 47.5 45" stroke="#7aa9de" stroke-width="1.1" fill="none"/>`,

  // 刀盾：铜色鸢形盾 + 正中一柄银剑
  mole: `${emblemFrame('mole', '#6b4220', '#2a170a', '#d0965a')}
    <defs><linearGradient id="sh-mole" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f2c38a"/><stop offset="1" stop-color="#9a5e28"/></linearGradient>
    <linearGradient id="bl-mole" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#9fb2c6"/></linearGradient></defs>
    <path d="M32 12 L49 18.5 V31 C49 41.5 41 48.5 32 53 C23 48.5 15 41.5 15 31 V18.5 Z" fill="url(#sh-mole)" stroke="#fff0d8" stroke-width="1.6" stroke-linejoin="round"/>
    <path d="M32 16 L45.5 21 V31 C45.5 39.5 39 45.5 32 49.3 Z" fill="#000" opacity="0.14"/>
    <path d="M30.3 8 H33.7 V38 L32 42 L30.3 38 Z" fill="url(#bl-mole)" stroke="#3a2a1a" stroke-width="0.8"/>
    <rect x="23" y="37.5" width="18" height="3.4" rx="1.6" fill="#ffd27a" stroke="#3a2a1a" stroke-width="0.8"/>
    <rect x="30.4" y="41" width="3.2" height="7.5" rx="1" fill="#5a3a1c"/>
    <circle cx="32" cy="50.3" r="2.3" fill="#ffd27a" stroke="#3a2a1a" stroke-width="0.8"/>`,

  // 鱼叉：三叉戟破浪而出
  octopus: `${emblemFrame('octopus', '#4a2a86', '#170b33', '#b67bff')}
    <defs><linearGradient id="tr-octopus" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#cdb0ff"/></linearGradient></defs>
    <path d="M10 47 q5.5 -5 11 0 t11 0 t11 0 t11 0 V57 H10 Z" fill="#6a3fc0" opacity="0.85"/>
    <path d="M10 47 q5.5 -5 11 0 t11 0 t11 0 t11 0" stroke="#d9c2ff" stroke-width="2" fill="none"/>
    <path d="M10 53 q5.5 -4 11 0 t11 0 t11 0 t11 0" stroke="#a37af0" stroke-width="1.4" fill="none" opacity="0.8"/>
    <rect x="30.6" y="24" width="2.8" height="28" rx="1.2" fill="url(#tr-octopus)"/>
    <path d="M20.5 15 V24 Q20.5 31 32 31 Q43.5 31 43.5 24 V15" stroke="url(#tr-octopus)" stroke-width="3" fill="none" stroke-linecap="round"/>
    <rect x="30.6" y="12" width="2.8" height="19" fill="url(#tr-octopus)"/>
    <path d="M32 6 L35.5 13.5 H28.5 Z M20.5 9 L24 16 H17 Z M43.5 9 L47 16 H40 Z" fill="#ffffff"/>`,

  // 吃土：一勺土 + 土堆上冒出的嫩芽
  mushroom: `${emblemFrame('mushroom', '#7a1f3e', '#2a0815', '#ff5e8a')}
    <defs><linearGradient id="sp-mushroom" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#ffb3c8"/></linearGradient></defs>
    <path d="M10 52 Q32 34 54 52 V57 H10 Z" fill="#7a4a2a"/>
    <path d="M14 52 Q32 38 50 52" stroke="#a8693d" stroke-width="1.6" fill="none"/>
    <circle cx="22" cy="50" r="1.2" fill="#3a2010"/><circle cx="40" cy="47" r="1.3" fill="#3a2010"/><circle cx="31" cy="51" r="1" fill="#3a2010"/>
    <path d="M44 40 Q44 33 49 31 Q49 37 44 40 Z M44 40 Q43 35 39 33.5 Q38.5 38 44 40 Z" fill="#7dff8a"/>
    <path d="M44 40 V45" stroke="#5ad46a" stroke-width="1.6"/>
    <line x1="27" y1="27" x2="44.5" y2="9.5" stroke="url(#sp-mushroom)" stroke-width="3.6" stroke-linecap="round"/>
    <ellipse cx="22.5" cy="32" rx="8" ry="10.5" transform="rotate(45 22.5 32)" fill="url(#sp-mushroom)" stroke="#ff5e8a" stroke-width="1.4"/>
    <ellipse cx="21.8" cy="32.8" rx="5" ry="6.5" transform="rotate(45 21.8 32.8)" fill="#7a4a2a"/>
    <circle cx="20" cy="31" r="1.1" fill="#3a2010"/>`,

  // 赛博朋克：发光护目镜的机械头 + 电路纹
  ai: `${emblemFrame('ai', '#0d5a52', '#04201d', '#3ef0d0')}
    <defs><linearGradient id="hd-ai" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d9fff7"/><stop offset="1" stop-color="#7fb8b0"/></linearGradient></defs>
    <path d="M10.5 30 H15 M10.5 36 H13 L15 38 M53.5 30 H49 M53.5 36 H51 L49 38" stroke="#3ef0d0" stroke-width="1.4" fill="none"/>
    <circle cx="10.5" cy="30" r="1.3" fill="#3ef0d0"/><circle cx="53.5" cy="30" r="1.3" fill="#3ef0d0"/>
    <line x1="32" y1="18" x2="32" y2="11" stroke="#d9fff7" stroke-width="2"/>
    <circle cx="32" cy="10" r="2.6" fill="#3ef0d0" stroke="#d9fff7" stroke-width="1"/>
    <rect x="15.5" y="18" width="33" height="29" rx="8" fill="url(#hd-ai)" stroke="#1a3a36" stroke-width="1.2"/>
    <rect x="19" y="25" width="26" height="9" rx="4.5" fill="#06302b"/>
    <rect x="20.5" y="26.5" width="23" height="6" rx="3" fill="#3ef0d0"/>
    <rect x="22" y="27.6" width="8" height="1.6" rx="0.8" fill="#ffffff" opacity="0.85"/>
    <path d="M25 40 H39 M25 43 H39" stroke="#2b5a54" stroke-width="1.6" stroke-linecap="round"/>
    <path d="M24 39 V44 M28.6 39 V44 M33.2 39 V44 M37.8 39 V44" stroke="#2b5a54" stroke-width="1"/>`,

  // 青铜：缎带奖牌 + 牌面燃烧的小宇宙
  roach: `${emblemFrame('roach', '#6e5a12', '#241c04', '#e8d04a')}
    <defs><radialGradient id="md-roach" cx="0.38" cy="0.32" r="0.75"><stop offset="0" stop-color="#ffd9a0"/><stop offset="0.55" stop-color="#c47d36"/><stop offset="1" stop-color="#6b3a12"/></radialGradient>
    <linearGradient id="fl-roach" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff6c2"/><stop offset="0.5" stop-color="#ffb02e"/><stop offset="1" stop-color="#ff5a1a"/></linearGradient></defs>
    <path d="M22 8 H30 L34 24 H26 Z" fill="#c8323a"/><path d="M42 8 H34 L30 24 H38 Z" fill="#2f6fd0"/>
    <path d="M22 8 H30 L34 24 H26 Z" fill="#000" opacity="0.12"/>
    <circle cx="32" cy="38" r="15" fill="url(#md-roach)" stroke="#ffe7b8" stroke-width="1.8"/>
    <circle cx="32" cy="38" r="11.5" fill="none" stroke="#5a2e0c" stroke-width="1" opacity="0.6"/>
    <path d="M32 27 C38.5 33 38.5 40 32 46 C25.5 40 26.5 35 29 32 C29.5 35 31 36 32 35.5 C30.5 32.5 31 29.5 32 27 Z" fill="url(#fl-roach)"/>
    <path d="M32 35 C34.5 37.5 34.5 41 32 43.5 C29.5 41 29.8 38.5 32 35 Z" fill="#fffbe6"/>`,

  // 三体人：三颗太阳在混乱的轨道上环绕一只竖瞳之眼
  trisolaris: `${emblemFrame('trisolaris', '#14402a', '#04120b', '#9dffb0')}
    <defs><radialGradient id="ey-tri" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="#eaffef"/><stop offset="0.6" stop-color="#7dff9a"/><stop offset="1" stop-color="#1f8a45"/></radialGradient>
    <radialGradient id="s1-tri" cx="0.4" cy="0.4" r="0.6"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#ffb02e"/></radialGradient>
    <radialGradient id="s2-tri" cx="0.4" cy="0.4" r="0.6"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#ff5a3a"/></radialGradient>
    <radialGradient id="s3-tri" cx="0.4" cy="0.4" r="0.6"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#7fd6ff"/></radialGradient></defs>
    <ellipse cx="32" cy="32" rx="21" ry="8.5" transform="rotate(-28 32 32)" fill="none" stroke="#9dffb0" stroke-width="1.2" opacity="0.75"/>
    <ellipse cx="32" cy="32" rx="21" ry="8.5" transform="rotate(32 32 32)" fill="none" stroke="#9dffb0" stroke-width="1.2" opacity="0.5"/>
    <ellipse cx="32" cy="32" rx="9.5" ry="13" fill="url(#ey-tri)" stroke="#d8ffe0" stroke-width="1.2"/>
    <ellipse cx="32" cy="32" rx="2.4" ry="9" fill="#04120b"/>
    <circle cx="13.5" cy="40.5" r="4.4" fill="url(#s1-tri)"/>
    <circle cx="50" cy="20" r="3.6" fill="url(#s2-tri)"/>
    <circle cx="46" cy="47" r="3" fill="url(#s3-tri)"/>`,
};

// 图标的 <svg> 字符串（size：显示尺寸 px）
// 每个图标实例的渐变 id 加唯一后缀：同 id 的第一份如果在隐藏的元素里（比如开始界面），浏览器会画不出渐变
let raceIconSeq = 0;
function raceIcon(id, size = 24, cls = 'ricon') {
  const body = RACE_ICON_SVG[id];
  if (!body) return '';
  const k = '-' + (++raceIconSeq).toString(36);
  const uniq = body.replace(/id="([^"]+)"/g, `id="$1${k}"`).replace(/url\(#([^)]+)\)/g, `url(#$1${k})`);
  return `<svg class="${cls}" width="${size}" height="${size}" viewBox="0 0 64 64" aria-hidden="true">${uniq}</svg>`;
}
// Canvas 用：每个种族一张预先栅格化好的图片
const RaceIconImg = {};
function raceIconImage(id) {
  if (RaceIconImg[id]) return RaceIconImg[id];
  const img = new Image();
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 64 64">${RACE_ICON_SVG[id] || ''}</svg>`);
  RaceIconImg[id] = img;
  return img;
}
