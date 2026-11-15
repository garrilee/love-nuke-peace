// ===================== 界面·闯关：选关、进度保存、开始页的两个入口、第 1 关的分步教学 =====================
'use strict';

// ---------- 进度：存在浏览器本地。stars[i] 是第 i 关拿到的星数（0 = 还没通过） ----------
const Campaign = {
  data() { const d = Store.get('campaign', null); return d && d.stars ? d : { stars: {} }; },
  stars(i) { return this.data().stars[i] || 0; },
  unlocked(i) { return i === 0 || this.stars(i - 1) > 0; },
  // 下一个该打的关：第一个还没通过的；全通了就是最后一关
  next() { for (let i = 0; i < LEVELS.length; i++) if (!this.stars(i)) return i; return LEVELS.length - 1; },
  save(i, stars) { const d = this.data(); d.stars[i] = Math.max(d.stars[i] || 0, stars); Store.set('campaign', d); },
  // 过关评星：按结束时剩下的人口占自己最高人口的比例
  rate(p) { const f = totalPop(p) / Math.max(1, p.stats.peakPop); return f >= 0.6 ? 3 : f >= 0.3 ? 2 : 1; },
  index() { return G && G.level ? LEVELS.indexOf(G.level) : -1; },
};
const starText = (n) => '★'.repeat(n) + '☆'.repeat(3 - n);

Object.assign(UI, {
  mode: 'camp', levelSel: 0,

  // ---------- 开始页：闯关 / 生存模式 ----------
  initModes() {
    $('tabCamp').onclick = () => this.setMode('camp');
    $('tabSurv').onclick = () => this.setMode('surv');
    const go = Store.get('campSel', null); // 结算页点了「下一关 / 重打」：回到开始页时直接选中那一关
    Store.set('campSel', null);
    this.levelSel = go !== null && Campaign.unlocked(go) ? go : Campaign.next();
    this.setMode(/[?&]room=/.test(location.search) ? 'surv' : go !== null ? 'camp' : Store.get('mode', 'camp'));
  },
  setMode(m) {
    this.mode = m;
    Store.set('mode', m);
    document.body.classList.toggle('mode-camp', m === 'camp');
    document.body.classList.toggle('mode-surv', m === 'surv');
    $('tabCamp').classList.toggle('on', m === 'camp');
    $('tabSurv').classList.toggle('on', m === 'surv');
    this.renderLevels();
    Lobby.render();
  },
  // 能不能点「开始」：闯关要选好关卡和国家；单人生存模式随机分配国家，随时能开
  startReady() { return this.mode === 'camp' ? !!this.pickedRace && Campaign.unlocked(this.levelSel) : true; },
  startLabel() { return this.mode === 'camp' ? `开始第 ${this.levelSel + 1} 关 · ${LEVELS[this.levelSel].name}` : '按下按钮，开始核平'; },
  renderLevels() {
    const box = $('levels');
    if (!box) return;
    box.innerHTML = LEVELS.map((L, i) => {
      const st = Campaign.stars(i), open = Campaign.unlocked(i);
      return `<button class="lv${i === this.levelSel ? ' sel' : ''}${open ? '' : ' locked'}${st ? ' done' : ''}" data-i="${i}">
        <span class="lv-n">${open ? i + 1 : '🔒'}</span><span class="lv-name">${L.name}</span><span class="lv-st">${st ? starText(st) : open ? '未通过' : '未解锁'}</span></button>`;
    }).join('');
    box.querySelectorAll('.lv').forEach((b) => { b.onclick = () => { this.levelSel = +b.dataset.i; this.renderLevels(); Lobby.render(); }; });
    // 选中关卡的说明：敌人、队友、特殊规则
    const L = LEVELS[this.levelSel], open = Campaign.unlocked(this.levelSel);
    const foe = L.enemies.map((e) => { const r = ALL_RACES.find((x) => x.id === e); return r ? `<span class="foe" style="--c:${r.color}">${raceIcon(r.id, 22)}${r.name}</span>` : '<span class="foe">❔ 随机国家</span>'; }).join('');
    const special = L.enemies.map((e) => ALL_RACES.find((x) => x.id === e)).filter((r) => r && (r.special || r.boss));
    $('levelInfo').innerHTML = `<div class="li-title">第 ${this.levelSel + 1} 关 · ${L.name} <span class="li-diff">AI 难度：${DIFFS[L.diff].name}</span></div>
      <div class="li-desc">${L.desc}</div>
      <div class="li-row"><b>敌人</b>${foe}<span class="dim">${L.foeTeam ? '（结盟，不互相打）' : '（各打各的）'}</span></div>
      ${L.allies ? `<div class="li-row"><b>队友</b>${L.allies} 个 AI 队友，不会打你，你也打不了它们。你倒下就算失败。</div>` : ''}
      ${special.map((r) => `<div class="li-row sp" style="--c:${r.color}"><b>${r.name}</b><span>${r.trait}。<i>弱点：${r.weak}</i></span></div>`).join('')}
      ${open ? '' : '<div class="li-lock">🔒 先通过上一关</div>'}`;
  },

  // ---------- 第 1 关：分步教学。每一步做完才出下一步 ----------
  GUIDE: [
    { text: '👋 先选一个打击目标：<b>点地图上任意一个敌国</b>，在弹出的窗口里点「开始打击」。', done: () => G.target >= 0 },
    { text: '💥 发射<b>导弹</b>：点橙色的导弹发射键（键盘 C）。导弹不用研发、飞得快，适合补刀。', done: (f) => f.conv },
    { text: '☢ 发射<b>核包裹</b>：点红色的发射键（键盘 F）。开局就有 5 个，发射键旁边的 ×N 是每次发射的数量。', done: (f) => f.nuke },
    { text: '⚖ <b>国力分配</b>决定你的产出。把「☢ 核武」的滑块拉到 <b>40% 以上</b>，多造一些核包裹。', done: () => G.player.alloc.nuke >= 0.395 },
    { text: '🔬 分给「科技」的国力会自动研发。等第一项科技<b>投送站</b>研发完成（进度在国力分配下面）。嫌慢可以点顶栏的 2× 或 3×。', done: () => has(G.player, 'pad') },
    { text: '🛡 敌人的包裹飞来时，落点会出现红色准星和倒计时。大量来袭就开<b>护盾</b>：现在点一次「护盾」（键盘 B）。', done: (f) => f.shield },
    { text: '🎯 少量来袭靠<b>拦截</b>，默认会自动开启，不用管。再放一群<b>小摩托</b>（蓝色发射键，键盘 D），它们专拆对方的发射设施。', done: (f) => f.drone },
    { text: '✨ 每个国家有一个<b>大招</b>，开局 90 秒后就绪。等它亮起来后点一下（键盘 Q）。', done: () => G.player.stats.ult > 0 },
    { text: '🏁 都学会了。现在把两个对手都核平：人口条最短的最容易打掉，废墟会自动重建，不用管。', done: () => false },
  ],
  initGuide() {
    this.guide = G.level && G.level.tutorial ? { i: 0, f: {}, at: G.t } : null;
    $('guide').classList.toggle('hidden', !this.guide);
    if (this.guide) this.showGuide();
  },
  showGuide() {
    const g = this.guide, S = this.GUIDE[g.i];
    setHTML($('guideBody'), `<span class="g-step">教学 ${g.i + 1} / ${this.GUIDE.length}</span>${S.text}`);
  },
  tickGuide() {
    const g = this.guide;
    if (!g || G.over || !G.player.alive) { if (g) $('guide').classList.add('hidden'); return; }
    if (this.GUIDE[g.i].done(g.f) && g.i < this.GUIDE.length - 1) { g.i++; SFX.click(); this.showGuide(); }
  },
  skipGuide() { this.guide = null; $('guide').classList.add('hidden'); },
});

// 教学步骤需要知道玩家做过什么
Bus.on('launchOrder', (e) => { const g = UI.guide; if (g && e.att === G.player) g.f[e.drone ? 'drone' : e.conv ? 'conv' : 'nuke'] = true; });
Bus.on('skill', (e) => { const g = UI.guide; if (g && e.n === G.player && e.kind === 'shield') g.f.shield = true; });
