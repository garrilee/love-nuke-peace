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
  // 军工热度：持续投入核武，工厂越来越“热”，生产效率越高；突然转产的工厂是“冷”的
  HEAT_FULL_AT: 0.4,      // 核武分配达到 40% 时热度目标为满
  HEAT_UP: 100,           // 从冷到满热约 100 秒
  HEAT_DOWN: 40,          // 停止投入后约 40 秒冷却
  HEAT_MIN: 0.4,          // 冷工厂效率 ×0.4
  HEAT_MAX: 1.4,          // 满热效率 ×1.4
  HEAT_START: 0.3,        // 开局热度
  // 情报：察觉“憋大招”的国家，各国联手先打
  INTEL_TECH_LEAD: 3,     // 科技领先其他国家 3 项以上
  INTEL_EARLY_LV5: 480,   // 8 分钟前就研发出东风
  INTEL_STOCK: 25,        // 库存包裹达到 25 个（自动生产上限是 30）
  INTEL_FOCUS: 40,        // 被察觉后 40 秒内成为各国首要目标
  INTEL_CD: 90,           // 同一国家 90 秒内不重复触发
  BYSTANDER_AFTER: 60,    // 超过 60 秒不出手，就开始招人恨（隔岸观火）
  ANGER_MAX: 200,         // 怒气上限
  ANGER_COOL_AFTER: 30,   // 两国超过 30 秒没有互相攻击，怒气开始回落
  ANGER_HALF_LIFE: 60,    // 回落速度：约每 60 秒减半
  AI_IDLE_FORCE: 60,      // AI 超过 60 秒没出手，必须打一轮
  SCORE_DAMAGE: 0.4,      // 终局排名：综合得分 = 人口 + 造成伤亡 × 0.4

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
  MIRV_SPLIT: 0.42,       // 分弹头在 42% 航程处与母弹分离
  LOCK_RANGE: 3,          // 来袭目标进入本国领土，或距落点 3 格以内才会被锁定
  LOCK_TO_HIT: 1.0,       // 锁定后约 1 秒迎击
  SMOKE_LIFE: 3.5,        // 蘑菇云基础持续时间（秒）
  SMOKE_LIFE_PER: 1.4,    // 每级威力额外持续（3 级约 6 秒，东风约 9 秒）
  SMOKE_CROWD: 0.07,      // 每多一朵同屏蘑菇云，烟的浓度降低 7%
  SMOKE_MIN_ALPHA: 0.4,   // 烟最淡降到原来的 40%
  SHAKE_CLUSTER: 3,      // 2.5 秒内至少 3 枚核包裹爆炸才震屏
  SHAKE_COOLDOWN: 6,      // 两次震屏至少间隔 6 秒
  PADS_PER_NATION: 5,     // 陆基投送站数量（多点发射，天女散花）
  PAD_CAP: 3,             // 每个投送站的火箭数
  SEA_CAP: 3,             // 每艘潜航器的火箭数
  MAX_SEA: 4,             // 每国最多潜航器数
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
  { id: 'lv5',   name: '终极核平·东风',   cost: 160, desc: '5 级包裹“东风”。全屏白光，使命必达。' },
];

// 包裹等级（纯游戏数值）
const PARCELS = {
  1: { name: '普通件', r: 0, dmg: 0.46, cost: 12, fizzle: 0.12, fx: 0.8, color: '#ffd27a' },
  2: { name: '次日达', r: 1, dmg: 0.62, cost: 14, fizzle: 0.06, fx: 1.3, color: '#ffb35a' },
  3: { name: '当日达', r: 1, dmg: 0.77, cost: 16, fizzle: 0.04, fx: 1.9, color: '#ff8a4a' },
  4: { name: '闪送',   r: 2, dmg: 0.90, cost: 20, fizzle: 0.03, fx: 2.7, color: '#ff6ad5', rainbow: true },
  5: { name: '东风',   r: 3, dmg: 0.95, cost: 60, fizzle: 0.03, fx: 4.0, color: '#ffffff', ultimate: true },
};

// 常规导弹：不需要科技，便宜、飞得快、冷却短，但威力小、没有蘑菇云
const CONV = {
  cost: 8,            // 每枚预算（核包裹 12~60 + 运载工具）
  buildTime: 2.5,     // 每枚生产耗时（秒），不再瞬间补满
  dmg: 0.10,          // 命中城市损失 10% 人口
  facChance: 0.45,    // 命中设施时 45% 打宕机
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
    id: 'human', name: '卷王', emoji: '📚', color: '#4da3ff',
    trait: '全民内卷：科技 +5%', weak: '没有明显弱点，也没有明显优点',
    mods: { tech: 1.05 }, ult: { name: '加班投送', icon: '⏰', cd: 120, dur: 15, desc: '全国加班 15 秒：总产出 ×1.6' },
    cities: ['996城', '加班港', '考研镇', '内卷市', '熬夜岭', '卷心湾'],
    lines: { launch: '你们下班了？我们还在研发。', hit: '这点伤害，加个班就补回来了。', dead: '卷……不动了……' },
  },
  {
    id: 'mole', name: '刀盾', emoji: '🛡', color: '#d0965a',
    trait: '盾坚如铁：护盾减伤 97%（常规 85%），冷却 -30%', weak: '科技 -4%',
    mods: { tech: 0.96, shield: 0.97, shieldCd: 0.7 }, ult: { name: '盾后突刺', icon: '🗡', cd: 110, desc: '免费开启护盾，并向最近打你的国家回敬 6 枚常规导弹' },
    cities: ['铁壁堡', '刀锋港', '盾城', '守望镇', '磐石市', '锋口'],
    lines: { launch: '左手刀，右手盾，先砍你再说。', hit: '打不着，打不着，略略略。', dead: '盾……碎了……' },
  },
  {
    id: 'octopus', name: '鱼叉', emoji: '🔱', color: '#b67bff',
    trait: '深海猎手：潜航器造价 -40%，送达更快', weak: '投送站火箭造价 +10%',
    mods: { sea: 0.6, rocket: 1.1, seaSpeed: 0.75 }, ult: { name: '一叉入魂', icon: '🔱', cd: 110, dur: 30, desc: '潜航器立即满载出海；30 秒内发射的核包裹无法被拦截、不会被拒收' },
    cities: ['鱼叉湾', '捕鲸港', '渔场城', '浪尖镇', '礁石市', '深海口'],
    lines: { launch: '鱼叉已上膛，目标锁定。', hit: '浪再大，也掀不翻我们的船。', dead: '回归……大海……' },
  },
  {
    id: 'mushroom', name: '吃土', emoji: '🥄', color: '#ff5e8a',
    trait: '吃土长大：辐射灰地块人口反而增长', weak: '初始人口 -25%',
    mods: { pop: 0.75, dustLove: true }, ult: { name: '扬沙', icon: '🌪', cd: 100, desc: '向所有敌国扬起辐射沙尘：敌国人口停止增长并缓慢流失，你在沙里长得更快' },
    cities: ['土坡村', '泥饼城', '月光镇', '尘埃港', '土豆岭', '灰原'],
    lines: { launch: '反正已经在吃土了，不怕多吃一点。', hit: '谢谢投喂，再来点。', dead: '这次……真的只剩土了……' },
  },
  {
    id: 'ai', name: '赛博朋克', emoji: '🤖', color: '#3ef0d0',
    trait: '义体改造：科技 +8%，不怕辐射灰', weak: '人口增长 -30%',
    mods: { tech: 1.08, growth: 0.7, dustImmune: true }, ult: { name: '断网攻击', icon: '📡', cd: 110, dur: 15, desc: '让当前目标的护盾和拦截瘫痪 15 秒，并窃取它 30% 的预算' },
    cities: ['霓虹市', '义体街', '电子港', '节点-7', '矩阵城', '云端堡'],
    lines: { launch: '检测到你的城市即将离线。', hit: '义体受损……正在生成回礼……完成。', dead: 'ERROR 404：国家不存在。' },
  },
  {
    id: 'roach', name: '青铜', emoji: '🥉', color: '#e8d04a',
    trait: '越级挑战：倒下也能爬起来，人口恢复 ×2', weak: '科技 -10%',
    mods: { tech: 0.9, growth: 2.0 }, ult: { name: '燃烧吧小宇宙', icon: '🔥', cd: 150, desc: '所有废墟和宕机设施立即复原，城市人口至少恢复到 60%' },
    cities: ['青铜城', '小宇宙港', '燃烧镇', '越级堡', '不屈岭', '星光市'],
    lines: { launch: '燃烧吧，小宇宙！', hit: '倒下了？我们还能再站起来！', dead: '小宇宙……燃尽了……' },
  },
];

// AI 难度：产出倍率、出手积极度、报复反应时间倍率、多久不出手就必须打一轮、大招使用意愿
const DIFFS = {
  easy:   { name: '简单', prod: 0.8, aggro: 0.7,  react: 1.6, idle: 100, ult: 0.35 },
  normal: { name: '普通', prod: 1.0, aggro: 1.0,  react: 1.0, idle: 60,  ult: 1 },
  hard:   { name: '癫狂', prod: 1.2, aggro: 1.35, react: 0.7, idle: 45,  ult: 1 },
};
const ULT_FIRST = 90; // 开局 90 秒后大招才可用

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
  '青铜发言人拒绝接受采访，只是默默燃烧起了小宇宙',
  '某投送员获“年度最快送达奖”，领奖台已不存在',
  '气象台：今日有东风，各国请注意防范',
  '烟花厂老板：拦截网让我们失业了',
];
