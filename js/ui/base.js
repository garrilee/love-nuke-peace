// ===================== 界面 =====================
'use strict';

const $ = (id) => document.getElementById(id);
// 只在内容真的变了才写 DOM：HUD 每 0.15 秒刷新一次，没变的部分不再重新渲染
// （不能拿 el.innerHTML 来比较：浏览器会把 HTML 重新格式化，导致每次都"不一样"）
// 小摩托的图标：纸飞机（没有现成的纸飞机 emoji，用一个小 SVG）
// 武器图标：纸飞机（小摩托，机头朝左上）、导弹（弹头朝左上）。页面里用 <i data-icon="…"> 占位，加载时换成这里的 SVG
const PAPER = '<svg class="paper" viewBox="0 0 24 24" aria-hidden="true"><path class="wing" d="M3.8 3.3 19.4 9 15.7 12.6z"/><path class="body" d="M3.8 3.3 15.7 12.6 13.1 15.3z"/><path class="wing2" d="M3.8 3.3 13.1 15.3 9.5 18.9z"/><path class="crease" d="M3.8 3.3 14.4 13.9"/></svg>';
const MISSILE = '<svg class="msl" viewBox="0 0 24 24" aria-hidden="true"><g transform="rotate(-45 12 12)"><path class="flame" d="M10.6 19.2 12 23.6 13.4 19.2z"/><path class="fin" d="M10 14.5 6.8 18.6V20l3.2-1.6zM14 14.5l3.2 4.1V20L14 18.4z"/><path class="hull" d="M12 1.6c1.5 1.4 2 3.4 2 5.6v12H10v-12c0-2.2.5-4.2 2-5.6z"/><path class="nose" d="M12 1.6c1.5 1.4 2 3.4 2 5.6H10c0-2.2.5-4.2 2-5.6z"/><path class="band" d="M10 12.2h4v1.3h-4z"/></g></svg>';
const ICONS = { paper: PAPER, missile: MISSILE };
for (const el of document.querySelectorAll('[data-icon]')) el.outerHTML = ICONS[el.dataset.icon] || '';
const setHTML = (el, html) => { if (el._h !== html) { el._h = html; el.innerHTML = html; } };
const setText = (el, t) => { t = String(t); if (el._t !== t) { el._t = t; el.textContent = t; } };
const setStyle = (el, prop, v) => { const k = '_s_' + prop; if (el[k] !== v) { el[k] = v; el.style[prop] = v; } };
// 本地设置：读写失败（隐私模式等）时静默忽略
const Store = {
  get(k, d) { try { const v = localStorage.getItem('lnp.' + k); return v === null ? d : JSON.parse(v); } catch (_) { return d; } },
  set(k, v) { try { localStorage.setItem('lnp.' + k, JSON.stringify(v)); } catch (_) {} },
};

// 开始界面的国家卡片：只写加成和代价，一句话说清大招
const RACE_CARD = {
  human:    { plus: ['科技 +15%'], minus: [], ult: '15 秒内产出 ×1.7' },
  mole:     { plus: ['护盾减伤 97%', '护盾冷却 -28%'], minus: ['科技 -4%'], ult: '免费护盾 + 回敬 6 枚导弹' },
  octopus:  { plus: ['自带潜航器，造价 -40%', '被拦截 -20%，不会被拒收'], minus: ['火箭造价 +5%'], ult: '30 秒内核弹无法拦截' },
  mushroom: { plus: ['辐射地块人口反而增长', '核弹伤害 -3%'], minus: ['科技 -5%'], ult: '敌国人口停止增长并流失' },
  ai:       { plus: ['科技 +15%', '不怕辐射'], minus: ['人口增长 -30%'], ult: '目标护盾、拦截瘫痪 15 秒，偷 30% 预算' },
  roach:    { plus: ['人口恢复 ×1.33'], minus: ['科技 -10%'], ult: '废墟和宕机设施立即复原' },
};
const UI = {
  pickedRace: null, uiTimer: 0, leaderTimer: 0, bannerTimer: 0, tickerItems: [],

  initStart(onStart) {
    this.initDevPanel();
    const box = $('races');
    box.innerHTML = '';
    for (const r of RACES) {
      const d = document.createElement('div');
      d.className = 'race';
      d.dataset.id = r.id;
      d.style.setProperty('--c', r.color);
      const cd = RACE_CARD[r.id];
      d.innerHTML = `<div class="emo">${raceIcon(r.id, 48)}</div><div class="rn">${r.name}</div>
        ${cd.plus.map((t) => `<div class="rp">＋ ${t}</div>`).join('')}${cd.minus.map((t) => `<div class="rm">－ ${t}</div>`).join('')}
        <div class="ru">${r.ult.icon} ${r.ult.name}：${cd.ult}</div>`;
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
    $('survival').checked = !!Store.get('survival', false);
    $('survival').addEventListener('change', () => Store.set('survival', $('survival').checked));
    this.startSolo = () => {
      const cnt = Math.max(1, +$('aiCount').value), diff = $('aiDiff').value;
      Store.set('race', this.pickedRace); Store.set('aiCount', cnt); Store.set('diff', diff);
      onStart(this.pickedRace, cnt, diff, $('tutorial').checked, null, $('survival').checked);
    };
    $('startBtn').onclick = () => Lobby.start();
    Lobby.init();
  },

  initDevPanel() {
    const panel = $('devPanel'), handle = $('devHandle'), toggle = $('devToggle'), lights = $('devHideLights');
    let drag = null;
    const place = (x, y) => {
      const box = panel.getBoundingClientRect(), margin = 8;
      panel.style.left = clamp(x, margin, Math.max(margin, window.innerWidth - box.width - margin)) + 'px';
      panel.style.top = clamp(y, margin, Math.max(margin, window.innerHeight - box.height - margin)) + 'px';
      panel.style.right = panel.style.bottom = 'auto';
    };
    const close = () => {
      panel.classList.add('hidden');
      toggle.setAttribute('aria-expanded', 'false');
      toggle.focus();
    };
    toggle.onclick = () => {
      if (!panel.classList.contains('hidden')) { close(); return; }
      panel.classList.remove('hidden');
      toggle.setAttribute('aria-expanded', 'true');
      const box = panel.getBoundingClientRect();
      place(box.left, box.top);
      lights.focus();
    };
    $('devClose').onclick = close;
    lights.checked = !Render.cityLightsEnabled;
    lights.onchange = () => { Render.cityLightsEnabled = !lights.checked; };
    handle.onpointerdown = (e) => {
      if (!e.isPrimary || e.button !== 0 || e.target.closest('button')) return;
      const box = panel.getBoundingClientRect();
      drag = { id: e.pointerId, x: e.clientX - box.left, y: e.clientY - box.top };
      handle.setPointerCapture(e.pointerId);
      handle.classList.add('dragging');
      handle.focus();
      e.preventDefault();
    };
    handle.onpointermove = (e) => {
      if (drag && drag.id === e.pointerId) place(e.clientX - drag.x, e.clientY - drag.y);
    };
    const endDrag = (e) => {
      if (!drag || drag.id !== e.pointerId) return;
      drag = null;
      handle.classList.remove('dragging');
      if (handle.hasPointerCapture(e.pointerId)) handle.releasePointerCapture(e.pointerId);
    };
    handle.onpointerup = handle.onpointercancel = handle.onlostpointercapture = endDrag;
    // Keep panel keyboard controls separate from the game's shortcuts.
    panel.onkeydown = (e) => {
      e.stopPropagation();
      if (e.key === 'Escape') { e.preventDefault(); close(); }
      else if (e.target === handle && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
        e.preventDefault();
        const box = panel.getBoundingClientRect(), step = e.shiftKey ? 40 : 10;
        place(box.left + (e.key === 'ArrowRight' ? step : e.key === 'ArrowLeft' ? -step : 0),
          box.top + (e.key === 'ArrowDown' ? step : e.key === 'ArrowUp' ? -step : 0));
      }
    };
    toggle.onkeydown = (e) => e.stopPropagation();
    window.addEventListener('resize', () => {
      if (panel.classList.contains('hidden')) return;
      const box = panel.getBoundingClientRect();
      place(box.left, box.top);
    });
  },

  // 人口走势记录（单机、房主、客户端都在本地记，客户端用快照里的人口）
  recordPop() {
    const H = G.popHist || (G.popHist = []);
    const last = H[H.length - 1];
    if (last && G.t - last.t < 5 && !(G.over && !G.popHistDone)) return;
    if (G.over) G.popHistDone = true;
    H.push({ t: G.t, p: G.nations.map((n) => (n.alive ? Math.round(totalPop(n) * 10) / 10 : 0)) });
  },
  initHUD() {
    $('start').classList.add('hidden');
    $('end').classList.add('hidden');
    $('hud').classList.remove('hidden');
    this.tickerItems = [];
    this.initRank();
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
    // 打击：选目标 + 三行武器（档位键 + 单击发射）
    $('pickTarget').onclick = () => this.openChooser();
    this.popId = -1; $('mapPop').classList.add('hidden');
    $('mapPopGo').onclick = () => { const id = this.popId; this.closeMapPop(); setTarget(id); };
    Fire.init();
    for (const ammo of ['nuke', 'conv', 'drone']) Fire.bind($('pfire-' + ammo), ammo, () => this.popId);
    $('mapPopX').onclick = () => this.closeMapPop();
    for (const ammo of ['nuke', 'conv', 'drone']) { Fire.bind($('fire-' + ammo), ammo); $('lvl-' + ammo).onclick = () => Fire.cycle(ammo); }
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
    const done = techDone(p);
    const tech = prod * a.tech * (p.mods.tech || 1) * sophonMul(p);
    const nuke = prod * a.nuke * CFG.NUKE_MUL * heatEff(p) * midnightProd();
    const def = prod * a.def + CFG.ENERGY_BASE * (G.midnight ? 2 : 1) + (done ? prod * a.tech : 0);
    const set = (k, html) => {
      const el = $('r-' + k);
      if (el._h === html) return;
      setHTML(el, html);
      if (changed) { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
    };
    set('tech', done ? '<span class="dim">已满 · 全部转为能量</span>' : `+${tech.toFixed(1)}<small>点/秒</small>`);
    set('nuke', `+${nuke.toFixed(1)}<small>预算/秒</small>`);
    set('def', `+${def.toFixed(1)}<small>能量/秒</small>`);
    // 军工热度条
    const target = clamp(a.nuke / CFG.HEAT_FULL_AT, 0, 1);
    const trend = target > p.heat + 0.02 ? '▲ 升温中' : target < p.heat - 0.02 ? '▼ 降温中' : '稳定';
    setStyle($('heatBar'), 'width', (p.heat * 100).toFixed(1) + '%');
    setText($('heatTxt'), `效率 ×${heatEff(p).toFixed(2)} · ${trend}`);
  },

  // ---------- 研发区：科技路线 + 当前研发进度 + 第 4 级二选一 ----------
  refreshResearch() {
    const p = G.player, box = $('research');
    if (!box) return;
    const opts = availTechs(p), choosing = !p.research && opts.length > 1;
    const node = (id, label) => `<span class="rt-n${has(p, id) ? ' done' : ''}${p.research === id ? ' cur' : ''}">${label}</span>`;
    const fork = `<span class="rt-fork">${node('lv4', '闪送')}<i>/</i>${node('net', '拦截网')}</span>`;
    const path = [node('pad', '投送站'), node('lv3', '当日达'), node('multi', '分装'), fork, node('lv5', '东风')].join('<b class="rt-ar">›</b>');
    const cur = curTech(p);
    let body;
    if (choosing) {
      const left = Math.max(0, Math.ceil(TECH_PICK_WAIT - (G.t - p.choiceSince)));
      body = `<div class="rt-pick"><div class="rt-q">选择第 4 级路线（${left} 秒后按核武/三防分配自动选）</div>
        <button class="rt-btn atk" data-id="lv4">☢ 闪送<small>主攻 · 4 级包裹</small></button>
        <button class="rt-btn def" data-id="net">🛡 拦截网<small>主防 · 6 发 75%</small></button></div>`;
    } else if (cur) {
      const k = clamp(p.techPts / cur.cost, 0, 1);
      body = `<div class="rt-cur">🔬 ${cur.name}<span class="mono">${Math.floor(Math.min(p.techPts, cur.cost))}/${cur.cost}</span></div><div class="bar rt-bar"><i style="width:${Math.round(k * 100)}%"></i></div>`;
    } else body = '<div class="rt-cur dim">✅ 研发全部完成 · 科技分配转为能量</div>';
    const key = path + body;
    if (box._k === key) return;
    box._k = key;
    setHTML(box, `<div class="rt-path">${path}</div>${body}`);
    for (const b of box.querySelectorAll('.rt-btn')) b.onclick = () => { Act.do({ a: 'research', id: b.dataset.id }); SFX.click && SFX.click(); };
  },
  // 当前生效的倍率：让隐藏机制看得见
  modChips(p) {
    const ud = underdog(p), chips = [];
    if (ud > 1.01) chips.push(`<span class="chip good" title="人口低于存活国家平均值，产出提高（最多 ×${CFG.UNDERDOG_MAX}）；午夜后取消">📈 弱势加成 ×${ud.toFixed(2)}</span>`);
    else if (!G.midnight) chips.push(`<span class="chip" title="人口低于存活国家平均值时，产出会提高（最多 ×${CFG.UNDERDOG_MAX}）">📈 弱势加成 无</span>`);
    const he = heatEff(p);
    chips.push(`<span class="chip ${he >= 1 ? 'good' : 'bad'}" title="军工热度：持续投入核武越来越高效（×${CFG.HEAT_MIN}～×${CFG.HEAT_MAX}）">🏭 军工 ×${he.toFixed(2)}</span>`);
    if (G.midnight) chips.push(`<span class="chip bad" title="午夜后核弹威力和核武产出都在升级">🕛 核弹威力 ×${nukeMul().toFixed(2)} · 产出 ×${midnightProd().toFixed(1)}</span>`);
    if (G.boss && G.boss.alive && p !== G.boss) chips.push(`<span class="chip bad" title="三体人活着时，其他国家科技速度 ×${BOSS_CFG.sophon}">👁 智子封锁 科技 ×${BOSS_CFG.sophon}</span>`);
    return chips.join('');
  },
  buildNationList() {
    const box = $('nations');
    if (!box) return; // 已并入人口排行榜
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
    this.refreshRank();
    this.refreshResearch();
    // 顶栏
    setText($('date'), fmtDate(G.t));
    const mob = this.mobile();
    const spdTxt = G.mp && Net.role !== 'host' ? ` · ${G.speed}×` : ''; // 联机玩家看到房主设定的速度
    setText($('timer'), fmtTime(G.t) + spdTxt);
    const mins = Math.max(0, Math.ceil(17 * (1 - G.t / CFG.MIDNIGHT)));
    setHTML($('doom'), G.midnight ? `🕛 <b class="red">${mob ? '' : '午夜狂欢 · '}☢×${nukeMul().toFixed(2)}</b>` : `🕐 ${mob ? '' : '距午夜 '}<b>${mins}</b> 分`);
    document.body.classList.toggle('midnight', G.midnight);
    $('timer').classList.toggle('urgent', nukeMul() >= CFG.ESC_MAX);
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
      if (!d) continue;
      const pop = totalPop(n);
      const anger = n === G.player ? '' : G.mp && n.isPlayer ? '<div class="small dim">真人玩家</div>' : `<div class="anger" title="对你的怒气"><i style="width:${Math.round(clamp(n.anger[p.id] / CFG.ANGER_MAX, 0, 1) * 100)}%"></i></div>`;
      d.classList.toggle('dead', !n.alive);
      d.classList.toggle('sel', G.target === n.id);
      setHTML(d, `<div class="nh"><span class="emo">${n.race.emoji}</span><b>${n.name}</b>${n === G.player ? '<span class="tag">你</span>' : G.mp && n.isPlayer ? '<span class="tag human">玩家</span>' : ''}${recentAttacker(n) ? '<span class="tag atk" title="最近攻击过你">⚔</span>' : ''}</div>
        <div class="nl">${n.alive ? `👥 ${fmtPop(pop)} · 📦 ${stock(n)} · 🔬 ${n.techIdx}/${TECHS.length}` : '💀 已被核平'}</div>
        ${n.alive ? anger : ''}`);
    }

    // 我方数据
    const prod = production(p);
    setHTML($('stats'), `
      <div class="me-head">${raceIcon(p.race.id, 34)}<b class="me-name">${p.name}</b><span class="me-pop mono">👥 ${fmtPop(totalPop(p))}</span></div>
      <div class="mods">${this.modChips(p)}</div>
      <div class="me-res"><span>💰 预算 <b class="mono">${Math.floor(p.bank)}</b></span><span>⚡ 能量 <b class="mono">${Math.floor(p.energy)}</b><small>/${CFG.ENERGY_CAP}</small></span></div>`);

    // 技能卡：状态文字 + 底部进度条（生效时显示剩余时间，冷却时显示冷却进度）
    setText($('energyTxt'), `⚡ ${Math.floor(p.energy)}/${CFG.ENERGY_CAP}`);
    if (p.hackT > 0) { this.skillCard('shield', `断网 ${p.hackT.toFixed(0)}s`, 'poor', 0); this.skillCard('net', `断网 ${p.hackT.toFixed(0)}s`, 'poor', 0); }
    else if (p.shieldT > 0) this.skillCard('shield', `生效中 ${p.shieldT.toFixed(1)}s`, 'active', p.shieldT / SKILLS.shield.dur);
    else if (p.shieldCd > 0) this.skillCard('shield', `冷却 ${p.shieldCd.toFixed(0)}s`, 'cd', 1 - p.shieldCd / SKILLS.shield.cd);
    else if (p.energy < COSTS.shield) {
      const eRate = production(p) * p.alloc.def + CFG.ENERGY_BASE * (G.midnight ? 2 : 1);
      this.skillCard('shield', eRate > 0 ? `⚡ ${Math.ceil((COSTS.shield - p.energy) / eRate)} 秒后可用` : `需 ⚡${COSTS.shield}`, 'poor', p.energy / COSTS.shield);
    }
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
    el.innerHTML = `<div class="lemo">${raceIcon(n.race.id, 46)}</div><div><div class="lname">${n.name} 领袖</div><div class="ltext">“${text}”</div></div>`;
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
    if (G) this.recordPop();
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
    lines.push(`<b>${TERRAIN_NAME[tile.terrain]}</b>${owner ? ` · <span style="color:${owner.color}">${raceIcon(owner.race.id, 14)}${owner.name}</span>` : ''}`);
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

};
