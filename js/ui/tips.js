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
    // 新手引导（按现在的玩法重写：单击发射、科技树、来袭准星、弱势加成、午夜、三体人）
    const mob = this.mobile(), T = { tutorial: true, life: 9 };
    if (t > 1.5) this.tip('start', `👋 开局就有 <b>5 个核包裹</b>。<b>点地图上的敌国</b>，在弹出的窗口里点 ☢ 发射；也可以用${mob ? '下方' : '右侧'}的三个圆形发射键。发射键左边的 <b>×N</b> 切换每次的数量。`, T);
    if (t > 12) this.tip('alloc', `⚖ ${mob ? '左上角 📊 里的' : '右侧的'}<b>国力分配</b>决定产出：科技（研发）、核武（造包裹）、三防（护盾和拦截的能量）。下面的<b>研发路线</b>一路通向东风，第 4 级要在「闪送（主攻）」和「拦截网（主防）」里二选一。`, T);
    if (t > 26) this.tip('conv', `💥 <b>导弹</b>不用研发、飞得快，适合补刀；${PAPER} <b>小摩托</b>便宜量大，专拆对方的投送站。三种武器都是有库存就能发。`, T);
    if (incomingFor(p).some((x) => isThreat(x.p))) this.tip('incoming', '⚠ 有包裹飞向你！落点会出现<b>红色准星和倒计时</b>。少量来袭会<b>自动拦截</b>；来得多就开<b>护盾</b>（B），能量不够时护盾框会显示还要几秒。', T);
    if (p.cities.some((c) => c.ruined)) this.tip('ruin', '🏚 城市变成废墟会冒烟，产出减半。废墟会<b>自动重建</b>，不花任何资源，一次修一座，科技越高修得越快；城市外圈的环是剩余人口。', T);
    if (p.ultCd <= 0 && t >= ULT_FIRST * tScale()) this.tip('ult', `✨ 国家大招就绪：<b>${U.icon} ${U.name}</b>（Q）<br>${U.desc}`, T);
    if (t > 40 && p.alloc.nuke > 0.35 && p.heat < 0.5) this.tip('heat', `🏭 <b>军工热度</b>低时核武产出打折（${mob ? '📊 里' : '左上角'}的「军工 ×」标签），持续投入约 100 秒才能升满，临时转产效率很低。`, T);
    if (t > 60) this.tip('rank', `🏆 ${mob ? '右上角的「人口排行」可以展开' : '左下的人口排行'}看各国人口和核弹数；地图上每个国家标签里的<b>人口条</b>越短，说明它越接近出局。点排行里的国家可以直接设为目标。`, T);
    if (G.crate) this.tip('crate', '📦 地图上落下了<b>空投补给</b>（有光柱的箱子）：点一下就领走，图标就是奖励——☢ 核包裹、⚡ 能量、🔬 科研。手慢会被别国抢走。', T);
    if (G.weather) this.tip('weather', '🌦 顶栏出现了<b>天气</b>图标：它对所有国家同时生效，过一会儿就结束，看图标旁的字和倒计时就行。', T);
    if (!G.midnight && underdog(p) > 1.3) this.tip('underdog', `📈 你的人口落后于平均，<b>弱势加成</b>让产出提高到 ×${underdog(p).toFixed(1)}，趁现在攒核弹反击！（午夜后取消）`, { cd: 150, life: 6 });
    if (!G.midnight && midAt() - t < 30) this.tip('midnight', `🕛 30 秒后<b>午夜狂欢</b>：核弹威力 ×${CFG.ESC_START}、核武产出 ×${CFG.MIDNIGHT_PROD}，之后每 ${Math.round(CFG.ESC_EVERY * tScale() / 60 * 10) / 10} 分钟再升级一次；人口不再加速恢复，弱势加成取消。`, T);
    if (G.midnight) this.tip('nolimit', '⏳ 没有时间限制，打到只剩一个国家。午夜后核弹威力和产出会一直升级，苟是苟不住的。', T);
    // 生存模式：三体人的规则（不受新手提示开关影响，每局提示一次）
    const b = G.boss;
    if (b && b.alive && b !== p) {
      if (t > 5) this.tip('boss', `👽 <b>三体人</b>降临：它平时很硬（伤害打 ${Math.round(b.mods.armor * 10)} 折），还会放<b>降维打击</b>。它的弱点是<b>乱纪元</b>：那 ${BOSS_CFG.chaosDur} 秒里它停产、没有护盾和拦截、受伤 ×${BOSS_CFG.chaosDmg}。平时攒核弹，乱纪元一起发射。`, { life: 11 });
      if (!isChaos(b) && b.chaosNext <= BOSS_CFG.chaosWarn * tScale() + 2) this.tip('chaosSoon', '🌪 三体即将进入<b>乱纪元</b>：把目标切到三体人，准备把库存一次打光！', { cd: 60, life: 6 });
      const dim = (G.dims || []).find((d) => d.tgt === p.id && dimRadius(d) < 0);
      if (dim) this.tip('dimWarn', '🌀 <b>降维打击</b>锁定了你：红圈里的城市会被直接抹掉，外圈按距离受损。开<b>护盾</b>能让外圈损失减半；60 秒后才能重建核心区。', { cd: 60, life: 8 });
    }
    if (G.expand && t > 20) this.tip('expand', '🗺 <b>扩张</b>：每个国家都会自动占领相邻的<b>空地</b>（地图上没有颜色的陆地），每占满一批就多一座新城市或新投送站。被核平的国家留下的土地和城市废墟，也会被邻国接管。', { tutorial: true, life: 10 });
    // 闯关的特殊敌人：每局提示一次规则
    const sw = G.nations.find((x) => x.alive && x.mods.swarm && !allied(x, p)), ft = G.nations.find((x) => x.alive && x.mods.fortress && !allied(x, p));
    if (sw && t > 8) this.tip('swarm', `🐛 <b>虫族</b>没有核弹，靠成群的小摩托啃城市（每只咬掉的人口是普通小摩托的 ${sw.mods.droneDmg} 倍）。<b>护盾</b>能把飞进来的整群烧掉；它没有护盾，核弹对它很有效。`, { life: 10 });
    if (ft && t > (sw ? 30 : 8)) this.tip('fort', `🏰 <b>堡垒国</b>的护盾一直开着，平时打它只有 ${Math.round((1 - SKILLS.shield.reduce) * 100)}% 的伤害。每隔一段时间它要<b>换班</b>，护盾失效 ${FORT_CFG.down} 秒，会提前预警：把库存留到那一刻再打。`, { life: 10 });
    if (ft && !fortOpen(ft) && ft.fortNext <= FORT_CFG.warn + 2) this.tip('fortSoon', '🏰 堡垒国马上<b>换班</b>：把目标切到它，准备把库存一次打光！', { cd: 60, life: 6 });
    if (G.level && G.level.allies && t > 3) this.tip('ally', '🤝 这一关你有<b>队友</b>（地图上名字前有 🤝）：它们不会打你，你也打不了它们。敌人全灭就过关；但<b>你倒下就算失败</b>，哪怕队友还活着。', { life: 10 });
    if (G.rules.night && t > 3) this.tip('night', '🕛 <b>永夜</b>：这一关开局就是午夜狂欢，核弹威力和产出不断升级，没有弱势加成。拖得越久越危险。', { life: 9 });
    if (G.rules.prod && t > 3) this.tip('famine', `🍚 <b>断粮</b>：这一关所有国家的产出只有平时的 ${Math.round(G.rules.prod * 100)}%，午夜也提前到来。别乱打，把包裹留给关键时刻。`, { life: 9 });
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
