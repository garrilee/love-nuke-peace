// ===================== 界面·打击：三种武器的发射按钮、档位、圆环；选目标；地图浮窗；来袭 =====================
'use strict';

// ---------- 开火：按指定数量向当前目标发射 ----------
const AMMO = {
  nuke:  { name: '核包裹',   unit: '个', icon: '☢' },
  conv:  { name: '常规导弹', unit: '枚', icon: '💥' },
  drone: { name: '小摩托',   unit: '架', icon: '' },
};
function playerFire(ammo, count) {
  const p = G.player, tgt = G.nations[G.target];
  if (!tgt || !tgt.alive || !p.alive || count <= 0) return 0;
  let sent = Act.do({ a: 'fire', ammo, count, tgt: tgt.id });
  if (sent === null) sent = Math.min(count, fireMax(ammo)); // 联机客户端：命令已发给房主，按预计数量提示
  const A = AMMO[ammo];
  if (sent) UI.banner(`${A.icon ? A.icon + ' ' : ''}${ammo === 'nuke' ? '已投送' : ammo === 'drone' ? '放飞' : '发射'} ${sent} ${A.unit}${A.name} → ${tgt.race.emoji}${tgt.name}`);
  UI.refreshStrike();
  return sent;
}

// 一次最多能发多少：核包裹看运载，导弹一次最多 5 枚，小摩托不限
const fireMax = (ammo) => {
  const p = G.player;
  if (ammo === 'conv') return Math.min(p.conv, CONV.perLaunch);
  if (ammo === 'drone') return p.drones;
  return deliverable(p, G.legs);
};

// ---------- 单击发射 ----------
// 每种武器一个档位键，点一下切换每次发射的数量（0 = 全部），档位会记住
const FIRE_LEVELS = { nuke: [1, 3, 5, 0], conv: [2, 5], drone: [5, 10, 0] };
const Fire = {
  lvl: {},
  shown: {},        // 圆环当前画到的位置（平滑跟随）
  nk: {},           // 核包裹圆环：上次库存 +1 的时间、平均间隔
  init() {
    for (const ammo in FIRE_LEVELS) this.lvl[ammo] = clamp(Store.get('fireLvl-' + ammo, 0) | 0, 0, FIRE_LEVELS[ammo].length - 1);
  },
  level(ammo) { return FIRE_LEVELS[ammo][this.lvl[ammo] || 0]; },
  lvText(ammo) { const v = this.level(ammo); return v ? '×' + v : '全部'; },
  cycle(ammo) {
    this.lvl[ammo] = ((this.lvl[ammo] || 0) + 1) % FIRE_LEVELS[ammo].length;
    Store.set('fireLvl-' + ammo, this.lvl[ammo]);
    SFX.click();
    this.syncIdle();
    UI.refreshStrike();
  },
  // 按钮规则只有一条：有库存就能点（不够档位的数量就有几个发几个，没有装填间隔）。
  // 没选目标时也能点，点了提示先选目标
  canFire(ammo) {
    return G.player.alive && fireMax(ammo) >= 1;
  },
  btns(ammo) { return [$('fire-' + ammo), $('pfire-' + ammo)].filter(Boolean); },
  // 点一下发射：all = 全部（Shift）；tgtId：地图浮窗里的按钮打浮窗上的国家（同时设为目标）
  tap(ammo, tgtId, all = false) {
    const tid = tgtId !== undefined ? tgtId : G.target, t = G.nations[tid];
    if (!t || !t.alive || t === G.player) { UI.banner('🎯 先选择打击目标（Tab 或点击地图上的敌国）'); return; }
    if (!this.canFire(ammo)) return;
    if (tid !== G.target) setTarget(tid);
    const v = this.level(ammo), max = fireMax(ammo), n = all || !v ? max : Math.min(v, max);
    const sent = playerFire(ammo, n);
    if (sent > 0) this.flash(ammo, '−' + sent);
  },
  // 点击反馈：按钮缩一下，上方飘出数量
  flash(ammo, text) {
    for (const b of this.btns(ammo)) {
      if (!b.offsetParent) continue;
      b.classList.remove('tapped'); void b.offsetWidth; b.classList.add('tapped');
      const f = document.createElement('span');
      f.className = 'fly'; f.textContent = text;
      b.appendChild(f);
      setTimeout(() => f.remove(), 800);
    }
  },
  // 圆环：下一个的生产进度（转满一圈库存 +1）
  // 逻辑每 0.1 秒才走一步，这里用 G.interp 补上两步之间流逝的时间，圆环每帧都在动
  progress(ammo) {
    const p = G.player, dt = G.speed > 0 ? (G.interp || 0) : 0;
    const timer = (left, total) => clamp(1 - (left - dt) / total, 0, 1);
    if (ammo === 'conv') {
      return p.conv >= CONV.stockCap || !(p.convBuildT > 0) ? 1 : timer(p.convBuildT, CONV.buildTime); // 开局时计时还没有值：按满圈处理
    }
    if (ammo === 'drone') {
      return p.drones >= DRONE.stockCap || !(p.droneBuildT > 0) ? 1 : timer(p.droneBuildT, DRONE.buildTime);
    }
    // 核包裹：预算还要分给火箭、潜航器，攒钱进度会忽多忽少。改按"距离上次库存 +1 过了多久 ÷ 平均间隔"来转，
    // 一直匀速往前走，库存 +1 时重新开始
    if (!bestLevel(p)) return 0; // 还没研发：不生产
    const st = stock(p), now = G.t + dt, k = this.nk;
    if (k.t === undefined || now < k.t) { k.t = now; k.st = st; }
    if (st > k.st && now - k.t > 0.05) { // 库存增加（同一步买了好几个只算一次）
      const gap = now - k.t;
      k.ema = k.ema ? clamp(k.ema * 0.6 + gap * 0.4, 1.5, 30) : clamp(gap, 1.5, 30);
      k.t = now;
    }
    k.st = st;
    if (st >= CFG.STOCK_CAP) return 1;
    const x = (now - k.t) / (k.ema || 8); // 比平均慢时不会顶住不动，而是越转越慢地逼近满圈
    return x < 0.85 ? Math.max(0, x) : 0.85 + 0.14 * (1 - Math.exp(-(x - 0.85) * 4));
  },
  tick(real = 0) {
    const p = G.player;
    if (!p.alive) return;
    for (const ammo of ['nuke', 'conv', 'drone']) {
      const target = this.progress(ammo);
      let v = this.shown[ammo];
      // 转满一圈又从头开始：直接跳回起点；其余时候只往前走、不往回退（数据抖一下也不会反转），并平滑跟随
      if (!Number.isFinite(v) || target < v - 0.25) v = target;
      else if (target > v) v += (target - v) * Math.min(1, real * 14);
      this.shown[ammo] = v;
      const dis = !this.canFire(ammo); // 每帧更新：库存一有就立刻亮起来
      for (const el of this.btns(ammo)) {
        if (el.disabled !== dis) el.disabled = dis;
        setStyle(el.querySelector('.prog'), 'strokeDashoffset', (170 * (1 - v)).toFixed(1));
      }
    }
  },
  syncIdle() {
    for (const ammo of ['nuke', 'conv', 'drone']) {
      setText($('lvl-' + ammo), this.lvText(ammo));
      setText($('plv-' + ammo), this.lvText(ammo));
    }
  },
  bind(btn, ammo, getTgt) {
    btn.onclick = () => { if (!btn.disabled) this.tap(ammo, getTgt ? getTgt() : undefined); };
  },
};

Object.assign(UI, {
  refreshStrike() {
    const p = G.player;
    const tgt = G.nations[G.target];
    const hasT = !!(tgt && tgt.alive);
    // 目标按钮 + 地图上方目标条
    $('pickTarget').classList.toggle('set', hasT);
    const tHtml = hasT ? `<span style="color:${tgt.color}">${raceIcon(tgt.race.id, 16)} ${tgt.name}</span> <span class="small dim">👥${fmtPop(totalPop(tgt))}</span>` : '未选择 · 点击选择';
    setHTML($('targetName'), tHtml);
    const badge = $('targetBadge');
    badge.classList.toggle('hidden', !hasT || !p.alive);
    const bHtml = hasT ? `<span class="lbl">🎯 打击目标</span><span style="color:${tgt.color}">${raceIcon(tgt.race.id, 18)} ${tgt.name}</span>` : '';
    setHTML(badge, bHtml);

    // 核包裹
    setText($('ct-nuke'), stock(p));
    setText($('sub-nuke'), stock(p) ? '有库存就能发射' : '生产中');
    // 导弹：库存上限 10，一次最多 5 枚
    setText($('ct-conv'), p.conv);
    setText($('sub-conv'), p.conv < CONV.stockCap && p.convBuildT > 0 ? `生产中 · 上限 ${CONV.stockCap}` : `一次最多 ${CONV.perLaunch} 枚`);
    // 小摩托：库存上限 20，一次发射不限
    setText($('ct-drone'), p.drones);
    setText($('sub-drone'), p.drones < DRONE.stockCap && p.droneBuildT > 0 ? `生产中 · 上限 ${DRONE.stockCap}` : `上限 ${DRONE.stockCap} · 慢但难拦`);

    Fire.syncIdle(); // 按钮能不能点由 Fire.tick 每帧统一更新

    let st;
    if (!hasT) st = '点击地图上的敌国，或按 Tab 选目标';
    else st = '点圆形按钮发射 · 左边 ×N 切换每次数量';
    setHTML($('strikeTarget'), st);
  },

  openChooser() {
    if (!G.player.alive) return;
    $('chooser').classList.remove('hidden');
    this.renderChooser();
    SFX.click();
  },
  closeChooser() {
    $('chooser').classList.add('hidden');
    G.selTarget = -1;
  },
  chooserTargets() { return G.nations.filter((x) => x.alive && x !== G.player); },
  renderChooser() {
    const p = G.player;
    setText($('chooserInfo'), '选定后，地图上方会显示目标，点开火按钮即可打击。');
    const list = $('chooserList');
    const targets = this.chooserTargets();
    const sig = targets.map((t) => t.id).join(',');
    if (list.dataset.sig !== sig) {
      list.dataset.sig = sig;
      list.innerHTML = '';
      targets.forEach((t, i) => {
        const d = document.createElement('div');
        d.className = 'tcard'; d.style.setProperty('--c', t.color); d.dataset.id = t.id;
        d.onclick = () => { setTarget(t.id); this.closeChooser(); };
        d.onmouseenter = () => { G.selTarget = t.id; };
        d.onmouseleave = () => { G.selTarget = -1; };
        d.innerHTML = `<kbd class="num">${i + 1}</kbd><div class="temo">${raceIcon(t.race.id, 34)}</div><div class="tbody"></div>`;
        list.appendChild(d);
      });
    }
    list.querySelectorAll('.tcard').forEach((d) => {
      const t = G.nations[+d.dataset.id];
      d.classList.toggle('human', G.mp && t.isPlayer);
      const html = this.nationInfo(t);
      setHTML(d.querySelector('.tbody'), html);
    });
  },
  // 一个国家的简要情报：选目标窗口和地图浮窗共用
  nationInfo(t) {
    const p = G.player, human = G.mp && t.isPlayer;
    const tags = (human ? ' <span class="tag human">👤 玩家</span>' : '')
      + (recentAttacker(t) ? ' <span class="tag atk">⚔ 最近攻击过你</span>' : '')
      + (t.name !== t.race.name ? ` <span class="dim small">${t.race.emoji}${t.race.name}</span>` : '')
      + (G.target === t.id ? ' <span class="tag tgt">🎯 当前目标</span>' : '');
    const head = `<div class="tn"><span class="nm" title="${t.name}">${t.name}</span>${tags}</div>
      <div class="dim">👥 ${fmtPop(totalPop(t))} · 📦 ${stock(t)} · 🔬 ${t.techIdx}/${TECHS.length}</div>`;
    if (human) return head + '<div class="dim small">🧠 真人玩家：没有怒气条，下一步全看心情</div>';
    const anger = clamp(t.anger[p.id] / CFG.ANGER_MAX, 0, 1);
    return head + `<div class="anger" title="对你的怒气"><i style="width:${anger * 100}%"></i></div>
      <div class="dim small">${anger > 0.6 ? '😡 对你非常愤怒' : anger > 0.3 ? '😠 对你不太友好' : '😐 暂时没盯上你'}</div>`;
  },

  // ---------- 地图浮窗：点击其他国家，弹出情报 + 「开始打击」 ----------
  openMapPop(n, sx, sy) {
    if (!n || !n.alive || n === G.player || !G.player.alive) return this.closeMapPop();
    this.popId = n.id;
    const el = $('mapPop');
    el.style.setProperty('--c', n.color);
    el.classList.remove('hidden');
    this.renderMapPop();
    // 放在点击位置旁边，不超出屏幕
    const w = el.offsetWidth, h = el.offsetHeight;
    el.style.left = clamp(sx + 14, 8, window.innerWidth - w - 8) + 'px';
    el.style.top = clamp(sy - h / 2, 52, window.innerHeight - h - 30) + 'px';
    G.selTarget = n.id; // 地图上高亮这个国家
    SFX.click();
  },
  renderMapPop() {
    const n = G.nations[this.popId];
    if (!n || !n.alive || !G.player.alive) return this.closeMapPop();
    const html = `<div class="temo">${raceIcon(n.race.id, 34)}</div><div class="tbody">${this.nationInfo(n)}</div>`;
    setHTML($('mapPopBody'), html);
    const p = G.player, go = $('mapPopGo'), isT = G.target === n.id;
    go.classList.toggle('hidden', isT);
    for (const ammo of ['nuke', 'conv', 'drone']) setText($('pct-' + ammo), ammo === 'nuke' ? stock(p) : ammo === 'conv' ? p.conv : p.drones);
  },
  closeMapPop() {
    if (this.popId === undefined || this.popId < 0) return;
    if (G && G.selTarget === this.popId) G.selTarget = -1;
    this.popId = -1;
    $('mapPop').classList.add('hidden');
  },
  popOpen() { return this.popId >= 0; },

  // 来袭：只保留紧张背景音和每一波新来袭的短促警报（地图上方的来袭弹框已去掉）
  refreshIncoming() {
    const inc = incomingFor(G.player).filter((x) => isThreat(x.p));
    SFX.tension(inc.length > 0);
    let fresh = false;
    for (const { p } of inc) if (!this.seenInc.has(p.id)) { this.seenInc.add(p.id); fresh = true; }
    if (fresh) SFX.alert();
  },
});
