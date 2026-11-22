// 主页：全游戏的总入口，没有底栏（docs/09）。
// 顶栏下面左右各一列三个入口——左列签到、每日挑战、转盘，右列商店、收藏、任务；中间是展示区（几个装着主角的光球，换成自己游戏的吉祥物）；
// 最下面是「开始」，旁边一个选关键（微信版左边再多一个设置键）。
// 展示区一直是活的；光点往上冒、光柱慢慢摆；「开始」呼吸；有红点的入口隔一会晃一下；进场依次弹出（≤ 0.8 秒）。
import { Color, Node, Sprite, Tween, UITransform, Vec3, tween } from 'cc';
import * as Album from '../core/meta/album';
import * as DailyChallenge from '../core/meta/dailyChallenge';
import * as Features from '../core/meta/features';
import * as SignIn from '../core/meta/signIn';
import * as Meta from '../core/meta/meta';
import * as Tasks from '../core/meta/tasks';
import { GameState } from '../core/dig/rules';
import * as Wheel from '../core/meta/wheel';
import { App } from '../services/app';
import { buzz, sfx } from '../services/audio';
import { today } from '../services/clock';
import { Board } from '../game/board';
import * as Flow from '../game/flow';
import * as fx from '../ui/fx';
import { tr } from '../ui/i18n';
import { Btn, PLATE_TEXT_LIFT, at, box, button, fit, fxImg, hex, img, lazyImg, onTap, opacity, plate, recycleFx, redDot, slice, text } from '../ui/kit';
import { openPopup } from '../ui/popup';
import { settingsPopup } from '../ui/popups';
import { Screen } from '../ui/screen';
import { Page, enterStagger, ui } from '../ui/shell';
import { signInPopup } from './signin';
import { kindTag, levelKind } from '../game/levelKind';

/**
 * 入口：左右各一列贴着屏幕边，每个入口是同样大的半透明白格子，图标放在格子里，格子下沿压一块蓝色标签牌。
 * 入口和展示区的大小定过：入口再多、展示的东西再多就挤
 */
const ENTRY_TILE = 112;
const ENTRY_ICON = 90;
const LABEL_W = 124;
const LABEL_H = 40;
const LABEL_FONT = 24;
/** 一个入口占的高（格子 + 压出去的半块标签牌），两个入口之间再空 ENTRY_GAP */
const ENTRY_H = ENTRY_TILE + LABEL_H / 2;
const ENTRY_GAP = 36;
/** 第一排入口的格子顶离顶栏多远（原来 18，紧贴顶栏「太靠上」，往下挪） */
const ENTRY_TOP = 82;
/** 入口的标签牌离屏幕边多远 */
const ENTRY_MARGIN = 22;
/** 光球的直径是里面那张图的几倍 */
const ORB_K = 1.42;
/** 光球表面转动的那层流光的颜色 */
const SHEEN = new Color(255, 200, 240, 255);
const WHITE = new Color(255, 255, 255, 255);
/** 「开始」按钮：上面大字「开始」，下面小字「第 N 关」；按钮底边离屏幕底 START_BOTTOM。右边紧挨着一个选关键（选哪一关和开始是一件事，放一起） */
const START_W = 430;
/** 微信小游戏里左边多一个设置键，开始窄一点，三个按钮一共 702 宽 */
const START_W_WITH_SETTINGS = 390;
const START_H = 156;
const START_BOTTOM = 50;
const LEVELS_W = 140;
const START_GAP = 16;
/** 顶栏占掉的高 */
const TOP_H = 144;
/** 顶栏到开始按钮之间的高，1334 高的屏上是这么多；更高的屏按比例把入口间距、光球拉开一点 */
const ZONE_H = 984;

/** 展示区的一个光球：node 整体漂、被点；drift 带着主角在球里慢慢转圈；hero 是主角（自己轻轻摆）；shell 是球膜，sheen 是上面那层流光 */
interface Orb {
  node: Node;
  home: Vec3;
  drift: Node;
  hero: Node;
  /** 朝哪边：1 原图方向，-1 镜像 */
  dir: number;
  shell: Node;
  sheen: Node;
  r: number;
}

/** 一个入口是什么：feature 是按关开放的功能（一开始就有的为 null），name 是标签的文案键，open 是点了以后做什么 */
interface EntryDef {
  id: string;
  feature: string | null;
  icon: string;
  name: string;
  open: () => void;
  /** 图标画得偏小的放大一点 */
  iconScale?: number;
}

interface Entry {
  def: EntryDef;
  /** 标签牌多宽（字太长时按它缩小） */
  labelW: number;
  /** 标签的字号（入口 24，选关键 26） */
  font: number;
  node: Node;
  icon: Node;
  lock: Node;
  dot: Node;
  label: ReturnType<typeof text>;
}

export class HomePage extends Page {
  override readonly topBar = true;
  /** 入口，按 id 找（按关开放的那几个，id 就是功能开放项的名字） */
  private entries = new Map<string, Entry>();
  private start!: Btn;
  private levelLabel!: ReturnType<typeof text>;
  private tag: Node | null = null;
  private startW = 0;
  /** 展示区：一个光球一个主角 */
  private heroes: Orb[] = [];
  /** 展示区（玩法）：下一关的拼豆画摆在一块底板上，下面停着小火车 */
  private showcase!: Node;
  private showcaseLevel = -1;
  /** 每次进主页重新起一轮动画；上一轮还没到点的定时回调看到号变了就不再接着跑 */
  private animGen = 0;
  /** 动态光照：光柱、地面的光斑、空中的亮点（盖在背景上、展示区和入口下面） */
  private light!: Node;
  private particles!: Node;

  build(root: Node): void {
    const bgH = Math.max(Screen.H, Screen.W * 1.5);
    lazyImg(root, 'bg/home', (bgH * 1024) / 1536, bgH);
    this.light = box('light', root, Screen.W, Screen.H);
    this.particles = box('particles', root, Screen.W, Screen.H);
    // 「开始」在最下面；顶栏和它之间是入口和光球
    const btnY = -Screen.H / 2 + Math.max(START_BOTTOM, Screen.safeBottom + 24) + START_H / 2;
    // 有胶囊时顶栏在胶囊那一行，内容跟着上移（Screen.headTop）
    const zoneTop = Screen.headTop - TOP_H;
    const zoneBottom = btnY + START_H / 2;
    const k = Math.max(1, Math.min(1.3, (zoneTop - zoneBottom) / ZONE_H));
    // 展示区：位置和大小在 game_ui.json 的 homeDeco.hero（[卡 id, x, y, 尺寸]），摆在两列入口之间
    const ks = Math.min(1.12, k);
    const midY = (zoneTop + zoneBottom) / 2;
    for (const [id, x, y, s] of App.config.ui.homeDeco.hero) {
      // 主角在里面轻轻动；球膜（kit/orb + 一层慢慢转的流光）盖在上面，像果冻一样软软地鼓、扁
      const d = s * ks;
      const D = d * ORB_K;
      const b = box(`orb_${id}`, root, D, D);
      at(b, x, midY + y * k);
      const drift = box('drift', b);
      const f = img(drift, `card/${id}`, d, d, 'hero');
      const dir = x > 0 ? -1 : 1;
      f.setScale(dir, 1, 1);
      const shell = box('shell', b, D, D);
      img(shell, 'kit/orb', D, D, 'film');
      const sheen = img(shell, 'kit/orb', D, D, 'sheen');
      (sheen.getComponent(Sprite) as Sprite).color = SHEEN;
      opacity(sheen).opacity = 80;
      // 点一下：往上窜一下、冒几个小光球
      onTap(b, () => this.poke(b), { press: 0, sound: null });
      this.heroes.push({ node: b, home: b.position.clone(), drift, hero: f, dir, shell, sheen, r: D / 2 });
    }
    // 展示区（玩法）：下一关的拼豆画 + 小火车。画在 refresh() 里按当前关卡换
    this.showcase = box('showcase', root, 360, 460);
    at(this.showcase, 0, midY + 10 * k);
    this.showcase.setScale(ks, ks, 1);
    // 入口：左列是「每天来点一下」的活动，右列是常驻的系统；从顶栏下面往下排
    const left: EntryDef[] = [
      { id: 'signin', feature: 'signin', icon: 'icon/entry_signin', name: 'H_FEAT_SIGNIN', open: () => signInPopup(() => ui.refresh()) },
      { id: 'daily', feature: 'daily', icon: 'icon/entry_daily', name: 'UI_TAB_DAILY', open: () => ui.go('daily') },
      { id: 'wheel', feature: 'wheel', icon: 'icon/entry_wheel', name: 'H_FEAT_WHEEL', open: () => ui.go('wheel') },
    ];
    const right: EntryDef[] = [
      { id: 'shop', feature: null, icon: 'icon/tab_shop', name: 'UI_TAB_SHOP', open: () => ui.go('shop') },
      { id: 'album', feature: 'album', icon: 'icon/tab_collect', name: 'H_FEAT_COLLECTION', open: () => ui.go('collect') },
      { id: 'tasks', feature: 'tasks', icon: 'icon/tab_tasks', name: 'UI_TAB_TASKS', open: () => ui.go('tasks') },
    ];
    const x0 = Screen.W / 2 - ENTRY_MARGIN - LABEL_W / 2;
    const row1 = zoneTop - ENTRY_TOP - ENTRY_TILE / 2;
    const step = (ENTRY_H + ENTRY_GAP) * Math.min(1.2, k);
    left.forEach((d, i) => this.entry(root, d, -x0, row1 - i * step));
    right.forEach((d, i) => this.entry(root, d, x0, row1 - i * step));
    // 「开始」：全屏唯一的主按钮，平面绿色大按钮，两行字。
    // 微信小游戏：顶栏挤在胶囊那一行，设置键放不下，挪到这里：「设置 · 开始 · 选关」三个对称排，开始窄一点
    const startW = Screen.cap ? START_W_WITH_SETTINGS : START_W;
    this.start = button(root, { color: 'green', w: startW, h: START_H, onTap: () => Flow.startLevel(App.save.data.level) });
    const startX = Screen.cap ? 0 : -(LEVELS_W + START_GAP) / 2;
    at(this.start.node, startX, btnY);
    this.levelsKey(root, startX + startW / 2 + START_GAP + LEVELS_W / 2, btnY);
    if (Screen.cap) this.settingsKey(root, startX - startW / 2 - START_GAP - LEVELS_W / 2, btnY);
    const row = this.start.node.getChildByName('row') as Node;
    const play = text(row, tr('UI_PLAY'), 66);
    at(play.node, 0, 22);
    fit(play, startW - 80, 66, 40);
    this.levelLabel = text(row, '', 30, { color: hex('#E9FFE0') });
    at(this.levelLabel.node, 0, -38);
    // 难关、超难关的小牌子在 refresh 里按当前关挂上（宽度跟着字走，右边缘不动，不缩字）
    this.startW = startW;
  }

  private entry(root: Node, def: EntryDef, x: number, y: number): void {
    const n = box(def.id, root, LABEL_W, ENTRY_TILE + LABEL_H);
    at(n, x, y);
    img(n, 'skin/f_card_glass', ENTRY_TILE, ENTRY_TILE, 'tile');
    const size = ENTRY_ICON * (def.iconScale ?? 1);
    const ic = img(n, def.icon, size, size, 'icon');
    at(ic, 0, 7);
    // 标签牌骑在格子的下沿上
    const pl = plate(n, 'skin/f_plate_blue', LABEL_W, LABEL_H, 'plate');
    at(pl, 0, -ENTRY_TILE / 2 - 2);
    const label = text(pl, tr(def.name), LABEL_FONT);
    at(label.node, 0, LABEL_H * PLATE_TEXT_LIFT);
    const lock = img(n, 'kit/ic_lock', 40, 40, 'lock');
    at(lock, ENTRY_TILE / 2 - 20, -ENTRY_TILE / 2 + 40);
    const dot = redDot(n, ENTRY_TILE / 2 - 6, ENTRY_TILE / 2 - 6, 28);
    // 没有底栏了，切页的「嘟嘟」声放在入口上
    onTap(n, () => this.tapEntry(def), { sound: 'tab' });
    this.entries.set(def.id, { def, labelW: LABEL_W, font: LABEL_FONT, node: n, icon: ic, lock, dot, label });
  }

  /** 设置键（只在微信小游戏里放这儿，平常在顶栏右端）：和选关键一样的蓝色高按钮，齿轮 + 小字 */
  private settingsKey(root: Node, x: number, y: number): void {
    const b = button(root, { color: 'blue', w: LEVELS_W, h: START_H, onTap: () => settingsPopup('home') });
    at(b.node, x, y);
    const row = b.node.getChildByName('row') as Node;
    at(img(row, 'kit/ic_gear', 76, 76, 'icon'), 0, 20);
    at(text(row, tr('UI_SETTINGS'), 26).node, 0, -44);
  }

  /** 选关键：和「开始」一样高的蓝色按钮，图标 + 小字；红点、锁、解锁引导和别的入口一样 */
  private levelsKey(root: Node, x: number, y: number): void {
    const def: EntryDef = { id: 'levelSelect', feature: 'levelSelect', icon: 'icon/entry_levels', name: 'H_FEAT_LEVELS', open: () => ui.go('map') };
    const b = button(root, { color: 'blue', w: LEVELS_W, h: START_H });
    at(b.node, x, y);
    const row = b.node.getChildByName('row') as Node;
    const ic = img(row, def.icon, 92, 92, 'icon');
    at(ic, 0, 20);
    const label = text(row, tr(def.name), 26);
    at(label.node, 0, -44);
    const lock = img(b.node, 'kit/ic_lock', 40, 40, 'lock');
    at(lock, LEVELS_W / 2 - 26, START_H / 2 - 30);
    const dot = redDot(b.node, LEVELS_W / 2 - 6, START_H / 2 - 6, 28);
    onTap(b.node, () => this.tapEntry(def), { press: 0.96, sound: 'tab' });
    this.entries.set(def.id, { def, labelW: LEVELS_W, font: 26, node: b.node, icon: ic, lock, dot, label });
  }

  private tapEntry(def: EntryDef): void {
    // 未开放：点进去是锁页（docs/01）
    if (def.feature && !App.featureOpen(def.feature)) ui.go('lock', { feature: def.feature });
    else def.open();
  }

  override show(): void {
    this.refresh();
    const nodes = Array.from(this.entries.values()).map((e) => e.node);
    enterStagger([...nodes.filter((n) => n !== this.entries.get('levelSelect')?.node), this.start.node, (this.entries.get('levelSelect') as Entry).node], 0.06);
    Tween.stopAllByTarget(this.start.node);
    fx.delay(this.node, 0.6, () => {
      this.start.node.setScale(1, 1, 1);
      fx.breathe(this.start.node, 0.03, 1.4);
    });
    this.animateSchool();
    this.startLight();
    this.startParticles();
    // 有红点的入口隔一会晃一下图标，提醒「这里有东西可领」
    for (const e of this.entries.values()) {
      Tween.stopAllByTarget(e.icon);
      e.icon.angle = 0;
      if (e.dot.active) fx.wiggle(e.icon, 7, 2.6);
    }
    // 过关新开放的功能（点「下一关」时攒着的也在里面）；技能这类主页上没有入口的不播
    const visible = Flow.takeUnlocks().filter((f) => this.entries.has(f));
    if (visible.length) fx.delay(this.node, App.config.ui.unlockGuide.delay, () => this.unlockGuide(visible));
  }

  override hide(): void {
    this.animGen++;
    for (const b of this.heroes) for (const n of [b.node, b.drift, b.hero, b.shell, b.sheen]) Tween.stopAllByTarget(n);
    this.light.destroyAllChildren();
    this.particles.destroyAllChildren();
    Tween.stopAllByTarget(this.particles);
  }

  /**
   * 展示区的待机动画：光球整体慢慢上下浮；球膜像果冻一样鼓一下、扁一下，上面一层流光沿着边慢慢转；隔一两秒某个球的高光上闪一颗小星；
   * 主角在球里轻轻摆、慢慢转小圈。每个球的节奏都错开，不齐步
   */
  private animateSchool(): void {
    const gen = ++this.animGen;
    this.heroes.forEach((b, i) => {
      for (const n of [b.node, b.drift, b.hero, b.shell, b.sheen]) Tween.stopAllByTarget(n);
      b.node.setPosition(b.home);
      fx.bob(b.node, 8, 2.8 + i * 0.3, i * 0.45);
      // 球膜：果冻
      b.shell.setScale(1, 1, 1);
      const t = 1.5 + (i % 5) * 0.17;
      tween(b.shell)
        .delay(i * 0.23)
        .repeatForever(
          tween(b.shell)
            .to(t, { scale: new Vec3(1.03, 0.97, 1) }, { easing: 'sineInOut' })
            .to(t, { scale: new Vec3(0.975, 1.025, 1) }, { easing: 'sineInOut' }),
        )
        .start();
      // 流光：慢慢转
      b.sheen.angle = (i * 47) % 360;
      tween(b.sheen)
        .repeatForever(tween(b.sheen).by(9 + (i % 4) * 1.5, { angle: i % 2 === 0 ? 360 : -360 }))
        .start();
      // 主角：轻轻摆
      b.hero.setPosition(0, 0, 0);
      b.hero.angle = 0;
      b.hero.setScale(b.dir, 1, 1);
      tween(b.hero)
        .delay(i * 0.2)
        .repeatForever(
          tween(b.hero)
            .to(0.65 + i * 0.06, { angle: 5, scale: new Vec3(b.dir * 1.04, 0.96, 1) }, { easing: 'sineInOut' })
            .to(0.65 + i * 0.06, { angle: -4, scale: new Vec3(b.dir, 1, 1) }, { easing: 'sineInOut' }),
        )
        .start();
      // 主角：在球里慢慢转一个小圈（四个点连起来）
      const ax = b.r * 0.1;
      const ay = b.r * 0.08;
      const seg = 1.3 + (i % 3) * 0.25;
      b.drift.setPosition(0, 0, 0);
      tween(b.drift)
        .delay(i * 0.37)
        .repeatForever(
          tween(b.drift)
            .to(seg, { position: new Vec3(ax, ay, 0) }, { easing: 'sineInOut' })
            .to(seg, { position: new Vec3(-ax, ay * 0.4, 0) }, { easing: 'sineInOut' })
            .to(seg, { position: new Vec3(-ax * 0.6, -ay, 0) }, { easing: 'sineInOut' })
            .to(seg, { position: new Vec3(ax * 0.5, -ay * 0.5, 0) }, { easing: 'sineInOut' }),
        )
        .start();
    });
    // 隔一两秒，挑一个光球在左上角的高光上闪一颗小星
    const twinkle = () => {
      if (gen !== this.animGen || !this.node.active) return;
      const b = this.heroes[Math.floor(Math.random() * this.heroes.length)];
      if (b) fx.sparkle(b.node, -b.r * 0.5, b.r * 0.52, 2, b.r * 0.12, WHITE, Math.max(18, b.r * 0.22));
      fx.delay(this.node, 0.9 + Math.random() * 1.4, twinkle);
    };
    fx.delay(this.node, 1, twinkle);
  }

  private poke(f: Node): void {
    sfx('pop');
    buzz('light');
    tween(f)
      .by(0.12, { position: new Vec3(0, 30, 0) }, { easing: 'quadOut' })
      .by(0.2, { position: new Vec3(0, -30, 0) }, { easing: 'quadIn' })
      .start();
    const p = f.position;
    fx.ring(this.particles, p.x, p.y, 60, 190);
    for (let i = 0; i < 4; i++) {
      const s = 16 + Math.random() * 18;
      const b = fxImg(this.particles, 'kit/orb_small', s, s, 'b');
      at(b, p.x + (Math.random() - 0.5) * 60, p.y + 20);
      tween(b)
        .to(0.9 + Math.random() * 0.5, { position: new Vec3(p.x + (Math.random() - 0.5) * 140, p.y + 150 + Math.random() * 120, 0) }, { easing: 'quadOut' })
        .call(() => recycleFx(b))
        .start();
      tween(opacity(b)).delay(0.6).to(0.5, { opacity: 0 }).start();
    }
  }

  /**
   * 动态光照：顶上一团呼吸的日光；五束光柱从顶上斜着照下来，各自慢慢摆、忽明忽暗，另有一束宽光慢慢左右扫；
   * 地面几块光斑左右漂、明暗交替；空中零星的亮点一闪一闪。换主题时改颜色（warm）或整段删掉
   */
  private startLight(): void {
    const L = this.light;
    L.destroyAllChildren();
    const warm = new Color(255, 250, 215, 255);
    const sun = img(L, 'kit/fx_glow', Screen.W * 1.3, 620, 'sun');
    (sun.getComponent(Sprite) as Sprite).color = warm;
    at(sun, 0, Screen.top - 60);
    const sop = opacity(sun);
    sop.opacity = 120;
    tween(sop).repeatForever(tween(sop).to(2.4, { opacity: 215 }, { easing: 'sineInOut' }).to(2.4, { opacity: 110 }, { easing: 'sineInOut' })).start();
    // 光柱：[横向位置, 宽, 基础亮度, 摆动周期, 明暗周期]。顶端固定，往两边散开
    const beams: [number, number, number, number, number][] = [
      [-290, 250, 170, 7.5, 4.2],
      [-140, 190, 205, 6.2, 3.4],
      [20, 300, 185, 8.4, 5.0],
      [170, 200, 210, 6.8, 3.8],
      [310, 260, 165, 7.9, 4.6],
    ];
    beams.forEach(([x, w, hi, sway, pulse], i) => {
      const b = img(L, 'kit/fx_beam', w, Screen.H * 0.86, 'beam');
      (b.getComponent(UITransform) as UITransform).setAnchorPoint(0.5, 1);
      (b.getComponent(Sprite) as Sprite).color = warm;
      at(b, x * 0.55, Screen.top + 30);
      const base = x * 0.045;
      b.angle = base - 4.5;
      tween(b)
        .delay(i * 0.4)
        .repeatForever(tween(b).to(sway / 2, { angle: base + 4.5 }, { easing: 'sineInOut' }).to(sway / 2, { angle: base - 4.5 }, { easing: 'sineInOut' }))
        .start();
      const op = opacity(b);
      op.opacity = Math.round(hi * 0.5);
      tween(op)
        .delay(i * 0.7)
        .repeatForever(tween(op).to(pulse / 2, { opacity: hi }, { easing: 'sineInOut' }).to(pulse / 2, { opacity: Math.round(hi * 0.25) }, { easing: 'sineInOut' }))
        .start();
    });
    // 一束更宽的光慢慢从左扫到右再扫回来（一眼能看出光在动）
    const sweep = img(L, 'kit/fx_beam', 460, Screen.H * 0.95, 'sweep');
    (sweep.getComponent(UITransform) as UITransform).setAnchorPoint(0.5, 1);
    (sweep.getComponent(Sprite) as Sprite).color = warm;
    at(sweep, 0, Screen.top + 30);
    opacity(sweep).opacity = 120;
    sweep.angle = -20;
    tween(sweep).repeatForever(tween(sweep).to(5.5, { angle: 20 }, { easing: 'sineInOut' }).to(5.5, { angle: -20 }, { easing: 'sineInOut' })).start();
    // 地面的光斑：扁的柔光，左右漂、明暗交替
    const floorTop = Screen.bottom + 280;
    for (let i = 0; i < 7; i++) {
      const w = 240 + Math.random() * 220;
      const c = img(L, 'kit/fx_glow', w, w * 0.28, 'caustic');
      (c.getComponent(Sprite) as Sprite).color = warm;
      const x = (Math.random() - 0.5) * (Screen.W - 80);
      const y = Screen.bottom + 20 + Math.random() * (floorTop - Screen.bottom - 20);
      at(c, x, y);
      const dx = 50 + Math.random() * 50;
      const dur = 3 + Math.random() * 2.5;
      tween(c)
        .repeatForever(tween(c).to(dur, { position: new Vec3(x + dx, y, 0) }, { easing: 'sineInOut' }).to(dur, { position: new Vec3(x - dx, y, 0) }, { easing: 'sineInOut' }))
        .start();
      const op = opacity(c);
      op.opacity = 0;
      const pd = 1.6 + Math.random() * 1.6;
      tween(op)
        .delay(Math.random() * 2)
        .repeatForever(tween(op).to(pd, { opacity: 185 }, { easing: 'sineInOut' }).to(pd, { opacity: 10 }, { easing: 'sineInOut' }))
        .start();
    }
    // 空中的亮点：随机位置闪一下
    const glint = () => {
      if (!this.node.active) return;
      const g = fxImg(L, 'kit/fx_spark', 26, 26, 'glint');
      at(g, (Math.random() - 0.5) * (Screen.W - 60), Screen.bottom + 80 + Math.random() * (Screen.H - 320));
      g.setScale(0.1, 0.1, 1);
      opacity(g).opacity = 200;
      const k = 0.6 + Math.random() * 0.8;
      tween(g)
        .to(0.35, { scale: new Vec3(k, k, 1), angle: 45 }, { easing: 'quadOut' })
        .to(0.45, { scale: new Vec3(0.05, 0.05, 1), angle: 90 }, { easing: 'quadIn' })
        .call(() => recycleFx(g))
        .start();
      fx.delay(L, 0.35 + Math.random() * 0.5, glint);
    };
    glint();
  }

  /** 小光球从下往上冒 */
  private startParticles(): void {
    const spawn = () => {
      if (!this.node.active) return;
      const s = 14 + Math.random() * 26;
      const b = fxImg(this.particles, 'kit/orb_small', s, s, 'b');
      const x = (Math.random() - 0.5) * (Screen.W - 60);
      at(b, x, Screen.bottom + 40);
      opacity(b).opacity = 200;
      tween(b)
        .to(5 + Math.random() * 3, { position: new Vec3(x + (Math.random() - 0.5) * 80, Screen.top + 40, 0) }, { easing: 'sineIn' })
        .call(() => recycleFx(b))
        .start();
      fx.delay(this.particles, 0.5 + Math.random() * 0.8, spawn);
    };
    spawn();
  }

  /** 展示区：第 lvl 关的拼豆画（缩小的）摆在底板上，下面是小火车和两个小人 */
  private async showPicture(lvl: number): Promise<void> {
    if (this.showcaseLevel === lvl) return;
    this.showcaseLevel = lvl;
    const { config } = App;
    let lv;
    try {
      lv = await config.loadLevel(Meta.levelFile(lvl, config.levelCount), 0);
    } catch {
      return;
    }
    if (this.showcaseLevel !== lvl || !this.showcase.isValid) return;
    const root = this.showcase;
    root.destroyAllChildren();
    // 底板：米白色的拼豆板
    const plateN = slice(root, 'kit/round_white', 330, 330, 'plate');
    at(plateN, 0, 60);
    (plateN.getChildByName('skin')?.getComponent(Sprite) as Sprite).color = new Color(255, 248, 228, 255);
    const holder = box('pic', root, 280, 280);
    at(holder, 0, 60);
    const board = new Board(holder, 280, 280, lv);
    board.build(GameState.fromLevel(lv), false);
    fx.bob(holder, 5, 3);
    // 小火车：一节车厢 + 车头，停在画下面；两个小人站在旁边
    const y = -150;
    for (let x = -150; x <= 150; x += 60) at(img(root, 'kit/track', 60, 18, 'track'), x, y + 3);
    const wagon = box('wagon', root, 96, 72);
    at(wagon, -62, y + 36);
    img(wagon, 'kit/wagon_back', 96, 72, 'back');
    lv.palette.slice(0, 4).forEach((c, i) => {
      const cube = img(wagon, 'kit/bead', 20, 25, 'cube');
      (cube.getComponent(Sprite) as Sprite).color = hex(c);
      at(cube, (i - 1.5) * 21, 2);
    });
    img(wagon, 'kit/wagon_front', 96, 72, 'front');
    at(img(root, 'kit/loco', 128, 92, 'loco'), 52, y + 45);
    lv.palette.slice(0, 2).forEach((c, i) => {
      const w = box('worker', root, 34, 41);
      at(w, i === 0 ? -148 : 148, y + 26);
      (img(w, 'kit/worker_body', 34, 41, 'body').getComponent(Sprite) as Sprite).color = hex(c);
      img(w, 'kit/worker_top', 34, 41, 'top');
      fx.bob(w, 4, 0.9, i * 0.4);
    });
    fx.popIn(root, 0, 0.3, root.scale.x);
  }

  override refresh(): void {
    const eco = App.config.eco;
    const lvl = App.save.data.level;
    this.levelLabel.string = tr('UI_LEVEL', lvl);
    void this.showPicture(lvl);
    // 难关、超难关：开始键右上角压一块同色小牌子（火苗「困难」/ 闪电「超难」，docs/09）
    const kind = levelKind(lvl);
    this.start.setColor('green');
    this.tag?.destroy();
    this.tag = null;
    if (kind !== 'normal') {
      const t = kindTag(this.start.node, kind, 44, 'tag');
      const tw = (t.getComponent(UITransform) as UITransform).width;
      at(t, this.startW / 2 - 22 - tw / 2, START_H / 2 - 6);
      this.tag = t;
    }
    for (const e of this.entries.values()) {
      const f = e.def.feature;
      const open = f === null || App.featureOpen(f);
      e.lock.active = !open;
      (e.icon.getComponent(Sprite) as Sprite).grayscale = !open;
      opacity(e.icon).opacity = open ? 255 : 120;
      // 没开放时标签写「等级 N」/「Level N」。字号各入口一样、不缩（文字多了别缩字，放不下就精简文字），
      // fit 只防新文案越界，正常情况下字号不缩
      e.label.string = f === null || open ? tr(e.def.name) : tr('H_ENTRY_LOCKED', Features.unlockLevel(eco, f));
      fit(e.label, e.labelW - 16, e.font, 16);
      e.dot.active = open && this.hasNews(e.def.id);
    }
  }

  /** 这个入口里有没有东西可领、可做（红点） */
  private hasNews(id: string): boolean {
    const s = App.save.data;
    const eco = App.config.eco;
    const day = today();
    switch (id) {
      case 'signin':
        return SignIn.canClaim(s, day);
      case 'wheel':
        return Wheel.spinsLeft(s, eco, day) > 0;
      case 'daily':
        return DailyChallenge.canStartFree(s, day);
      case 'album':
        return Album.claimable(s, eco) > 0;
      case 'tasks':
        return Tasks.claimable(s, eco, day) > 0;
      default:
        return false;
    }
  }

  /** 功能开放的当关过关后，主页播一次解锁动画并引导点进去（docs/01） */
  private unlockGuide(features: string[]): void {
    const [f, ...rest] = features;
    const e = this.entries.get(f) as Entry;
    const p = openPopup({ w: 600, h: 560, title: tr('H_UNLOCK_TITLE'), onClose: () => rest.length && this.unlockGuide(rest) });
    const icon = img(p.body, e.def.icon, 200, 200, 'icon');
    at(icon, 0, 90);
    fx.rays(p.body, 320).setSiblingIndex(1);
    fx.sparkle(p.body, 0, 90, App.config.ui.unlockGuide.sparks, 200);
    const l = text(p.body, tr('H_UNLOCK_LINE', tr(e.def.name)), 40);
    at(l.node, 0, -60);
    const go = button(p.body, {
      color: 'green',
      w: 360,
      h: 100,
      label: tr('H_GO_LOOK'),
      onTap: () => {
        p.close();
        e.def.open();
      },
    });
    at(go.node, 0, -180);
    fx.ring(e.node.parent as Node, e.node.position.x, e.node.position.y, 100, 320);
    fx.breathe(e.node, 0.08, 0.8);
  }
}

