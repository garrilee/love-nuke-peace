// ===================== 界面 =====================
'use strict';

const $ = (id) => document.getElementById(id);
// 只在内容真的变了才写 DOM：HUD 每 0.15 秒刷新一次，没变的部分不再重新渲染
// （不能拿 el.innerHTML 来比较：浏览器会把 HTML 重新格式化，导致每次都"不一样"）
const setHTML = (el, html) => { if (el._h !== html) { el._h = html; el.innerHTML = html; } };
const setText = (el, t) => { t = String(t); if (el._t !== t) { el._t = t; el.textContent = t; } };
const setStyle = (el, prop, v) => { const k = '_s_' + prop; if (el[k] !== v) { el[k] = v; el.style[prop] = v; } };
// 本地设置：读写失败（隐私模式等）时静默忽略
const Store = {
  get(k, d) { try { const v = localStorage.getItem('lnp.' + k); return v === null ? d : JSON.parse(v); } catch (_) { return d; } },
  set(k, v) { try { localStorage.setItem('lnp.' + k, JSON.stringify(v)); } catch (_) {} },
};

const UI = {
  pickedRace: null, uiTimer: 0, leaderTimer: 0, bannerTimer: 0, tickerItems: [],

  initStart(onStart) {
    const box = $('races');
    box.innerHTML = '';
    for (const r of RACES) {
      const d = document.createElement('div');
      d.className = 'race';
      d.dataset.id = r.id;
      d.style.setProperty('--c', r.color);
      d.innerHTML = `<div class="emo">${r.emoji}</div><div class="rn">${r.name}</div>
        <div class="rt">✔ ${r.trait}</div><div class="rw">✘ ${r.weak}</div>
        <div class="rs">大招：${r.ult.icon} ${r.ult.name} — ${r.ult.desc}</div>
        <div class="rq">“${r.lines.launch}”</div>`;
      if (Store.get('race') === r.id) { this.pickedRace = r.id; d.classList.add('sel'); $('startBtn').disabled = false; }
      d.onclick = () => {
        if (d.classList.contains('taken')) return;
        this.pickedRace = r.id;
        box.querySelectorAll('.race').forEach((x) => x.classList.remove('sel'));
        d.classList.add('sel');
        $('startBtn').disabled = false;
        Lobby.pick(r.id);
        Lobby.render();
      };
      box.appendChild(d);
    }
    $('aiCount').value = String(Store.get('aiCount', 3));
    $('aiDiff').value = Store.get('diff', 'normal');
    $('tutorial').checked = !Store.get('tutorialDone', false);
    this.startSolo = () => {
      const cnt = Math.max(1, +$('aiCount').value), diff = $('aiDiff').value;
      Store.set('race', this.pickedRace); Store.set('aiCount', cnt); Store.set('diff', diff);
      onStart(this.pickedRace, cnt, diff, $('tutorial').checked);
    };
    $('startBtn').onclick = () => Lobby.start();
    Lobby.init();
  },

  initHUD() {
    $('start').classList.add('hidden');
    $('end').classList.add('hidden');
    $('hud').classList.remove('hidden');
    this.tickerItems = [];
    // 速度
    document.querySelectorAll('#speed button').forEach((b) => {
      b.onclick = () => { setSpeed(+b.dataset.speed); SFX.click(); };
    });
    $('mute').onclick = () => { SFX.setMuted(!SFX.muted); Store.set('muted', SFX.muted); $('mute').textContent = SFX.muted ? '🔇' : '🔊'; };
    $('mute').textContent = SFX.muted ? '🔇' : '🔊';
    $('btnInfo').onclick = () => $('leftcol').classList.toggle('open');
    // 滑条
    const keys = ['tech', 'nuke', 'def'];
    keys.forEach((k) => {
      const el = $('sl-' + k);
      el.oninput = () => this.setAlloc(k, +el.value / 100);
    });
    this.syncSliders();
    // 技能
    $('sk-shield').onclick = () => Act.do({ a: 'shield' });
    $('sk-net').onclick = () => Act.do({ a: 'net' });
    const U = G.player.race.ult;
    $('ic-ult').textContent = U.icon; $('nm-ult').textContent = U.name;
    $('sk-ult').title = `国家大招 (Q)：${U.name}。${U.desc}。冷却 ${U.cd} 秒，开局 ${ULT_FIRST} 秒后可用。`;
    $('sk-ult').onclick = () => playerUlt();
    $('tipX').onclick = () => this.hideTip();
    this.tipQueue = []; this.tipSeen = new Set(); this.tipCd = {}; this.tipCur = null; this.tipCheckT = 0;
    $('tip').classList.add('hidden'); $('countdown').classList.add('hidden');
    document.body.classList.remove('midnight');
    $('sk-autonet').checked = true;
    $('sk-autonet').onchange = (e) => Act.do({ a: 'toggle', k: 'autoNet', v: e.target.checked });
    $('sk-autorebuild').checked = true;
    $('sk-autorebuild').onchange = (e) => Act.do({ a: 'toggle', k: 'autoRebuild', v: e.target.checked });
    // 打击：选目标 + 两行开火按钮（长按蓄力 / 梭哈）
    $('pickTarget').onclick = () => this.openChooser();
    this.popId = -1; $('mapPop').classList.add('hidden');
    $('mapPopGo').onclick = () => { const id = this.popId; this.closeMapPop(); setTarget(id); };
    $('mapPopX').onclick = () => this.closeMapPop();
    for (const ammo of ['nuke', 'conv']) {
      Fire.bindFire($('fire-' + ammo), ammo);
      Fire.bindAllIn($('allin-' + ammo), ammo);
    }
    this.seenInc = new Set();
    $('chooser').onclick = (e) => { if (e.target.id === 'chooser') this.closeChooser(); };
    this.buildNationList();
    this.refreshAll();
  },

  setAlloc(key, v) {
    const a = G.player.alloc;
    const others = Object.keys(a).filter((k) => k !== key);
    const rest = 1 - v;
    const sum = others.reduce((s, k) => s + a[k], 0);
    a[key] = v;
    others.forEach((k) => { a[k] = sum > 0.0001 ? (a[k] / sum) * rest : rest / 2; });
    Act.do({ a: 'alloc', v: { ...a } });
    this.syncSliders();
  },
  syncSliders() {
    const a = G.player.alloc;
    for (const k of ['tech', 'nuke', 'def']) {
      $('sl-' + k).value = Math.round(a[k] * 100);
      $('v-' + k).textContent = Math.round(a[k] * 100) + '%';
    }
    this.updateRates(true);
  },
  // 国力分配的直观收益：每项每秒增加多少
  updateRates(changed) {
    const p = G.player, a = p.alloc, prod = production(p);
    const done = p.techIdx >= TECHS.length;
    const tech = prod * a.tech * (p.mods.tech || 1);
    const nuke = prod * a.nuke * CFG.NUKE_MUL * heatEff(p) * (G.midnight ? 3 : 1);
    const def = prod * a.def + CFG.ENERGY_BASE + (done ? prod * a.tech * 0.5 : 0);
    const set = (k, html) => {
      const el = $('r-' + k);
      if (el._h === html) return;
      setHTML(el, html);
      if (changed) { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
    };
    set('tech', done ? '<span class="dim">已满</span>' : `+${tech.toFixed(1)}<small>点/秒</small>`);
    set('nuke', `+${nuke.toFixed(1)}<small>预算/秒</small>`);
    set('def', `+${def.toFixed(1)}<small>能量/秒</small>`);
    const t = TECHS[p.techIdx];
    const lv = bestLevel(p) || 1;
    const per = PARCELS[Math.min(lv, 4)].cost + COSTS.rocket / multiK(p);
    const hints = [];
    if (t) hints.push(`下一项【${t.name}】约 ${tech > 0 ? Math.ceil((t.cost - p.techPts) / tech) + ' 秒' : '∞'}`);
    hints.push(`约每 ${nuke > 0 ? (per / nuke).toFixed(0) : '∞'} 秒造出一个包裹`);
    hints.push(`护盾能量 ${def > 0 ? Math.max(0, Math.ceil((COSTS.shield - p.energy) / def)) : '∞'} 秒后够用`);
    setHTML($('allocHint'), hints.join('<br>'));
    // 军工热度条
    const target = clamp(a.nuke / CFG.HEAT_FULL_AT, 0, 1);
    const trend = target > p.heat + 0.02 ? '▲ 升温中' : target < p.heat - 0.02 ? '▼ 降温中' : '稳定';
    setStyle($('heatBar'), 'width', (p.heat * 100).toFixed(1) + '%');
    setText($('heatTxt'), `效率 ×${heatEff(p).toFixed(2)} · ${trend}`);
  },

  buildNationList() {
    const box = $('nations');
    box.innerHTML = '<div class="sect-title">世界各国</div>';
    for (const n of G.nations) {
      const d = document.createElement('div');
      d.className = 'nation' + (n === G.player ? ' me' : '');
      d.id = 'nat-' + n.id;
      d.style.setProperty('--c', n.color);
      d.onclick = () => { if (n !== G.player && n.alive) setTarget(n.id); };
      box.appendChild(d);
    }
  },

  refreshAll() {
    const p = G.player;
    // 顶栏
    setText($('date'), fmtDate(G.t));
    const mob = this.mobile();
    const spdTxt = G.mp && Net.role !== 'host' ? ` · ${G.speed}×` : ''; // 联机玩家看到房主设定的速度
    setText($('timer'), (mob ? fmtTime(G.t) : `${fmtTime(G.t)} / ${fmtTime(CFG.GAME_END)}`) + spdTxt);
    const mins = Math.max(0, Math.ceil(17 * (1 - G.t / CFG.MIDNIGHT)));
    setHTML($('doom'), G.midnight ? '🕛 <b class="red">午夜狂欢</b>' : `🕐 ${mob ? '' : '距午夜 '}<b>${mins}</b> 分`);
    document.body.classList.toggle('midnight', G.midnight);
    $('timer').classList.toggle('urgent', CFG.GAME_END - G.t < 60);
    // 午夜前 10 秒倒计时
    const toMid = CFG.MIDNIGHT - G.t, cd = $('countdown');
    if (!G.midnight && toMid <= 10 && toMid > 0) {
      const k = String(Math.ceil(toMid));
      if (cd.textContent !== k) { cd.textContent = k; cd.classList.remove('hidden'); cd.style.animation = 'none'; void cd.offsetWidth; cd.style.animation = ''; SFX.tick(); }
    } else if (!cd.classList.contains('hidden')) cd.classList.add('hidden');
    document.querySelectorAll('#speed button').forEach((b) => b.classList.toggle('on', +b.dataset.speed === G.speed));

    // 各国
    for (const n of G.nations) {
      const d = $('nat-' + n.id);
      const pop = totalPop(n);
      const anger = n === G.player ? '' : G.mp && n.isPlayer ? '<div class="small dim">真人玩家</div>' : `<div class="anger" title="对你的怒气"><i style="width:${Math.round(clamp(n.anger[p.id] / CFG.ANGER_MAX, 0, 1) * 100)}%"></i></div>`;
      d.classList.toggle('dead', !n.alive);
      d.classList.toggle('sel', G.target === n.id);
      setHTML(d, `<div class="nh"><span class="emo">${n.race.emoji}</span><b>${n.name}</b>${n === G.player ? '<span class="tag">你</span>' : G.mp && n.isPlayer ? '<span class="tag human">玩家</span>' : ''}${recentAttacker(n) ? `<span class="tag atk" title="${Math.floor(attackedAgo(n, p))} 秒前攻击过你">⚔</span>` : ''}</div>
        <div class="nl">${n.alive ? `👥 ${fmtPop(pop)} · 📦 ${stock(n)} · 🔬 ${n.techIdx}/${TECHS.length}` : '💀 已被核平'}</div>
        ${n.alive ? anger : ''}`);
    }

    // 我方数据
    const prod = production(p);
    const tech = TECHS[p.techIdx];
    const tk = tech ? clamp(p.techPts / tech.cost, 0, 1) : 1;
    const lvStr = [1, 2, 3, 4, 5].filter((k) => p.parcels[k] > 0).map((k) => `<span class="lv lv${k}">${k}级×${p.parcels[k]}</span>`).join(' ') || '<span class="dim">暂无</span>';
    const pads = facOf(p, 'pad');
    const subsOut = p.subs.filter((s) => s.state === 'out');
    setHTML($('stats'), `
      <div class="sect-title">${p.race.emoji} ${p.name}</div>
      <div class="big">👥 ${fmtPop(totalPop(p))} <span class="dim">产出 ${prod.toFixed(1)}/秒</span></div>
      <div class="techline">🔬 ${tech ? tech.name : '全部解锁'} <span class="bar"><i style="width:${Math.round(tk * 100)}%"></i></span></div>
      <div>📦 包裹 ${lvStr} · <span class="conv">💥 常规×${p.conv}</span></div>
      <div class="dim">🚀 ${has(p, 'pad') ? pads.map((f) => (f.alive ? f.missiles : '✘')).join('/') : '未解锁'} · 🐋 ${has(p, 'sea') ? subsOut.length + '/' + p.subs.length : '未解锁'} · ✈ ${p.ufoReady}${p.ufoReturn.length ? '(+' + p.ufoReturn.length + ')' : ''}</div>
      <div class="dim">💰 预算 ${Math.floor(p.bank)} · ⚡ 能量 ${Math.floor(p.energy)}/${CFG.ENERGY_CAP}</div>`);

    // 技能卡：状态文字 + 底部进度条（生效时显示剩余时间，冷却时显示冷却进度）
    setText($('energyTxt'), `⚡ ${Math.floor(p.energy)}/${CFG.ENERGY_CAP}`);
    if (p.hackT > 0) { this.skillCard('shield', `断网 ${p.hackT.toFixed(0)}s`, 'poor', 0); this.skillCard('net', `断网 ${p.hackT.toFixed(0)}s`, 'poor', 0); }
    else if (p.shieldT > 0) this.skillCard('shield', `生效中 ${p.shieldT.toFixed(1)}s`, 'active', p.shieldT / SKILLS.shield.dur);
    else if (p.shieldCd > 0) this.skillCard('shield', `冷却 ${p.shieldCd.toFixed(0)}s`, 'cd', 1 - p.shieldCd / SKILLS.shield.cd);
    else if (p.energy < COSTS.shield) this.skillCard('shield', `需 ⚡${COSTS.shield}`, 'poor', p.energy / COSTS.shield);
    else this.skillCard('shield', `就绪 · ⚡${COSTS.shield}`, 'ready', 1);
    const netOn = p.netT > 0 && p.netCharges > 0;
    if (p.hackT > 0) { /* 断网：上面已经处理 */ }
    else if (netOn) this.skillCard('net', `锁定中 · 剩 ${p.netCharges} 发`, 'active', p.netCharges / netMax(p));
    else if (p.netCd > 0) this.skillCard('net', `冷却 ${p.netCd.toFixed(0)}s`, 'cd', 1 - p.netCd / SKILLS.net.cd);
    else if (p.energy < COSTS.net) this.skillCard('net', `需 ⚡${COSTS.net}`, 'poor', p.energy / COSTS.net);
    else this.skillCard('net', `就绪 · ${netMax(p)} 发 · ${Math.round(netChance(p) * 100)}%`, 'ready', 1);
    // 国家大招
    const U = p.race.ult, buffT = p.overtimeT || p.harpoonT;
    if (buffT > 0) this.skillCard('ult', `生效中 ${buffT.toFixed(0)}s`, 'active', buffT / U.dur);
    else if (p.ultCd > 0) this.skillCard('ult', `${p.ultCd.toFixed(0)}s 后就绪`, 'cd', 1 - p.ultCd / (p.stats.ult ? U.cd : ULT_FIRST));
    else if (ultNeedsTarget(p) && !(G.nations[G.target] && G.nations[G.target].alive)) this.skillCard('ult', '就绪 · 先选目标', 'cd', 1);
    else this.skillCard('ult', '就绪！', 'ready', 1);
    // 重建状态
    const ruined = p.cities.filter((c) => c.ruined && c.rebuild <= 0).length;
    const building = p.cities.filter((c) => c.rebuild > 0).length + p.facilities.filter((f) => f.rebuild > 0).length;
    const deadFac = p.facilities.filter((f) => !f.alive && f.rebuild <= 0).length;
    let rs = '🏗 ';
    if (building) rs += `重建中 ${building} 处`;
    if (ruined + deadFac) rs += `${building ? ' · ' : ''}待重建 ${ruined + deadFac} 处${p.autoRebuild ? '（等能量）' : ' · 按 R 重建'}`;
    if (!building && !(ruined + deadFac)) rs += '国土完好';
    setText($('rebuildStatus'), rs);
    if (!$('chooser').classList.contains('hidden')) this.renderChooser();
    if (this.popOpen()) this.renderMapPop();

    this.updateRates(false);
    this.refreshStrike();
    this.refreshIncoming();
  },

  skillCard(key, text, state, frac) {
    const b = $('sk-' + key);
    const st = $('st-' + key);
    setText(st, text);
    for (const s of ['active', 'cd', 'poor', 'ready']) b.classList.toggle(s, s === state);
    b.disabled = state === 'cd' || state === 'poor';
    setStyle($('cd-' + key), 'width', Math.round(clamp(frac, 0, 1) * 100) + '%');
  },

  refreshStrike() {
    const p = G.player;
    const tgt = G.nations[G.target];
    const hasT = !!(tgt && tgt.alive);
    // 目标按钮 + 地图上方目标条
    $('pickTarget').classList.toggle('set', hasT);
    const tHtml = hasT ? `<span style="color:${tgt.color}">${tgt.race.emoji} ${tgt.name}</span> <span class="small dim">👥${fmtPop(totalPop(tgt))}</span>` : '未选择 · 点击选择';
    setHTML($('targetName'), tHtml);
    const badge = $('targetBadge');
    badge.classList.toggle('hidden', !hasT || !p.alive);
    const bHtml = hasT ? `<span class="lbl">🎯 打击目标</span><span style="color:${tgt.color}">${tgt.race.emoji} ${tgt.name}</span>` : '';
    setHTML(badge, bHtml);

    // 核包裹
    const D = deliverable(p, G.legs);
    setText($('ct-nuke'), stock(p));
    setText($('all-nuke'), '×' + D);
    setText($('sub-nuke'), !bestLevel(p) ? '尚未研发' : `可投送 ${D}` + (D < stock(p) ? '（等运载）' : ''));
    // 常规导弹
    setText($('ct-conv'), p.conv);
    setText($('all-conv'), '×' + p.conv);
    setText($('sub-conv'), p.convCd > 0 ? `装填 ${p.convCd.toFixed(1)}s`
      : p.conv < CONV.stockCap && p.convBuildT > 0 ? `生产中 ${p.convBuildT.toFixed(1)}s` : `每枚 💰${CONV.cost}`);

    const ok = hasT && p.alive;
    const holding = (ammo) => !!(Fire.charging && Fire.charging.ammo === ammo); // 按住期间不禁用，保证松手能收到
    $('fire-nuke').disabled = (!ok || D <= 0) && !holding('nuke');
    $('allin-nuke').disabled = !ok || D <= 0;
    $('fire-conv').disabled = (!ok || p.conv <= 0) && !holding('conv');
    $('allin-conv').disabled = !ok || p.conv <= 0;
    Fire.syncIdle();

    let st;
    if (!hasT) st = '先选择打击目标';
    else if (Fire.charging) st = `松开发射 <b class="gold">${Fire.charging.count}</b> ${Fire.charging.ammo === 'nuke' ? '个核包裹' : '枚常规导弹'}`;
    else st = '单击发 1 个 · 按住蓄力 · 梭哈全发';
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
    setText($('chooserInfo'), '选定后，地图上方会显示目标，按住开火按钮即可打击。');
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
        d.innerHTML = `<kbd class="num">${i + 1}</kbd><div class="temo">${t.race.emoji}</div><div class="tbody"></div>`;
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
      + (recentAttacker(t) ? ' <span class="tag atk">⚔ 攻击过你</span>' : '')
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
    const html = `<div class="temo">${n.race.emoji}</div><div class="tbody">${this.nationInfo(n)}</div>`;
    setHTML($('mapPopBody'), html);
    const isT = G.target === n.id, go = $('mapPopGo');
    go.disabled = isT;
    const label = isT ? '✔ 已是打击目标' : '🎯 开始打击';
    setText(go, label);
  },
  closeMapPop() {
    if (this.popId === undefined || this.popId < 0) return;
    if (G && G.selTarget === this.popId) G.selTarget = -1;
    this.popId = -1;
    $('mapPop').classList.add('hidden');
  },
  popOpen() { return this.popId >= 0; },

  refreshIncoming() {
    const inc = incomingFor(G.player);
    const box = $('incoming');
    SFX.tension(inc.length > 0);
    document.body.classList.toggle('inc-on', inc.length > 0); // 来袭面板显示时，提示卡让到下方
    if (!inc.length) { if (!box.classList.contains('hidden')) box.classList.add('hidden'); return; }
    box.classList.remove('hidden');
    // 每一波新来袭只响一次短促警报
    let fresh = false;
    for (const { p } of inc) if (!this.seenInc.has(p.id)) { this.seenInc.add(p.id); fresh = true; }
    if (fresh) SFX.alert();
    const rows = inc.slice(0, 7).map(({ p, left }) => {
      const a = G.nations[p.att];
      const tag = p.kind === 'conv' ? '<span class="lv conv">常规</span> 💥' : `<span class="lv lv${p.lv}">${p.lv}级</span> ${p.kind === 'ufo' ? '✈' : '🚀'}`;
      return `<div class="inc"><span style="color:${a.color}">${a.race.emoji}${a.name}</span> ${tag} <b class="mono">${left.toFixed(1)}s</b></div>`;
    }).join('');
    setHTML(box, `<div class="sect-title red">⚠ 包裹来袭 ×${inc.length}</div>${rows}
      <div class="hint">${inc.length > netMax(G.player) ? '<b class="gold">来袭太多！</b>B 开护盾' : 'N 拦截（少量来袭）'} · 或者……回敬一个</div>`);
  },

  addFeed(text) {
    this.tickerItems.unshift(text);
    this.tickerItems = this.tickerItems.slice(0, 5);
    this.rebuildTicker();
  },
  rebuildTicker() {
    const items = [...this.tickerItems, ...shuffle(NEWS_FILLER.slice()).slice(0, 4)];
    $('tickerInner').textContent = items.join('　　◆　　');
  },

  leader(n, text) {
    const el = $('leader');
    el.style.setProperty('--c', n.color);
    el.innerHTML = `<div class="lemo">${n.race.emoji}</div><div><div class="lname">${n.name} 领袖</div><div class="ltext">“${text}”</div></div>`;
    el.classList.remove('hidden');
    this.leaderTimer = 4.5;
  },
  banner(text) {
    const el = $('banner');
    el.textContent = text; el.classList.remove('hidden');
    el.style.animation = 'none'; void el.offsetWidth; el.style.animation = '';
    this.bannerTimer = 3;
  },

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
    if (t > 14) this.tip('conv', `💥 还没核包裹时，先用<b>常规导弹</b>骚扰：点${this.mobile() ? '下方' : '右侧'}「打击目标」选国家，<b>按住</b>发射键蓄力，松开发射。`, { tutorial: true, life: 9 });
    if (bestLevel(p)) this.tip('nuke', '☢ 核包裹解锁！选好目标后<b>按住</b>核包裹按钮蓄力，数量越涨越快；<b>梭哈</b>一次全发。', { tutorial: true });
    if (incomingFor(p).length) this.tip('incoming', '⚠ 有东西飞过来了！少量来袭会<b>自动拦截</b>；来得多就开<b>护盾</b>（B）。', { tutorial: true });
    if (p.cities.some((c) => c.ruined)) this.tip('ruin', '🏚 城市变成废墟，产出减半。开着<b>自动重建</b>会消耗能量慢慢修好。', { tutorial: true });
    if (p.ultCd <= 0 && t >= ULT_FIRST) this.tip('ult', `✨ 国家大招就绪：<b>${U.icon} ${U.name}</b>（Q）<br>${U.desc}`, { tutorial: true, life: 9 });
    if (t > 30 && p.alloc.nuke > 0.35 && p.heat < 0.5) this.tip('heat', '🏭 <b>军工热度</b>低时核武产出打折，持续投入约 100 秒才能升满。临时转产效率很低。', { tutorial: true });
    if (t > 300) this.tip('score', '📊 时间到时按<b>综合得分 = 人口 + 造成伤亡 × 0.4</b> 排名，光苟着拿不了第一。', { tutorial: true });
    if (!G.midnight && CFG.MIDNIGHT - t < 30) this.tip('midnight', '🕛 30 秒后<b>午夜狂欢</b>：包裹威力 ×1.5、核武预算 ×3，人口不再加速恢复。', { tutorial: true });
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

  tick(dt) {
    if (G && !G.over) {
      this.tipCheckT -= dt;
      if (this.tipCheckT <= 0) { this.tipCheckT = 0.5; this.checkTips(); }
      if (this.tipCur) { this.tipCur.left -= dt; if (this.tipCur.left <= 0) this.hideTip(); }
      else if (this.tipQueue.length) {
        const tp = this.tipQueue.shift();
        this.tipCur = { ...tp, left: tp.life };
        $('tipBody').innerHTML = tp.html;
        const el = $('tip'); el.classList.remove('hidden'); el.style.animation = 'none'; void el.offsetWidth; el.style.animation = '';
      }
    }
    this.uiTimer -= dt;
    if (this.uiTimer <= 0) { this.uiTimer = 0.15; if (G) this.refreshAll(); }
    if (this.leaderTimer > 0) { this.leaderTimer -= dt; if (this.leaderTimer <= 0) $('leader').classList.add('hidden'); }
    if (this.bannerTimer > 0) { this.bannerTimer -= dt; if (this.bannerTimer <= 0) $('banner').classList.add('hidden'); }
  },

  tooltip(tile, sx, sy) {
    const el = $('tooltip');
    if (!tile) { el.classList.add('hidden'); return; }
    const lines = [];
    const owner = tile.owner >= 0 ? G.nations[tile.owner] : null;
    lines.push(`<b>${TERRAIN_NAME[tile.terrain]}</b>${owner ? ` · <span style="color:${owner.color}">${owner.race.emoji}${owner.name}</span>` : ''}`);
    if (tile.city) {
      const c = tile.city;
      lines.push(`🏙 ${c.name}${c.isCapital ? '（首都）' : ''} · 👥 ${fmtPop(c.pop)}`);
      if (c.ruined) lines.push(c.rebuild > 0 ? `🏗 重建中 ${c.rebuild.toFixed(0)}s` : `<span class="red">废墟</span>${owner && owner === G.player ? ' · 点击重建（⚡' + COSTS.rebuild + '）' : ''}`);
    }
    if (tile.fac) {
      const f = tile.fac, info = FACILITY_INFO[f.type];
      const mine = owner && owner === G.player;
      lines.push(`${info.icon} ${info.name} ${f.alive ? (f.type === 'pad' && mine ? '· 火箭 ' + f.missiles : '') : f.rebuild > 0 ? '· 修复中' : '<span class="red">· 宕机</span>' + (mine ? ' · 点击修复（💰' + COSTS.facility + '）' : '')}`);
    }
    if (tile.rad > 0.03) lines.push(`🌫 灰尘浓度 ${(tile.rad * 100).toFixed(0)}%`);
    setHTML(el, lines.join('<br>'));
    el.classList.remove('hidden');
    el.style.left = Math.min(sx + 16, window.innerWidth - 240) + 'px';
    el.style.top = Math.min(sy + 16, window.innerHeight - 100) + 'px';
  },

  showEnd(kind) {
    const p = G.player;
    const alive = G.nations.filter((n) => n.alive);
    const survivor = alive[0];
    const ranked = G.nations.slice().sort((a, b) => (b.alive - a.alive) || (finalScore(b) - finalScore(a)));
    // 联机：同一个结局，每个人看到的胜负不同
    if (G.mp && kind !== 'disconnected' && kind !== 'earth') kind = !p.alive ? 'lose' : kind === 'last' ? 'win' : ranked[0] === p ? 'survive' : 'loseRank';
    let title, sub;
    if (kind === 'disconnected') { title = '📴 连接中断'; sub = '和房主的连接断开了，这局游戏没法继续。'; }
    else if (kind === 'win') { title = '🏆 核平胜利'; sub = '恭喜，您统治了一片发着绿光的废墟。'; }
    else if (kind === 'survive') { title = '🏳 积分胜利'; sub = '时间到，你的综合得分（人口 + 战绩）最高。'; }
    else if (kind === 'earth') { title = '🌍 地球赢了'; sub = '所有国家同归于尽。鸟儿重新开始歌唱，世界终于和平了。'; }
    else if (survivor && survivor.race.id === 'roach' && p.race.id !== 'roach') { title = '🥉 青铜笑到最后'; sub = '青铜也能越级，打倒所有人。'; }
    else if (kind === 'loseRank') { title = '📉 积分落后'; sub = '时间到，别人的综合得分（人口 + 战绩）比你高。光苟着可不够。'; }
    else { title = '💀 你已被核平'; sub = survivor && alive.length === 1 ? `${survivor.race.emoji}${survivor.name} 笑到了最后。` : '剩下的国家还在互相投送包裹……'; }
    const s = p.stats;
    const box = document.querySelector('#end .end-inner');
    box.innerHTML = `<h1>${title}</h1><div class="slogan">${sub}</div>
      <div class="endstats">
        <div>用时 <b>${fmtTime(G.t)}</b></div>
        <div>投送包裹 <b>${s.sent}</b></div>
        <div>成功送达 <b>${s.delivered}</b></div>
        <div>让别人少了 <b>${fmtPop(s.caused)}</b> 人口</div>
        <div>自己少了 <b>${fmtPop(s.lost)}</b> 人口</div>
        <div>打成烟花 <b>${s.intercepted}</b></div>
        <div>护盾挡下 <b>${s.blocked || 0}</b></div>
        <div>重建城市 <b>${s.rebuilt}</b></div>
        <div>大招次数 <b>${s.ult}</b></div>
        <div>综合得分 <b>${Math.round(finalScore(p))}</b></div>
      </div>
      ${G.mp ? `<div class="mprank">${ranked.map((n, i) => `<div class="${n === p ? 'me' : ''}" style="--c:${n.color}"><span>${i + 1}</span>${n.race.emoji} <b>${n.name}</b> ${n.isPlayer || n.netId ? '<span class="tag">玩家</span>' : '<span class="dim small">AI</span>'}<i>${n.alive ? Math.round(finalScore(n)) + ' 分' : '💀'}</i></div>`).join('')}</div>` : ''}
      <div class="pers">AI 真实性格：${G.nations.filter((n) => !n.isPlayer && n.pers).map((n) => `${n.race.emoji}${n.name}=${PERSONALITIES[n.pers].name}`).join('　')}</div>
      <button id="againBtn">再核平一次</button>`;
    $('end').classList.remove('hidden');
    if (G.tutorial) Store.set('tutorialDone', true);
    $('againBtn').onclick = () => { Net.leave(true); location.href = location.pathname; };
  },
};
