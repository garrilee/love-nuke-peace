// ===================== 热爱核平 · 配置与数值（街机沙盒版）=====================
'use strict';

const CFG = {
  SIM_DT: 0.1,
  MAP_COLS: 40,
  MAP_ROWS: 24,
  HEX: 14,
  MIDNIGHT: 540,          // 第 9 分钟：午夜狂欢
  // 没有时间限制：打到只剩一个国家。午夜后核弹威力继续上升，防止对局拖太久
  ESC_EVERY: 120,         // 午夜后每 2 分钟
  ESC_START: 1.25,        // 午夜时核弹威力 ×1.25
  ESC_STEP: 0.1,          // 之后每次再 +10%
  ESC_MAX: 2.5,           // 最多 ×2.5
  ESC_PROD: 0.1,          // 每次末日升级，核武产出也再 +10%（不设上限，防止后期僵持）
  PROD_PER_POP: 0.03,
  NUKE_MUL: 1.7,          // 核武预算倍率
  MIDNIGHT_PROD: 3.5,     // 午夜后核武产出 ×3.5（后期火力和前期分开调，避免僵持）
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
  ATTACKER_MARK: 120,     // 最近 2 分钟内攻击过你的国家，会在地图和列表上标出来
  AI_IDLE_FORCE: 60,      // AI 超过 60 秒没出手，必须打一轮

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
  STOCK_CAP: 30,          // 核包裹库存上限（到了就不再生产）
  START_PARCELS: 5,       // 每个国家开局自带 5 个 1 级核包裹（开局就能投送，不用研发）
};

// 科技树：前 3 级共用；第 4 级二选一（主攻「闪送」/ 主防「拦截网升级」），任选其一就能研发东风；
// 造出东风后，另一个第 4 级选项还能继续研发
const TECHS = [
  { id: 'pad',   name: '地面投送站',       cost: 45,  req: [],                desc: '投送站启用，火箭投送 7~10 秒送达。' },
  { id: 'lv3',   name: '核平投送·当日达', cost: 90,  req: ['pad'],           desc: '3 级包裹，双层冲击光环。' },
  { id: 'multi', name: '分装包裹',         cost: 100, req: ['lv3'],           desc: '每枚火箭一次装 3 个包裹。' },
  { id: 'lv4',   name: '星际顺丰·闪送',   cost: 110, req: ['multi'], branch: 'atk', desc: '主攻：4 级包裹，蘑菇云自带彩虹边。' },
  { id: 'net',   name: '拦截网升级',       cost: 110, req: ['multi'], branch: 'def', desc: '主防：拦截弹 3 → 6 枚，命中率 60% → 75%。' },
  { id: 'lv5',   name: '终极核平·东风',   cost: 230, reqAny: ['lv4', 'net'], desc: '5 级包裹“东风”。全屏白光，使命必达。' },
];
const TECH_PICK_WAIT = 20; // 第 4 级二选一：玩家 20 秒不选，按当前核武/三防分配自动选

// 包裹等级（纯游戏数值）
const PARCELS = {
  1: { name: '普通件', r: 0, dmg: 0.30, cost: 12, fizzle: 0.12, fx: 0.8, color: '#ffd27a' },
  2: { name: '次日达', r: 1, dmg: 0.42, cost: 14, fizzle: 0.06, fx: 1.3, color: '#ffb35a' },
  3: { name: '当日达', r: 1, dmg: 0.58, cost: 16, fizzle: 0.04, fx: 1.9, color: '#ff8a4a' },
  4: { name: '闪送',   r: 2, dmg: 0.75, cost: 20, fizzle: 0.03, fx: 2.7, color: '#ff6ad5', rainbow: true },
  5: { name: '东风',   r: 3, dmg: 0.90, cost: 60, fizzle: 0.03, fx: 4.0, color: '#ffffff', ultimate: true },
};

// 常规导弹：不需要科技，便宜、飞得快、冷却短，但威力小、没有蘑菇云
const CONV = {
  cost: 5,            // 每枚预算（核包裹 12~60 + 运载工具）
  buildTime: 4,       // 每枚生产耗时（秒）
  dmg: 0.20,          // 命中城市损失 20% 人口
  facChance: 0.45,    // 命中设施时 45% 打宕机
  cd: 3,              // 齐射冷却（秒）
  flight: [4, 6],     // 飞行时间
  salvo: [1, 3, 5],   // AI：一件 / 一半 / 清仓 对应的最多枚数
  perLaunch: 5,       // 一次最多发射 5 枚
  keepMin: 4,         // 自动生产：先保证至少 4 枚
  stockCap: 10,       // 库存上限
};

// 无人机：生产快、飞得慢、难被拦截弹打中，主要用来拆设施、消耗对手的防空（数值在调平衡时定）
const DRONE = {
  cost: 1,            // 每架预算（很便宜：独立生产线，不挤占核武预算）
  buildTime: 3,       // 每 3 秒出一架，库存没满就一直生产
  keepMin: 4,         // 自动生产：先保证至少 4 架
  stockCap: 20,       // 库存上限；一次发射不限数量
  flight: [14, 17],   // 飞行时间（仍比飞机慢）
  cityDmg: 0.025,     // 打到城市：损失 2.5% 人口
  facChance: 0.45,    // 打到设施：45% 宕机
  facBias: 0.7,       // 70% 的无人机瞄准设施
  netMul: 0.5,        // 拦截弹打无人机的命中率 ×0.5
  cd: 1,              // 两次放飞间隔（秒）
};
// 空战：不同国家的小摩托在空中距离小于 1 格就会互相攻击
const DOG = {
  range: 20,          // 交战距离（约 1 格）
  interval: 1.5,      // 交火后冷却 1.5 秒（擦肩而过一般只打一两轮）
  hit: 0.2,           // 每次交火击落对方的几率
};
// 升空拦截：敌方小摩托飞进本国领土时，库存里的小摩托自动起飞迎击。起飞就消耗，不返航：
// 一直追着目标打，直到击落目标或自己被击落；目标没了就找下一架，再没有就在空中自毁
const GUARD = {
  max: 2,             // 同时最多起飞 2 架
  speed: 60,          // 飞行速度（比来袭的小摩托快一些）
  leash: 10,          // 追出起飞点 10 格以上就放弃（自毁）
  every: 1.5,         // 每 1.5 秒最多起飞 1 架
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
    trait: '全民内卷：科技 +15%', weak: '没有明显弱点，也没有明显优点',
    mods: { tech: 1.15 }, ult: { name: '加班投送', icon: '⏰', cd: 120, dur: 15, desc: '全国加班 15 秒：总产出 ×1.7' },
    cities: ['996城', '加班港', '考研镇', '内卷市', '熬夜岭', '卷心湾'],
    lines: { launch: '你们下班了？我们还在研发。', hit: '这点伤害，加个班就补回来了。', dead: '卷……不动了……' },
  },
  {
    id: 'mole', name: '刀盾', emoji: '🛡', color: '#d0965a',
    trait: '盾坚如铁：护盾减伤 97%（常规 85%），冷却 -28%', weak: '科技 -4%',
    mods: { tech: 0.96, shield: 0.97, shieldCd: 0.72 }, ult: { name: '盾后突刺', icon: '🗡', cd: 110, desc: '免费开启护盾，并向最近打你的国家回敬 6 枚常规导弹' },
    cities: ['铁壁堡', '刀锋港', '盾城', '守望镇', '磐石市', '锋口'],
    lines: { launch: '左手刀，右手盾，先砍你再说。', hit: '打不着，打不着，略略略。', dead: '盾……碎了……' },
  },
  {
    id: 'octopus', name: '鱼叉', emoji: '🔱', color: '#b67bff',
    trait: '深海猎手：天生拥有海底仓，潜航器造价 -40%、送达更快；包裹从不被拒收，被拦截几率 -20%', weak: '投送站火箭造价 +5%',
    mods: { sea: 0.6, rocket: 1.05, seaSpeed: 0.75, fizzle: -1, evade: 0.8, innateSea: true }, ult: { name: '一叉入魂', icon: '🔱', cd: 90, dur: 30, desc: '潜航器立即满载出海；30 秒内发射的核包裹无法被拦截、不会被拒收' },
    cities: ['鱼叉湾', '捕鲸港', '渔场城', '浪尖镇', '礁石市', '深海口'],
    lines: { launch: '鱼叉已上膛，目标锁定。', hit: '浪再大，也掀不翻我们的船。', dead: '回归……大海……' },
  },
  {
    id: 'mushroom', name: '吃土', emoji: '🥄', color: '#ff5e8a',
    trait: '吃土长大：辐射灰地块人口反而增长；皮糙肉厚，受到核弹伤害 -3%', weak: '科技 -5%',
    mods: { tech: 0.95, dustLove: true, nukeArmor: 0.97 }, ult: { name: '扬沙', icon: '🌪', cd: 100, desc: '向所有敌国扬起辐射沙尘：敌国人口停止增长并缓慢流失，你在沙里长得更快' },
    cities: ['土坡村', '泥饼城', '月光镇', '尘埃港', '土豆岭', '灰原'],
    lines: { launch: '反正已经在吃土了，不怕多吃一点。', hit: '谢谢投喂，再来点。', dead: '这次……真的只剩土了……' },
  },
  {
    id: 'ai', name: '赛博朋克', emoji: '🤖', color: '#3ef0d0',
    trait: '义体改造：科技 +15%，不怕辐射灰', weak: '人口增长 -30%',
    mods: { tech: 1.15, growth: 0.7, dustImmune: true }, ult: { name: '断网攻击', icon: '📡', cd: 110, dur: 15, desc: '让当前目标的护盾和拦截瘫痪 15 秒，并窃取它 30% 的预算' },
    cities: ['霓虹市', '义体街', '电子港', '节点-7', '矩阵城', '云端堡'],
    lines: { launch: '检测到你的城市即将离线。', hit: '义体受损……正在生成回礼……完成。', dead: 'ERROR 404：国家不存在。' },
  },
  {
    id: 'roach', name: '青铜', emoji: '🥉', color: '#e8d04a',
    trait: '越级挑战：倒下也能爬起来，人口恢复 ×1.33', weak: '科技 -10%',
    mods: { tech: 0.9, growth: 1.33 }, ult: { name: '燃烧吧小宇宙', icon: '🔥', cd: 170, desc: '所有废墟和宕机设施立即复原，城市人口至少恢复到 35%' },
    cities: ['青铜城', '小宇宙港', '燃烧镇', '越级堡', '不屈岭', '星光市'],
    lines: { launch: '燃烧吧，小宇宙！', hit: '倒下了？我们还能再站起来！', dead: '小宇宙……燃尽了……' },
  },
];

// 三体人：生存模式里出现的高阶文明，只由 AI 控制，玩家不能选
const BOSS = {
  id: 'trisolaris', name: '三体人', emoji: '👽', color: '#9dffb0', boss: true,
  trait: '高阶文明：开局科技领先（已有当日达、分装包裹）、产出 ×1.8、人口 ×1.3、护盾冷却 -30%；恒纪元时受到伤害 ×0.6；智子封锁让其他国家科技 ×0.8',
  weak: '乱纪元：开局 5 分钟后，每 125 秒有 25 秒停产、护盾和拦截失效、受到伤害 ×1.5',
  mods: { pop: 1.3, prod: 1.8, shieldCd: 0.7, armor: 0.6 }, // armor：恒纪元时受到的伤害倍率
  ult: { name: '降维打击', icon: '🌀', cd: 180, desc: '预警 10 秒后二维化从中心展开：核心 5 格内全部毁灭，5～10 格按距离造成 80%～15% 损失' },
  cities: ['红岸', '恒纪元', '三日凌空', '飞星', '智子城', '水滴港'],
  lines: { launch: '降临，从你开始。', hit: '这点抵抗，不值一提。', dead: '舰队……失去了信号……' },
};
const ALL_RACES = [...RACES, BOSS];
const BOSS_CFG = {
  startTechs: ['pad', 'lv3', 'multi'], // 开局已研发：投送站、当日达、分装包裹
  firstUlt: 240,          // 开局 4 分钟后才能第一次降维打击
  sophon: 0.8,            // 智子封锁：其他国家科技 ×0.8
  chaosFirst: 300,        // 第一次乱纪元：开局 5 分钟后
  chaosEvery: 125,        // 乱纪元：之后每 125 秒一次
  chaosDur: 25,           //   持续 25 秒
  chaosWarn: 10,          //   提前 10 秒预警
  chaosDmg: 1.5,          //   期间受到的伤害 ×1.5
  dimWarn: 10,            // 降维打击：预警 10 秒
  dimSpread: 25,          //   25 秒内展开到最大范围
  dimCore: 5,             //   核心区半径（格）：全部毁灭
  dimOuter: 10,           //   外延区半径（格）
  outerLoss: [0.8, 0.15], //   外延区人口损失：从 80% 按距离降到 15%（护盾减半）
  outerFac: [0.7, 0.1],   //   外延区设施摧毁几率
  noRebuild: 60,          //   核心区的城市和设施 60 秒内不能重建
  hate: 0,                // 其他 AI 平时对三体人的额外敌意（为 0：平时各打各的，三体人人口多本来就招恨）
  chaosHate: 80,          // 乱纪元期间的额外敌意（大家趁机围攻）
  playerAnger: 60,        // 三体人开局就盯着真人玩家
  aggro: 1.5,             // 出手积极度（在暴躁性格基础上再 ×1.5）
  neighborHate: 30,       // 选目标时对最近邻国的额外敌意（越近越高）
  flatHold: 60,           // 二维化痕迹：核心区保持 60 秒（和禁止重建一致）
  flatFade: 60,           //   之后 60 秒内褪去
  flatFadeOuter: 30,      //   外延区的痕迹 30 秒内褪去
};

// AI 难度：产出倍率、出手积极度、报复反应时间倍率、多久不出手就必须打一轮、大招使用意愿
const DIFFS = {
  easy:   { name: '简单', prod: 0.8, aggro: 0.7,  react: 1.6, idle: 100, ult: 0.35 },
  normal: { name: '普通', prod: 1.0, aggro: 1.0,  react: 1.0, idle: 60,  ult: 1 },
  hard:   { name: '癫狂', prod: 1.2, aggro: 1.35, react: 0.7, idle: 45,  ult: 1 },
};
const ULT_FIRST = 90;
const MAX_NATIONS = 8;   // 一局最多 8 个国家（真人 + AI）；国家可以重复选
// 同一个国家出现多次时，后来者换一个国境线颜色
const ALT_COLORS = ['#ff8c3a', '#7ee05a', '#f06cff', '#00b4ff', '#c8d2e0', '#b5ff3a', '#ffb0c8', '#c7a0ff'];
const DUP_SUFFIX = ['', '二', '三', '四', '五', '六', '七', '八']; // 开局 90 秒后大招才可用

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
