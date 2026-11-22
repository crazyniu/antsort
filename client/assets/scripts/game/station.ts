// 上场位和排队区（docs/01 第 1.2 节）：河里一排小船就是上场位（5 条 + 一条「＋」），河对岸几列排队的小队方块。
// 只管画和点：点了方块调 onTapCar，规则在 core/dig/rules.ts，什么时候上场、搬豆、离场由局内页面按事件安排。
// 代码里的名字沿用上一版：car = 小队方块，track = 排队区的一列，place = 上场位。
import { Color, Label, Node, Sprite, Tween, Vec3, tween } from 'cc';
import type { GameState } from '../core/dig/rules';
import * as fx from '../ui/fx';
import { COLOR, at, box, img, onTap, opacity, size, text } from '../ui/kit';

/** 方块的显示尺寸（kit/block_body） */
export const CAR_W = 100;
export const CAR_H = 92;
/** 上场位（船）占的高度；船的图宽高比（kit/boat） */
const PAD_H = 100;
const BOAT_K = 198 / 339;
/** 方块坐在船上，比船的中心高多少 */
const SEAT = 14;
/** 排队区里方块缩到多大、一行占多高、最多露出几行、两列隔多远 */
const QUEUE_K = 0.82;
const ROW_H = 80;
export const TRACK_ROWS = 3;
const COL_GAP = 150;
const BUMP_TAG = 9301;
/** 后排的方块压暗到多少 */
const DIM = 0.62;

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
  private pads: Node[] = [];
  private plusPad: Node | null = null;
  private more: Label[] = [];
  private warn = false;

  /**
   * stage：放船和方块的层。stationY：船那一排的中线；trackTop：排队区最上面。
   * plus：还能不能加位（能就多画一条「＋」的船，点它调 onPlus）
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

  static padHeight(): number {
    return PAD_H;
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
    const gap = Math.min(COL_GAP, (this.width - 220) / Math.max(1, T - 1));
    return (t - (T - 1) / 2) * gap;
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
    return Math.min(122, (this.width - 20) / Math.max(1, this.padCount()));
  }

  /** 方块在船上缩到多大 */
  carScale(): number {
    return Math.min(1, (this.placeW() - 26) / CAR_W);
  }

  placePos(i: number): Vec3 {
    const w = this.placeW();
    return new Vec3((i - (this.padCount() - 1) / 2) * w, this.stationY + SEAT, 0);
  }

  /** 造一条船 */
  private makeBoat(): Node {
    const w = this.placeW() - 6;
    return img(this.stage, 'kit/boat', w, w * BOAT_K, 'boat');
  }

  /** 上场位变成 count 条船：船重排，上面的方块跟着挪。加过位以后「＋」那条船变成真的位子 */
  setSlots(count: number, instant = false): void {
    if (!instant && count > this.places.length) this.plus = false;
    while (this.places.length < count) this.places.push(null);
    const w = this.placeW();
    while (this.pads.length < count) {
      const pad = this.makeBoat();
      // 船垫在方块下面
      pad.setSiblingIndex(0);
      this.pads.push(pad);
      if (!instant) fx.popIn(pad, 0, 0.25);
    }
    if (this.plus && !this.plusPad) {
      const pad = this.makeBoat();
      pad.setSiblingIndex(0);
      opacity(pad).opacity = 200;
      const plus = text(pad, '+', 54, { color: COLOR.white, outline: new Color(60, 90, 140, 255), outlineWidth: 5 });
      at(plus.node, 0, 10);
      onTap(pad, () => this.onPlus());
      this.plusPad = pad;
    }
    if (!this.plus && this.plusPad) {
      this.plusPad.destroy();
      this.plusPad = null;
    }
    const all = this.plusPad ? [...this.pads, this.plusPad] : this.pads;
    all.forEach((pad, i) => {
      size(pad, w - 6, (w - 6) * BOAT_K);
      const p = this.placePos(i);
      if (instant) at(pad, p.x, this.stationY);
      else tween(pad).to(0.2, { position: new Vec3(p.x, this.stationY, 0) }, { easing: 'quadOut' }).start();
    });
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

  /** 上场位告急：空着的船泛红 */
  setWarn(on: boolean): void {
    if (on === this.warn && !on) return;
    this.warn = on;
    this.pads.forEach((pad, i) => {
      (pad.getComponent(Sprite) as Sprite).color = on && !this.places[i] ? new Color(255, 150, 136, 255) : Color.WHITE;
    });
  }

  /** 上场位一起闪一下（满了还点） */
  flashPads(): void {
    for (const pad of this.pads) fx.squash(pad, 1.08);
  }

  private makeCar(c: number, n: number, left: number): CarView {
    const node = box('car', this.stage, CAR_W, CAR_H);
    const rim = img(node, 'kit/block_rim', CAR_W + 12, CAR_H + 12, 'rim');
    const body = img(node, 'kit/block_body', CAR_W, CAR_H, 'body');
    const label = text(null, String(left), 50, { color: COLOR.white, outline: new Color(30, 34, 48, 255), outlineWidth: 5 });
    node.addChild(label.node);
    at(label.node, 0, 7);
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

  /** 最前排：亮、有白边；后排：压暗、没有白边。onField = 已经在上场位上（亮、没有白边） */
  private setFront(car: CarView, front: boolean, dim = !front): void {
    car.rim.active = front;
    const base = this.colors[car.c] ?? Color.WHITE;
    const k = dim ? DIM : 1;
    (car.body.getComponent(Sprite) as Sprite).color = new Color(Math.round(base.r * k), Math.round(base.g * k), Math.round(base.b * k), 255);
    opacity(car.label.node).opacity = dim ? 170 : 255;
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
    if (this.warn) this.setWarn(true);
    return car;
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
