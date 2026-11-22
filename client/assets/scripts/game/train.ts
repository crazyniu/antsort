// 火车（docs/01 第 1.2、3 节）：停在画下面的铁轨上，车头在右。小人从画那边（铁轨上沿）把豆放进车厢，装满一列开走，下一列紧跟着进站。
// 只是装豆的地方，不影响规则：按送来了几颗自己算装到第几节、什么时候发车。
// 车厢是白图按装的颜色染色（一节装一种颜色）；放豆的位置按是这一节的第几颗分到左、中、右，前后错开一点，几个小人同时放不叠在一起。
import { Color, Node, Sprite, Tween, Vec3, tween } from 'cc';
import { at, box, img, opacity } from '../ui/kit';

/** 车头、车厢显示多大（kit/loco、kit/wagon_*，client/tools/art/sprites.py 的 v3 切出来的，宽高比照图） */
const LOCO_H = 108;
const LOCO_W = Math.round(LOCO_H * 1.259);
const WAGON_H = 76;
const WAGON_W = Math.round(WAGON_H * 1.804);
/** 车厢之间、车厢和车头之间的缝 */
const GAP = 2;
/** 车厢里一排放几颗小方块、每颗多大、一排比一排高多少 */
const COLS = 6;
const CUBE = 17;
const ROW_LIFT = 8;
/** 铁轨一段显示多高（kit/rail 宽 / 高 6.14） */
const RAIL_H = 26;
const RAIL_W = Math.round(RAIL_H * 6.14);
/** 小人站在车厢后沿放豆：离车轮底下那条线多高 */
export const DROP_UP = Math.round(WAGON_H * 0.86);
/** 车厢的颜色：装的颜色掺一点白（豆码在里面看得出来） */
const WAGON_LIGHT = 0.22;
/** 开走前顿多久（秒，按倍速前） */
const DEPART_DELAY = 0.15;

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

interface WagonView {
  node: Node;
  body: Node;
  front: Node;
  cubes: Node;
}

export class Train {
  private node: Node;
  private wagons: WagonView[] = [];
  /** 现在停着（或正在进站）的是第几列；state：进站中、停着、正在换车（前一列开走、这一列跟着进来）、没车了 */
  private cur = 0;
  private state: 'in' | 'stop' | 'swap' | 'none' = 'in';
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
    for (let x = -width / 2 - RAIL_W; x < width / 2 + RAIL_W; x += RAIL_W - 1) at(img(layer, 'kit/rail', RAIL_W, RAIL_H, 'rail'), x + RAIL_W / 2, y + 4);
    this.node = this.makeTrain(this.cur);
    this.arrive(this.node);
  }

  /** 一列多长 */
  static lengthOf(wagons: number): number {
    return wagons * (WAGON_W + GAP) + LOCO_W;
  }

  /** 一列火车高多少（车头） */
  static get height(): number {
    return LOCO_H;
  }

  /** 这一列的中心 */
  private homeX(): number {
    return 0;
  }

  private wagonX(i: number): number {
    const len = Train.lengthOf(this.wagonCount);
    // 第 0 节挨着车头
    return len / 2 - LOCO_W - GAP - WAGON_W / 2 - i * (WAGON_W + GAP);
  }

  /** 第 k 列车厢的颜色：装的颜色掺一点白；还没定颜色的是浅灰白 */
  private wagonColor(c: number): Color {
    const base = c >= 0 ? (this.colors[c] ?? Color.WHITE) : new Color(236, 236, 242, 255);
    const k = c >= 0 ? WAGON_LIGHT : 0;
    return new Color(
      Math.round(base.r + (255 - base.r) * k),
      Math.round(base.g + (255 - base.g) * k),
      Math.round(base.b + (255 - base.b) * k),
      255,
    );
  }

  private makeTrain(k: number): Node {
    const node = box('train', this.layer);
    this.wagons = [];
    const len = Train.lengthOf(this.wagonCount);
    const L = this.loadOf(k);
    for (let i = 0; i < this.wagonCount; i++) {
      const w = box('wagon', node, WAGON_W, WAGON_H);
      at(w, this.wagonX(i), WAGON_H / 2);
      const body = img(w, 'kit/wagon_body', WAGON_W, WAGON_H, 'body');
      const cubes = box('cubes', w);
      const front = img(w, 'kit/wagon_front', WAGON_W, WAGON_H, 'front');
      img(w, 'kit/wagon_wheels', WAGON_W, WAGON_H, 'wheels');
      const col = this.wagonColor(L.color[i]);
      (body.getComponent(Sprite) as Sprite).color = col;
      (front.getComponent(Sprite) as Sprite).color = col;
      this.wagons.push({ node: w, body, front, cubes });
    }
    at(img(node, 'kit/loco', LOCO_W, LOCO_H, 'loco'), len / 2 - LOCO_W / 2, LOCO_H / 2 - 4);
    return node;
  }

  private arrive(node: Node): void {
    this.state = 'in';
    this.onMove('in', false);
    at(node, -this.width / 2 - Train.lengthOf(this.wagonCount) / 2 - 20, this.y);
    tween(node)
      .to(this.moveSec / this.speed(), { position: new Vec3(this.homeX(), this.y, 0) }, { easing: 'quadOut' })
      .call(() => {
        this.state = 'stop';
        this.check();
      })
      .start();
  }

  /** 装满了：这一列开走，下一列紧跟着从左边开进来（不等前一列开出屏幕，docs/01 第 3 节「小人不站着等」） */
  private depart(): void {
    const last = this.cur >= Math.ceil(this.total / this.cap) - 1;
    this.state = 'swap';
    this.onMove('out', last);
    const old = this.node;
    for (let i = 0; i < 3; i++) this.puff(old, i * 0.12);
    const out = this.width / 2 + Train.lengthOf(this.wagonCount) / 2 + 40;
    tween(old)
      .delay(DEPART_DELAY / this.speed())
      .to(this.moveSec / this.speed(), { position: new Vec3(out, this.y, 0) }, { easing: 'quadIn' })
      .call(() => {
        old.destroy();
        if (last) this.state = 'none';
      })
      .start();
    if (last) {
      this.cur++;
      return;
    }
    this.cur++;
    this.node = this.makeTrain(this.cur);
    at(this.node, -this.width / 2 - Train.lengthOf(this.wagonCount) / 2 - 20, this.y);
    const next = this.node;
    tween(next)
      .delay(DEPART_DELAY / this.speed())
      .call(() => this.onMove('in', false))
      .to(this.moveSec / this.speed(), { position: new Vec3(this.homeX(), this.y, 0) }, { easing: 'quadOut' })
      .call(() => {
        if (this.node !== next) return;
        this.state = 'stop';
        this.check();
      })
      .start();
  }

  /** 换一次车（从开走到下一列停稳）要多久：按倍速前的秒数，小人那边的时间也是按倍速前算的 */
  get swapTime(): number {
    return DEPART_DELAY + this.moveSec;
  }

  /** 第 k 列现在是什么情况：'stop' 停着能放；'coming' 正在进站或换车；'later' 还要等前面的装满；'gone' 已经开走了 */
  status(k: number): 'stop' | 'coming' | 'later' | 'gone' {
    if (k < this.cur || this.state === 'none') return 'gone';
    if (k > this.cur) return 'later';
    return this.state === 'stop' ? 'stop' : 'coming';
  }

  /** 现在停着的是第几列 */
  get current(): number {
    return this.cur;
  }

  /** 烟囱冒一团烟 */
  private puff(node: Node, delay: number): void {
    const len = Train.lengthOf(this.wagonCount);
    const p = img(this.layer, 'kit/circle_white', 24, 24, 'puff');
    at(p, node.position.x + len / 2 - LOCO_W * 0.55, this.y + LOCO_H + 2);
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
      if (L.color[wagon] < 0) {
        L.color[wagon] = color;
        // 停着（或正在进站）的这一列：车厢马上染上这个颜色
        const v = k === this.cur ? this.wagons[wagon] : undefined;
        if (v) {
          const col = this.wagonColor(color);
          (v.body.getComponent(Sprite) as Sprite).color = col;
          (v.front.getComponent(Sprite) as Sprite).color = col;
        }
      }
      const index = L.resv[wagon]++;
      // 站在车厢后沿：按第几颗分到左、中、右，前后错开一点
      const lane = (index % 3) - 1;
      const row = Math.floor(index / 3) % 2;
      return {
        train: k,
        wagon,
        index,
        x: this.homeX() + this.wagonX(wagon) + lane * WAGON_W * 0.28,
        y: this.y + DROP_UP + row * 7,
      };
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
      const cube = img(w.cubes, 'kit/stud', CUBE, CUBE * 1.056, 'cube');
      (cube.getComponent(Sprite) as Sprite).color = this.colors[color] ?? Color.WHITE;
      const x = (col - (COLS - 1) / 2) * (CUBE + 1);
      // 第一排大半截藏在前挡板后面，往上一排排码到斗口
      const y = 6 + row * ROW_LIFT;
      // 从上往下数：后放的在上面一排，要画在下面一排的后面（下面一排盖住它的侧面）
      cube.setSiblingIndex(0);
      at(cube, x, y + 16);
      Tween.stopAllByTarget(w.node);
      tween(cube).to(0.12, { position: new Vec3(x, y, 0) }, { easing: 'quadIn' }).start();
      // 车厢接住一颗：轻轻往下一沉
      w.node.setScale(1.03, 0.96, 1);
      tween(w.node).to(0.12, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' }).start();
    }
    this.check();
  }

  /** 全部装完、最后一列也开走了 */
  get finished(): boolean {
    return this.state === 'none';
  }
}
