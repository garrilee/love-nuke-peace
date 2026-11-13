// ===================== 界面·提示卡：新手引导 + “为什么挨打” =====================
'use strict';

Object.assign(UI, {
  // ---------- 提示卡：新手引导 + “为什么挨打” ----------
  // key：同一条提示只出一次（cd>0 时改为冷却 cd 秒后可再出）；tutorial：只在开启新手提示时显示
  tip(key, html, { cd = 0, tutorial = false, life = 7 } = {}) {
    if (!G || (tutorial && !G.tutorial)) return;
    if (cd) { if (G.t < (this.tipCd[key] ?? -1e9)) return; this.tipCd[key] = G.t + cd; }
    else { if (this.tipSeen.has(key)) return; this.tipSeen.add(key); }
    this.tipQueue = this.tipQueue.filter((t) => t.key !== key);
    this.tipQueue.push({ key, html, life });
    if (this.tipQueue.length > 3) this.tipQueue.shift();
  },
  hideTip() { $('tip').classList.add('hidden'); this.tipCur = null; },
  checkTips() {
    const p = G.player;
    if (!p.alive || G.over) return;
    const t = G.t, U = p.race.ult;
    // 新手引导
    if (t > 1.5) this.tip('start', `👋 欢迎！${this.mobile() ? '左上角 📊 里的' : '左侧'}<b>国力分配</b>决定科技、核武、三防的产出。前期多投<b>科技</b>，尽快解锁核包裹。`, { tutorial: true, life: 9 });
    if (t > 14) this.tip('conv', `💥 还没核包裹时，先用<b>常规导弹</b>骚扰：点${this.mobile() ? '下方' : '右侧'}「打击目标」选国家，点发射键发射（一次 2 枚）。`, { tutorial: true, life: 9 });
    if (bestLevel(p)) this.tip('nuke', '☢ 开局就有 5 个核包裹：选好目标后点发射按钮投送；按钮左边的 <b>×1</b> 可以切换每次 1 / 3 / 5 / 全部。点地图上的敌国也能直接打。', { tutorial: true });
    if (incomingFor(p).length) this.tip('incoming', '⚠ 有东西飞过来了！少量来袭会<b>自动拦截</b>；来得多就开<b>护盾</b>（B）。', { tutorial: true });
    if (p.cities.some((c) => c.ruined)) this.tip('ruin', '🏚 城市变成废墟，产出减半。开着<b>自动重建</b>会消耗能量慢慢修好。', { tutorial: true });
    if (p.ultCd <= 0 && t >= ULT_FIRST) this.tip('ult', `✨ 国家大招就绪：<b>${U.icon} ${U.name}</b>（Q）<br>${U.desc}`, { tutorial: true, life: 9 });
    if (t > 30 && p.alloc.nuke > 0.35 && p.heat < 0.5) this.tip('heat', '🏭 <b>军工热度</b>低时核武产出打折，持续投入约 100 秒才能升满。临时转产效率很低。', { tutorial: true });
    if (t > 50) this.tip('drone', PAPER + ' <b>小摩托</b>生产快、飞得慢、拦截弹很难打中，适合拆敌国的投送站、消耗对方的防空。按 D 或点小摩托按钮放飞（一次 5 架）。', { tutorial: true, life: 9 });
    if (t > 300) this.tip('nolimit', '⏳ 没有时间限制，打到只剩一个国家。午夜后核弹威力会越来越大，苟是苟不住的。', { tutorial: true });
    if (!G.midnight && underdog(G.player) > 1.3) this.tip('underdog', `📈 你的人口落后于平均，<b>弱势加成</b>让产出提高到 ×${underdog(G.player).toFixed(1)}，趁现在攒核弹反击！（午夜后取消）`, { cd: 150, life: 6 });
    if (!G.midnight && CFG.MIDNIGHT - t < 30) this.tip('midnight', '🕛 30 秒后<b>午夜狂欢</b>：包裹威力 ×1.25、核武预算 ×3.5，人口不再加速恢复。', { tutorial: true });
    // 局势提醒（始终开启，有冷却）
    const alive = G.nations.filter((x) => x.alive);
    const idle = t - Math.max(p.lastAttack, 60);
    if (t > 90 && idle > CFG.BYSTANDER_AFTER - 15 && alive.length > 2)
      this.tip('idle', `👀 你已经 ${Math.round(idle)} 秒没出手了。再观望下去会被当成<b>隔岸观火</b>，各国都会更恨你。`, { cd: 90 });
    if (p.intelUntil < t && stock(p) >= CFG.INTEL_STOCK - 5 && alive.length > 2)
      this.tip('stock', `📦 你囤了 ${stock(p)} 个核包裹。超过 ${CFG.INTEL_STOCK} 个会被情报机构<b>点名</b>，遭到围攻。`, { cd: 90 });
    const others = alive.filter((x) => x !== p);
    if (others.length >= 2 && p.intelUntil < t && p.techIdx - Math.max(...others.map((o) => o.techIdx)) === CFG.INTEL_TECH_LEAD - 1)
      this.tip('techlead', '🔬 你的科技已经明显领先，再拉开差距会被情报<b>点名</b>，别光顾着闷头研发。', { cd: 120 });
    if (others.length >= 2 && others.every((o) => totalPop(o) * 1.3 < totalPop(p)))
      this.tip('bird', '🐦 你的人口遥遥领先，成了<b>出头鸟</b>，大家都更想打你。', { cd: 150 });
  },
  mobile() { return document.body.classList.contains('compact'); },
});
