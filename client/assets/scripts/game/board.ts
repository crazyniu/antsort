// 示例玩法的场地（换玩法时换掉这个文件和 core/demo，见 docs/02）：把一关的块摆出来、点块、被压住的压暗。
// 只管画和点，不管规则：点了调 onTap(块号)，规则在 core/demo/rules.ts，结果由 GamePage 按事件播。
import { Color, Node, Tween, Vec3, tween } from 'cc';
import type { DemoLevel } from '../core/demo/level';
import type { GameState } from '../core/demo/rules';
import * as fx from '../ui/fx';
import { at, box, img, onTap, opacity, setImg, slice, tint } from '../ui/kit';

/** 被压住的块盖一层多深的影子 */
const SHADE = new Color(10, 30, 80, 255);
const SHADE_OPACITY = 120;
/** 块的皮（白色圆角卡片）比图案大多少 */
const PAD = 0.14;

export interface TileView {
  node: Node;
  art: Node;
  shade: Node;
}

export class Board {
  readonly node: Node;
  views: TileView[] = [];
  /** 一块的边长（设计单位） */
  size = 100;
  private lv: DemoLevel;
  private frames: string[];

  /**
   * parent 里 w × h 的一块地方；frames[图案号] = 这种图案用哪张图；onTap(块号)
   */
  constructor(parent: Node, w: number, h: number, lv: DemoLevel, frames: string[], private onTapTile: (i: number) => void) {
    this.node = box('board', parent, w, h);
    this.lv = lv;
    this.frames = frames;
    this.size = Math.min(124, ((w - 20) / lv.spanX) * 2, ((h - 20) / lv.spanY) * 2);
  }

  /** 块号 → 在 board 里的位置（层越高往上提一点，看着是叠起来的） */
  pos(i: number): Vec3 {
    const t = this.lv.tiles[i];
    const half = this.size / 2;
    return new Vec3((t.x - (this.lv.spanX - 2) / 2) * half, -(t.y - (this.lv.spanY - 2) / 2) * half + t.layer * 6, 0);
  }

  /** 画出全部块（intro：依次弹出） */
  build(s: GameState, intro: boolean, stagger = 0.02): void {
    this.node.destroyAllChildren();
    this.views = [];
    // 低层先画、高层后画，上面的盖住下面的
    const order = this.lv.tiles.map((_, i) => i).sort((a, b) => this.lv.tiles[a].layer - this.lv.tiles[b].layer);
    const views: TileView[] = new Array(this.lv.tiles.length);
    const S = this.size;
    for (const i of order) {
      const n = slice(this.node, 'kit/panel_glass', S - 4, S - 4, `tile${i}`);
      const p = this.pos(i);
      at(n, p.x, p.y);
      const art = img(n, this.frames[s.tiles[i].kind] ?? 'icon/star', S * (1 - PAD * 2), S * (1 - PAD * 2), 'art');
      const shade = tint(n, S - 4, S - 4, SHADE, 'shade');
      opacity(shade).opacity = SHADE_OPACITY;
      onTap(n, () => this.onTapTile(i), { sound: null, press: 0.94 });
      views[i] = { node: n, art, shade };
      if (intro) fx.popIn(n, 0.1 + order.indexOf(i) * stagger, 0.25);
    }
    this.views = views;
    this.refresh(s);
  }

  /** 按局面刷新：不在场上的藏起来，被压住的压暗 */
  refresh(s: GameState): void {
    this.views.forEach((v, i) => {
      if (!v || !v.node.isValid) return;
      if (v.node.parent !== this.node) return; // 已经飞出去了（在暂存槽里）
      v.node.active = s.alive[i];
      v.shade.active = !s.free(i);
    });
  }

  /** 洗牌后换图案：每块转一下再换图 */
  reskin(s: GameState): void {
    this.views.forEach((v, i) => {
      if (!v || !s.alive[i]) return;
      Tween.stopAllByTarget(v.art);
      tween(v.art)
        .to(0.12, { scale: new Vec3(0, 1, 1) })
        .call(() => setImg(v.art, this.frames[s.tiles[i].kind] ?? 'icon/star', this.size * (1 - PAD * 2), this.size * (1 - PAD * 2)))
        .to(0.12, { scale: new Vec3(1, 1, 1) })
        .start();
    });
  }

  /** 点到被压住的块：晃一下 */
  blocked(i: number): void {
    const v = this.views[i];
    if (v) fx.shake(v.node, 6);
  }

  /** 在这块上放一个提示圈，返回圈（调用方负责销毁） */
  hint(i: number): Node | null {
    const v = this.views[i];
    if (!v || !v.node.active) return null;
    const ring = img(v.node, 'kit/hint_ring', this.size * 1.25, this.size * 1.25, 'hint');
    fx.breathe(ring, 0.12, 0.9);
    return ring;
  }
}
