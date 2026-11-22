// 料场（docs/01 第 1.2、1.3 节）：把拼豆画摆出来，每个位置只画最上面那颗豆；被挖走时缩掉、露出下面的。
// 只管画，不管规则：能不能挖、挖哪颗都由 core/dig/rules.ts 算，局内页面按事件调 dig()。
// 这里自己留一份「画面上的豆」：规则是当场算完的，画面慢慢播，两边不同步。
import { Color, Node, Sprite, Tween, Vec3, tween } from 'cc';
import { DigLevel, STONE } from '../core/dig/level';
import type { GameState } from '../core/dig/rules';
import * as fx from '../ui/fx';
import { at, box, hex, img, opacity, size, slice } from '../ui/kit';

/** 一格最大多大（设计单位） */
const CELL_MAX = 62;
/** 豆、豆眼占一格的多少；两层以上的豆大一圈 */
const BEAD = 0.9;
const BEAD_TALL = 0.99;
const HOLE = 0.32;
const STONE_COLOR = new Color(141, 147, 156, 255);

function darker(c: Color, k: number): Color {
  return new Color(Math.round(c.r * k), Math.round(c.g * k), Math.round(c.b * k), 255);
}

export class Board {
  readonly node: Node;
  /** 一格的边长（设计单位） */
  readonly cell: number;
  /** 颜色编号 → 颜色 */
  readonly colors: Color[];
  private holeColors: Color[];
  private shadeColors: Color[];
  /** 画面上每个位置从下到上的豆（开局、重画时从局面抄一份） */
  private cols: number[][] = [];
  private shadeL: Node;
  private xrayL: Node;
  private beadL: Node;
  private holeL: Node;
  private beads: Node[] = [];
  private holes: Node[] = [];
  private shades: Node[] = [];
  private stones = new Map<number, Node>();
  private xrays = new Map<number, Node>();

  /** parent 里 w × h 的一块地方（居中摆） */
  constructor(parent: Node, w: number, h: number, private lv: DigLevel) {
    this.cell = Math.min(CELL_MAX, (w - 28) / lv.w, (h - 28) / lv.h);
    this.colors = lv.palette.map((c) => hex(c));
    this.holeColors = this.colors.map((c) => darker(c, 0.78));
    this.shadeColors = this.colors.map((c) => darker(c, 0.56));
    this.node = box('board', parent, lv.w * this.cell + 20, lv.h * this.cell + 20);
    // 底板：浅色的拼豆板
    slice(this.node, 'kit/row', lv.w * this.cell + 20, lv.h * this.cell + 20, 'plate');
    // 分层放：同一层用同一张图，引擎才能合批
    this.shadeL = box('shades', this.node);
    this.xrayL = box('xray', this.node);
    this.beadL = box('beads', this.node);
    this.holeL = box('holes', this.node);
  }

  /** 第 p 个位置的中心，在 board 节点里的坐标 */
  pos(p: number): Vec3 {
    const x = p % this.lv.w;
    const y = (p - x) / this.lv.w;
    return new Vec3((x - (this.lv.w - 1) / 2) * this.cell, ((this.lv.h - 1) / 2 - y) * this.cell, 0);
  }

  /** 画出整张（intro：从中间往外依次弹出） */
  build(s: GameState, intro: boolean, stagger = 0.02): void {
    for (const l of [this.shadeL, this.xrayL, this.beadL, this.holeL]) l.destroyAllChildren();
    this.stones.clear();
    this.xrays.clear();
    this.cols = s.cols.map((c) => c.slice());
    const C = this.cell;
    const n = this.lv.w * this.lv.h;
    this.beads = [];
    this.holes = [];
    this.shades = [];
    for (let p = 0; p < n; p++) {
      const at0 = this.pos(p);
      const shade = img(this.shadeL, 'kit/circle_white', C * BEAD_TALL, C * BEAD_TALL, 'shade');
      at(shade, at0.x, at0.y - C * 0.1);
      const bead = img(this.beadL, 'kit/circle_white', C * BEAD, C * BEAD, 'bead');
      at(bead, at0.x, at0.y);
      const hole = img(this.holeL, 'kit/circle_white', C * HOLE, C * HOLE, 'hole');
      at(hole, at0.x, at0.y);
      this.shades.push(shade);
      this.beads.push(bead);
      this.holes.push(hole);
      this.render(p);
      if (intro && this.cols[p].length > 0) {
        const d = Math.hypot(at0.x, at0.y) / C;
        fx.popIn(bead, 0.1 + d * stagger, 0.22);
        fx.popIn(hole, 0.1 + d * stagger, 0.22);
      }
    }
  }

  /** 按画面上的豆刷新第 p 个位置 */
  private render(p: number): void {
    const col = this.cols[p];
    const top = col.length > 0 ? col[col.length - 1] : -1;
    const bead = this.beads[p];
    const hole = this.holes[p];
    const shade = this.shades[p];
    const C = this.cell;
    Tween.stopAllByTarget(bead);
    Tween.stopAllByTarget(hole);
    bead.setScale(1, 1, 1);
    hole.setScale(1, 1, 1);
    opacity(bead).opacity = 255;
    const x = this.xrays.get(p);
    if (x) {
      x.destroy();
      this.xrays.delete(p);
    }
    let stone = this.stones.get(p);
    if (top === STONE && !stone) {
      stone = img(this.beadL, 'kit/round_white', C * 0.94, C * 0.94, 'stone');
      const at0 = this.pos(p);
      at(stone, at0.x, at0.y);
      (stone.getComponent(Sprite) as Sprite).color = STONE_COLOR;
      this.stones.set(p, stone);
    }
    if (stone) stone.active = top === STONE;
    const isBead = top >= 0;
    bead.active = isBead;
    hole.active = isBead;
    // 两层以上：豆大一圈，下面垫一圈深色，看着是摞起来的
    const tall = isBead && col.length >= 2;
    shade.active = tall;
    if (!isBead) return;
    const s0 = C * (tall ? BEAD_TALL : BEAD);
    size(bead, s0, s0);
    (bead.getComponent(Sprite) as Sprite).color = this.colors[top] ?? Color.WHITE;
    (hole.getComponent(Sprite) as Sprite).color = this.holeColors[top] ?? Color.GRAY;
    if (tall) (shade.getComponent(Sprite) as Sprite).color = this.shadeColors[top] ?? Color.GRAY;
  }

  /** 画面上这个位置最上面那颗豆的颜色编号（没有是 -1） */
  topOf(p: number): number {
    const col = this.cols[p];
    return col.length > 0 ? col[col.length - 1] : -1;
  }

  /** 挖走第 p 个位置最上面的豆：缩掉，露出下面的（下面有豆就弹一下） */
  dig(p: number): void {
    const col = this.cols[p];
    if (col.length === 0) return;
    const bead = this.beads[p];
    const hole = this.holes[p];
    col.pop();
    const under = col.length > 0 ? col[col.length - 1] : -1;
    Tween.stopAllByTarget(bead);
    Tween.stopAllByTarget(hole);
    tween(hole).to(0.07, { scale: new Vec3(0, 0, 1) }).start();
    tween(bead)
      .to(0.09, { scale: new Vec3(0.2, 0.2, 1) }, { easing: 'quadIn' })
      .call(() => {
        this.render(p);
        if (under >= 0) {
          bead.setScale(0.6, 0.6, 1);
          tween(bead).to(0.14, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' }).start();
        }
      })
      .start();
  }

  /** 画面上还有被盖住的豆吗 */
  hasHidden(): boolean {
    return this.cols.some((col) => col.length >= 2 && col[col.length - 2] >= 0);
  }

  /** 透视：上面的豆变透明几秒，看得到正下面那颗的颜色 */
  xray(seconds: number): void {
    const C = this.cell;
    this.cols.forEach((col, p) => {
      if (col.length < 2 || col[col.length - 1] < 0 || col[col.length - 2] < 0 || this.xrays.has(p)) return;
      const n = img(this.xrayL, 'kit/circle_white', C * BEAD, C * BEAD, 'x');
      const at0 = this.pos(p);
      at(n, at0.x, at0.y);
      (n.getComponent(Sprite) as Sprite).color = this.colors[col[col.length - 2]] ?? Color.WHITE;
      this.xrays.set(p, n);
      const op = opacity(this.beads[p]);
      Tween.stopAllByTarget(op);
      tween(op).to(0.2, { opacity: 40 }).start();
      this.holes[p].active = false;
      this.shades[p].active = false;
    });
    fx.delay(this.xrayL, seconds, () => {
      for (const p of Array.from(this.xrays.keys())) {
        const op = opacity(this.beads[p]);
        tween(op)
          .to(0.2, { opacity: 255 })
          .call(() => this.render(p))
          .start();
      }
    });
  }
}
