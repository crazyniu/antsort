// 局内页面（底座，换玩法时只改标了「玩法」的几处，见 docs/02）。
// 版式：顶栏（设置 · 进度 · 关卡号）→ 像素画（四周一圈小人走的路）→ 铁轨和火车 → 上场位 → 排队区 → 技能栏。
// 逻辑在 core 里立即结算，这里按事件播表现（动画不挡操作）：小人一个个去搬（crew.ts），豆装上火车（train.ts）。
// 代码里的名字沿用上一版：car = 小队方块，track = 排队区的一列，slot / place = 上场位。连击的那一套是底座的，这款游戏不用（docs/01 第 1.5 节）。
import { Color, Director, Label, Node, Sprite, Tween, UITransform, Vec3, director, game, tween } from 'cc';
import { Combo } from '../core/meta/combo';
import * as Skills from '../core/meta/skills';
import * as Meta from '../core/meta/meta';
import * as Chapters from '../core/meta/chapters';
import type { DigLevel } from '../core/dig/level';
import * as Rules from '../core/dig/rules';
import { GameState, Status } from '../core/dig/rules';
import type { GameEvent } from '../core/dig/rules';
import { Rng } from '../core/rng/rng';
import { App } from '../services/app';
import { buzz, sfx } from '../services/audio';
import * as fx from '../ui/fx';
import { language, tr } from '../ui/i18n';
import { artNumber, at, blockInput, box, Capsule, capsule, COLOR, fit, fxImg, iconButton, img, keyButton, lazyImg, onTap, opacity, recycleFx, resizeSlice, slice, text, textWidth, tint } from '../ui/kit';
import { Screen } from '../ui/screen';
import { gameFrames, loadFrames } from '../ui/res';
import { popupCount } from '../ui/popup';
import { skillName } from '../ui/popups';
import { Page, ui } from '../ui/shell';
import { Board } from './board';
import { Crew, Field, Job } from './crew';
import * as Flow from './flow';
import { labSlots } from './labHooks';
import { KIND_STYLE, kindBanner, kindTag, levelKind } from './levelKind';
import { CarView, Station } from './station';
import { Train } from './train';

export interface GameArg {
  level: number;
  daily?: boolean;
  /** 每日挑战：这局算哪一天的（进场时定，过了零点结算也算进场那天） */
  day?: number;
  /** 每日挑战的重试怎么付（看过广告 / 金币）；不给 = 当天的免费次 */
  pay?: 'ad' | 'coins';
  /** 难度调试页的演示：电脑按参考解替玩家点，不记成绩、不扣命 */
  demo?: 'route';
}

/** 连击四档的颜色（蓝、金、红、紫） */
const COMBO_COLORS = [new Color(110, 215, 255), new Color(255, 214, 64), new Color(255, 110, 80), new Color(214, 130, 255)];
/** 升档夸奖词的字色 */
const PRAISE_FILL = [new Color(150, 240, 255), new Color(255, 222, 70), new Color(255, 150, 120), new Color(235, 170, 255)];
/** 连击「满屏」的强度，按档位：四边光框亮度、放射光亮度和转一圈的秒数、每秒冒几个光点 */
const FEVER = [
  { frame: 150, rays: 60, turn: 16, rise: 6 },
  { frame: 180, rays: 85, turn: 11, rise: 10 },
  { frame: 210, rays: 110, turn: 8, rise: 14 },
  { frame: 240, rays: 135, turn: 5.5, rise: 18 },
];
const PRAISE_TAG = 9202;
/** 技能键多大、间隔多少 */
const SKILL_S = 104;
const SKILL_GAP = 28;
const BADGE_W = 42;
const BADGE_H = 36;
/** 画四周那圈路：中线离画多远、路多宽；草地和沙子路的颜色 */
const PATH_OUT = 24;
const PATH_W = 38;
const GRASS = new Color(140, 211, 106, 255);
const GRASS_IN = new Color(154, 220, 120, 255);
const SAND = new Color(244, 222, 164, 255);
/** 小桥的图宽 ÷ 高 */
const BRIDGE_ASPECT = 0.82;
/** 草地上的小摆设：[图, 显示多高] */
const DECO: [string, number][] = [
  ['kit/deco_tuft1', 24],
  ['kit/deco_tuft2', 24],
  ['kit/deco_flower', 30],
  ['kit/deco_bush', 42],
  ['kit/deco_pebble', 14],
  ['kit/deco_tuft1', 22],
];
/** 倍速开关：开着就一直开着，换关不重置 */
let fast = false;

function mmss(sec: number): string {
  const t = Math.max(0, Math.ceil(sec));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
}

export class GamePage extends Page {
  // ---- 一局的状态
  lv!: DigLevel;
  s!: GameState;
  arg!: GameArg;
  combo = new Combo();
  /** 局内时钟（秒），连击窗口用 */
  clock = 0;
  moved = false;
  /** 这一局的每日任务进度记过了没有（Flow.endRun） */
  tallied = false;
  ended = false;
  paused = false;
  /** 本关各技能用了几次 */
  used: Record<string, number> = {};
  /** 强制教学用掉的那几次（不算进星级的道具数） */
  freebies = 0;
  /** 技能以外算「用了道具」的：复活 */
  extras = 0;
  /** 这一关要强制教的新技能（解锁关第一次能用上时压暗全屏只让点它）；"" = 没有 */
  tutor = '';
  demoStep = 0;
  /** 正在挑「调车」要叫的车厢：挑中了调这个（局内流程给的，里面扣技能） */
  private picking: ((track: number, index: number) => void) | null = null;
  private rng = new Rng(Date.now() >>> 0);

  // ---- 画面
  private bg!: Node;
  /** 场景和玩法之间的一层：连击时的放射光、往上冒的光点 */
  private under!: Node;
  private stage!: Node;
  private fly!: Node;
  private board!: Board;
  private progress!: Capsule;
  private clockCap: Capsule | null = null;
  private clockSecond = -1;
  private clockWarn = false;
  private station!: Station;
  private stationY = 0;
  /** 规则里的每个上场位，画面上是哪个方块（事件一到就改，动画用当时取到的那个） */
  private slotView: (CarView | null)[] = [];
  private vnow = 0;
  private crew: Crew | null = null;
  private train: Train | null = null;
  private field!: Field;
  /** 画的中心在特效层的哪里（算小人的路用） */
  private boardAt = new Vec3();
  /** 排活儿用的「画」：规则已经算到哪一步了，每个位置还摞着几颗（比画面上的走得快） */
  private plan: number[] = [];
  private groupSeq = 0;
  /** 每个方块现在有几个小人在去搬的路上 */
  private out = new Map<CarView, number>();
  private pendingWin = false;
  private pendingLose = false;
  private lastPickSfx = 0;
  private lastDropSfx = 0;
  /** 画面上已经搬走了几颗（顶栏的进度） */
  private shownCarried = 0;
  private speedLabel: Label | null = null;
  private skillNodes = new Map<string, { node: Node; icon: Node; count: Label; lock: Node; plus: Node; name: Node; badge: Node }>();
  private comboRow!: Node;
  private comboBadge!: Node;
  private comboNum!: Node;
  private comboWord!: Node;
  private comboWordW = 78;
  private comboY = 0;
  private frame!: Node;
  private frameHi = 0;
  private feverRays!: Node;
  private comboTier = -1;
  private comboColor = COLOR.white;
  private riseT = 0;
  private comboBreaking = false;
  private praiseNode: Node | null = null;
  private hintNode: Node | null = null;
  private tutorNode: Node | null = null;
  private kindTagNode: Node | null = null;
  private kindBannerNode: Node | null = null;
  private pointedNode: Node | null = null;
  private nudged = new Set<string>();
  private idle = 0;
  private autoT = 0;
  private fieldTop = 0;
  private fieldBottom = 0;
  private total = 0;

  /** 星级按它算：这一关用了几样道具（技能 + 复活，强制教学那几次不算） */
  get items(): number {
    return Math.max(0, this.usedAll - this.freebies) + this.extras;
  }

  get usedAll(): number {
    return Object.values(this.used).reduce((a, b) => a + b, 0);
  }

  /** 这一关的关卡号，每日挑战是 0（「前几关技能免费」不算每日挑战） */
  get freeLevelId(): number {
    return this.arg.daily ? 0 : this.arg.level;
  }

  /** 这一局发走了几节车厢（每日任务用） */
  get departed(): number {
    return this.s ? this.s.departed : 0;
  }

  /** 倍速：动画的时长都除以它 */
  private get speed(): number {
    return fast ? App.config.ui.dig.speed : 1;
  }

  skillFree(id: string): boolean {
    const eco = App.config.eco;
    return Skills.levelFree(eco, this.freeLevelId, this.usedAll) || Skills.freeAvailable(App.save.data, id, eco);
  }

  build(root: Node): void {
    this.bg = box('bg', root, Screen.W, Screen.H);
    this.under = box('under', root, Screen.W, Screen.H);
    this.stage = box('stage', root, Screen.W, Screen.H);
    this.fly = box('fly', root, Screen.W, Screen.H);
    // 每帧推进：倒计时、连击窗口、提示、代打
    // 小人每一帧都要走，跟着引擎的帧走（上面那个 30 帧的计时器会一顿一顿的）
    director.on(Director.EVENT_BEFORE_UPDATE, () => this.step(game.deltaTime));
    const ticker = box('ticker', root);
    tween(ticker)
      .repeatForever(
        tween(ticker)
          .delay(1 / 30)
          .call(() => {
            this.vnow += 1 / 30;
            this.update(1 / 30);
          }),
      )
      .start();
  }

  override show(arg?: unknown): void {
    this.arg = arg as GameArg;
    void this.start();
  }

  override back(): boolean {
    Flow.pause(this);
    return false;
  }

  private async start(): Promise<void> {
    ui.busy(true);
    this.ended = true;
    this.under.destroyAllChildren();
    this.stage.destroyAllChildren();
    this.fly.destroyAllChildren();
    const { config, save } = App;
    const id = this.arg.level;
    const file = Meta.levelFile(id, config.levelCount);
    const ease = this.arg.daily || this.arg.demo ? 0 : Meta.easeFor(save.data, config.eco, id);
    try {
      // 玩法：读关卡。微信版资源在网上，读不下来就提示、回主页（不扣命）
      this.lv = await config.loadLevel(file, ease);
      await loadFrames(gameFrames());
    } catch (e) {
      console.warn('关卡读不出来', e);
      ui.toast(tr('BOOT_FAIL'));
      ui.go('home');
      return;
    } finally {
      ui.busy(false);
    }
    if (!Flow.payDaily(this)) return;
    this.s = GameState.fromLevel(this.lv);
    if (this.arg.daily || this.arg.demo) this.s.clock = Infinity;
    // 难度调试页的整体档：装车位加减几个
    if (!this.arg.demo) {
      for (let d = labSlots(); d > 0; d--) this.s.slots.push(null);
      for (let d = labSlots(); d < 0 && this.s.slots.length > 1; d++) this.s.slots.pop();
    }
    this.combo = new Combo();
    this.comboTier = -1;
    this.comboBreaking = false;
    this.clock = 0;
    this.moved = false;
    this.tallied = false;
    this.ended = false;
    this.paused = false;
    this.used = {};
    this.freebies = 0;
    this.extras = 0;
    this.picking = null;
    this.demoStep = 0;
    this.idle = 0;
    this.total = this.lv.beads;
    this.layout(true);
    Flow.onLevelStart(this);
  }

  // ---------------------------------------------------------------- 版式

  /** 整个重画（开局、撤销、复活）；intro = 开局的进场动画 */
  private layout(intro: boolean): void {
    this.bg.destroyAllChildren();
    this.under.destroyAllChildren();
    this.stage.destroyAllChildren();
    this.fly.destroyAllChildren();
    this.slotView = [];
    this.crew = null;
    this.train = null;
    this.out.clear();
    this.pendingWin = false;
    this.pendingLose = false;
    this.groupSeq = 0;
    this.plan = this.s.cols.map((c) => c.length);
    this.shownCarried = this.total - this.s.beads;
    this.picking = null;
    this.skillNodes.clear();
    this.nudged.clear();
    this.pointedNode = null;
    this.hintNode = null;
    this.tutorNode = null;
    this.praiseNode = null;
    this.kindBannerNode = null;
    const eco = App.config.eco;
    // 背景：按章节换（bg/chapter_<id>），没配章节就用主页背景
    const chs = Chapters.list(eco);
    const ch = chs.length ? `bg/chapter_${chs[Chapters.forLevel(eco, Meta.levelFile(this.arg.level, App.config.levelCount))].id}` : 'bg/home';
    const bgH = Math.max(Screen.H, Screen.W * 1.5);
    lazyImg(this.bg, ch, (bgH * 1024) / 1536, bgH);

    // ---- 顶栏：微信小游戏（有胶囊）挪到胶囊那一行，设置键在最左；App 设置键在最右。关卡号居中，限时关中间换成倒计时
    const hudY = Screen.cap ? Screen.headY : Screen.top - (Screen.notchTop > 0 ? 33 + 8 : 52);
    const levelName = this.arg.daily ? tr('UI_TAB_DAILY') : tr('UI_LEVEL', this.arg.level);
    const rightEdge = Screen.cap ? Screen.headRight : Screen.W / 2 - 24 - 74 - 12;
    let progressRight = -Screen.W / 2;
    const midX = (w: number): number => Math.min(rightEdge - w / 2, Math.max(0, progressRight + 12 + w / 2));
    const timed = this.s.clock !== Infinity;
    const h = Screen.cap ? Screen.headH : 66;
    let x0 = -Screen.W / 2 + 24;
    if (Screen.cap) {
      const gearW = 76;
      at(iconButton(this.stage, 'kit/round_blue', 'kit/ic_gear', gearW, () => Flow.pause(this)), x0 + gearW / 2, hudY);
      x0 += gearW + 10;
    }
    // 进度：搬走了百分之几（宽度按最长的写法定，整关不变）
    this.progress = capsule(this.stage, Math.round((196 * h) / 66), h, 'icon/star', '', Math.round((34 * h) / 66), 'skin/f_hud', '100%');
    const realW = (this.progress.node.getComponent(UITransform) as UITransform).width;
    at(this.progress.node, x0 + realW / 2, hudY);
    progressRight = x0 + realW;
    this.levelTitle(levelName, hudY, midX, timed);
    this.clockCap = null;
    this.clockSecond = -1;
    this.clockWarn = false;
    if (timed) {
      this.clockSecond = Math.ceil(this.s.clock);
      this.clockCap = capsule(this.stage, Math.round((120 * h) / 66), h, null, mmss(this.s.clock), Math.round((34 * h) / 66), 'skin/f_hud');
      const cw = (this.clockCap.node.getComponent(UITransform) as UITransform).width;
      at(this.clockCap.node, midX(cw), hudY);
    }
    if (!Screen.cap) at(iconButton(this.stage, 'kit/round_blue', 'kit/ic_gear', 74, () => Flow.pause(this)), Screen.W / 2 - 24 - 37, hudY);

    // ---- 技能栏：贴着底部安全区
    const skillY = Screen.bottom + (Screen.safeBottom > 0 ? 10 : 26) + SKILL_S / 2;
    const ids = Skills.ids(eco);
    ids.forEach((sid, i) => this.buildSkill(sid, (i - (ids.length - 1) / 2) * (SKILL_S + SKILL_GAP), skillY));

    // ---- 排队区：技能栏上面；上场位：排队区上面；再往上是小人走的小路、铁轨（玩法）
    const trackTop = skillY + SKILL_S / 2 + 30 + Station.trackHeight();
    this.stationY = trackTop + 14 + Station.padHeight() / 2;
    const laneY = this.stationY + Station.padHeight() / 2 + 20;
    const railY = laneY + 22;
    /** 画四周那圈路最下面一段的中线：正好在车厢上面 */
    const ringB = railY + 100;

    // ---- 连击计（底座的，这款游戏不出）
    this.comboY = laneY;
    this.comboRow = box('combo', this.fly, 420, 120);
    at(this.comboRow, 0, this.comboY);
    this.comboBadge = box('badge', this.comboRow, 420, 120);
    // 「连击」：中文用艺术字图，其它语言用字
    if (language() === 'zh_CN') {
      this.comboWord = img(this.comboBadge, 'skin/j_combo_word', 110, 90, 'word');
      (this.comboWord.getComponent(UITransform) as UITransform).setAnchorPoint(0, 0.5);
      this.comboWordW = 110;
    } else {
      const word = text(this.comboBadge, tr('UI_COMBO_WORD'), 44, { align: 'left' });
      word.updateRenderData(true);
      this.comboWord = word.node;
      this.comboWordW = (word.node.getComponent(UITransform) as UITransform).width;
    }
    this.comboNum = box('num', this.comboBadge);
    this.comboRow.active = false;
    // 连击光框（四边柔光）和放射光（垫在玩法后面）
    this.frame = box('frame', this.under, Screen.W, Screen.H);
    for (const sx of [-1, 1]) at(img(this.frame, 'kit/fx_glow', 300, Screen.H * 1.2, 'side'), (sx * Screen.W) / 2, 0);
    for (const sy of [-1, 1]) at(img(this.frame, 'kit/fx_glow', Screen.W * 1.2, 280, 'cap'), 0, (sy * Screen.H) / 2);
    opacity(this.frame).opacity = 0;
    const raysS = Math.hypot(Screen.W, Screen.H) * 1.15;
    this.feverRays = img(this.under, 'kit/fx_rays', raysS, raysS, 'rays');
    opacity(this.feverRays).opacity = 0;

    // ---- 像素画：顶栏和火车之间的全部高度，四周留一圈路；画贴着下面放，路的最下面一段正好在车厢上面（玩法）
    this.fieldTop = hudY - h / 2 - 12;
    this.fieldBottom = laneY - PATH_W / 2;
    at(this.feverRays, 0, (this.fieldTop + this.fieldBottom) / 2);
    const maxW = Screen.W - 2 * (PATH_OUT + PATH_W / 2 + 14);
    const maxH = this.fieldTop - PATH_W / 2 - 4 - ringB - 2 * PATH_OUT;
    const holder = box('fieldHolder', this.stage, maxW, maxH);
    this.board = new Board(holder, maxW, maxH, this.lv);
    const bw = this.board.width;
    const bh = this.board.height;
    const by = ringB + PATH_OUT + bh / 2;
    at(holder, 0, by);
    this.boardAt.set(0, by, 0);
    this.field = {
      l: -bw / 2 - PATH_OUT,
      r: bw / 2 + PATH_OUT,
      b: ringB,
      t: by + bh / 2 + PATH_OUT,
      bridgeX: -Screen.W / 2 + 58,
      laneY,
      carPos: (car) => car.node.position,
    };
    // 草地、沙子路（垫在最下面）
    const f = this.field;
    const ground = box('ground', this.under);
    ground.setSiblingIndex(0);
    at(tint(ground, Screen.W, this.fieldTop + 8 - this.fieldBottom, GRASS, 'grass'), 0, (this.fieldTop + 8 + this.fieldBottom) / 2);
    const paint = (n: Node, c: Color): void => {
      (n.getChildByName('skin')?.getComponent(Sprite) as Sprite).color = c;
    };
    const ring = slice(ground, 'kit/round_white', f.r - f.l + PATH_W, f.t - f.b + PATH_W, 'ring');
    at(ring, 0, (f.t + f.b) / 2);
    paint(ring, SAND);
    const inner = slice(ground, 'kit/round_white', f.r - f.l - PATH_W, f.t - f.b - PATH_W, 'inner');
    at(inner, 0, (f.t + f.b) / 2);
    paint(inner, GRASS_IN);
    // 上场位和铁轨之间的小路、桥头接到那圈路上的一段
    at(tint(ground, Screen.W, PATH_W, SAND, 'lane'), 0, laneY);
    if (f.bridgeX < f.l) at(tint(ground, f.l - f.bridgeX + PATH_W, PATH_W, SAND, 'link'), (f.l + f.bridgeX) / 2, f.b);
    this.board.build(this.s, intro, App.config.ui.intro.stagger);
    // ---- 铁轨、火车、小桥
    const cfg = App.config.ui.dig;
    const tc = App.config.levels.train;
    let perWagon = tc.perWagon;
    if (this.total < tc.wagons * perWagon * tc.minTrains) perWagon = Math.max(4, Math.ceil(this.total / (tc.wagons * tc.minTrains) / 4) * 4);
    const rail = box('rail', this.stage);
    this.train = new Train(rail, this.board.colors, Screen.W, railY, tc.wagons, perWagon, this.total, this.shownCarried, cfg.trainMove, () => this.speed, (kind) => {
      // 进站：一阵「哧哧」；开走：先鸣笛
      if (kind === 'out') {
        sfx('whistle');
        buzz('light');
      }
      sfx('chug', 0, kind === 'out' ? 0.8 : 0.5);
    }, () => {
      if (this.vnow - this.lastDropSfx < 0.09) return;
      this.lastDropSfx = this.vnow;
      sfx('bowl', 0, 0.3);
    });
    // 小桥：跨过铁轨，桥面的两头接着下面的小路和上面那圈路
    const bridgeH = ringB - laneY + PATH_W + 6;
    at(img(this.stage, 'kit/bridge', bridgeH * BRIDGE_ASPECT, bridgeH, 'bridge'), f.bridgeX, (ringB + laneY) / 2);
    this.decorate(ground);
    // ---- 上场位、排队区、已经在场上的方块（复活后重画）
    this.station = new Station(
      this.stage,
      this.board.colors,
      Screen.W,
      this.stationY,
      trackTop,
      !this.s.slotAdded,
      (car) => this.tapCar(car),
      () => Flow.useSkill(this, 'slot'),
    );
    this.station.build(this.s);
    this.slotView = this.station.places.slice();
    // ---- 小人
    this.crew = new Crew(
      this.fly,
      this.board.colors,
      this.field,
      this.train,
      { walk: cfg.walk, gap: cfg.gap, maxWalkers: cfg.maxWalkers },
      (job) => this.picked(job),
      (job) => {
        this.out.set(job.car, (this.out.get(job.car) ?? 0) + 1);
        this.station.bump(job.car, 0.035);
      },
    );
    // ---- 倍速开关：排队区右边
    const sp = slice(this.stage, 'kit/capsule', 84, 50, 'speed');
    at(sp, Screen.W / 2 - 20 - 42, trackTop - 36);
    this.speedLabel = text(sp, '', 28);
    onTap(sp, () => {
      fast = !fast;
      this.refreshSpeed();
    });
    this.refreshSpeed();
    this.refreshHud();
    this.refreshSkills();
  }

  private refreshSpeed(): void {
    if (this.speedLabel) this.speedLabel.string = `×${this.speed}`;
  }

  /** 草地上撒几样小摆设：只放在那圈路外面的空地上（左右两条、上面一条），位置按关卡号定，同一关每次都一样 */
  private decorate(ground: Node): void {
    const f = this.field;
    const rng = new Rng(this.lv.id * 7919 + 17);
    const zones: [number, number, number, number][] = [
      [-Screen.W / 2 + 14, f.l - PATH_W / 2 - 16, f.b + 70, f.t + 10],
      [f.r + PATH_W / 2 + 16, Screen.W / 2 - 14, f.b + 110, f.t + 10],
      [-Screen.W / 2 + 20, Screen.W / 2 - 20, f.t + PATH_W / 2 + 16, this.fieldTop - 12],
    ];
    for (const [x0, x1, y0, y1] of zones) {
      if (x1 - x0 < 24 || y1 - y0 < 24) continue;
      const n = Math.max(1, Math.round(((x1 - x0) * (y1 - y0)) / 9000));
      for (let i = 0; i < Math.min(6, n); i++) {
        const [path, h] = DECO[Math.floor(rng.randf() * DECO.length) % DECO.length];
        at(img(ground, path, undefined, h, 'deco'), x0 + rng.randf() * (x1 - x0), y0 + rng.randf() * (y1 - y0));
      }
    }
  }

  /** 画上第 x 列第 y 行的中心，在特效层里的坐标（可以在画外面一圈） */
  private cellAt(x: number, y: number): Vec3 {
    const p = this.board.posXY(x, y);
    return new Vec3(this.boardAt.x + p.x, this.boardAt.y + p.y, 0);
  }

  private buildSkill(id: string, x: number, y: number): void {
    const S = SKILL_S;
    const node = img(this.stage, 'skin/f_skill', S, S, id);
    at(node, x, y);
    const icon = img(node, `icon/skill_${id}`, 76, 76, 'icon');
    at(icon, 0, 11);
    const name = text(node, skillName(id), 22);
    at(name.node, 0, -37);
    fit(name, S - 8, 22, 15);
    const badge = slice(node, 'kit/tag_red', BADGE_W, BADGE_H, 'badge');
    at(badge, S / 2 - BADGE_W / 2 + 8, S / 2 - 10);
    const count = text(badge, '', 24);
    at(count.node, 0, 2);
    const plus = keyButton(node, 'green', 'kit/ic_plus', 42, null, 0.56);
    at(plus, S / 2 - 12, S / 2 - 10);
    const lock = box('lock', node, S, S);
    at(img(lock, 'kit/ic_lock', 38, 38, 'icon'), 0, 12);
    const lockLabel = text(lock, tr('H_ENTRY_LOCKED', Skills.unlockLevel(App.config.eco, id)), 20);
    at(lockLabel.node, 0, -37);
    fit(lockLabel, S - 8, 22, 14);
    onTap(node, () => Flow.useSkill(this, id));
    this.skillNodes.set(id, { node, icon, count, lock, plus, name: name.node, badge });
  }

  /** 技能键：没解锁灰 + 锁；有库存写数量，免费写「免费」，没有了换绿色加号（点了去买） */
  refreshSkills(): void {
    const save = App.save.data;
    const eco = App.config.eco;
    const lvl = this.arg.daily ? save.level : Math.max(save.level, this.arg.level);
    for (const [id, v] of this.skillNodes) {
      const unlocked = Skills.isUnlocked(eco, id, lvl);
      v.lock.active = !unlocked;
      (v.icon.getComponent(Sprite) as Sprite).grayscale = !unlocked;
      opacity(v.icon).opacity = unlocked ? 255 : 110;
      v.name.active = unlocked;
      const n = Skills.count(save, id);
      const free = this.skillFree(id);
      v.badge.active = unlocked && (n > 0 || free);
      v.plus.active = unlocked && n <= 0 && !free;
      v.count.string = free ? tr('UI_SKILL_FREE') : String(Math.min(n, App.config.ui.badgeCap));
      fit(v.count, SKILL_S - 26, 24, 16);
      const bw = Math.max(BADGE_W, Math.round(textWidth(v.count) + 20));
      resizeSlice(v.badge, bw, BADGE_H);
      at(v.badge, SKILL_S / 2 - bw / 2 + 8, SKILL_S / 2 - 10);
    }
  }

  /** 进度、装车位告急（只剩 warnFree 个空位变红）、该用道具时技能键发光 + 小手 */
  refreshHud(): void {
    this.progress.set(`${this.total > 0 ? Math.floor((this.shownCarried * 100) / this.total) : 0}%`);
    const cfg = App.config.ui.station;
    const free = this.s.freeSlots();
    const playing = this.s.status === Status.PLAYING;
    // 一次点击算完以后还停在站台上的车厢都是在等豆的，所以空位少就是告急
    const tight = playing && this.moved && free < this.s.slots.length;
    this.station.setWarn(tight && free <= cfg.warnFree);
    const nudge = tight && free <= cfg.skillNudgeFree;
    const hand = nudge ? (cfg.nudgeHand.find((id) => this.skillUsable(id)) ?? null) : null;
    this.pointSkill(hand);
    for (const [id, v] of this.skillNodes) {
      const on = nudge && !v.lock.active && cfg.rescueSkills.includes(id);
      if (on && !this.nudged.has(id)) {
        this.nudged.add(id);
        fx.breathe(v.icon, 0.12, 0.6);
      } else if (!on && this.nudged.has(id)) {
        this.nudged.delete(id);
        Tween.stopAllByTarget(v.icon);
        v.icon.setScale(1, 1, 1);
      }
    }
  }

  private skillUsable(id: string): boolean {
    const v = this.skillNodes.get(id);
    if (!v || v.lock.active) return false;
    const why = Skills.canUse(App.save.data, App.config.eco, id, this.used[id] ?? 0, this.freeLevelId, this.usedAll);
    return (why === '' || why === 'empty') && Flow.hasEffect(this, id) === null;
  }

  private pointSkill(id: string | null): void {
    const node = id === null ? null : (this.skillNodes.get(id)?.node ?? null);
    if (this.pointedNode === node) return;
    this.pointedNode?.getChildByName('finger')?.destroy();
    this.pointedNode = node;
    if (node) addFinger(node);
  }

  // ---------------------------------------------------------------- 输入（玩法）

  /** 点了一节车厢：待发线最前面的进站；后排的只有在挑「调车」时才点得动 */
  private tapCar(car: CarView): void {
    if (this.arg.demo) return;
    const at0 = this.station.find(car);
    if (!at0) return; // 已经在站台上了
    const [track, index] = at0;
    const pick = this.picking;
    if (pick && index > 0) {
      if (!this.canEnter()) return this.refuse(car);
      pick(track, index);
      return;
    }
    if (pick) this.endPick();
    // 不在挑车时点后排，按点这条线最前面的算
    this.doTap(track);
  }

  /** 现在叫得了车吗：规则里有空装车位，而且画面上也有（上一节还没开走的位子不能用） */
  private canEnter(): boolean {
    return this.s.freeSlot() >= 0 && this.station.freePlace() >= 0;
  }

  private refuse(car: CarView | null): void {
    if (car) this.station.shake(car);
    this.station.flashPads();
    sfx('error');
  }

  /** 第 track 条线的车厢进站（index > 0 是「调车」叫的后排）。点不动返回 false */
  doTap(track: number, index = 0): boolean {
    if (this.ended || this.paused || this.s.status !== Status.PLAYING) return false;
    if (this.kindBannerNode) this.dismissKindBanner();
    const list = this.s.tracks[track];
    if (!list || index >= list.length) return false;
    if (!this.canEnter()) {
      this.refuse(this.station.tracks[track]?.[index] ?? null);
      return false;
    }
    const ev = index === 0 ? Rules.tap(this.s, track) : Rules.useShunt(this.s, track, index);
    if (ev.length === 0) return false;
    this.clearHint();
    if (!this.moved) {
      this.moved = true;
      Flow.onFirstMove(this);
    }
    this.play(ev);
    this.refreshSkills();
    return true;
  }

  /** 用道具等改了局面的操作：算出事件并播 */
  act(step: () => GameEvent[]): void {
    const ev = step();
    this.play(ev);
    this.refreshSkills();
  }

  /**
   * 玩法：按事件播表现。规则已经当场算完，这里把要搬的豆一颗颗排给小人（crew.ts 管什么时候出发）：
   * 上场马上播；同一次点击里同一轮搬的豆算一批，后一批不会比前一批先被搬走；数字搬到 0 的方块离场
   */
  play(events: GameEvent[]): void {
    const cfg = App.config.ui.dig;
    const crew = this.crew;
    if (!crew) return;
    let round = -1;
    let group = 0;
    let paths: ((p: number) => Vec3[]) | null = null;
    let taken: number[] = [];
    const flush = (): void => {
      for (const p of taken) this.plan[p] = Math.max(0, this.plan[p] - 1);
      taken = [];
    };
    for (const e of events) {
      if (e.type === 'enter') {
        const place = this.station.freePlace();
        const car = this.station.enter(e.track, e.index, place, cfg.enter / this.speed);
        this.slotView[e.slot] = car;
        car.readyAt = crew.now + cfg.enter;
        sfx('enter');
        buzz('light');
      } else if (e.type === 'dig') {
        if (e.round !== round || !paths) {
          flush();
          round = e.round;
          group = ++this.groupSeq;
          paths = this.pathFinder();
        }
        const car = this.slotView[e.slot];
        if (!car) continue;
        for (const p of e.cells) {
          crew.add({ car, cell: p, color: e.c, group, inside: paths(p) });
          taken.push(p);
        }
      } else if (e.type === 'depart') {
        const car = this.slotView[e.slot];
        this.slotView[e.slot] = null;
        if (!car) continue;
        car.done = true;
        if (car.left <= 0) this.station.leave(car);
      } else if (e.type === 'slot') {
        while (this.slotView.length < e.count) this.slotView.push(null);
        this.station.setSlots(e.count);
        sfx('unlock');
      } else if (e.type === 'win') {
        this.ended = true;
        this.pendingWin = true;
      } else if (e.type === 'lose') {
        this.pendingLose = true;
      }
    }
    flush();
    this.refreshHud();
  }

  /**
   * 给这一批要搬的豆找路：从画外面那一圈，穿过已经空了的格子，走到豆旁边。
   * 返回的函数：第 p 个位置的豆 → 一串点（第 0 个在那圈路上，最后一个在豆旁边）
   */
  private pathFinder(): (p: number) => Vec3[] {
    const w = this.lv.w;
    const h = this.lv.h;
    const W2 = w + 2;
    const H2 = h + 2;
    const dist = new Int32Array(W2 * H2).fill(-1);
    const from = new Int32Array(W2 * H2).fill(-1);
    const queue = new Int32Array(W2 * H2);
    let tail = 0;
    const open = (gx: number, gy: number): boolean => gx === 0 || gy === 0 || gx === W2 - 1 || gy === H2 - 1 || this.plan[(gy - 1) * w + (gx - 1)] === 0;
    for (let gy = 0; gy < H2; gy++) {
      for (let gx = 0; gx < W2; gx++) {
        if (gx === 0 || gy === 0 || gx === W2 - 1 || gy === H2 - 1) {
          dist[gy * W2 + gx] = 0;
          queue[tail++] = gy * W2 + gx;
        }
      }
    }
    const DX = [1, -1, 0, 0];
    const DY = [0, 0, 1, -1];
    for (let head = 0; head < tail; head++) {
      const q = queue[head];
      const gx = q % W2;
      const gy = (q - gx) / W2;
      for (let k = 0; k < 4; k++) {
        const nx = gx + DX[k];
        const ny = gy + DY[k];
        if (nx < 0 || ny < 0 || nx >= W2 || ny >= H2) continue;
        const n = ny * W2 + nx;
        if (dist[n] >= 0 || !open(nx, ny)) continue;
        dist[n] = dist[q] + 1;
        from[n] = q;
        queue[tail++] = n;
      }
    }
    const f = this.field;
    /** 画外面一圈的格子 → 那圈路上对着它的点 */
    const onRing = (gx: number, gy: number): Vec3 => {
      const c = this.cellAt(gx - 1, gy - 1);
      if (gx === 0) return new Vec3(f.l, Math.min(f.t, Math.max(f.b, c.y)), 0);
      if (gx === W2 - 1) return new Vec3(f.r, Math.min(f.t, Math.max(f.b, c.y)), 0);
      if (gy === 0) return new Vec3(c.x, f.t, 0);
      return new Vec3(c.x, f.b, 0);
    };
    return (p: number): Vec3[] => {
      const x = p % w;
      const y = (p - x) / w;
      const bead = this.cellAt(x, y);
      let best = -1;
      for (let k = 0; k < 4; k++) {
        const n = (y + 1 + DY[k]) * W2 + (x + 1 + DX[k]);
        if (dist[n] >= 0 && (best < 0 || dist[n] < dist[best])) best = n;
      }
      if (best < 0) {
        // 没有空格子通到它（磁铁吸的、叠层的）：从最近的一边直接走过去
        const d = [x, w - 1 - x, y, h - 1 - y];
        const k = d.indexOf(Math.min(...d));
        const edge = k === 0 ? onRing(0, y + 1) : k === 1 ? onRing(W2 - 1, y + 1) : k === 2 ? onRing(x + 1, 0) : onRing(x + 1, H2 - 1);
        return [edge, bead];
      }
      const cells: number[] = [];
      for (let q = best; q >= 0; q = from[q]) cells.push(q);
      // cells：从豆旁边的空格子一路到画外面那一圈；倒过来就是进去的路
      const border = cells[cells.length - 1];
      const bx = border % W2;
      const pts: Vec3[] = [onRing(bx, (border - bx) / W2)];
      for (let i = cells.length - 2; i >= 0; i--) {
        const gx = cells[i] % W2;
        pts.push(this.cellAt(gx - 1, (cells[i] - gx) / W2 - 1));
      }
      const last = pts[pts.length - 1];
      // 停在豆的边上，不踩上去
      pts.push(cells.length === 1 ? new Vec3(bead.x + (last.x - bead.x) * 0.01, bead.y + (last.y - bead.y) * 0.01, 0) : new Vec3(last.x + (bead.x - last.x) * 0.45, last.y + (bead.y - last.y) * 0.45, 0));
      return pts;
    };
  }

  /** 一个小人抱起了一颗豆：豆从画上消失，方块的数字减 1，搬完的方块离场 */
  private picked(job: Job): void {
    const car = job.car;
    this.board.dig(job.cell);
    this.out.set(car, Math.max(0, (this.out.get(car) ?? 1) - 1));
    this.shownCarried++;
    if (this.vnow - this.lastPickSfx > 0.07) {
      this.lastPickSfx = this.vnow;
      sfx('bo', 0, 0.45);
    }
    if (!car.node.isValid) return;
    this.station.setLeft(car, car.left - 1);
    if (car.left <= 0 && car.done) {
      const x = car.node.position.x;
      this.station.leave(car);
      this.out.delete(car);
      sfx('done');
      buzz('light');
      fx.sparkle(this.fly, x, this.stationY, 10, 110, this.board.colors[car.c], 28);
    }
    this.refreshHud();
  }

  /** 每一帧：小人走路；该过关、该判输的时候收尾；标出在等豆的方块 */
  private step(dt: number): void {
    const crew = this.crew;
    if (!crew || !this.s || !this.stage.isValid || !this.stage.activeInHierarchy) return;
    if (this.paused || ui.currentName !== 'game' || popupCount() > 0) return;
    crew.update(Math.min(dt, 0.05), this.speed);
    for (const car of this.station.places) {
      if (!car) continue;
      const idle = car.left > 0 && crew.now > car.readyAt + 0.2 && !crew.pending(car) && (this.out.get(car) ?? 0) === 0;
      this.station.setWait(car, idle);
    }
    if (this.pendingWin && crew.empty && this.train?.finished) {
      this.pendingWin = false;
      this.celebrate();
      fx.delay(this.fly, 1.2, () => Flow.win(this));
    }
    if (this.pendingLose && !crew.busy) {
      this.pendingLose = false;
      fx.delay(this.fly, 0.25, () => Flow.lose(this));
    }
  }

  /** 复活等改了局面以后：整个重画 */
  resync(): void {
    this.layout(false);
  }

  /** 技能「调车」：开始挑车厢，挑中了调 pick（没点后排的车厢就取消） */
  startPick(pick: (track: number, index: number) => void): void {
    this.clearHint();
    this.picking = pick;
    this.station.highlightBack(true);
    ui.toast(tr('UI_SHUNT_PICK'));
  }

  endPick(): void {
    if (!this.picking) return;
    this.picking = null;
    this.station.highlightBack(false);
  }

  get isPicking(): boolean {
    return this.picking !== null;
  }

  /** 该搬的豆都被抱起来了吗（还在往火车走的不算） */
  get quiet(): boolean {
    return !this.crew || !this.crew.busy;
  }

  // ---------------------------------------------------------------- 连击（底座：换玩法照用，玩法只管在「命中」时调 hitCombo）

  /** 这款游戏不调它（docs/01 第 1.5 节不做连击）；留着是因为连击的满屏表现是底座的 */
  protected hitCombo(x = 0): void {
    const eco = App.config.eco;
    const r = this.combo.hit(this.clock, eco.combo, this.rng, this.arg.daily === true);
    if (this.ended && this.s.status !== Status.WON) return;
    if (r.tier >= 0) sfx('hit', r.count - eco.combo.startAt);
    if (r.count >= 2) buzz('light');
    if (r.tier < 0) {
      this.comboRow.active = false;
      if (r.count >= 2) this.hitPop(`×${r.count}`, 30 + r.count * 4);
      return;
    }
    const col = COMBO_COLORS[r.tier] ?? COLOR.white;
    const was = this.comboRow.active && !this.comboBreaking;
    this.comboBreaking = false;
    this.comboRow.active = true;
    const dw = artNumber(this.comboNum, `×${r.count}`, 88, 'left');
    const groupW = this.comboWordW + 16 + dw;
    at(this.comboWord, -groupW / 2, 0);
    at(this.comboNum, -groupW / 2 + this.comboWordW + 16, 0);
    if (r.coins > 0) {
      const cl = text(null, `+${r.coins}`, 28, { color: COLOR.yellow });
      at(img(cl.node, 'icon/coin', 28, 28, 'coin'), -34, 0);
      fx.floatUp(this.fly, cl.node, groupW / 2 + 50, this.comboY - 10, 26, 0.6);
    }
    if (!was) {
      Tween.stopAllByTarget(this.comboRow);
      Tween.stopAllByTarget(opacity(this.comboRow));
      at(this.comboRow, 0, this.comboY);
      opacity(this.comboRow).opacity = 255;
      fx.popIn(this.comboRow, 0, 0.25);
    }
    // 数字砸下来：放大 2 倍、略歪，回弹到正
    const ln = this.comboNum;
    Tween.stopAllByTarget(ln);
    ln.setScale(2, 2, 1);
    ln.angle = (Math.random() - 0.5) * 8;
    tween(ln).to(0.26, { scale: new Vec3(1, 1, 1), angle: 0 }, { easing: 'backOut' }).start();
    const bd = this.comboBadge;
    Tween.stopAllByTarget(bd);
    bd.setScale(1.14, 1.14, 1);
    tween(bd).to(0.16, { scale: new Vec3(1, 1, 1) }, { easing: 'quadOut' }).start();
    fx.sparkle(this.fly, 0, this.comboY, 6 + Math.min(r.count, 10), 110, col, 28);
    fx.glowPop(this.under, x, this.stationY, 300 + r.tier * 40, col, 0.3, 240);
    fx.ring(this.under, x, this.stationY, 80, 280 + r.tier * 40, col);
    fx.punch(this.stage, 1.008 + r.tier * 0.004);
    this.setFever(r.tier, col);
    this.pulseFrame();
    if (r.tier_up) this.praise(tr(eco.combo.tiers[r.tier].key), r.tier, col);
    if (r.card) Flow.comboCard(this);
  }

  private hitPop(s: string, size0: number): void {
    const n = box('pop', null);
    artNumber(n, s, size0);
    n.angle = (Math.random() - 0.5) * 14;
    fx.floatUp(this.fly, n, 0, this.comboY - 6, 24, 0.5);
  }

  /** 连击满屏的常驻部分：四边光框、放射光、光点，随档位换色；tier < 0 全部收掉 */
  private setFever(tier: number, col: Color): void {
    if (tier === this.comboTier) return;
    this.comboTier = tier;
    this.comboColor = col;
    const fop = opacity(this.frame);
    const rop = opacity(this.feverRays);
    Tween.stopAllByTarget(fop);
    Tween.stopAllByTarget(rop);
    if (tier < 0) {
      this.frameHi = 0;
      tween(fop).to(0.3, { opacity: 0 }).start();
      tween(rop).to(0.4, { opacity: 0 }).start();
      return;
    }
    const f = FEVER[Math.min(tier, FEVER.length - 1)];
    for (const g of this.frame.children) (g.getComponent(Sprite) as Sprite).color = col;
    (this.feverRays.getComponent(Sprite) as Sprite).color = col;
    this.frameHi = f.frame;
    this.breatheFrame();
    tween(rop).to(0.4, { opacity: f.rays }).start();
    Tween.stopAllByTarget(this.feverRays);
    tween(this.feverRays).repeatForever(tween(this.feverRays).by(f.turn, { angle: -360 })).start();
  }

  private breatheFrame(): void {
    const op = opacity(this.frame);
    const hi = this.frameHi;
    const period = 1.1 - Math.max(0, this.comboTier) * 0.18;
    tween(op)
      .to(0.2, { opacity: hi })
      .call(() => {
        tween(op)
          .repeatForever(tween(op).to(period / 2, { opacity: Math.round(hi * 0.6) }).to(period / 2, { opacity: hi }))
          .start();
      })
      .start();
  }

  private pulseFrame(): void {
    if (this.frameHi <= 0) return;
    const op = opacity(this.frame);
    Tween.stopAllByTarget(op);
    op.opacity = 255;
    this.breatheFrame();
  }

  private spawnRise(): void {
    const tier = Math.max(0, this.comboTier);
    const s0 = 22 + Math.random() * 30;
    const n = fxImg(this.under, 'kit/fx_spark', s0, s0, 'rise');
    (n.getComponent(Sprite) as Sprite).color = this.comboColor;
    const x = (Math.random() - 0.5) * Screen.W;
    const y0 = Screen.bottom - 30;
    const y1 = Screen.bottom + Screen.H * (0.55 + Math.random() * 0.5);
    const dur = (1.5 + Math.random() * 0.9) * (1 - tier * 0.1);
    at(n, x, y0);
    const op = opacity(n);
    op.opacity = 235;
    tween(n)
      .to(dur, { position: new Vec3(x + (Math.random() - 0.5) * 90, y1, 0), angle: 200 }, { easing: 'quadOut' })
      .call(() => recycleFx(n))
      .start();
    tween(op).delay(dur * 0.55).to(dur * 0.45, { opacity: 0 }).start();
  }

  private boom(x: number, y: number, col: Color, loud = true, layer: Node = this.fly): void {
    fx.glowPop(layer, x, y, 380, col, 0.3);
    fx.ring(layer, x, y, 60, 420, col);
    fx.ring(layer, x, y, 30, 240, COLOR.white);
    fx.sparkle(layer, x, y, 26, 280, col, 52);
    fx.sparkle(layer, x, y, 12, 140, COLOR.white, 30);
    if (loud) sfx('firework');
  }

  /** 连击升档：夸奖词砸下来（中文用艺术字图），整屏闪、放射光、冲击波、屏幕震、彩纸；高档再放烟花 */
  private praise(word: string, tier: number, col: Color): void {
    const y = (this.fieldTop + this.fieldBottom) / 2;
    if (this.praiseNode?.isValid) this.praiseNode.destroy();
    const meter = opacity(this.comboBadge);
    Tween.stopAllByTag(PRAISE_TAG, meter);
    tween(meter).tag(PRAISE_TAG).to(0.08, { opacity: 0 }).delay(1.05).to(0.2, { opacity: 255 }).start();
    const holder = box('praise', this.fly, 420, 200);
    this.praiseNode = holder;
    at(holder, 0, y);
    const glow = img(holder, 'kit/fx_glow', 380, 200, 'glow');
    (glow.getComponent(Sprite) as Sprite).color = col;
    glow.setScale(0.3, 0.3, 1);
    tween(glow).to(0.22, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' }).start();
    const star = img(holder, 'skin/j_burst', 190, 204, 'burst');
    star.setScale(0.2, 0.2, 1);
    tween(star).to(0.2, { scale: new Vec3(1.1, 1.1, 1) }, { easing: 'quadOut' }).to(0.12, { scale: new Vec3(1, 1, 1) }).start();
    tween(star).by(1.4, { angle: -50 }).start();
    const ww = 290;
    const node =
      language() === 'zh_CN'
        ? img(holder, `skin/j_praise_${tier + 1}`, ww, (ww * (tier === 2 ? 341 : 381)) / 660, 'word')
        : text(holder, word, 68, { color: PRAISE_FILL[tier] ?? COLOR.white, outline: COLOR.navy, outlineWidth: 6 }).node;
    at(node, 0, 6);
    node.setScale(2.4, 2.4, 1);
    node.angle = -8;
    const lop = opacity(node);
    lop.opacity = 0;
    tween(lop).to(0.08, { opacity: 255 }).start();
    tween(node)
      .to(0.15, { scale: new Vec3(0.9, 0.9, 1), angle: 0 }, { easing: 'quadIn' })
      .call(() => this.praiseImpact(y, tier, col))
      .to(0.14, { scale: new Vec3(1.06, 1.06, 1) }, { easing: 'quadOut' })
      .to(0.1, { scale: new Vec3(1, 1, 1) })
      .start();
    // 停一下，缩小飞进连击计
    fx.delay(this.fly, 0.9, () => {
      if (!holder.isValid) return;
      fx.flyArc(holder, 0, this.comboY, 0.3, 40, 'quadIn', () => {
        if (holder.isValid) holder.destroy();
        if (!this.comboRow.active) return;
        const bd = this.comboBadge;
        Tween.stopAllByTarget(bd);
        bd.setScale(1.3, 1.3, 1);
        tween(bd).to(0.22, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' }).start();
        fx.sparkle(this.fly, 0, this.comboY, 12, 140, col, 32);
      }, 0.15);
      tween(opacity(holder)).delay(0.14).to(0.16, { opacity: 0 }).start();
    });
    sfx('tier', tier + 1);
  }

  private praiseImpact(y: number, tier: number, col: Color): void {
    const half = Screen.W / 2;
    const reach = Math.hypot(Screen.W, Screen.H);
    buzz(tier >= 2 ? 'heavy' : 'medium');
    fx.trauma(this.stage, 0.5 + tier * 0.12, 20);
    fx.flash(this.under, Screen.W, Screen.H, 90 + tier * 25, col);
    fx.rayBurst(this.under, 0, y, reach * 1.2, col, 0.6, 190);
    fx.ring(this.under, 0, y, 140, reach * 1.1, col, 0.55);
    fx.ring(this.under, 0, y, 100, 620, COLOR.white, 0.4);
    fx.sparkle(this.under, 0, y, 18 + tier * 4, 340, col, 44);
    const n = 16 + tier * 10;
    fx.cannon(this.under, -half - 10, this.fieldBottom - 20, 66, n, 900 + tier * 110);
    fx.cannon(this.under, half + 10, this.fieldBottom - 20, 114, n, 900 + tier * 110);
    const mid = (this.fieldTop + this.fieldBottom) / 2;
    const span = (this.fieldTop - this.fieldBottom) / 2;
    for (let i = 0; i < (tier >= 3 ? 5 : tier >= 2 ? 3 : 0); i++) {
      fx.delay(this.under, 0.12 + i * 0.14, () => {
        this.boom((Math.random() - 0.5) * (Screen.W - 160), mid + (Math.random() - 0.5) * span * 1.4, COMBO_COLORS[(tier + i) % COMBO_COLORS.length], i % 2 === 0, this.under);
      });
    }
  }

  /** 过关庆祝：闪白、放射光、震屏、两角喷彩纸、四发烟花；连击计和满屏收掉 */
  private celebrate(): void {
    this.comboRow.active = false;
    this.setFever(-1, COLOR.white);
    const mid = (this.fieldTop + this.fieldBottom) / 2;
    const half = Screen.W / 2;
    fx.flash(this.fly, Screen.W, Screen.H, 170);
    fx.rayBurst(this.fly, 0, mid, Math.hypot(Screen.W, Screen.H) * 1.2, COLOR.yellow, 0.8, 170);
    fx.ring(this.fly, 0, mid, 140, Screen.H * 1.2, COLOR.white, 0.6);
    fx.trauma(this.stage, 0.6, 20);
    fx.cannon(this.fly, -half - 10, this.fieldBottom - 20, 68, 60, 1250);
    fx.cannon(this.fly, half + 10, this.fieldBottom - 20, 112, 60, 1250);
    const cols = [new Color(255, 214, 64), new Color(110, 215, 255), new Color(255, 120, 200), new Color(140, 255, 120)];
    [[-160, mid + 200], [180, mid + 90], [-40, mid - 60], [150, mid - 220]].forEach(([x, y], i) => {
      fx.delay(this.fly, 0.1 + i * 0.2, () => {
        this.boom(x, y, cols[i]);
        buzz('light');
      });
    });
    buzz('heavy');
  }

  /** 断连：数字变灰，整块抖一下往下掉、淡出 */
  private missCombo(): void {
    const had = this.comboRow.active && !this.comboBreaking;
    this.combo.miss();
    this.setFever(-1, COLOR.white);
    if (!had) return;
    this.comboBreaking = true;
    for (const g of this.comboNum.children) {
      const sp = g.getComponent(Sprite);
      if (sp) sp.grayscale = true;
    }
    const row = this.comboRow;
    Tween.stopAllByTarget(row);
    const y = this.comboY;
    tween(row)
      .to(0.05, { position: new Vec3(-6, y, 0) })
      .to(0.05, { position: new Vec3(6, y, 0) })
      .to(0.05, { position: new Vec3(0, y, 0) })
      .to(0.25, { position: new Vec3(0, y - 24, 0) }, { easing: 'quadIn' })
      .call(() => {
        this.comboBreaking = false;
        row.active = false;
        at(row, 0, y);
        opacity(row).opacity = 255;
      })
      .start();
    const op = opacity(row);
    Tween.stopAllByTarget(op);
    tween(op).delay(0.15).to(0.25, { opacity: 0 }).start();
  }

  // ---------------------------------------------------------------- 每帧

  private update(dt: number): void {
    if (!this.node?.active || !this.s || this.ended) return;
    if (this.paused || ui.currentName !== 'game' || popupCount() > 0) return;
    this.clock += dt;
    // 连击到点就断
    if (this.comboRow.active && !this.comboBreaking && this.clock - this.combo.lastAt > App.config.eco.combo.windowSeconds) this.missCombo();
    if (this.comboTier >= 0) {
      this.riseT += dt * FEVER[Math.min(this.comboTier, FEVER.length - 1)].rise;
      while (this.riseT >= 1) {
        this.riseT -= 1;
        this.spawnRise();
      }
    }
    // 限时关：走第一步才开始走
    if (this.s.status === Status.PLAYING && this.moved) {
      const ev = Rules.tick(this.s, dt);
      if (ev.length) this.play(ev);
      this.syncClock();
    }
    // 闲着不点：亮提示（圈出该点的那个方块；画面上没有空位、点不了的时候不算闲着）
    const quiet = this.quiet;
    if (quiet || this.station.freePlace() >= 0) this.idle += dt;
    const hint = App.config.ui.hint;
    const wait = this.arg.level <= hint.tutorialLevels ? hint.tutorialSeconds : hint.seconds;
    if (!this.arg.demo && !this.hintNode && !this.tutorNode && !this.picking && this.idle > wait && this.s.status === Status.PLAYING) {
      const car = this.station.front(Rules.hint(this.s));
      if (car) {
        const ring = img(car.node, 'kit/hint_ring', 150, 150, 'hint');
        fx.breathe(ring, 0.1, 0.9);
        this.hintNode = ring;
        if (this.arg.level <= hint.tutorialLevels) addFinger(ring);
      }
    }
    if (this.tutor && !this.tutorNode) Flow.checkTutorial(this);
    // 玩法：演示（调试页）按参考解点；机器人代打（./run.sh auto）按提示点。都等上一步的动画播完再点
    const demo = this.arg.demo === 'route';
    if ((demo || App.flags.autoplay) && this.s.status === Status.PLAYING && quiet) {
      this.autoT += dt;
      if (this.autoT > (demo ? App.config.ui.demo.ring + App.config.ui.demo.gap : 0.35)) {
        this.autoT = 0;
        const t = demo ? this.lv.solution[this.demoStep] : Rules.hint(this.s);
        if (t === undefined || t < 0) {
          if (demo) Flow.demoStuck(this);
        } else if (this.doTap(t) && demo) this.demoStep++;
      }
    }
  }

  private syncClock(): void {
    const cap = this.clockCap;
    if (!cap) return;
    const sec = Math.ceil(this.s.clock);
    if (sec === this.clockSecond) return;
    this.clockSecond = sec;
    cap.set(mmss(this.s.clock));
    const warn = this.s.clock <= App.config.ui.clock.warn;
    if (warn) {
      fx.squash(cap.node, 1.12);
      sfx('tick');
    }
    if (warn !== this.clockWarn) {
      this.clockWarn = warn;
      cap.label.color = warn ? COLOR.red : COLOR.white;
    }
  }

  /** 顶栏的关卡号：难关、超难关描边换色，右边挂同色小牌子 */
  private levelTitle(levelName: string, hudY: number, midX: (w: number) => number, timed: boolean): void {
    const kind = this.arg.daily ? 'normal' : levelKind(this.arg.level);
    const lv = text(this.stage, levelName, 30, kind === 'normal' ? {} : { outline: KIND_STYLE[kind].outline });
    const tw = textWidth(lv);
    this.kindTagNode = null;
    if (kind === 'normal') {
      at(lv.node, midX(tw), hudY);
      lv.node.active = !timed;
      return;
    }
    const tag = kindTag(this.stage, kind, 40);
    const tagW = (tag.getComponent(UITransform) as UITransform).width;
    const total = tw + 8 + tagW;
    const x0 = midX(total) - total / 2;
    at(lv.node, x0 + tw / 2, hudY);
    at(tag, x0 + tw + 8 + tagW / 2, hudY);
    lv.node.active = !timed;
    tag.active = !timed;
    this.kindTagNode = tag;
  }

  /** 开局说明看完后：难关、超难关出横幅 */
  showIntro(): void {
    const kind = this.arg.daily || this.arg.demo ? 'normal' : levelKind(this.arg.level);
    if (kind === 'normal' || this.ended) return;
    const b = kindBanner(this.stage, kind);
    this.kindBannerNode = b;
    const y = Screen.H * 0.12;
    at(b, -Screen.W, y);
    sfx('warn');
    const cfg = App.config.ui.kindBanner;
    tween(b)
      .to(cfg.slideIn, { position: new Vec3(0, y, 0) }, { easing: 'backOut' })
      .delay(cfg.hold)
      .call(() => this.dismissKindBanner())
      .start();
  }

  private dismissKindBanner(): void {
    const b = this.kindBannerNode;
    if (!b || !b.isValid) return;
    this.kindBannerNode = null;
    Tween.stopAllByTarget(b);
    const tag = this.kindTagNode;
    const to = tag && tag.isValid && tag.active ? tag.position.clone() : new Vec3(Screen.W, b.position.y, 0);
    tween(b)
      .to(App.config.ui.kindBanner.fly, { position: to, scale: new Vec3(0.2, 0.2, 1) }, { easing: 'quadIn' })
      .call(() => {
        b.destroy();
        if (tag && tag.isValid) fx.squash(tag, 1.2);
      })
      .start();
  }

  /** 新技能教学：压暗全屏，只留这个技能键能点，上方一句「试试新技能」+ 手指 */
  startTutorial(id: string, onUse: () => void): void {
    const v = this.skillNodes.get(id);
    if (!v || this.tutorNode) return;
    this.clearHint();
    const layer = box('tutor', this.stage, Screen.W * 2, Screen.H * 2);
    this.tutorNode = layer;
    const shade = tint(layer, Screen.W * 2, Screen.H * 2, new Color(2, 16, 46, 160), 'shade');
    blockInput(shade);
    opacity(shade).opacity = 0;
    tween(opacity(shade)).to(0.2, { opacity: 255 }).start();
    const p = v.node.position;
    const ring = img(layer, 'kit/fx_ring', 190, 190, 'ring');
    (ring.getComponent(Sprite) as Sprite).color = new Color(255, 243, 107, 255);
    at(ring, p.x, p.y);
    fx.breathe(ring, 0.1, 0.8);
    const copy = img(layer, 'skin/f_skill', SKILL_S, SKILL_S, 'copy');
    at(copy, p.x, p.y);
    at(img(copy, `icon/skill_${id}`, 76, 76, 'icon'), 0, 11);
    onTap(copy, () => {
      this.endTutorial();
      onUse();
    });
    const tip = text(layer, tr('UI_SKILL_TRY', skillName(id)), 40, { color: COLOR.yellow });
    at(tip.node, 0, p.y + 190);
    fx.popIn(tip.node, 0.1, 0.25);
    addFinger(copy);
    sfx('unlock');
  }

  endTutorial(): void {
    this.tutor = '';
    this.tutorNode?.destroy();
    this.tutorNode = null;
  }

  private clearHint(): void {
    this.idle = 0;
    this.hintNode?.destroy();
    this.hintNode = null;
  }

  /** 特效层（流程里飘字用） */
  fxLayer(): Node {
    return this.fly;
  }
}

/** 引导手指：指着目标上下点 */
function addFinger(target: Node): void {
  const f = img(target, 'skin/j_finger', 84, 120, 'finger');
  const x = 42 - 0.3 * 84;
  const y = -60 - 20;
  at(f, x + 6, y);
  f.angle = 18;
  tween(f)
    .repeatForever(
      tween(f)
        .to(0.35, { position: new Vec3(x + 6, y + 18, 0), scale: new Vec3(0.92, 0.92, 1) }, { easing: 'quadOut' })
        .to(0.35, { position: new Vec3(x + 6, y, 0), scale: new Vec3(1, 1, 1) }, { easing: 'quadIn' }),
    )
    .start();
}
