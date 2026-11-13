// ===================== 界面·人口排行榜：按人口排序，人口条 + 核弹数，名次变化箭头；手机默认收起 =====================
'use strict';

Object.assign(UI, {
  rankPrev: {}, rankMove: {},
  initRank() {
    const box = $('rank');
    this.rankPrev = {}; this.rankMove = {};
    box.classList.toggle('collapsed', this.mobile());
    $('rankToggle').onclick = () => { box.classList.toggle('collapsed'); this.refreshRank(); };
    this.refreshRank();
  },
  refreshRank() {
    const box = $('rank');
    if (!box || !G) return;
    const alive = G.nations.filter((n) => n.alive).sort((a, b) => totalPop(b) - totalPop(a));
    const dead = G.nations.filter((n) => !n.alive).sort((a, b) => (b.diedAt || 0) - (a.diedAt || 0));
    const maxPop = Math.max(1, ...alive.map(totalPop));
    const me = G.player, myRank = alive.indexOf(me) + 1;
    setText($('rankToggle'), `🏆 人口排行${myRank ? ` · 你第 ${myRank}` : ''} ${box.classList.contains('collapsed') ? '▾' : '▴'}`);
    if (box.classList.contains('collapsed')) return;
    const now = G.t;
    alive.forEach((n, i) => {
      const prev = this.rankPrev[n.id];
      if (prev !== undefined && prev !== i) this.rankMove[n.id] = { up: i < prev, until: now + 4 };
      this.rankPrev[n.id] = i;
    });
    const row = (n, i) => {
      const pop = totalPop(n), mv = this.rankMove[n.id], arrow = mv && mv.until > now ? (mv.up ? '<i class="up">▲</i>' : '<i class="down">▼</i>') : '';
      let extra = '';
      if (n.race.boss && n.alive) {
        if (isChaos(n)) extra = `<div class="rk-x chaos">🌪 乱纪元中 · ${Math.ceil(n.chaosT)} 秒</div>`;
        else if (n.chaosNext <= 30) extra = `<div class="rk-x">🌪 ${Math.ceil(n.chaosNext)} 秒后乱纪元</div>`;
      }
      return `<div class="rk-row${n === me ? ' me' : ''}${n.alive ? '' : ' dead'}${n.race.boss ? ' boss' : ''}" data-id="${n.id}" style="--c:${n.color}">
        <span class="rk-i">${n.alive ? i + 1 : '💀'}</span><span class="rk-n">${n.race.emoji} ${n.name}${arrow}</span>
        <span class="rk-p mono">${n.alive ? fmtPop(pop) : ''}</span><span class="rk-k mono">${n.alive ? '☢' + stock(n) : ''}</span>
        <div class="rk-bar"><i style="width:${n.alive ? Math.max(2, Math.round(pop / maxPop * 100)) : 0}%"></i></div>${extra}</div>`;
    };
    setHTML($('rankList'), alive.map(row).join('') + dead.map((n) => row(n, -1)).join(''));
    for (const el of $('rankList').querySelectorAll('.rk-row')) {
      const n = G.nations[+el.dataset.id];
      el.onclick = () => { if (n !== G.player && n.alive) setTarget(n.id); };
    }
  },
});
