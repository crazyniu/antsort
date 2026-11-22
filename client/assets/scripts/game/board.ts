// 像素画（docs/01 第 1.2、1.3、3 节）：把拼豆画摆出来，一格一颗鲜艳的正方体宝石（kit/gem 染色 + kit/gem_hi 高光），紧挨着排；
// 搬走的格子露出背景。
// 只管画，不管规则：能不能搬、搬哪颗都由 core/dig/rules.ts 算，局内页面按事件调 dig()。
// 这里自己留一份「画面上的豆」：规则是当场算完的，画面慢慢播，两边不同步。
import { Color, Node, Sprite, Tween, Vec3, tween } from 'cc';
import { DigLevel } from '../core/dig/level';
import type { GameState } from '../core/dig/rules';
import * as fx from '../ui/fx';
import { at, box, hex, img, size } from '../ui/kit';

/** 一格最大多大（设计单位）：小画也不放得太大 */
const CELL_MAX = 24;
/** 宝石的图（kit/gem，宽 / 高 0.841）比一格高出多少：下面那一截是前面的侧面，垂到下一行，被下一行盖住 */
const SIDE = 1 / 0.841 - 1;
/** 摞着的豆往上抬多少格 */
const LIFT = 0.22;

export class Board {
  readonly node: Node;
  /** 一格的边长（设计单位） */
  readonly cell: number;
  /** 颜色编号 → 颜色 */
  readonly colors: Color[];
  /** 画面上每个位置从下到上的豆（开局、重画时从局面抄一份） */
  private cols: number[][] = [];
  private beadL: Node;
  private glossL: Node;
  private beads: Node[] = [];
  private gloss: Node[] = [];

  /** parent 里 w × h 的一块地方（居中摆） */
  constructor(parent: Node, w: number, h: number, private lv: DigLevel) {
    this.cell = Math.min(CELL_MAX, w / lv.w, h / lv.h);
    this.colors = lv.palette.map((c) => hex(c));
    this.node = box('board', parent, lv.w * this.cell, lv.h * this.cell);
    // 分层放：同一层用同一张图，引擎才能合批
    this.beadL = box('beads', this.node);
    this.glossL = box('gloss', this.node);
  }

  get width(): number {
    return this.lv.w * this.cell;
  }

  get height(): number {
    return this.lv.h * this.cell;
  }

  /** 第 p 个位置的中心，在 board 节点里的坐标 */
  pos(p: number): Vec3 {
    const x = p % this.lv.w;
    const y = (p - x) / this.lv.w;
    return this.posXY(x, y);
  }

  /** 第 x 列第 y 行的中心（可以在画外面一圈：-1、w、h） */
  posXY(x: number, y: number): Vec3 {
    return new Vec3((x - (this.lv.w - 1) / 2) * this.cell, ((this.lv.h - 1) / 2 - y) * this.cell, 0);
  }

  /** 画出整张（intro：从中间往外依次弹出） */
  build(s: GameState, intro: boolean, stagger = 0.02): void {
    this.beadL.destroyAllChildren();
    this.glossL.destroyAllChildren();
    this.cols = s.cols.map((c) => c.slice());
    const C = this.cell;
    const n = this.lv.w * this.lv.h;
    this.beads = [];
    this.gloss = [];
    // 从上到下一行行放：下面一行盖住上面一行垂下来的侧面；豆的面比一格矮，每颗下面都露一条侧面
    for (let p = 0; p < n; p++) {
      const at0 = this.pos(p);
      const bead = img(this.beadL, 'kit/gem', C, C * (1 + SIDE), 'bead');
      // 高光：不染色，和豆同步（染色是乘法，白高光会被染掉，所以另叠一张）
      const gl = img(this.glossL, 'kit/gem_hi', C, C * (1 + SIDE), 'gl');
      this.beads.push(bead);
      this.gloss.push(gl);
      this.render(p);
      if (intro && this.cols[p].length > 0) {
        const d = 0.1 + (Math.hypot(at0.x, at0.y) / C) * stagger;
        fx.popIn(bead, d, 0.22);
        fx.popIn(gl, d, 0.22);
      }
    }
  }

  /** 按画面上的豆刷新第 p 个位置 */
  private render(p: number): void {
    const col = this.cols[p];
    const top = col.length > 0 ? col[col.length - 1] : -1;
    const bead = this.beads[p];
    const gl = this.gloss[p];
    const C = this.cell;
    Tween.stopAllByTarget(bead);
    Tween.stopAllByTarget(gl);
    bead.setScale(1, 1, 1);
    gl.setScale(1, 1, 1);
    bead.active = top >= 0;
    gl.active = top >= 0;
    if (top < 0) return;
    const at0 = this.pos(p);
    // 图的上面那一块正好盖住这一格，侧面垂在格子下面；摞着的往上抬一点
    const y = at0.y - (C * SIDE) / 2 + (col.length - 1) * C * LIFT;
    at(bead, at0.x, y);
    at(gl, at0.x, y);
    size(bead, C, C * (1 + SIDE));
    size(gl, C, C * (1 + SIDE));
    (bead.getComponent(Sprite) as Sprite).color = this.colors[top] ?? Color.WHITE;
  }

  /** 画面上这个位置最上面那颗豆的颜色编号（没有是 -1） */
  topOf(p: number): number {
    const col = this.cols[p];
    return col.length > 0 ? col[col.length - 1] : -1;
  }

  /** 画面上这个位置摞着几颗 */
  heightOf(p: number): number {
    return this.cols[p]?.length ?? 0;
  }

  /** 搬走第 p 个位置最上面的豆：缩掉，露出下面的（下面有豆就弹一下） */
  dig(p: number): void {
    const col = this.cols[p];
    if (col.length === 0) return;
    const bead = this.beads[p];
    const gl = this.gloss[p];
    col.pop();
    const under = col.length > 0 ? col[col.length - 1] : -1;
    Tween.stopAllByTarget(bead);
    Tween.stopAllByTarget(gl);
    tween(gl).to(0.08, { scale: new Vec3(0.3, 0.3, 1) }, { easing: 'quadIn' }).start();
    tween(bead)
      .to(0.08, { scale: new Vec3(0.3, 0.3, 1) }, { easing: 'quadIn' })
      .call(() => {
        this.render(p);
        if (under >= 0) {
          bead.setScale(0.7, 0.7, 1);
          gl.setScale(0.7, 0.7, 1);
          tween(bead).to(0.14, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' }).start();
          tween(gl).to(0.14, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' }).start();
        }
      })
      .start();
  }
}
