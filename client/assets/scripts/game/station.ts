// 上场位和排队区（docs/01 第 1.2、3 节）：铁轨下面一条圆角的半透明托盘，里面 5 个上场位 + 一个「＋」；托盘下面几列排队的小队方块。
// 方块是带盖的立体方块（kit/box 染色 + kit/box_hi 高光），托盘和分隔线是代码画的。
// 只管画和点：点了方块调 onTapCar，规则在 core/dig/rules.ts，什么时候上场、搬豆、离场由局内页面按事件安排。
// 代码里的名字沿用上一版：car = 小队方块，track = 排队区的一列，place = 上场位。尺寸比例照效果图 H（art/raw/mock_game_page_v3/mock_h.png）。
import { Color, Graphics, Label, Node, Sprite, Tween, Vec3, tween } from 'cc';
import type { GameState } from '../core/dig/rules';
import * as fx from '../ui/fx';
import { COLOR, at, box, img, onTap, opacity, text } from '../ui/kit';

/** 方块的显示尺寸（kit/box，宽 / 高 1.136） */
export const CAR_W = 100;
export const CAR_H = Math.round(CAR_W / 1.136);
/** 托盘：多高、一格最宽多宽、方块在格子里缩到格宽的多少、四个角多圆 */
const TRAY_H = 112;
const PLACE_W = 112;
const SEAT_W = 0.86;
const TRAY_R = 26;
/** 托盘的颜色：比背景深一档的半透明；细的浅色边和分隔线 */
const TRAY_FILL = new Color(132, 136, 176, 120);
const TRAY_EDGE = new Color(255, 255, 255, 150);
const TRAY_LINE = new Color(255, 255, 255, 90);
/** 空格子告急时泛的红 */
const WARN_RED = new Color(255, 120, 120, 120);
/** 排队区里方块缩到多大、一行占多高、最多露出几行、两列隔多远 */
const QUEUE_K = 1;
const ROW_H = 96;
export const TRACK_ROWS = 3;
const COL_GAP = 128;
const BUMP_TAG = 9301;
/** 后排的方块压暗到多少（只压一点：压多了颜色发灰；前后排主要靠白边分） */
const DIM = 0.9;
/** 很浅的方块上数字的颜色 */
const PALE_INK = new Color(110, 84, 80, 255);

export interface CarView {
  node: Node;
  body: Node;
  rim: Node;
  c: number;
  n: number;
  /** 画面上还差几颗 */
  left: number;
  label: Label;
  /** 「在等豆露出来」的小标记 */
  wait: Node;
  /** 上场的动画什么时候播完（局内页面的时间），之前不放小人 */
  readyAt: number;
  /** 规则里这一队已经搬完了：画面上数字到 0 就离场 */
  done: boolean;
}

export class Station {
  /** 每个上场位上是哪个方块 */
  places: (CarView | null)[] = [];
  /** 排队区每一列的方块，从前到后 */
  tracks: CarView[][] = [];
  /** 托盘（代码画的）和每一格的底（告急时泛红） */
  private tray: Node | null = null;
  private cells: Graphics[] = [];
  private more: Label[] = [];
  private warn = false;

  /**
   * stage：放托盘和方块的层。stationY：托盘的中线；trackTop：排队区最上面。
   * plus：还能不能加位（能就多画一格「＋」，点它调 onPlus）
   */
  constructor(
    private stage: Node,
    private colors: Color[],
    private width: number,
    private stationY: number,
    private trackTop: number,
    private plus: boolean,
    private onTapCar: (car: CarView) => void,
    private onPlus: () => void,
  ) {}

  /** 排队区一共占多高 */
  static trackHeight(): number {
    return TRACK_ROWS * ROW_H + 8;
  }

  /** 托盘多高 */
  static padHeight(): number {
    return TRAY_H;
  }

  /** 排队区 T 列一共占多宽（最左一列的左边到最右一列的右边） */
  static trackSpan(T: number, width: number): number {
    return (T - 1) * Station.colGap(T, width) + CAR_W * QUEUE_K;
  }

  private static colGap(T: number, width: number): number {
    return Math.min(COL_GAP, (width - 220) / Math.max(1, T - 1));
  }

/** 按局面整个重画（开局、复活后） */
  build(s: GameState): void {
    const T = s.tracks.length;
    for (let t = 0; t < T; t++) {
      const more = text(null, '', 22, { color: COLOR.white });
      this.stage.addChild(more.node);
      at(more.node, this.trackX(t, T), this.trackTop - Station.trackHeight() - 10);
      this.more.push(more);
    }
    this.tracks = s.tracks.map((list, t) =>
      list.map((def, i) => {
        const car = this.makeCar(def.c, def.n, def.n);
        const p = this.trackPos(t, i, T);
        at(car.node, p.x, p.y);
        car.node.setScale(QUEUE_K, QUEUE_K, 1);
        car.node.active = i < TRACK_ROWS;
        this.setFront(car, i === 0);
        return car;
      }),
    );
    // 后排的先画、前排的后画：前排压在后排上面
    for (const list of this.tracks) for (let i = list.length - 1; i >= 0; i--) list[i].node.setSiblingIndex(this.stage.children.length - 1);
    this.refreshMore();
    this.places = [];
    this.setSlots(s.slots.length, true);
    s.slots.forEach((c, i) => {
      if (!c) return;
      const car = this.makeCar(c.c, c.n, c.left);
      this.places[i] = car;
      const p = this.placePos(i);
      at(car.node, p.x, p.y);
      car.node.setScale(this.carScale(), this.carScale(), 1);
      this.setFront(car, false, false);
      this.setWait(car, true);
    });
  }

  private trackX(t: number, T: number): number {
    return (t - (T - 1) / 2) * Station.colGap(T, this.width);
  }

  /** 第 t 列第 i 个的位置（0 = 最前面，在最上面，挨着上场位） */
  trackPos(t: number, i: number, T = this.tracks.length): Vec3 {
    return new Vec3(this.trackX(t, T), this.trackTop - 4 - ROW_H / 2 - i * ROW_H, 0);
  }

  /** 画面上一共几格：上场位 + 还没用掉的「＋」 */
  private padCount(): number {
    return this.places.length + (this.plus ? 1 : 0);
  }

  private placeW(): number {
    return Math.min(PLACE_W, (this.width - 36) / Math.max(1, this.padCount()));
  }

  /** 方块在托盘里缩到多大 */
  carScale(): number {
    return Math.min(1, (this.placeW() * SEAT_W) / CAR_W);
  }

  /** 第 i 个上场位上方块的位置 */
  placePos(i: number): Vec3 {
    return new Vec3((i - (this.padCount() - 1) / 2) * this.placeW(), this.stationY, 0);
  }

  /** 托盘的上沿（小人从这里走出来） */
  get trayTop(): number {
    return this.stationY + TRAY_H / 2;
  }

  /** 重画托盘：圆角半透明的一条、细的浅色边、格子之间的分隔线；每一格一块底（告急时泛红）；最后一格是「＋」 */
  private drawTray(): void {
    this.tray?.destroy();
    this.cells = [];
    const n = this.padCount();
    const pw = this.placeW();
    const w = n * pw + 16;
    const tray = box('tray', this.stage, w, TRAY_H);
    tray.setSiblingIndex(0);
    at(tray, 0, this.stationY);
    this.tray = tray;
    const g = box('trayG', tray).addComponent(Graphics);
    g.fillColor = TRAY_FILL;
    g.roundRect(-w / 2, -TRAY_H / 2, w, TRAY_H, TRAY_R);
    g.fill();
    g.lineWidth = 3;
    g.strokeColor = TRAY_EDGE;
    g.roundRect(-w / 2, -TRAY_H / 2, w, TRAY_H, TRAY_R);
    g.stroke();
    g.lineWidth = 2;
    g.strokeColor = TRAY_LINE;
    for (let i = 1; i < n; i++) {
      const x = (i - n / 2) * pw;
      g.moveTo(x, -TRAY_H / 2 + 14);
      g.lineTo(x, TRAY_H / 2 - 14);
    }
    g.stroke();
    for (let i = 0; i < n; i++) {
      const cell = box('cell', tray, pw - 10, TRAY_H - 16).addComponent(Graphics);
      at(cell.node, this.placePos(i).x, 0);
      this.cells.push(cell);
    }
    if (this.plus) {
      const p = box('plus', tray, pw - 10, TRAY_H - 16);
      at(p, this.placePos(n - 1).x, 0);
      const l = text(p, '+', 64, { color: new Color(255, 255, 255, 200), outline: null, shadow: false });
      at(l.node, 0, 4);
      onTap(p, () => this.onPlus());
    }
    this.paintCells();
  }

  /** 每一格的底：告急时空着的格子泛红，别的透明 */
  private paintCells(): void {
    const pw = this.placeW();
    this.cells.forEach((g, i) => {
      g.clear();
      if (!(this.warn && i < this.places.length && !this.places[i])) return;
      g.fillColor = WARN_RED;
      g.roundRect(-(pw - 10) / 2, -(TRAY_H - 16) / 2, pw - 10, TRAY_H - 16, 18);
      g.fill();
    });
  }

  /** 上场位变成 count 格：托盘重画，上面的方块跟着挪。加过位以后「＋」那格变成真的位子 */
  setSlots(count: number, instant = false): void {
    if (!instant && count > this.places.length) this.plus = false;
    while (this.places.length < count) this.places.push(null);
    this.drawTray();
    if (!instant && this.tray) fx.squash(this.tray, 1.04);
    const k = this.carScale();
    this.places.forEach((car, i) => {
      if (!car) return;
      const p = this.placePos(i);
      Tween.stopAllByTarget(car.node);
      tween(car.node).to(0.2, { position: p, scale: new Vec3(k, k, 1) }, { easing: 'quadOut' }).start();
    });
  }

  /** 画面上第一个空着的上场位，没有返回 -1 */
  freePlace(): number {
    return this.places.indexOf(null);
  }

  /** 上场位告急：空着的格子泛红 */
  setWarn(on: boolean): void {
    if (on === this.warn && !on) return;
    this.warn = on;
    this.paintCells();
  }

  /** 托盘闪一下（满了还点） */
  flashPads(): void {
    if (this.tray) fx.squash(this.tray, 1.05);
  }

  private makeCar(c: number, n: number, left: number): CarView {
    const node = box('car', this.stage, CAR_W, CAR_H);
    const rim = img(node, 'kit/block_rim', CAR_W + 14, CAR_H + 14, 'rim');
    const body = img(node, 'kit/box', CAR_W, CAR_H, 'body');
    // 高光（不染色，染色是乘法，白高光会被染掉）
    img(node, 'kit/box_hi', CAR_W, CAR_H, 'gloss');
    // 白色、米色这些很浅的方块：数字用深色，不描边（白字看不清）
    const base = this.colors[c] ?? Color.WHITE;
    const pale = base.r * 0.3 + base.g * 0.59 + base.b * 0.11 > 222;
    const label = pale
      ? text(null, String(left), 50, { color: PALE_INK, outline: null, shadow: false })
      : text(null, String(left), 50, { color: COLOR.white, outline: this.inkOf(c), outlineWidth: 4 });
    node.addChild(label.node);
    at(label.node, 0, -6);
    const wait = box('wait', node, 34, 34);
    at(wait, CAR_W / 2 - 8, CAR_H / 2 - 6);
    img(wait, 'kit/circle_white', 34, 34, 'bubble');
    for (let i = -1; i <= 1; i++) {
      const dot = img(wait, 'kit/circle_white', 6, 6, 'dot');
      (dot.getComponent(Sprite) as Sprite).color = new Color(70, 80, 100, 255);
      at(dot, i * 9, 0);
    }
    wait.active = false;
    const car: CarView = { node, body, rim, c, n, left, label, wait, readyAt: 0, done: false };
    this.setLeft(car, left);
    onTap(node, () => this.onTapCar(car), { sound: null, press: 0 });
    return car;
  }

  /** 数字的描边：方块颜色的深一档（不用黑的，黑边压在亮色上显脏）；颜色太浅或太深的往中间靠一点，保证白字看得清 */
  private inkOf(c: number): Color {
    const base = this.colors[c] ?? Color.WHITE;
    const lum = (base.r * 0.3 + base.g * 0.59 + base.b * 0.11) / 255;
    const k = lum > 0.8 ? 0.42 : lum < 0.3 ? 0.5 : 0.52;
    return new Color(Math.round(base.r * k), Math.round(base.g * k), Math.round(base.b * k), 255);
  }

  /** 最前排：亮、有白边；后排：压暗一点、没有白边。onField = 已经在上场位上（亮、没有白边） */
  private setFront(car: CarView, front: boolean, dim = !front): void {
    car.rim.active = front;
    const base = this.colors[car.c] ?? Color.WHITE;
    const k = dim ? DIM : 1;
    (car.body.getComponent(Sprite) as Sprite).color = new Color(Math.round(base.r * k), Math.round(base.g * k), Math.round(base.b * k), 255);
    opacity(car.label.node).opacity = dim ? 205 : 255;
  }

  /** 这个方块在排队区的哪里：[列, 第几个]；不在排队区返回 null */
  find(car: CarView): [number, number] | null {
    for (let t = 0; t < this.tracks.length; t++) {
      const i = this.tracks[t].indexOf(car);
      if (i >= 0) return [t, i];
    }
    return null;
  }

  /** 画面上还差几颗 */
  setLeft(car: CarView, left: number): void {
    car.left = Math.max(0, left);
    car.label.string = String(car.left);
  }

  setWait(car: CarView, on: boolean): void {
    if (!car.node.isValid || car.wait.active === on) return;
    car.wait.active = on;
    if (on) fx.popIn(car.wait, 0, 0.2);
  }

  /** 第 t 列的第 i 个跳上第 place 个上场位，这一列后面的往前挪；返回这个方块 */
  enter(t: number, i: number, place: number, dur: number): CarView {
    const car = this.tracks[t].splice(i, 1)[0];
    this.places[place] = car;
    car.node.active = true;
    this.setFront(car, false, false);
    // 跳过去的时候盖在别的方块上面
    car.node.setSiblingIndex(this.stage.children.length - 1);
    const k = this.carScale();
    Tween.stopAllByTarget(car.node);
    const from = car.node.position.clone();
    const to = this.placePos(place);
    const top = new Vec3((from.x + to.x) / 2, Math.max(from.y, to.y) + 46, 0);
    tween(car.node)
      .to(dur * 0.5, { position: top, scale: new Vec3(k * 1.1, k * 1.1, 1) }, { easing: 'quadOut' })
      .to(dur * 0.5, { position: to, scale: new Vec3(k, k, 1) }, { easing: 'quadIn' })
      .call(() => this.bump(car))
      .start();
    this.relayout(t, dur);
    if (this.warn) this.setWarn(true);
    return car;
  }

  /** 第 t 列（从前往后）摆好：前 TRACK_ROWS 个露出来，最前面的亮 */
  private relayout(t: number, dur: number): void {
    this.tracks[t].forEach((c, j) => {
      const was = c.node.active;
      c.node.active = j < TRACK_ROWS;
      const p = this.trackPos(t, j);
      Tween.stopAllByTarget(c.node);
      c.node.setScale(QUEUE_K, QUEUE_K, 1);
      this.setFront(c, j === 0);
      if (c.node.active && !was) {
        at(c.node, p.x, p.y - ROW_H * 0.5);
        fx.fadeIn(c.node, dur);
      }
      tween(c.node).to(dur, { position: p }, { easing: 'quadOut' }).start();
    });
    this.refreshMore();
  }

  /** 技能「铲子」从排队区第 t 列第 i 个方块上扣了 k：数字跳一下；扣到 0 弹一下消失，后面的往前补 */
  cut(t: number, i: number, k: number, gone: boolean, dur: number): void {
    const car = this.tracks[t]?.[i];
    if (!car) return;
    car.n -= k;
    this.setLeft(car, car.left - k);
    if (!gone) {
      if (car.node.active) this.bump(car, 0.12);
      return;
    }
    this.tracks[t].splice(i, 1);
    const node = car.node;
    Tween.stopAllByTarget(node);
    const s = node.scale.x;
    tween(node)
      .to(0.1, { scale: new Vec3(s * 1.18, s * 1.18, 1) }, { easing: 'quadOut' })
      .to(0.14, { scale: new Vec3(0, 0, 1) }, { easing: 'backIn' })
      .call(() => node.destroy())
      .start();
    this.relayout(t, dur);
  }

  private refreshMore(): void {
    this.tracks.forEach((list, t) => {
      const l = this.more[t];
      if (!l) return;
      const hidden = list.length - TRACK_ROWS;
      l.string = hidden > 0 ? `+${hidden}` : '';
    });
  }

  /** 搬完离场：方块跳一下消失，上场位空出来 */
  leave(car: CarView): void {
    const place = this.places.indexOf(car);
    if (place >= 0) this.places[place] = null;
    this.setWait(car, false);
    const node = car.node;
    Tween.stopAllByTarget(node);
    const k = node.scale.x;
    tween(node)
      .to(0.1, { scale: new Vec3(k * 1.18, k * 1.18, 1) }, { easing: 'quadOut' })
      .to(0.14, { scale: new Vec3(0, 0, 1) }, { easing: 'backIn' })
      .call(() => node.destroy())
      .start();
    if (this.warn) this.setWarn(true);
  }

  /** 方块顿一下（落位、放出一个小人）：缩放回到它该有的大小 */
  bump(car: CarView, amount = 0.07): void {
    const n = car.node;
    if (!n.isValid) return;
    const k = this.places.includes(car) ? this.carScale() : QUEUE_K;
    Tween.stopAllByTag(BUMP_TAG, n);
    n.setScale(k * (1 + amount), k * (1 - amount), 1);
    tween(n).tag(BUMP_TAG).to(0.14, { scale: new Vec3(k, k, 1) }, { easing: 'backOut' }).start();
  }

  /** 点不动：晃一下 */
  shake(car: CarView): void {
    fx.shake(car.node, 6);
  }

  /** 第 t 列最前面的方块（提示圈、教学手指挂在它上面） */
  front(t: number): CarView | null {
    return this.tracks[t]?.[0] ?? null;
  }

  /** 「调队」挑方块时：后排的方块一起呼吸，提醒能点 */
  highlightBack(on: boolean): void {
    for (const list of this.tracks) {
      list.forEach((c, i) => {
        if (i === 0 || !c.node.active) return;
        Tween.stopAllByTarget(c.node);
        c.node.setScale(QUEUE_K, QUEUE_K, 1);
        this.setFront(c, false, !on);
        if (on) fx.breathe(c.node, 0.08, 0.7);
      });
    }
  }
}
