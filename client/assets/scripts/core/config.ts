// 配置表的类型。数值只在 assets/resources/config/*.json 里，代码不写死（CLAUDE.md 硬性约束 5）。

export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legend';
/** 技能 id：slot 加位、shunt 调车、xray 透视（economy.json 的 skills.order，docs/01 第 1.6 节） */
export type SkillId = string;

/** 一张收藏卡（config/cards.json）：图在 resources/card/<id>.png，名字文案 CARD_<id> */
export interface CardDef {
  id: string;
  /** 中文备注（界面上的名字走多语言 CARD_<id>） */
  name: string;
  rarity: Rarity;
  [k: string]: unknown;
}

/** 一份奖励：金币、每种技能各几个、随机技能几个、无限生命秒数 */
export interface Reward {
  coins?: number;
  tools?: number;
  skills?: number;
  unlimited?: number;
}

/** 章节（地图上的一大段关卡）：背景图 bg/chapter_<id>，名字文案 CHAPTER_<序号> */
export interface Chapter {
  id: string;
  /** 这一章的第一关 */
  levelFrom: number;
}

export interface Book {
  id: number;
  /** 这一册属于哪一章（Chapter.id），可不填 */
  chapter?: string;
  unlock: number;
  cards: string[];
  reward: Reward;
}

export interface Area {
  id: string;
  unlock: number;
  /** 每步 [星星, 金币] */
  steps: [number, number][];
  reward: Reward;
}

export interface ComboTier {
  at: number;
  coins: number;
  key: string;
}

export interface ComboConfig {
  windowSeconds: number;
  startAt: number;
  maxCoinsPerLevel: number;
  tiers: ComboTier[];
  cardChance: Record<string, number>;
  bestBonus: { minCombo: number; coinsPerCombo: number; max: number };
}

export interface WheelPrize {
  id: string;
  kind: 'coins' | 'skill' | 'unlimited' | 'card';
  amount?: number;
  rarity?: Rarity;
  weight: number;
}

export interface SignInDay {
  coins?: number;
  wheel?: number;
  skill?: number;
  chest?: { skill: number; card: number };
  bigChest?: { minRarity: Rarity; coins: number; unlimitedSeconds: number };
}

/** 一项每日任务。mode 为 max 时进度取单次最大值（最高连击），否则累加 */
export interface TaskDef {
  id: string;
  goal: number;
  points: number;
  /** 这项功能开放后才会抽到 */
  feature?: string;
  /** 平台有这项能力才留在池子里（启动时由服务层筛掉） */
  cap?: string;
  mode?: 'max';
}

/** 任务宝箱里的收藏卡：rates 不写就用过关宝箱的概率；minRarity 是最低稀有度 */
export interface TaskCard {
  rates?: Partial<Record<Rarity, number>>;
  minRarity?: Rarity;
  preferUnowned?: boolean;
}

/** 积分进度条上的一档宝箱 */
export interface TaskTier {
  points: number;
  reward?: Reward;
  card?: TaskCard;
}

export interface TasksConfig {
  /** 每天必有的任务 id */
  fixed: string[];
  /** 另外再随机抽几个（没有 count 时用：每天 fixed + random 项） */
  random: number;
  /** 每天几项（偶数，至少 6）：固定的进不了池子（如没有广告时的看广告）就多抽随机的补上 */
  count?: number;
  /** 每日积分封顶 */
  dayMax: number;
  pool: TaskDef[];
  dayTiers: TaskTier[];
  weekTiers: TaskTier[];
}

export interface EconomyConfig {
  levelCoins: number;
  challengeCoins: number;
  /** 超难关的过关金币（docs/01）；没配按 challengeCoins */
  bossCoins?: number;
  /** 全部免费的那几关（skills.freeAllUntil 以前）某几个技能单独的每关次数上限（撤销 3 次，docs/01） */
  toolMaxFreeById?: Record<string, number>;
  /**
   * 星级和首次三星（docs/01）：twoStarLine 用了几个道具以内两星；first3 第一次拿三星多送的（coins 金币、card 卡的稀有度、skill 几个随机技能），
   * 第 earlyUntil 关以前金币只给 earlyCoins
   */
  stars?: {
    twoStarLine: Record<'normal' | 'hard' | 'boss', number>;
    first3: Record<'normal' | 'hard' | 'boss', { coins: number; card?: string; skill?: number }>;
    earlyUntil: number;
    earlyCoins: number;
  };
  adCoinMultiplier: number;
  toolStart: Record<string, number>;
  toolPrice: Record<string, number>;
  /**
   * 全部免费的那几关（skills.freeAllUntil 以前）每关每种技能最多用几次。别的关不限次数：道具靠库存和金币买（docs/01）
   */
  toolMaxFree: number;
  dupeCoins: Record<Rarity, number>;
  freeCoin: { amount: number; daily: number };
  easeAfterFails: number[];
  combo: ComboConfig;
  rarities: Rarity[];
  lives: {
    max: number;
    regenSeconds: number;
    freeUntilLevel: number;
    buyOneCoins: number;
    refillCoins: number;
    firstWinUnlimitedSeconds: number;
    /** 看广告得命，每天几次 */
    adDaily?: number;
  };
  skills: {
    order: SkillId[];
    grantOnUnlock: number;
    freePerDay: number;
    freeDaily?: number;
    /** 第 1 关到第几关（含）：每关第一次用技能免费（没配 = 没有这一条） */
    freeLevelUntil?: number;
    /** 第 1 关到第几关（含）：技能随便用、都免费（每种每关仍按次数上限，docs/01） */
    freeAllUntil?: number;
    /** 第一次过了第 after 关送礼包：已解锁的每种技能各 count 个，告诉玩家「从下一关起要用库存或金币了」 */
    gift?: { after: number; count: number };
  };
  chapters?: Chapter[];
  album: { books: Book[]; final: Reward };
  dailyChallenge: {
    levelStep: number;
    retryCoins: number;
    reward: Reward;
    streakDays: number;
    streakReward: Reward;
  };
  tasks?: TasksConfig;
  features: Record<string, number>;
  chest: {
    normal: { coins: number; skill: number; card: number; coinMin: number; coinMax: number };
    challengeRareBoost: number;
    cardRates: Partial<Record<Rarity, number>>;
    pityAfter: number;
  };
  wheel: {
    freePerDay: number;
    firstWinSpins: number;
    adPerDay: number;
    coinCost: number;
    tenCost: number;
    tenCount: number;
    tenMinRarity: Rarity;
    pityAfter: number;
    pityMinRarity: Rarity;
    unlimitedSeconds: number;
    prizes: WheelPrize[];
  };
  signInDays: SignInDay[];
  replay: { rewardedPerDay: number };
}

export interface AdsConfig {
  placements: Record<string, { type: 'rewarded' | 'interstitial' | 'banner' }>;
  interstitial: {
    minLevel: number;
    minSeconds: number;
    minLevelsBetween: number;
    skipAfterRewardedSeconds: number;
  };
}

/**
 * 关卡总表（assets/resources/config/levels.json，docs/02 第 4–6 节）。关卡本身一关一个文件 config/levels/level_XXXX.json
 * （core/dig/level.ts 的 LevelFile），由 client/tools/level/build.ts 生成
 */
export interface LevelsConfig {
  /** 关卡总数：超过后在后一半里循环（Meta.levelFile） */
  total: number;
  /** 每几关一个难关、每几关一个超难关（0 = 没有） */
  hardEvery: number;
  bossEvery: number;
  /** 装车位几个 */
  slots: number;
  /** 时间到了复活加几秒 */
  reviveSeconds: number;
  /** 每种机关第几关首发：之前的关不能用（level-verify 查） */
  mechanicFrom: Record<string, number>;
}

/** 界面数值（动画时长、提示、教学），assets/resources/config/game_ui.json */
export interface GameUiConfig {
  /**
   * 挖豆的表现（docs/01 第 3 节）：一斗最多几颗、每节车厢几台挖机；车厢进站、挖机开过去、铲一斗、开回来各几秒，
   * 同一节车厢的挖机一台接一台隔几秒出发；发车开走几秒；倍速的倍数；「透视」看几秒
   */
  dig: { bucket: number; diggers: number; enter: number; go: number; scoop: number; back: number; stagger: number; depart: number; speed: number; xraySeconds: number };
  /** 开局：豆依次弹出的间隔 */
  intro: { startDelay: number; stagger: number };
  /** 难关、超难关的开局横幅（docs/09）：滑进来几秒、停几秒、缩成小牌子飞过去几秒 */
  kindBanner: { slideIn: number; hold: number; fly: number };
  /** 难度调试页的整体三档（开发版）：下标 = 档 + 1（困难、标准、简单）；slots 装车位加减几个，window 连击窗口秒数（0 = 照 economy.json） */
  labTiers: { slots: number; window: number }[];
  /** 演示：每步先圈出来停 ring 秒再点，点完隔 gap 秒 */
  demo: { ring: number; gap: number };
  /** 限时关：剩几秒以内变色、跳动 */
  clock: { warn: number };
  /** 装车位：剩几个空位时变红闪；剩几个时提醒用道具（rescueSkills 里的发光，nudgeHand 第一个能用的放小手） */
  station: { warnFree: number; skillNudgeFree: number; rescueSkills: string[]; nudgeHand: string[] };
  /** 闲着不点几秒后亮提示；前 tutorialLevels 关等 tutorialSeconds 秒 */
  hint: { tutorialLevels: number; tutorialSeconds: number; seconds: number };
  /** 第几关开局弹哪几条说明（文案键，逗号隔开） */
  tips: Record<string, string>;
  tutorial: { delay: number };
  unlockGuide: { delay: number; lockSeconds: number; sparks: number };
  /** 结算页的演出时间点（秒）：celebrate、starAt、starGap、coinsAt、coinsRoll、chestAt、chestShake、buttonsAt */
  win: Record<string, number | string>;
  /** 技能、数量角标最多显示到几 */
  badgeCap: number;
  /** 主页中间的展示：[收藏卡 id, x, y, 尺寸]（换成自己的吉祥物、主角） */
  homeDeco: { hero: [string, number, number, number][] };
}
