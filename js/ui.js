// ===================== 界面 =====================
'use strict';

const $ = (id) => document.getElementById(id);

const UI = {
  pickedRace: null, uiTimer: 0, leaderTimer: 0, bannerTimer: 0, tickerItems: [],

  initStart(onStart) {
    const box = $('races');
    box.innerHTML = '';
    for (const r of RACES) {
      const d = document.createElement('div');
      d.className = 'race';
      d.style.setProperty('--c', r.color);
      d.innerHTML = `<div class="emo">${r.emoji}</div><div class="rn">${r.name}</div>
        <div class="rt">✔ ${r.trait}</div><div class="rw">✘ ${r.weak}</div>
        <div class="rs">专属投送：${r.special}</div>
        <div class="rq">“${r.lines.launch}”</div>`;
      d.onclick = () => {
        this.pickedRace = r.id;
        box.querySelectorAll('.race').forEach((x) => x.classList.remove('sel'));
        d.classList.add('sel');
        $('startBtn').disabled = false;
      };
      box.appendChild(d);
    }
    $('startBtn').onclick = () => onStart(this.pickedRace, +$('aiCount').value);
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
    $('mute').onclick = () => { SFX.setMuted(!SFX.muted); $('mute').textContent = SFX.muted ? '🔇' : '🔊'; };
    // 滑条
    const keys = ['tech', 'nuke', 'def'];
    keys.forEach((k) => {
      const el = $('sl-' + k);
      el.oninput = () => this.setAlloc(k, +el.value / 100);
    });
    this.syncSliders();
    // 技能
    $('sk-shield').onclick = () => useShield(G.player);
    $('sk-net').onclick = () => useNet(G.player);
    $('sk-autonet').checked = true;
    $('sk-autonet').onchange = (e) => { G.player.autoNet = e.target.checked; };
    $('sk-autorebuild').checked = true;
    $('sk-autorebuild').onchange = (e) => { G.player.autoRebuild = e.target.checked; };
    // 打击：选目标 + 两行开火按钮（长按蓄力 / 梭哈）
    $('pickTarget').onclick = () => this.openChooser();
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
    const nuke = prod * a.nuke * CFG.NUKE_MUL * (G.midnight ? 3 : 1);
    const def = prod * a.def + CFG.ENERGY_BASE + (done ? prod * a.tech * 0.5 : 0);
    const set = (k, html) => {
      const el = $('r-' + k);
      if (el.innerHTML === html) return;
      el.innerHTML = html;
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
    $('allocHint').innerHTML = hints.join('<br>');
  },

  buildNationList() {
    const box = $('nations');
    box.innerHTML = '<div class="sect-title">世界各国</div>';
    for (const n of G.nations) {
      const d = document.createElement('div');
      d.className = 'nation' + (n.isPlayer ? ' me' : '');
      d.id = 'nat-' + n.id;
      d.style.setProperty('--c', n.color);
      d.onclick = () => { if (!n.isPlayer && n.alive) setTarget(n.id); };
      box.appendChild(d);
    }
  },

  refreshAll() {
    const p = G.player;
    // 顶栏
    $('date').textContent = fmtDate(G.t);
    $('timer').textContent = `${fmtTime(G.t)} / ${fmtTime(CFG.GAME_END)}`;
    const mins = Math.max(0, Math.ceil(17 * (1 - G.t / CFG.MIDNIGHT)));
    $('doom').innerHTML = G.midnight ? '🕛 <b class="red">午夜狂欢</b>' : `🕐 距午夜 <b>${mins}</b> 分`;
    document.querySelectorAll('#speed button').forEach((b) => b.classList.toggle('on', +b.dataset.speed === G.speed));

    // 各国
    for (const n of G.nations) {
      const d = $('nat-' + n.id);
      const pop = totalPop(n);
      const anger = n.isPlayer ? '' : `<div class="anger" title="对你的怒气"><i style="width:${clamp(n.anger[p.id] / 150, 0, 1) * 100}%"></i></div>`;
      d.classList.toggle('dead', !n.alive);
      d.classList.toggle('sel', G.target === n.id);
      d.innerHTML = `<div class="nh"><span class="emo">${n.race.emoji}</span><b>${n.name}</b>${n.isPlayer ? '<span class="tag">你</span>' : ''}</div>
        <div class="nl">${n.alive ? `👥 ${fmtPop(pop)} · 📦 ${stock(n)} · 🔬 ${n.techIdx}/${TECHS.length}` : '💀 已被核平'}</div>
        ${n.alive ? anger : ''}`;
    }

    // 我方数据
    const prod = production(p);
    const tech = TECHS[p.techIdx];
    const tk = tech ? clamp(p.techPts / tech.cost, 0, 1) : 1;
    const lvStr = [1, 2, 3, 4, 5].filter((k) => p.parcels[k] > 0).map((k) => `<span class="lv lv${k}">${k}级×${p.parcels[k]}</span>`).join(' ') || '<span class="dim">暂无</span>';
    const pads = facOf(p, 'pad');
    const subsOut = p.subs.filter((s) => s.state === 'out');
    $('stats').innerHTML = `
      <div class="sect-title">${p.race.emoji} ${p.name}</div>
      <div class="big">👥 ${fmtPop(totalPop(p))} <span class="dim">产出 ${prod.toFixed(1)}/秒</span></div>
      <div class="techline">🔬 ${tech ? tech.name : '全部解锁'} <span class="bar"><i style="width:${tk * 100}%"></i></span></div>
      <div>📦 包裹 ${lvStr} · <span class="conv">💥 常规×${p.conv}</span></div>
      <div class="dim">🚀 ${has(p, 'pad') ? pads.map((f) => (f.alive ? f.missiles : '✘')).join('/') : '未解锁'} · 🐋 ${has(p, 'sea') ? subsOut.length + '/' + p.subs.length : '未解锁'} · ✈ ${p.ufoReady}${p.ufoReturn.length ? '(+' + p.ufoReturn.length + ')' : ''}</div>
      <div class="dim">💰 预算 ${Math.floor(p.bank)} · ⚡ 能量 ${Math.floor(p.energy)}/${CFG.ENERGY_CAP}</div>`;

    // 技能卡：状态文字 + 底部进度条（生效时显示剩余时间，冷却时显示冷却进度）
    $('energyTxt').textContent = `⚡ ${Math.floor(p.energy)}/${CFG.ENERGY_CAP}`;
    if (p.shieldT > 0) this.skillCard('shield', `生效中 ${p.shieldT.toFixed(1)}s`, 'active', p.shieldT / SKILLS.shield.dur);
    else if (p.shieldCd > 0) this.skillCard('shield', `冷却 ${p.shieldCd.toFixed(0)}s`, 'cd', 1 - p.shieldCd / SKILLS.shield.cd);
    else if (p.energy < COSTS.shield) this.skillCard('shield', `需 ⚡${COSTS.shield}`, 'poor', p.energy / COSTS.shield);
    else this.skillCard('shield', `就绪 · ⚡${COSTS.shield}`, 'ready', 1);
    const netOn = p.netT > 0 && p.netCharges > 0;
    if (netOn) this.skillCard('net', `锁定中 · 剩 ${p.netCharges} 发`, 'active', p.netCharges / netMax(p));
    else if (p.netCd > 0) this.skillCard('net', `冷却 ${p.netCd.toFixed(0)}s`, 'cd', 1 - p.netCd / SKILLS.net.cd);
    else if (p.energy < COSTS.net) this.skillCard('net', `需 ⚡${COSTS.net}`, 'poor', p.energy / COSTS.net);
    else this.skillCard('net', `就绪 · ${netMax(p)} 发 · ${Math.round(netChance(p) * 100)}%`, 'ready', 1);
    // 重建状态
    const ruined = p.cities.filter((c) => c.ruined && c.rebuild <= 0).length;
    const building = p.cities.filter((c) => c.rebuild > 0).length + p.facilities.filter((f) => f.rebuild > 0).length;
    const deadFac = p.facilities.filter((f) => !f.alive && f.rebuild <= 0).length;
    let rs = '🏗 ';
    if (building) rs += `重建中 ${building} 处`;
    if (ruined + deadFac) rs += `${building ? ' · ' : ''}待重建 ${ruined + deadFac} 处${p.autoRebuild ? '（等能量）' : ' · 按 R 重建'}`;
    if (!building && !(ruined + deadFac)) rs += '国土完好';
    $('rebuildStatus').textContent = rs;
    if (!$('chooser').classList.contains('hidden')) this.renderChooser();

    this.updateRates(false);
    this.refreshStrike();
    this.refreshIncoming();
  },

  skillCard(key, text, state, frac) {
    const b = $('sk-' + key);
    const st = $('st-' + key);
    if (st.textContent !== text) st.textContent = text;
    for (const s of ['active', 'cd', 'poor', 'ready']) b.classList.toggle(s, s === state);
    b.disabled = state === 'cd' || state === 'poor';
    $('cd-' + key).style.width = clamp(frac, 0, 1) * 100 + '%';
  },

  refreshStrike() {
    const p = G.player;
    const tgt = G.nations[G.target];
    const hasT = !!(tgt && tgt.alive);
    // 目标按钮 + 地图上方目标条
    $('pickTarget').classList.toggle('set', hasT);
    const tHtml = hasT ? `<span style="color:${tgt.color}">${tgt.race.emoji} ${tgt.name}</span> <span class="small dim">👥${fmtPop(totalPop(tgt))}</span>` : '未选择 · 点击选择';
    if ($('targetName').innerHTML !== tHtml) $('targetName').innerHTML = tHtml;
    const badge = $('targetBadge');
    badge.classList.toggle('hidden', !hasT || !p.alive);
    const bHtml = hasT ? `<span class="lbl">🎯 打击目标</span><span style="color:${tgt.color}">${tgt.race.emoji} ${tgt.name}</span>` : '';
    if (badge.innerHTML !== bHtml) badge.innerHTML = bHtml;

    // 核包裹
    const D = deliverable(p, G.legs);
    $('ct-nuke').textContent = stock(p);
    $('all-nuke').textContent = '×' + D;
    $('sub-nuke').textContent = !bestLevel(p) ? '尚未研发' : `可投送 ${D}` + (D < stock(p) ? '（等运载）' : '');
    // 常规导弹
    $('ct-conv').textContent = p.conv;
    $('all-conv').textContent = '×' + p.conv;
    $('sub-conv').textContent = p.convCd > 0 ? `装填 ${p.convCd.toFixed(1)}s` : `每枚 💰${CONV.cost}`;

    const ok = hasT && p.alive;
    $('fire-nuke').disabled = !ok || D <= 0;
    $('allin-nuke').disabled = !ok || D <= 0;
    $('fire-conv').disabled = !ok || p.conv <= 0;
    $('allin-conv').disabled = !ok || p.conv <= 0;
    Fire.syncIdle();

    let st;
    if (!hasT) st = '先选择打击目标';
    else if (Fire.charging) st = `松开发射 <b class="gold">${Fire.charging.count}</b> ${Fire.charging.ammo === 'nuke' ? '个核包裹' : '枚常规导弹'}`;
    else st = '单击发 1 个 · 按住蓄力 · 梭哈全发';
    if ($('strikeTarget').innerHTML !== st) $('strikeTarget').innerHTML = st;
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
  chooserTargets() { return G.nations.filter((x) => x.alive && !x.isPlayer); },
  renderChooser() {
    const p = G.player;
    $('chooserInfo').textContent = '选定后，地图上方会显示目标，按住开火按钮即可打击。';
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
      const anger = clamp(t.anger[p.id] / 150, 0, 1);
      d.querySelector('.tbody').innerHTML = `<div class="tn">${t.name}</div>
        <div class="dim">👥 ${fmtPop(totalPop(t))} · 📦 ${stock(t)} · 🔬 ${t.techIdx}/${TECHS.length}</div>
        <div class="anger" title="对你的怒气"><i style="width:${anger * 100}%"></i></div>
        <div class="dim small">${anger > 0.6 ? '😡 对你非常愤怒' : anger > 0.3 ? '😠 对你不太友好' : '😐 暂时没盯上你'}</div>`;
    });
  },

  refreshIncoming() {
    const inc = incomingFor(G.player);
    const box = $('incoming');
    SFX.tension(inc.length > 0);
    if (!inc.length) { box.classList.add('hidden'); return; }
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
    box.innerHTML = `<div class="sect-title red">⚠ 包裹来袭 ×${inc.length}</div>${rows}
      <div class="hint">${inc.length > netMax(G.player) ? '<b class="gold">来袭太多！</b>B 开护盾' : 'N 拦截（少量来袭）'} · 或者……回敬一个</div>`;
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

  tick(dt) {
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
      if (c.ruined) lines.push(c.rebuild > 0 ? `🏗 重建中 ${c.rebuild.toFixed(0)}s` : `<span class="red">废墟</span>${owner && owner.isPlayer ? ' · 点击重建（⚡' + COSTS.rebuild + '）' : ''}`);
    }
    if (tile.fac) {
      const f = tile.fac, info = FACILITY_INFO[f.type];
      const mine = owner && owner.isPlayer;
      lines.push(`${info.icon} ${info.name} ${f.alive ? (f.type === 'pad' && mine ? '· 火箭 ' + f.missiles : '') : f.rebuild > 0 ? '· 修复中' : '<span class="red">· 宕机</span>' + (mine ? ' · 点击修复（💰' + COSTS.facility + '）' : '')}`);
    }
    if (tile.rad > 0.03) lines.push(`🌫 灰尘浓度 ${(tile.rad * 100).toFixed(0)}%`);
    el.innerHTML = lines.join('<br>');
    el.classList.remove('hidden');
    el.style.left = Math.min(sx + 16, window.innerWidth - 240) + 'px';
    el.style.top = Math.min(sy + 16, window.innerHeight - 100) + 'px';
  },

  showEnd(kind) {
    const p = G.player;
    const alive = G.nations.filter((n) => n.alive);
    const survivor = alive[0];
    let title, sub;
    if (kind === 'win') { title = '🏆 核平胜利'; sub = '恭喜，您统治了一片发着绿光的废墟。'; }
    else if (kind === 'survive') { title = '🏳 苟活胜利'; sub = '时间到，你是人口最多的那个。你赢了，大概吧。'; }
    else if (kind === 'earth') { title = '🌍 地球赢了'; sub = '所有国家同归于尽。鸟儿重新开始歌唱，世界终于和平了。'; }
    else if (survivor && survivor.race.id === 'roach' && p.race.id !== 'roach') { title = '🌑 长夜降临'; sub = '他们早就告诉过你：最后来收拾的，是他们。'; }
    else if (kind === 'loseRank') { title = '📉 苟活失败'; sub = '时间到，别人比你活得更多一点。'; }
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
        <div>最高人口 <b>${fmtPop(s.peakPop)}</b></div>
      </div>
      <div class="pers">AI 真实性格：${G.nations.filter((n) => !n.isPlayer).map((n) => `${n.race.emoji}${n.name}=${PERSONALITIES[n.pers].name}`).join('　')}</div>
      <button id="againBtn">再核平一次</button>`;
    $('end').classList.remove('hidden');
    $('againBtn').onclick = () => location.reload();
  },
};
