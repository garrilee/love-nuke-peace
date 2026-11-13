// ===================== 界面·结算画面 =====================
'use strict';

Object.assign(UI, {
  showEnd(kind) {
    const p = G.player;
    const alive = G.nations.filter((n) => n.alive);
    const survivor = alive[0];
    // 排名：活着的在前，其余按坚持的时间（倒下得越晚越靠前）
    const ranked = G.nations.slice().sort((a, b) => (b.alive - a.alive) || ((b.diedAt || 0) - (a.diedAt || 0)) || (totalPop(b) - totalPop(a)));
    // 联机：同一个结局，每个人看到的胜负不同
    if (G.mp && kind !== 'disconnected' && kind !== 'earth') kind = p.alive ? 'win' : 'lose';
    let title, sub;
    if (kind === 'disconnected') { title = '📴 连接中断'; sub = '和房主的连接断开了，这局游戏没法继续。'; }
    else if (kind === 'win') { title = G.boss ? '🏆 人类幸存' : '🏆 核平胜利'; sub = G.boss ? `你在${G.boss.name}的降维打击下活到了最后。` : '恭喜，您统治了一片发着绿光的废墟。'; }
    else if (kind === 'earth') { title = '🌍 地球赢了'; sub = '所有国家同归于尽。鸟儿重新开始歌唱，世界终于和平了。'; }
    else if (survivor && survivor.race.boss && alive.length === 1) { title = '👽 地球被降临'; sub = `${survivor.name}的舰队接管了这颗星球。下一次，记得在乱纪元集中火力。`; }
    else if (survivor && survivor.race.id === 'roach' && p.race.id !== 'roach') { title = '🥉 青铜笑到最后'; sub = '青铜也能越级，打倒所有人。'; }
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
        <div>放飞小摩托 <b>${s.dronesSent}</b></div>
        <div>空战击落 <b>${s.dogKills}</b></div>
        <div>${p.alive ? '活到最后' : '坚持了'} <b>${fmtTime(p.alive ? G.t : p.diedAt || G.t)}</b></div>
      </div>
      <div class="popchart"><div class="pc-title">📈 人口走势</div><canvas id="popChart"></canvas><div id="popLegend" class="pc-legend"></div></div>
      ${G.mp ? `<div class="mprank">${ranked.map((n, i) => `<div class="${n === p ? 'me' : ''}" style="--c:${n.color}"><span>${i + 1}</span>${n.race.emoji} <b>${n.name}</b> ${n.isPlayer || n.netId ? '<span class="tag">玩家</span>' : '<span class="dim small">AI</span>'}<i>${n.alive ? '🏆 存活' : '💀 ' + fmtTime(n.diedAt || 0)}</i></div>`).join('')}</div>` : ''}
      <div class="pers">AI 真实性格：${G.nations.filter((n) => !n.isPlayer && n.pers).map((n) => `${n.race.emoji}${n.name}=${PERSONALITIES[n.pers].name}`).join('　')}</div>
      ${G.mp && kind !== 'disconnected' ? '<div class="endbtns"><button id="roomBtn">回到房间，再来一局</button><button id="againBtn" class="ghost">离开房间</button></div>' : '<button id="againBtn">再核平一次</button>'}`;
    $('end').classList.remove('hidden');
    this.drawPopChart();
    if (G.tutorial) Store.set('tutorialDone', true);
    $('againBtn').onclick = () => { Net.leave(true); location.href = location.pathname; };
    if ($('roomBtn')) $('roomBtn').onclick = () => Net.backToRoom();
  },
  // 结算：全程人口曲线（每个国家一条线，你的最粗；午夜、乱纪元、倒下的时刻都标出来）
  drawPopChart() {
    const cv = $('popChart'), H = G.popHist || [];
    if (!cv || H.length < 2) { if (cv) cv.parentElement.style.display = 'none'; return; }
    const dpr = window.devicePixelRatio || 1, W = cv.clientWidth || 600, Hh = cv.clientHeight || 200;
    cv.width = W * dpr; cv.height = Hh * dpr;
    const x = cv.getContext('2d'); x.scale(dpr, dpr);
    const pl = 38, pr = 10, pt = 10, pb = 22, tMax = H[H.length - 1].t;
    const pMax = Math.max(10, ...H.flatMap((h) => h.p)) * 1.05;
    const X = (t) => pl + (t / tMax) * (W - pl - pr), Y = (p) => pt + (1 - p / pMax) * (Hh - pt - pb);
    x.font = '11px "Microsoft YaHei", sans-serif'; x.fillStyle = '#7f93aa'; x.strokeStyle = 'rgba(255,255,255,0.08)'; x.lineWidth = 1;
    for (let k = 0; k <= 4; k++) { const v = pMax * k / 4, y = Y(v); x.beginPath(); x.moveTo(pl, y); x.lineTo(W - pr, y); x.stroke(); x.textAlign = 'right'; x.fillText(fmtPop(v), pl - 4, y + 4); }
    x.textAlign = 'center';
    for (let m = 0; m * 60 <= tMax; m += tMax > 900 ? 5 : 2) x.fillText(m + '分', X(m * 60), Hh - 6);
    if (tMax > CFG.MIDNIGHT) { // 午夜狂欢分界
      x.strokeStyle = 'rgba(255,60,40,0.55)'; x.setLineDash([4, 4]);
      x.beginPath(); x.moveTo(X(CFG.MIDNIGHT), pt); x.lineTo(X(CFG.MIDNIGHT), Hh - pb); x.stroke(); x.setLineDash([]);
      x.fillStyle = '#ff6b5b'; x.textAlign = 'left'; x.fillText('🕛 午夜', X(CFG.MIDNIGHT) + 4, pt + 10);
    }
    const order = G.nations.slice().sort((a, b) => (a === G.player) - (b === G.player)); // 你的线最后画、在最上面
    for (const n of order) {
      const me = n === G.player;
      x.strokeStyle = me ? '#ffd27a' : n.color; x.lineWidth = me ? 3 : 1.6; x.globalAlpha = me ? 1 : 0.85;
      x.beginPath();
      let deadAt = null;
      H.forEach((h, i) => { const v = h.p[n.id]; const px = X(h.t), py = Y(v); if (i) x.lineTo(px, py); else x.moveTo(px, py); if (deadAt === null && v <= 0 && i) deadAt = h; });
      x.stroke(); x.globalAlpha = 1;
      if (n.diedAt !== undefined) { x.textAlign = 'center'; x.font = '12px sans-serif'; x.fillText('💀', X(Math.min(n.diedAt, tMax)), Y(0) - 4); x.font = '11px "Microsoft YaHei", sans-serif'; }
    }
    setHTML($('popLegend'), G.nations.map((n) => `<span style="--c:${n === G.player ? '#ffd27a' : n.color}"${n === G.player ? ' class="me"' : ''}><i></i>${n.race.emoji}${n.name}</span>`).join(''));
  },
  // 联机：一局结束后回到开始界面的房间里（地图停止推进，连接保持）
  showRoom() {
    running = false;
    SFX.music(false); SFX.tension && SFX.tension(false);
    for (const id of ['hud', 'end', 'mapPop', 'tooltip', 'tip', 'countdown', 'leader', 'banner']) $(id).classList.add('hidden');
    document.body.classList.remove('mp', 'mphost');
    $('start').classList.remove('hidden');
    $('start').scrollTop = 0;
  },
});
