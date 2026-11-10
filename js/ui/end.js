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
    else if (kind === 'win') { title = '🏆 核平胜利'; sub = '恭喜，您统治了一片发着绿光的废墟。'; }
    else if (kind === 'earth') { title = '🌍 地球赢了'; sub = '所有国家同归于尽。鸟儿重新开始歌唱，世界终于和平了。'; }
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
        <div>近防炮击落 <b>${s.ciwsKills}</b></div>
        <div>空战击落 <b>${s.dogKills}</b></div>
        <div>${p.alive ? '活到最后' : '坚持了'} <b>${fmtTime(p.alive ? G.t : p.diedAt || G.t)}</b></div>
      </div>
      ${G.mp ? `<div class="mprank">${ranked.map((n, i) => `<div class="${n === p ? 'me' : ''}" style="--c:${n.color}"><span>${i + 1}</span>${n.race.emoji} <b>${n.name}</b> ${n.isPlayer || n.netId ? '<span class="tag">玩家</span>' : '<span class="dim small">AI</span>'}<i>${n.alive ? '🏆 存活' : '💀 ' + fmtTime(n.diedAt || 0)}</i></div>`).join('')}</div>` : ''}
      <div class="pers">AI 真实性格：${G.nations.filter((n) => !n.isPlayer && n.pers).map((n) => `${n.race.emoji}${n.name}=${PERSONALITIES[n.pers].name}`).join('　')}</div>
      <button id="againBtn">再核平一次</button>`;
    $('end').classList.remove('hidden');
    if (G.tutorial) Store.set('tutorialDone', true);
    $('againBtn').onclick = () => { Net.leave(true); location.href = location.pathname; };
  },
});
