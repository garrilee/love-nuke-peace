// ===================== 界面·人口排行榜：按人口排序，人口条 + 核弹数，名次变化箭头；手机默认收起 =====================
'use strict';

Object.assign(UI, {
  rankPrev: {}, rankMove: {},
  initRank() {
    const box = $('rank');
    this.rankPrev = {}; this.rankMove = {};
    // 电脑：放进左栏（替代原来的「世界各国」）；手机：浮在地图右上角，默认收起
    const docked = !this.mobile();
    if (docked) $('leftcol').appendChild(box); else $('hud').appendChild(box);
    box.classList.toggle('docked', docked);
    box.classList.toggle('collapsed', !docked);
    // 两侧栏折叠（只在电脑上）
    const fold = (side) => { document.body.classList.toggle('fold' + side); this.syncFold(); Render.fit(); };
    $('foldL').onclick = () => fold('L'); $('foldR').onclick = () => fold('R');
    this.syncFold();
    $('rankToggle').onclick = () => { box.classList.toggle('collapsed'); this.refreshRank(); };
    this.refreshRank();
  },
  syncFold() {
    const b = document.body.classList;
    setText($('foldL'), b.contains('foldL') ? '▶' : '◀');
    setText($('foldR'), b.contains('foldR') ? '◀' : '▶');
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
      const sub = n.alive && n !== me && box.classList.contains('docked')
        ? `<div class="rk-sub">🔬 ${n.techIdx}/${TECHS.length}${G.mp && n.isPlayer ? ' · 真人玩家' : `<span class="rk-ang" title="对你的怒气"><i style="width:${Math.round(clamp(n.anger[me.id] / CFG.ANGER_MAX, 0, 1) * 100)}%"></i></span>`}${recentAttacker(n) ? '<b class="rk-atk">⚔ 打过你</b>' : ''}</div>` : '';
      return `<div class="rk-row${n === me ? ' me' : ''}${G.target === n.id ? ' sel' : ''}${n.alive ? '' : ' dead'}${n.race.boss ? ' boss' : ''}" data-id="${n.id}" style="--c:${n.color}">
        <span class="rk-i">${n.alive ? i + 1 : '💀'}</span><span class="rk-n">${raceIcon(n.race.id, 16)} ${n.name}${arrow}</span>
        <span class="rk-p mono">${n.alive ? fmtPop(pop) : ''}</span><span class="rk-k mono">${n.alive ? '☢' + stock(n) : ''}</span>
        <div class="rk-bar"><i style="width:${n.alive ? Math.max(2, Math.round(pop / maxPop * 100)) : 0}%"></i></div>${sub}${extra}</div>`;
    };
    setHTML($('rankList'), alive.map(row).join('') + dead.map((n) => row(n, -1)).join(''));
    for (const el of $('rankList').querySelectorAll('.rk-row')) {
      const n = G.nations[+el.dataset.id];
      el.onclick = () => { if (n !== G.player && n.alive) setTarget(n.id); };
    }
  },
});
