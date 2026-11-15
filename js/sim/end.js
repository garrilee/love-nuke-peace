// ===================== 模拟·结束：胜负判定与结算 =====================
'use strict';

function checkEnd() {
  const alive = G.nations.filter((n) => n.alive);
  // 没有时间限制：打到只剩一个国家才结束
  if (G.mp) { // 联机：有人阵亡不结束（观战），最后剩一个国家或真人全部阵亡才结束；胜负由各自客户端判定
    if (!alive.length) return endGame('earth');
    if (alive.length === 1) return endGame('last');
    if (G.t > 5 && !alive.some((n) => n.isPlayer)) return endGame('humansDead');
    return;
  }
  if (!alive.length) return endGame('earth');
  if (!G.player.alive) return endGame('lose');            // 你倒下就算输，哪怕队友还活着
  if (!alive.some((n) => !allied(n, G.player))) return endGame('win'); // 敌人全灭就算赢，队友活不活都行
}
// 终局综合得分：活着的人口 + 造成的伤亡（只苟着不打，得分不会高）
function endGame(kind) {
  if (G.over) return;
  G.over = kind;
  Bus.emit('gameover', kind);
}
