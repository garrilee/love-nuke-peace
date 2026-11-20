// ===================== 界面·人口排行榜：按人口排序，人口条 + 核弹数，名次变化箭头；手机默认收起 =====================
'use strict';

Object.assign(UI, {
  rankPrev: {}, rankMove: {},
  initRank() {
    const box = $('rank');
    this.rankPrev = {}; this.rankMove = {};
    this.rankRows = new Map();
    $('rankList').replaceChildren();
    // 电脑：放进左栏（替代原来的「世界各国」）；手机：浮在地图右上角，默认收起
    const docked = !this.mobile();
    if (docked) $('leftcol').appendChild(box); else $('hud').appendChild(box);
    box.classList.toggle('docked', docked);
    // 手机：自动拦截 / 自动重建开关收进 📊 抽屉（国力分配下面），底部操作区只留发射和防御按钮
    // 国力分配：电脑上放在右侧操作栏（左边只留信息：本国数据和排行榜）；手机上留在左上角 📊 的抽屉里
    if (docked) $('rightcol').prepend($('alloc')); else $('leftcol').appendChild($('alloc')); // 电脑上排在最上面：国力分配、打击、防御
    box.classList.toggle('collapsed', !docked);
    // 两侧栏折叠（只在电脑上）
    const fold = (side) => { document.body.classList.toggle('fold' + side); this.syncFold(); Render.fit(); };
    $('foldL').onclick = () => fold('L'); $('foldR').onclick = () => fold('R');
    this.syncFold();
    $('rankList').onclick = (e) => { // 点某一行：设为打击目标
      const el = e.target.closest('.rk-row'), n = el && G.nations[+el.dataset.id];
      if (n && !allied(n, G.player) && n.alive) setTarget(n.id);
    };
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
    const list = $('rankList'), ordered = [...alive, ...dead], keep = new Set();
    for (let i = 0; i < ordered.length; i++) {
      const n = ordered[i]; keep.add(n.id);
      let row = this.rankRows.get(n.id);
      if (!row) {
        const el = $('rankRowTemplate').content.firstElementChild.cloneNode(true);
        const get = (selector) => el.querySelector(selector);
        row = { el, index: get('.rk-i'), icon: get('[data-rank="icon"]'), name: get('[data-rank="name"]'),
          move: get('[data-rank="move"]'), ally: get('[data-rank="ally"]'), pop: get('.rk-p'), stock: get('.rk-k'), bar: get('.rk-bar i'),
          sub: get('.rk-sub'), tech: get('[data-rank="tech"]'), anger: get('.rk-ang'), angerBar: get('.rk-ang i'),
          attacked: get('.rk-atk'), extra: get('.rk-x') };
        el.dataset.id = n.id; this.rankRows.set(n.id, row);
      }
      const pop = totalPop(n), mv = this.rankMove[n.id], moving = mv && mv.until > now;
      const cls = `rk-row${n === me ? ' me' : ''}${G.target === n.id ? ' sel' : ''}${n.alive ? '' : ' dead'}${n.race.boss ? ' boss' : ''}`;
      if (row.el.className !== cls) row.el.className = cls;
      if (row.color !== n.color) { row.el.style.setProperty('--c', n.color); row.color = n.color; }
      setText(row.index, n.alive ? i + 1 : '💀');
      setHTML(row.icon, raceIcon(n.race.id, 16)); setText(row.name, n.name);
      row.ally.classList.toggle('hidden', n === me || !allied(n, me)); // 闯关：队友标签
      setText(row.move, moving ? (mv.up ? '▲' : '▼') : '');
      row.move.classList.toggle('up', !!moving && mv.up); row.move.classList.toggle('down', !!moving && !mv.up);
      row.move.classList.toggle('hidden', !moving);
      setText(row.pop, n.alive ? fmtPop(pop) : ''); setText(row.stock, n.alive ? (n.mods.swarm ? '🐛' + n.drones : '☢' + stock(n)) : ''); // 虫族显示虫子数量
      setStyle(row.bar, 'width', (n.alive ? Math.max(2, Math.round(pop / maxPop * 100)) : 0) + '%');
      const sub = n.alive && n !== me && box.classList.contains('docked'), human = G.mp && n.isPlayer;
      row.sub.classList.toggle('hidden', !sub);
      if (sub) {
        setText(row.tech, `🔬 ${n.techIdx}/${TECHS.length}${human ? ' · 真人玩家' : ''}`);
        row.anger.classList.toggle('hidden', !!human);
        if (!human) setStyle(row.angerBar, 'width', Math.round(clamp(n.anger[me.id] / CFG.ANGER_MAX, 0, 1) * 100) + '%');
        row.attacked.classList.toggle('hidden', !recentAttacker(n));
      }
      const chaos = n.race.boss && n.alive && isChaos(n);
      const open = n.alive && fortOpen(n); // 堡垒国：换班窗口
      const extra = n.race.boss && n.alive ? (chaos ? `🌪 乱纪元中 · ${Math.ceil(n.chaosT)} 秒` :
        n.chaosNext <= 30 ? `🌪 ${Math.ceil(n.chaosNext)} 秒后乱纪元` : '')
        : n.mods.fortress && n.alive ? (open ? `🏰 换班中，没有护盾 · ${Math.ceil(n.fortDown)} 秒` : `🏰 ${Math.ceil(n.fortNext)} 秒后换班`) : '';
      row.extra.classList.toggle('hidden', !extra); row.extra.classList.toggle('chaos', !!chaos); row.extra.classList.toggle('open', open); setText(row.extra, extra);
      // Keep identities (and CSS transitions) stable, moving only rows whose rank changed.
      if (list.children[i] !== row.el) list.insertBefore(row.el, list.children[i] || null);
    }
    for (const [id, row] of this.rankRows) {
      if (!keep.has(id)) { row.el.remove(); this.rankRows.delete(id); }
    }
  },
});
