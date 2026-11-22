// 站台（docs/01 第 1.2 节）：上面一排装车位，下面几条待发线，还有每节车厢的小挖机。
// 只管画和点：点了车厢调 onTapCar(线, 第几节)，规则在 core/dig/rules.ts，什么时候进站、挖豆、发车由局内页面按事件安排。
import { Color, Label, Node, Sprite, Tween, UITransform, Vec3, tween } from 'cc';
import type { GameState } from '../core/dig/rules';
import * as fx from '../ui/fx';
import { COLOR, at, box, img, onTap, opacity, resizeSlice, setSlice, size, slice, text, tint } from '../ui/kit';

/** 车厢的显示尺寸（kit/wagon_*） */
export const CAR_W = 120;
export const CAR_H = 80;
/** 装车位的格子多高 */
const PAD_H = 96;
/** 待发线上一节车厢占多高、最多露出几节 */
const ROW_H = 82;
export const TRACK_ROWS = 3;
/** 挖机多大 */
const DIGGER = 46;
const BUMP_TAG = 9301;

export interface CarView {
  node: Node;
  c: number;
  n: number;
  /** 画面上还差几颗 */
  left: number;
  label: Label;
  /** 车斗里堆起来的豆 */
  fill: Node;
  /** 「在等豆露出来」的小标记 */
  wait: Node;
  /** 这节车厢的挖机（进站后才有） */
  diggers: Digger[];
  /** 这节车厢的挖机最晚忙到什么时候（局内页面的时间） */
  busyEnd: number;
}

export interface Digger {
  node: Node;
  /** 铲斗里的豆（开回来的路上亮着） */
  load: Node;
  /** 停在车厢旁边的位置 */
  home: Vec3;
}

export class Station {
  /** 每个装车位上停着哪节车厢 */
  places: (CarView | null)[] = [];
  /** 每条待发线上排着的车厢，从前到后 */
  tracks: CarView[][] = [];
  private pads: Node[] = [];
  private more: Label[] = [];
  private warn = false;

  /**
   * stage：放格子和车厢的层；fly：特效层（挖机在这一层跑，盖在料场上面）。
   * stationY：装车位那一排的中线；trackTop：待发线最上面
   */
  constructor(
    private stage: Node,
    private fly: Node,
    private colors: Color[],
    private width: number,
    private stationY: number,
    private trackTop: number,
    private onTapCar: (car: CarView) => void,
  ) {}

  /** 待发线一共占多高 */
  static trackHeight(): number {
    return TRACK_ROWS * ROW_H + 16;
  }

  static padHeight(): number {
    return PAD_H;
  }

  /** 按局面整个重画（开局、复活后） */
  build(s: GameState): void {
    const T = s.tracks.length;
    // 待发线的底
    for (let t = 0; t < T; t++) {
      const bed = slice(this.stage, 'kit/row', CAR_W + 24, Station.trackHeight(), `track${t}`);
      at(bed, this.trackX(t, T), this.trackTop - Station.trackHeight() / 2);
      opacity(bed).opacity = 150;
      const more = text(null, '', 22, { color: COLOR.white });
      this.stage.addChild(more.node);
      at(more.node, this.trackX(t, T), this.trackTop - Station.trackHeight() - 14);
      this.more.push(more);
    }
    this.tracks = s.tracks.map((list, t) =>
      list.map((def, i) => {
        const car = this.makeCar(def.c, def.n, def.n);
        const p = this.trackPos(t, i, T);
        at(car.node, p.x, p.y);
        car.node.active = i < TRACK_ROWS;
        return car;
      }),
    );
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
      this.spawnDiggers(car, i);
      this.setWait(car, true);
    });
  }

  private trackX(t: number, T: number): number {
    const gap = Math.min(230, (this.width - 40) / T);
    return (t - (T - 1) / 2) * gap;
  }

  /** 第 t 条线上第 i 节的位置（0 = 最前面，在最上面） */
  trackPos(t: number, i: number, T = this.tracks.length): Vec3 {
    return new Vec3(this.trackX(t, T), this.trackTop - 8 - ROW_H / 2 - i * ROW_H, 0);
  }

  private placeW(): number {
    return Math.min(146, (this.width - 24) / Math.max(1, this.places.length));
  }

  /** 车厢停在装车位上缩到多大（位子多了就小一点） */
  carScale(): number {
    return Math.min(1, (this.placeW() - 14) / CAR_W);
  }

  placePos(i: number): Vec3 {
    const w = this.placeW();
    return new Vec3((i - (this.places.length - 1) / 2) * w, this.stationY, 0);
  }

  /** 装车位变成 count 个：格子重排，停着的车厢和挖机跟着挪 */
  setSlots(count: number, instant = false): void {
    while (this.places.length < count) this.places.push(null);
    const w = this.placeW();
    while (this.pads.length < count) {
      const pad = slice(this.stage, 'kit/slot', w - 8, PAD_H, 'pad');
      // 格子垫在车厢下面
      pad.setSiblingIndex(0);
      this.pads.push(pad);
      if (!instant) fx.popIn(pad, 0, 0.25);
    }
    this.pads.forEach((pad, i) => {
      resizeSlice(pad, w - 8, PAD_H);
      const p = this.placePos(i);
      if (instant) at(pad, p.x, p.y);
      else tween(pad).to(0.2, { position: p }, { easing: 'quadOut' }).start();
    });
    const k = this.carScale();
    this.places.forEach((car, i) => {
      if (!car) return;
      const p = this.placePos(i);
      Tween.stopAllByTarget(car.node);
      tween(car.node).to(0.2, { position: p, scale: new Vec3(k, k, 1) }, { easing: 'quadOut' }).start();
      car.diggers.forEach((d, j) => {
        d.home = this.diggerHome(i, j, car.diggers.length);
        tween(d.node).to(0.2, { position: d.home }).start();
      });
    });
  }

  /** 画面上第一个空着的装车位，没有返回 -1 */
  freePlace(): number {
    return this.places.indexOf(null);
  }

  /** 装车位告急：空着的格子变红 */
  setWarn(on: boolean): void {
    if (on === this.warn && !on) return;
    this.warn = on;
    this.pads.forEach((pad, i) => setSlice(pad, on && !this.places[i] ? 'kit/slot_warn' : 'kit/slot'));
  }

  /** 装车位一起闪一下（满了还点） */
  flashPads(): void {
    for (const pad of this.pads) fx.squash(pad, 1.08);
  }

  private makeCar(c: number, n: number, left: number): CarView {
    const node = box('car', this.stage, CAR_W, CAR_H);
    const body = img(node, 'kit/wagon_body', CAR_W, CAR_H, 'body');
    (body.getComponent(Sprite) as Sprite).color = this.colors[c] ?? Color.WHITE;
    // 车斗里的豆：从斗底往上涨的一条亮色
    const fill = tint(node, CAR_W - 14, 2, new Color(255, 255, 255, 255), 'fill');
    (fill.getComponent(UITransform) as UITransform).setAnchorPoint(0.5, 0);
    at(fill, 0, -20);
    opacity(fill).opacity = 90;
    img(node, 'kit/wagon_top', CAR_W, CAR_H, 'top');
    const label = text(null, String(left), 36, { color: COLOR.white, outline: new Color(30, 34, 48, 255), outlineWidth: 4 });
    node.addChild(label.node);
    at(label.node, 0, 4);
    const wait = box('wait', node, 34, 34);
    at(wait, CAR_W / 2 - 10, CAR_H / 2 - 12);
    img(wait, 'kit/circle_white', 34, 34, 'bubble');
    for (let i = -1; i <= 1; i++) {
      const dot = img(wait, 'kit/circle_white', 6, 6, 'dot');
      (dot.getComponent(Sprite) as Sprite).color = new Color(70, 80, 100, 255);
      at(dot, i * 9, 0);
    }
    wait.active = false;
    const car: CarView = { node, c, n, left, label, fill, wait, diggers: [], busyEnd: 0 };
    this.setLeft(car, left);
    onTap(node, () => this.onTapCar(car), { sound: null, press: 0 });
    return car;
  }

  /** 这节车厢在待发线的哪里：[线, 第几节]；不在待发线上返回 null */
  find(car: CarView): [number, number] | null {
    for (let t = 0; t < this.tracks.length; t++) {
      const i = this.tracks[t].indexOf(car);
      if (i >= 0) return [t, i];
    }
    return null;
  }

  /** 画面上还差几颗：数字和车斗里的豆 */
  setLeft(car: CarView, left: number): void {
    car.left = Math.max(0, left);
    car.label.string = String(car.left);
    const k = car.n > 0 ? 1 - car.left / car.n : 0;
    size(car.fill, CAR_W - 14, 2 + 40 * k);
  }

  setWait(car: CarView, on: boolean): void {
    if (!car.node.isValid || car.wait.active === on) return;
    car.wait.active = on;
    if (on) fx.popIn(car.wait, 0, 0.2);
  }

  /** 第 t 条线的第 i 节开进第 place 个装车位，这条线后面的往前挪；返回这节车厢 */
  enter(t: number, i: number, place: number, dur: number): CarView {
    const car = this.tracks[t].splice(i, 1)[0];
    this.places[place] = car;
    car.node.active = true;
    // 开过去的时候盖在别的车厢上面
    car.node.setSiblingIndex(this.stage.children.length - 1);
    const k = this.carScale();
    Tween.stopAllByTarget(car.node);
    car.node.setScale(1, 1, 1);
    tween(car.node)
      .to(dur, { position: this.placePos(place), scale: new Vec3(k, k, 1) }, { easing: 'quadOut' })
      .call(() => this.bump(car))
      .start();
    this.tracks[t].forEach((c, j) => {
      const was = c.node.active;
      c.node.active = j < TRACK_ROWS;
      const p = this.trackPos(t, j);
      Tween.stopAllByTarget(c.node);
      c.node.setScale(1, 1, 1);
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

  private diggerHome(place: number, j: number, count: number): Vec3 {
    const p = this.placePos(place);
    const k = this.carScale();
    return new Vec3(p.x + (j - (count - 1) / 2) * DIGGER * 0.74 * k, p.y + (CAR_H / 2 + DIGGER * 0.34) * k, 0);
  }

  /** 给停在第 place 个装车位的车厢配挖机 */
  spawnDiggers(car: CarView, place: number, count = 3): void {
    for (let j = 0; j < count; j++) {
      const node = box('digger', this.fly, DIGGER, DIGGER);
      const body = img(node, 'kit/digger_body', DIGGER, DIGGER, 'body');
      (body.getComponent(Sprite) as Sprite).color = this.colors[car.c] ?? Color.WHITE;
      img(node, 'kit/digger_top', DIGGER, DIGGER, 'top');
      const load = img(node, 'kit/circle_white', 13, 13, 'load');
      (load.getComponent(Sprite) as Sprite).color = this.colors[car.c] ?? Color.WHITE;
      at(load, DIGGER * 0.34, DIGGER * 0.06);
      load.active = false;
      const home = this.diggerHome(place, j, count);
      at(node, home.x, home.y);
      fx.popIn(node, j * 0.05, 0.2);
      car.diggers.push({ node, load, home });
    }
  }

  /** 发车：车厢和它的挖机开走，装车位空出来 */
  leave(car: CarView, dur: number): void {
    const place = this.places.indexOf(car);
    if (place >= 0) this.places[place] = null;
    this.setWait(car, false);
    for (const d of car.diggers) {
      Tween.stopAllByTarget(d.node);
      fx.popOut(d.node, 0.15, () => d.node.destroy());
    }
    car.diggers = [];
    const node = car.node;
    Tween.stopAllByTarget(node);
    const p = node.position;
    tween(node)
      .to(0.08, { position: new Vec3(p.x - 6, p.y, 0) })
      .to(dur, { position: new Vec3(this.width / 2 + CAR_W, p.y, 0) }, { easing: 'quadIn' })
      .call(() => node.destroy())
      .start();
    if (this.warn) this.setWarn(true);
  }

  /** 车厢顿一下（进站落位、倒进一斗豆）：缩放回到它在装车位上该有的大小 */
  bump(car: CarView): void {
    const n = car.node;
    if (!n.isValid) return;
    const k = this.places.includes(car) ? this.carScale() : 1;
    Tween.stopAllByTag(BUMP_TAG, n);
    n.setScale(k * 1.07, k * 0.94, 1);
    tween(n).tag(BUMP_TAG).to(0.14, { scale: new Vec3(k, k, 1) }, { easing: 'backOut' }).start();
  }

  /** 点不动：晃一下 */
  shake(car: CarView): void {
    fx.shake(car.node, 6);
  }

  /** 第 t 条线最前面的车厢（提示圈、教学手指挂在它上面） */
  front(t: number): CarView | null {
    return this.tracks[t]?.[0] ?? null;
  }

  /** 「调车」挑车厢时：后排的车厢一起呼吸，提醒能点 */
  highlightBack(on: boolean): void {
    for (const list of this.tracks) {
      list.forEach((c, i) => {
        if (i === 0 || !c.node.active) return;
        Tween.stopAllByTarget(c.node);
        c.node.setScale(1, 1, 1);
        if (on) fx.breathe(c.node, 0.08, 0.7);
      });
    }
  }
}
