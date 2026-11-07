// ===================== 热爱核平 · 配置与数值（街机沙盒版）=====================
'use strict';

const CFG = {
  SIM_DT: 0.1,
  MAP_COLS: 40,
  MAP_ROWS: 24,
  HEX: 14,
  MIDNIGHT: 720,          // 12:00 午夜狂欢
  GAME_END: 900,          // 15:00 结束
  PROD_PER_POP: 0.03,
  NUKE_MUL: 1.8,          // 核武预算倍率
  PROD_BASE: 1.0,        // 保底产出：人口再少也有事可做
  UNDERDOG_MAX: 2.5,      // 弱势加成上限（人口低于平均时产出翻倍）
  REVENGE_BANK: 2.0,      // 每损失 1M 人口，获得的复仇预算
  REVENGE_ENERGY: 1.5,    // 每损失 1M 人口，获得的能量
  ENERGY_BASE: 0.5,       // 能量保底回复/秒
  GROWTH: 0.0008,
  RECOVER_GROWTH: 3,      // 人口越低于原值，增长越快
  REBUILD_TIME: 8,
  REBUILD_POP: 0.35,      // 重建完成后人口至少恢复到原值的 35%
  DEATH_POP: 3,           // 总人口低于 3M 即被核平
  POP_CAP_MUL: 1.6,
  ENERGY_CAP: 150,
  BANK_CAP: 400,
  LOCK_RANGE: 3,          // 来袭目标进入本国领土，或距落点 3 格以内才会被锁定
  LOCK_TO_HIT: 1.0,       // 锁定后约 1 秒迎击
  SHAKE_CLUSTER: 3,      // 2.5 秒内至少 3 枚核包裹爆炸才震屏
  SHAKE_COOLDOWN: 6,      // 两次震屏至少间隔 6 秒
  PAD_CAP: 4,
  SEA_CAP: 4,
  MAX_SEA: 2,
  MAX_UFO: 6,
  RUIN_PROD: 0.5,
};

// 科技（按顺序解锁）
const TECHS = [
  { id: 'lv1',   name: '核平投送·普通件', cost: 30, desc: '解锁 1 级包裹，可用飞机投送。“三日达，不包邮。”' },
  { id: 'pad',   name: '地面投送站',       cost: 45,  desc: '投送站启用，火箭投送 7~10 秒送达。' },
  { id: 'lv2',   name: '核平投送·次日达', cost: 60,  desc: '2 级包裹，爆炸圈更大。' },
  { id: 'sea',   name: '海底仓',           cost: 80,  desc: '潜航器藏在海里，敌人看不见它。' },
  { id: 'lv3',   name: '核平投送·当日达', cost: 95,  desc: '3 级包裹，双层冲击光环。' },
  { id: 'net',   name: '拦截网升级',       cost: 90,  desc: '拦截弹 3 → 6 枚，命中率 60% → 75%。更多来袭包裹会变成烟花。' },
  { id: 'lv4',   name: '星际顺丰·闪送',   cost: 120, desc: '4 级包裹，蘑菇云自带彩虹边。' },
  { id: 'multi', name: '分装包裹',         cost: 120, desc: '每枚火箭一次装 3 个包裹。' },
  { id: 'lv5',   name: '终极核平·到付',   cost: 160, desc: '5 级包裹。全屏白光，请对方签收。' },
];

// 包裹等级（纯游戏数值）
const PARCELS = {
  1: { name: '普通件', r: 0, dmg: 0.38, cost: 12, fizzle: 0.12, fx: 0.8, color: '#ffd27a' },
  2: { name: '次日达', r: 1, dmg: 0.52, cost: 14, fizzle: 0.06, fx: 1.3, color: '#ffb35a' },
  3: { name: '当日达', r: 1, dmg: 0.65, cost: 16, fizzle: 0.04, fx: 1.9, color: '#ff8a4a' },
  4: { name: '闪送',   r: 2, dmg: 0.80, cost: 20, fizzle: 0.03, fx: 2.7, color: '#ff6ad5', rainbow: true },
  5: { name: '到付',   r: 3, dmg: 0.95, cost: 60, fizzle: 0.03, fx: 4.0, color: '#ffffff', ultimate: true },
};

// 常规导弹：不需要科技，便宜、飞得快、冷却短，但威力小、没有蘑菇云
const CONV = {
  cost: 6,            // 每枚预算（核包裹 12~60 + 运载工具）
  dmg: 0.07,          // 命中城市损失 7% 人口
  facChance: 0.35,    // 命中设施时 35% 打宕机
  cd: 3,              // 齐射冷却（秒）
  flight: [4, 6],     // 飞行时间
  salvo: [1, 3, 8],   // 一件 / 一半 / 清仓 对应的最多枚数
  keepMin: 4,         // 自动生产：先保证至少 4 枚
  stockCap: 12,       // 库存上限
};

const COSTS = { rocket: 15, sea: 70, ufo: 20, facility: 15, rebuild: 10, shield: 40, net: 18 };

const SKILLS = {
  // 护盾：全国领土的大范围防御，短时间扛住饱和打击
  //   常规导弹全部挡住；核包裹伤害 -85%；城市不会变成废墟；设施不会宕机
  shield: { dur: 8, cd: 30, reduce: 0.85 },
  // 拦截：点防御。开启后有若干枚拦截弹，每枚自动迎击一个来袭目标，有一定几率击毁
  //   适合对付少量来袭；数量一多拦截弹就不够用了
  net: { dur: 12, cd: 28, chance: 0.6, charges: 3, chanceUp: 0.75, chargesUp: 6 },
};

const RACES = [
  {
    id: 'human', name: '奥瑞恩联邦', emoji: '⭐', color: '#4da3ff',
    trait: '均衡发展：科技 +10%', weak: '没有明显弱点，也没有明显优点',
    mods: { tech: 1.1 }, special: '星辰投送',
    cities: ['新晨港', '白岸', '铁桥市', '长风', '阿尔卡', '松岭'],
    lines: { launch: '我们发明了投送，也发明了拒收。', hit: '这一定是个误会……我们马上回敬一个误会。', dead: '至少……我们曾经很文明。' },
  },
  {
    id: 'mole', name: '深岩邦联', emoji: '⛰', color: '#d0965a',
    trait: '地下堡垒：护盾对核包裹减伤 97%（常规 85%）', weak: '科技 -15%',
    mods: { tech: 0.85, shield: 0.97 }, special: '坑道直送',
    cities: ['黑岩堡', '深井城', '石门', '坑道市', '铁砧', '地脉'],
    lines: { launch: '我们的城市在地下三百米。请随意。', hit: '地面上的事，与我们无关。', dead: '我们……挖得还不够深。' },
  },
  {
    id: 'octopus', name: '瀚海联合王国', emoji: '⚓', color: '#b67bff',
    trait: '海洋霸主：潜航器造价 -40%，送达更快', weak: '投送站火箭造价 +30%',
    mods: { sea: 0.6, rocket: 1.3, seaSpeed: 0.75 }, special: '深海速递',
    cities: ['潮汐港', '珊瑚城', '深渊湾', '灯塔市', '浪岬', '海门'],
    lines: { launch: '大海会记住每一次挑衅。', hit: '潮水会把这笔账带回去。', dead: '回归……大海……' },
  },
  {
    id: 'mushroom', name: '灰烬共和国', emoji: '🔥', color: '#ff5e8a',
    trait: '灰烬中重生：辐射灰地块人口反而增长', weak: '初始人口 -20%',
    mods: { pop: 0.8, dustLove: true }, special: '余烬包邮',
    cities: ['余烬城', '灰原', '焦土镇', '硫磺港', '炉心', '赤岭'],
    lines: { launch: '每一朵蘑菇云，都是回家的路。', hit: '灰烬里长出来的，才最坚硬。', dead: '我们终将……从灰里长回来……' },
  },
  {
    id: 'ai', name: '苍穹理事会', emoji: '🛰', color: '#3ef0d0',
    trait: '机械躯体：科技 +20%，不怕辐射灰', weak: '人口增长 -30%',
    mods: { tech: 1.2, growth: 0.7, dustImmune: true }, special: '光速云配送',
    cities: ['枢纽-1', '主控城', '缓存港', '节点-7', '云端堡', '矩阵市'],
    lines: { launch: '根据计算，你们的签收率为 100%。', hit: '检测到异常包裹。正在生成回礼……完成。', dead: 'ERROR 404：国家不存在。' },
  },
  {
    id: 'roach', name: '长夜帝国', emoji: '🌑', color: '#e8d04a',
    trait: '坚忍不拔：人口恢复 ×2', weak: '科技 -25%，包裹拒收率 +10%',
    mods: { tech: 0.75, growth: 2.0, fizzle: 0.10 }, special: '长夜直达',
    cities: ['夜城', '永冬堡', '暗河', '残月港', '寒鸦岭', '不眠城'],
    lines: { launch: '你们打你们的，我们最后来收拾。', hit: '就这点力气？', dead: '长夜……终有尽头……' },
  },
];

const PERSONALITIES = {
  hot:     { name: '暴躁', react: [1, 2.5],   aggro: 1.6, start: 75 },
  zen:     { name: '佛系', react: [2, 4],     aggro: 0.0, start: 9999 },
  crazy:   { name: '疯癫', react: [0.5, 1.5], aggro: 1.2, start: 60 },
  steady:  { name: '稳健', react: [2, 4],     aggro: 1.0, start: 220 },
  grudge:  { name: '记仇', react: [1, 2],     aggro: 0.3, start: 9999 },
};

const FACILITY_INFO = {
  pad: { name: '地面投送站', icon: '🚀' },
  ufo: { name: '机场', icon: '✈' },
  sea: { name: '海底仓',     icon: '🐋' },
};

const TERRAIN_NAME = { deep: '深海', ocean: '海洋', plain: '平原', forest: '森林', desert: '沙漠', mountain: '山地', ice: '冰原' };

const NEWS_FILLER = [
  '专家称：昨晚的蘑菇云“比上次的更圆”',
  '联合国呼吁各方“至少别往联合国投送包裹”',
  '投送行业协会：本季度投诉量暴涨，主要诉求为“我没买东西”',
  '气象台：明日多云转蘑菇云，请市民带好伞',
  '和平鸽协会抗议：我们的形象被滥用了',
  '最新民调：98% 的受访者表示“刚才那是什么声音”',
  '房地产专家：地下室房价暴涨 3000%',
  '末日时钟维修工：“这钟走得也太快了”',
  '长夜帝国发言人拒绝接受采访，只是笑了笑',
  '某投送员获“年度最快送达奖”，领奖台已不存在',
  '消协提醒：到付包裹请谨慎签收',
  '烟花厂老板：拦截网让我们失业了',
];
