// 火车（docs/01 第 1.2、3 节）：停在画和上场位之间的铁轨上，小人把豆放进车厢，装满一列开走、下一列开进来。
// 只是装豆的地方，不影响规则：按送来了几颗自己算装到第几节、什么时候发车。
import { Color, Node, Sprite, Vec3, tween } from 'cc';
import { at, box, img, opacity } from '../ui/kit';

/** 车头、车厢显示多大（kit/loco、kit/wagon_*，client/tools/art/sprites.py 切出来的） */
const LOCO_W = 130;
const LOCO_H = 96;
const WAGON_W = 105;
const WAGON_H = 66;
/** 车厢里一排放几颗小方块、每颗多大、一排比一排高多少 */
const COLS = 5;
const CUBE = 17;
const ROW_LIFT = 7;

export interface Drop {
  /** 第几列火车 */
  train: number;
  wagon: number;
  /** 这一节里的第几颗 */
  index: number;
  /** 小人站在哪里放（layer 里的坐标） */
  x: number;
  y: number;
}

/** 一列火车装到什么程度：每节占了几个位子、每节装的什么颜色（-1 = 还没定）、一共放进来几颗 */
interface Load {
  resv: number[];
  color: number[];
  put: number;
}

export class Train {
  private node: Node;
  private wagons: { node: Node; cubes: Node }[] = [];
  /** 现在停着的是第几列；state：进站中、停着、开走中、没车了 */
  private cur = 0;
  private state: 'in' | 'stop' | 'out' | 'none' = 'in';
  private put = 0;
  private loads: Load[] = [];
  private readonly cap: number;

  /**
   * layer：铁轨和火车放在这一层；y：车轮底下那条线；total：这一关一共多少颗豆；
   * speed：现在的倍速（动画时长除以它）
   */
  constructor(
    private layer: Node,
    private colors: Color[],
    private width: number,
    private y: number,
    private wagonCount: number,
    private perWagon: number,
    private total: number,
    /** 已经装走了几颗（复活后重画时不从头数） */
    start: number,
    private moveSec: number,
    private speed: () => number,
    /** 火车动了：'in' 进站、'out' 开走（last = 最后一列）；onDrop：放进去一颗 */
    private onMove: (kind: 'in' | 'out', last: boolean) => void,
    private onDrop: () => void,
  ) {
    this.cap = wagonCount * perWagon;
    // 复活后重画：已经装走的 start 颗按顺序塞满前几列（颜色不知道，后面照常接着装）
    this.put = start;
    this.cur = Math.floor(start / this.cap);
    for (let k = 0, rem = start; rem > 0; k++) {
      const L = this.loadOf(k);
      const take = Math.min(this.capOf(k), rem);
      L.put = take;
      for (let w = 0, r = take; w < wagonCount && r > 0; w++) {
        L.resv[w] = Math.min(perWagon, r);
        r -= L.resv[w];
      }
      rem -= take;
    }
    for (let x = -width / 2 - 30; x < width / 2 + 60; x += 60) at(img(layer, 'kit/track', 60, 18, 'track'), x + 30, y + 3);
    this.node = box('train', layer);
    this.makeTrain();
    this.arrive();
  }

  /** 这一列的中心：车厢在左、车头在右，整列偏右一点（左边留给小桥） */
  private homeX(): number {
    return 58;
  }

  private wagonX(i: number): number {
    const len = this.wagonCount * (WAGON_W + 2) + LOCO_W;
    // 第 0 节挨着车头
    return len / 2 - LOCO_W - 2 - WAGON_W / 2 - i * (WAGON_W + 2);
  }

  private makeTrain(): void {
    this.node.destroyAllChildren();
    this.wagons = [];
    const len = this.wagonCount * (WAGON_W + 2) + LOCO_W;
    for (let i = 0; i < this.wagonCount; i++) {
      const w = box('wagon', this.node, WAGON_W, WAGON_H);
      at(w, this.wagonX(i), WAGON_H / 2);
      img(w, 'kit/wagon_back', WAGON_W, WAGON_H, 'back');
      const cubes = box('cubes', w);
      img(w, 'kit/wagon_front', WAGON_W, WAGON_H, 'front');
      this.wagons.push({ node: w, cubes });
    }
    at(img(this.node, 'kit/loco', LOCO_W, LOCO_H, 'loco'), len / 2 - LOCO_W / 2, LOCO_H / 2 - 2);
  }

  private arrive(): void {
    this.state = 'in';
    this.onMove('in', false);
    at(this.node, -this.width / 2 - 320, this.y);
    tween(this.node)
      .to(this.moveSec / this.speed(), { position: new Vec3(this.homeX(), this.y, 0) }, { easing: 'quadOut' })
      .call(() => {
        this.state = 'stop';
        this.check();
      })
      .start();
  }

  private depart(): void {
    this.state = 'out';
    const last = this.cur >= Math.ceil(this.total / this.cap) - 1;
    this.onMove('out', last);
    for (let i = 0; i < 3; i++) this.puff(i * 0.12);
    tween(this.node)
      .delay(0.15 / this.speed())
      .to(this.moveSec / this.speed(), { position: new Vec3(this.width / 2 + 320, this.y, 0) }, { easing: 'quadIn' })
      .call(() => {
        this.cur++;
        if (last) {
          this.state = 'none';
          return;
        }
        this.makeTrain();
        this.arrive();
      })
      .start();
  }

  /** 烟囱冒一团烟 */
  private puff(delay: number): void {
    const len = this.wagonCount * (WAGON_W + 2) + LOCO_W;
    const p = img(this.layer, 'kit/circle_white', 26, 26, 'puff');
    at(p, this.node.position.x + len / 2 - 38, this.y + LOCO_H + 4);
    p.setScale(0.3, 0.3, 1);
    const op = opacity(p);
    op.opacity = 0;
    tween(op).delay(delay).to(0.05, { opacity: 230 }).to(0.55, { opacity: 0 }).start();
    tween(p)
      .delay(delay)
      .to(0.6, { scale: new Vec3(1.5, 1.5, 1), position: new Vec3(p.position.x - 26, p.position.y + 46, 0) })
      .call(() => p.destroy())
      .start();
  }

  /** 这一列每节都装满了（最后一列装完剩下的）就开走 */
  private check(): void {
    if (this.state !== 'stop') return;
    const c = this.capOf(this.cur);
    if (c > 0 && this.loadOf(this.cur).put >= c) this.depart();
  }

  private loadOf(k: number): Load {
    while (this.loads.length <= k) {
      this.loads.push({ resv: new Array<number>(this.wagonCount).fill(0), color: new Array<number>(this.wagonCount).fill(-1), put: 0 });
    }
    return this.loads[k];
  }

  /** 第 k 列一共要装几颗（最后一列装剩下的那点） */
  private capOf(k: number): number {
    return Math.max(0, Math.min(this.cap, this.total - k * this.cap));
  }

  /**
   * 给下一颗豆定个位子：一节车厢装一种颜色——先挑装着同色、还有空的那节；没有就开一节新的；
   * 实在没有（颜色太多）就塞进装得最少的那节，保证不会堵住。前一列定满了才开始定下一列
   */
  reserve(color: number): Drop {
    for (let k = Math.max(0, this.cur); ; k++) {
      const L = this.loadOf(k);
      const used = L.resv.reduce((a, b) => a + b, 0);
      if (used >= this.capOf(k)) continue;
      let wagon = L.resv.findIndex((n, i) => n < this.perWagon && L.color[i] === color);
      if (wagon < 0) wagon = L.resv.findIndex((n, i) => n < this.perWagon && L.color[i] < 0);
      if (wagon < 0) {
        for (let i = 0; i < this.wagonCount; i++) {
          if (L.resv[i] < this.perWagon && (wagon < 0 || L.resv[i] < L.resv[wagon])) wagon = i;
        }
      }
      if (L.color[wagon] < 0) L.color[wagon] = color;
      const index = L.resv[wagon]++;
      // 火车在画的上面：小人站在铁轨下沿放豆
      return { train: k, wagon, index, x: this.homeX() + this.wagonX(wagon), y: this.y - 26 };
    }
  }

  /** 第 k 列停稳了、可以放吗 */
  ready(k: number): boolean {
    return this.cur === k && this.state === 'stop';
  }

  /** 放进去一颗：车厢里多一颗这个颜色的小方块 */
  drop(d: Drop, color: number): void {
    this.put++;
    this.loadOf(d.train).put++;
    this.onDrop();
    const w = this.wagons[d.wagon];
    if (w && this.cur === d.train) {
      const col = d.index % COLS;
      const row = Math.floor(d.index / COLS);
      const cube = img(w.cubes, 'kit/bead', CUBE, CUBE * 1.25, 'cube');
      (cube.getComponent(Sprite) as Sprite).color = this.colors[color] ?? Color.WHITE;
      const x = (col - (COLS - 1) / 2) * (CUBE + 1);
      // 第一排大半截藏在前挡板后面，往上一排排码到斗口
      const y = 2 + row * ROW_LIFT;
      // 从上往下数：后放的在上面一排，要画在下面一排的后面（下面一排盖住它的侧面）
      cube.setSiblingIndex(0);
      at(cube, x, y + 16);
      tween(cube).to(0.12, { position: new Vec3(x, y, 0) }, { easing: 'quadIn' }).start();
    }
    this.check();
  }

  /** 全部装完、最后一列也开走了 */
  get finished(): boolean {
    return this.state === 'none';
  }
}
