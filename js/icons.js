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
  // 卷王：只突出一个大大的 996
  human: `${emblemFrame('human', '#1d4f8f', '#0b1f3d', '#4da3ff')}
    <text x="32" y="40.5" text-anchor="middle" font-family="Arial Black, Arial, sans-serif" font-weight="900" font-size="23" letter-spacing="-1" fill="#ffe79a" stroke="#0b1f3d" stroke-width="3" paint-order="stroke" stroke-linejoin="round">996</text>
    <rect x="16" y="45" width="32" height="2.4" rx="1.2" fill="#4da3ff"/>`,

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

  // 青铜：带翼的青铜头盔，额前一颗宝石
  roach: `${emblemFrame('roach', '#6e5a12', '#241c04', '#e8d04a')}
    <defs><linearGradient id="hm-roach" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffe0a8"/><stop offset="0.5" stop-color="#c98a3a"/><stop offset="1" stop-color="#6b3a12"/></linearGradient></defs>
    <path d="M22 33 C15 31 10 25 9 14 C14 18 17 20 20 21 C18 18 17 15 17 11 C21 16 24 20 25 27 Z" fill="#fff0c8" stroke="#8a5320" stroke-width="1"/>
    <path d="M42 33 C49 31 54 25 55 14 C50 18 47 20 44 21 C46 18 47 15 47 11 C43 16 40 20 39 27 Z" fill="#fff0c8" stroke="#8a5320" stroke-width="1"/>
    <path d="M20 42 C20 26 25.5 18 32 18 C38.5 18 44 26 44 42 L44 49 L38.5 49 L38.5 39 L32 44 L25.5 39 L25.5 49 L20 49 Z" fill="url(#hm-roach)" stroke="#fff0c8" stroke-width="1.4" stroke-linejoin="round"/>
    <path d="M32 18 V30" stroke="#6b3a12" stroke-width="1.2"/>
    <circle cx="32" cy="27" r="3.2" fill="#5ad0ff" stroke="#ffffff" stroke-width="1"/>
    <path d="M32 9 L34 15 H30 Z" fill="#ffd27a"/>`,

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
// 渐变定义（<defs>）集中放进页面开头一个不占位的 <svg> 里，全页共用；
// 图标本身只有图形，所以同一个种族、同一尺寸的图标字符串永远相同，界面刷新时不用重建
const RACE_ICON_DEFS = {}, RACE_ICON_SHAPES = {};
for (const id of Object.keys(RACE_ICON_SVG)) {
  RACE_ICON_DEFS[id] = (RACE_ICON_SVG[id].match(/<defs>[\s\S]*?<\/defs>/g) || []).join('');
  RACE_ICON_SHAPES[id] = RACE_ICON_SVG[id].replace(/<defs>[\s\S]*?<\/defs>/g, '');
}
(function mountIconDefs() {
  const holder = document.createElement('div');
  holder.innerHTML = `<svg width="0" height="0" style="position:absolute;width:0;height:0;overflow:hidden" aria-hidden="true">${Object.values(RACE_ICON_DEFS).join('')}</svg>`;
  const add = () => document.body.insertBefore(holder.firstChild, document.body.firstChild);
  if (document.body) add(); else document.addEventListener('DOMContentLoaded', add);
})();
const raceIconCache = {};
function raceIcon(id, size = 24, cls = 'ricon') {
  const key = id + ':' + size + ':' + cls;
  if (raceIconCache[key]) return raceIconCache[key];
  if (!RACE_ICON_SHAPES[id]) return '';
  return (raceIconCache[key] = `<svg class="${cls}" width="${size}" height="${size}" viewBox="0 0 64 64" aria-hidden="true">${RACE_ICON_SHAPES[id]}</svg>`);
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
