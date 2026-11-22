// 小人（docs/01 第 3 节）：从托盘里的方块顶上走出来 → 走道 → 近的那座天桥 → 过桥到画那边 → 沿着画四周（看不见的一圈）绕到离那颗豆最近的一边
// → 走进去抱起豆 → 回到画下面、走到车厢后沿放进火车 → 这一队还有能搬的就直接去搬下一颗（不再过桥），没有了就过桥走回方块里。
// 只是表现：搬哪颗、谁先搬都是规则算好的（局内页面把一颗颗「活」排进来），这里只管什么时候出发、怎么走。
// 小人不站着等车：放进下一列的，按算好的下一列停稳的时刻放慢回程，到的时候车刚好停稳。
// 出发的先后要守住一条：一颗豆要等它面前那条路上的豆都被搬走了才能去搬（不然看着像是从里面掏的）。只卡这一条，
// 不按「一队搬完下一队才动」排：几支小队只要各自的豆露出来了就同时干活，画面才热闹。
// 动画：正面（往下走）、侧面（朝右，往左翻转）、背面（往上走）各 4 帧，空手一套、双手伸在身前抱东西一套（kit/wk_*，tools/art/sprites.py 切的）。
// 抱着的豆（kit/cube）画在「身前」：往两边走在手那一侧，往下走在胸前（盖住身子），往上走在头顶后面（俯视的画面里，身前就是画面上方，被头挡住一半）。
import { Color, Node, Sprite, SpriteFrame, Vec3 } from 'cc';
import { at, box, img, size } from '../ui/kit';
import { frame } from '../ui/res';
import type { CarView } from './station';
import type { Drop, Train } from './train';

/** 小人显示多高、抱着的豆多宽（kit/cube 宽 40 高 44） */
const H = 46;
const CUBE = 23;
/** 赶下一列火车时最多放慢到几成速度（再慢就看得出来了） */
const MIN_PACE = 0.5;
/** 空着手走回方块的速度（比平时快一点，路上不堆人） */
const HOME_PACE = 1.3;
/** 姿势：f 正面、s 侧面、b 背面；前面加 c 是举着豆的 */
const POSES = ['f', 's', 'b', 'cf', 'cs', 'cb'] as const;
type Pose = (typeof POSES)[number];

export interface Job {
  car: CarView;
  /** 画上的哪个位置 */
  cell: number;
  color: number;
  /** 从画四周的路上的进入点，到那颗豆旁边（特效层的坐标）；第 0 个点在路上 */
  inside: Vec3[];
  /** 走进去要经过的格子：这些格子的豆得先被搬走 */
  need: number[];
}

/** 场地的几何（特效层的坐标） */
export interface Field {
  /** 画四周看不见的那一圈：左、右、下（车厢后沿，小人站在这条线上放豆）、上 */
  l: number;
  r: number;
  b: number;
  t: number;
  /** 那一圈四个角的圆角半径 */
  rad: number;
  /** 方块现在在哪里（托盘里） */
  carPos: (car: CarView) => Vec3;
  /** 小人从方块的哪个高度走出来（托盘上沿）、走道的中线 */
  exitY: number;
  walkY: number;
  /** 两座天桥的 x（桥从走道一直通到火车后面）；下了桥落在哪个高度（再往前走几步就到那一圈的下沿） */
  bridges: number[];
  landY: number;
}

interface Walker {
  body: Node;
  top: Node;
  /** 抱着的豆：画在身子前面的一份、画在身子后面的一份（往上走时用），按方向显示其中一份 */
  cube: Node;
  cubeB: Node;
  carry: boolean;
  job: Job;
  pts: Vec3[];
  seg: number;
  x: number;
  y: number;
  /** 0 去搬、1 往火车走、2 在车厢边等火车停稳、3 放完了走回方块 */
  phase: number;
  /** 这一趟按几成速度走（赶下一列火车时放慢）；预计什么时候走到车厢边 */
  pace: number;
  eta: number;
  /** 从哪个方块出来的（走回去用） */
  home: Vec3;
  drop: Drop | null;
  ox: number;
  oy: number;
  step: number;
  /** 最近一步在往哪边走（定用哪一面的帧） */
  mdx: number;
  mdy: number;
  /** 现在显示的是哪一帧（姿势_帧号，'' = 还没定） */
  shown: string;
}

export class Crew {
  private cubeBackL: Node;
  private bodyL: Node;
  private topL: Node;
  private cubeL: Node;
  private walkers: Walker[] = [];
  private pool: Walker[] = [];
  private queues = new Map<CarView, Job[]>();
  private nextAt = new Map<CarView, number>();
  /** 每一格：一共排进来几颗、已经派出去几颗、派出去的小人最晚什么时候到（到了才算搬走） */
  private cellAdded = new Map<number, number>();
  private cellSent = new Map<number, number>();
  private cellPickAt = new Map<number, number>();
  /** 每颗豆在它那一格是第几颗（摞着的要按顺序搬）、算好的出发路线 */
  private rank = new Map<Job, number>();
  private routes = new Map<Job, Vec3[]>();
  /** 小人的时间（秒，按倍速走） */
  now = 0;
  /** 每个姿势的 4 帧（body 染色、top 不染）和显示宽度 */
  private frames = new Map<Pose, { b: SpriteFrame; t: SpriteFrame; w: number }[]>();

  constructor(
    layer: Node,
    private colors: Color[],
    private field: Field,
    private train: Train,
    private cfg: { walk: number; gap: number; maxWalkers: number; width: number },
    private onPick: (job: Job) => void,
    private onSend: (job: Job) => void,
  ) {
    this.cubeBackL = box('cubesBack', layer);
    this.bodyL = box('bodies', layer);
    this.topL = box('tops', layer);
    this.cubeL = box('cubes', layer);
    for (const pose of POSES) {
      const list: { b: SpriteFrame; t: SpriteFrame; w: number }[] = [];
      for (let i = 0; i < 4; i++) {
        const b = frame(`kit/wk_${pose}_${i}b`);
        const t = frame(`kit/wk_${pose}_${i}t`);
        if (b && t) list.push({ b, t, w: (H * b.originalSize.width) / b.originalSize.height });
      }
      if (list.length > 0) this.frames.set(pose, list);
    }
  }

  /** 排进一颗要搬的豆（按规则算出来的先后排进来） */
  add(job: Job): void {
    let q = this.queues.get(job.car);
    if (!q) this.queues.set(job.car, (q = []));
    q.push(job);
    const n = this.cellAdded.get(job.cell) ?? 0;
    this.rank.set(job, n);
    this.cellAdded.set(job.cell, n + 1);
  }

  /** 还有豆没被抱起来（排着队的、在路上的） */
  get busy(): boolean {
    for (const q of this.queues.values()) if (q.length > 0) return true;
    return this.walkers.some((w) => w.phase === 0);
  }

  /** 场上一个小人都没有了 */
  get empty(): boolean {
    for (const q of this.queues.values()) if (q.length > 0) return false;
    return this.walkers.length === 0;
  }

  /** 这个方块还有没出发的小人吗 */
  pending(car: CarView): boolean {
    return (this.queues.get(car)?.length ?? 0) > 0;
  }

  // ---------------------------------------------------------------- 路线

  /** 那圈路的圆角半径（路太短时缩小） */
  private get rad(): number {
    const { l, r, b, t, rad } = this.field;
    return Math.max(0, Math.min(rad, (r - l) / 2, (t - b) / 2));
  }

  /** 画四周那圈路上的一点，按「从左下角起逆时针走了多远」记（按直角的周长记）。四个角是圆的：离角不到一个半径的那一段落在圆弧上 */
  private ringAt(s: number): Vec3 {
    const { l, r, b, t } = this.field;
    const w = r - l;
    const h = t - b;
    const P = 2 * (w + h);
    const R = this.rad;
    s = ((s % P) + P) % P;
    if (R > 0) {
      // 四个角：[在周长上的位置, 圆心 x, 圆心 y, 进这个角时的角度]
      const corners: [number, number, number, number][] = [
        [0, l + R, b + R, Math.PI],
        [w, r - R, b + R, 1.5 * Math.PI],
        [w + h, r - R, t - R, 0],
        [2 * w + h, l + R, t - R, 0.5 * Math.PI],
      ];
      for (const [c, cx, cy, a0] of corners) {
        let d = s - c;
        if (d > P / 2) d -= P;
        if (Math.abs(d) < R) {
          const a = a0 + ((d + R) / (2 * R)) * (Math.PI / 2);
          return new Vec3(cx + Math.cos(a) * R, cy + Math.sin(a) * R, 0);
        }
      }
    }
    if (s <= w) return new Vec3(l + s, b, 0);
    if (s <= w + h) return new Vec3(r, b + (s - w), 0);
    if (s <= 2 * w + h) return new Vec3(r - (s - w - h), t, 0);
    return new Vec3(l, t - (s - 2 * w - h), 0);
  }

  private ringS(p: Vec3): number {
    const { l, r, b, t } = this.field;
    const w = r - l;
    const h = t - b;
    const x = Math.min(r, Math.max(l, p.x));
    const y = Math.min(t, Math.max(b, p.y));
    const d = [Math.abs(y - b), Math.abs(x - r), Math.abs(y - t), Math.abs(x - l)];
    const k = d.indexOf(Math.min(...d));
    if (k === 0) return x - l;
    if (k === 1) return w + (y - b);
    if (k === 2) return w + h + (r - x);
    return 2 * w + h + (t - y);
  }

  /** 沿着路从 a 走到 b（挑近的一边），返回中间拐的角和 b */
  private ring(a: Vec3, b: Vec3): Vec3[] {
    const f = this.field;
    const w = f.r - f.l;
    const h = f.t - f.b;
    const P = 2 * (w + h);
    const sa = this.ringS(a);
    const sb = this.ringS(b);
    const fwd = (((sb - sa) % P) + P) % P;
    // 每个角上取几个点：小人顺着圆弧拐弯
    const R = this.rad;
    const corners: number[] = [];
    for (const c of [0, w, w + h, 2 * w + h]) for (const k of R > 0 ? [-1, -0.6, -0.2, 0.2, 0.6, 1] : [0]) corners.push(c + k * R);
    const out: Vec3[] = [];
    if (fwd <= P - fwd) {
      const list = corners.map((c) => (((c - sa) % P) + P) % P).filter((d) => d > 0.01 && d < fwd - 0.01);
      list.sort((x, y) => x - y);
      for (const d of list) out.push(this.ringAt(sa + d));
    } else {
      const back = P - fwd;
      const list = corners.map((c) => (((sa - c) % P) + P) % P).filter((d) => d > 0.01 && d < back - 0.01);
      list.sort((x, y) => x - y);
      for (const d of list) out.push(this.ringAt(sa - d));
    }
    out.push(this.ringAt(sb));
    return out;
  }

  /** 离 x 最近的那座桥 */
  private bridgeFor(x: number): number {
    const bs = this.field.bridges;
    let best = bs[0] ?? 0;
    for (const b of bs) if (Math.abs(b - x) < Math.abs(best - x)) best = b;
    return best;
  }

  /**
   * 去搬一颗豆的整条路。from 不给：从方块顶上出来 → 走道 → 近的桥 → 过桥到那一圈的下沿 → 沿着那一圈绕到进入点 → 走进去；
   * from 给了（刚在车厢边放完豆）：从车厢后沿直接沿那一圈绕过去，不过桥
   */
  private routeOut(job: Job, from?: Vec3): Vec3[] {
    const f = this.field;
    const pts: Vec3[] = [];
    let start: Vec3;
    if (from) {
      start = new Vec3(from.x, f.b, 0);
      pts.push(start);
    } else {
      const c = f.carPos(job.car);
      const bx = this.bridgeFor(c.x);
      start = new Vec3(bx, f.b, 0);
      pts.push(new Vec3(c.x, f.exitY, 0), new Vec3(c.x, f.walkY, 0), new Vec3(bx, f.walkY, 0), new Vec3(bx, f.landY, 0), start);
    }
    pts.push(...this.ring(start, job.inside[0]));
    for (let i = 1; i < job.inside.length; i++) pts.push(job.inside[i]);
    return pts;
  }

  /** 抱着豆去火车的路：原路退到那一圈上，绕到下沿、车厢上面那一段，再走到放豆的位置 */
  private routeBack(job: Job, d: Drop): Vec3[] {
    const pts: Vec3[] = [];
    for (let i = job.inside.length - 2; i >= 1; i--) pts.push(job.inside[i]);
    pts.push(this.ringAt(this.ringS(job.inside[0])));
    const above = new Vec3(Math.min(this.field.r, Math.max(this.field.l, d.x)), this.field.b, 0);
    pts.push(...this.ring(job.inside[0], above));
    pts.push(new Vec3(d.x, d.y, 0));
    return pts;
  }

  /** 空着手走回方块：沿下沿走到近的桥 → 过桥 → 走道 → 走进方块 */
  private routeHome(w: Walker): Vec3[] {
    const f = this.field;
    const bx = this.bridgeFor(w.home.x);
    return [
      new Vec3(w.x, f.b, 0),
      new Vec3(bx, f.b, 0),
      new Vec3(bx, f.landY, 0),
      new Vec3(bx, f.walkY, 0),
      new Vec3(w.home.x, f.walkY, 0),
      new Vec3(w.home.x, f.exitY, 0),
      new Vec3(w.home.x, w.home.y, 0),
    ];
  }

  /**
   * 第 k 列火车大概什么时候停稳（小人的时间）：停着就是现在；正在进站、换车按一整次换车算；
   * 还要等前面一列装满的，等往前一列放豆的小人都到了，再加一次换车
   */
  private readyTime(k: number, depth = 0): number {
    const st = this.train.status(k);
    if (st === 'stop' || st === 'gone' || depth > 4) return this.now;
    if (st === 'coming') return this.now + this.train.swapTime;
    let last = this.readyTime(k - 1, depth + 1);
    for (const w of this.walkers) if (w.drop && w.drop.train === k - 1 && (w.phase === 1 || w.phase === 2)) last = Math.max(last, w.eta);
    return last + this.train.swapTime;
  }

  private static len(pts: Vec3[]): number {
    let d = 0;
    for (let i = 1; i < pts.length; i++) d += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    return d;
  }

  // ---------------------------------------------------------------- 每帧

  /** dt：真实过了几秒；speed：倍速 */
  update(dt: number, speed: number): void {
    const step = dt * speed;
    this.now += step;
    this.dispatch();
    const v = this.cfg.walk * step;
    for (let i = this.walkers.length - 1; i >= 0; i--) {
      const w = this.walkers[i];
      if (w.phase === 2) {
        if (w.drop && this.train.ready(w.drop.train)) {
          // 放进车厢；这一队还有现在就能搬的，直接去搬下一颗，没有就走回方块
          this.train.drop(w.drop, w.job.color);
          w.carry = false;
          w.drop = null;
          if (!this.takeNext(w)) {
            w.pts = this.routeHome(w);
            w.seg = 0;
            w.phase = 3;
          }
        }
        this.draw(w, step);
        continue;
      }
      this.move(w, w.phase === 3 ? v * HOME_PACE : w.phase === 1 ? v * w.pace : v);
      if (w.phase === 3) {
        if (w.seg >= w.pts.length - 1) this.free(i);
        else this.draw(w, step);
        continue;
      }
      if (w.seg >= w.pts.length - 1) {
        if (w.phase === 0) {
          // 到豆旁边了：抱起来，定好放在哪节车厢，往火车走
          this.onPick(w.job);
          w.carry = true;
          w.drop = this.train.reserve(w.job.color);
          w.pts = [new Vec3(w.x, w.y, 0), ...this.routeBack(w.job, w.drop)];
          w.seg = 0;
          w.phase = 1;
          // 掐着点到：车要过一会儿才停稳的，回程放慢，到的时候车刚好停稳（最慢放到 MIN_PACE）
          const t0 = Crew.len(w.pts) / this.cfg.walk;
          const wait = this.readyTime(w.drop.train) - this.now;
          w.pace = wait > t0 ? Math.max(MIN_PACE, t0 / wait) : 1;
          w.eta = this.now + t0 / w.pace;
        } else {
          w.phase = 2;
          w.mdx = 0;
          w.mdy = 1;
        }
      }
      this.draw(w, step);
    }
  }

  private move(w: Walker, dist: number): void {
    while (dist > 0 && w.seg < w.pts.length - 1) {
      const to = w.pts[w.seg + 1];
      const dx = to.x - w.x;
      const dy = to.y - w.y;
      const d = Math.hypot(dx, dy);
      if (d > 0.01) {
        w.mdx = dx / d;
        w.mdy = dy / d;
      }
      if (d <= dist) {
        w.x = to.x;
        w.y = to.y;
        w.seg++;
        dist -= d;
      } else {
        w.x += (dx / d) * dist;
        w.y += (dy / d) * dist;
        dist = 0;
      }
    }
  }

  /** 摆到位置上：按走的方向挑正面 / 侧面 / 背面，按走的节奏换帧 */
  private draw(w: Walker, step: number): void {
    w.step += step * 11;
    const walking = w.phase !== 2;
    // 往上走是背面，往下走是正面，左右是侧面（往左翻转）
    const side = Math.abs(w.mdx) > Math.abs(w.mdy);
    const dir: Pose = side ? 's' : w.mdy > 0 ? 'b' : 'f';
    const pose = (w.carry ? `c${dir}` : dir) as Pose;
    const list = this.frames.get(pose);
    if (!list || list.length === 0) return;
    const fi = walking ? Math.floor(w.step / (Math.PI / 2)) % list.length : 0;
    const key = `${pose}_${fi}`;
    if (key !== w.shown) {
      w.shown = key;
      const f = list[fi];
      (w.body.getComponent(Sprite) as Sprite).spriteFrame = f.b;
      (w.top.getComponent(Sprite) as Sprite).spriteFrame = f.t;
      size(w.body, f.w, H);
      size(w.top, f.w, H);
    }
    const flip = side && w.mdx < 0 ? -1 : 1;
    w.body.setScale(flip, 1, 1);
    w.top.setScale(flip, 1, 1);
    const hop = walking ? Math.abs(Math.sin(w.step)) * 2 : 0;
    const x = w.x + w.ox;
    const y = w.y + w.oy + hop;
    at(w.body, x, y + H * 0.34);
    at(w.top, x, y + H * 0.34);
    w.cube.active = w.carry && dir !== 'b';
    w.cubeB.active = w.carry && dir === 'b';
    if (!w.carry) return;
    if (dir === 's') at(w.cube, x + flip * H * 0.4, y + H * 0.28);
    else if (dir === 'f') at(w.cube, x, y + H * 0.16);
    else at(w.cubeB, x, y + H * 0.8);
  }

  /** 这一格还有排着队没派出去的豆吗 */
  private waitingOn(cell: number): boolean {
    return (this.cellSent.get(cell) ?? 0) < (this.cellAdded.get(cell) ?? 0);
  }

  /** 这颗豆现在能派人去搬吗：路上的格子都（将在它到之前）空出来了，同一格摞在它上面的也都派出去了。能就返回路线 */
  private ready(job: Job, from?: Vec3): Vec3[] | null {
    if ((this.cellSent.get(job.cell) ?? 0) < (this.rank.get(job) ?? 0)) return null;
    for (const c of job.need) if (this.waitingOn(c)) return null;
    let pts = from ? this.routeOut(job, from) : this.routes.get(job);
    if (!pts) this.routes.set(job, (pts = this.routeOut(job)));
    const arrive = this.now + Crew.len(pts) / this.cfg.walk;
    if ((this.cellPickAt.get(job.cell) ?? 0) > arrive - 0.02) return null;
    for (const c of job.need) if ((this.cellPickAt.get(c) ?? 0) > arrive - 0.02) return null;
    return pts;
  }

  /** 该出发的出发：每个方块隔 gap 秒放一个；队里靠前的豆路还没空出来，就先派后面路已经空了的 */
  private dispatch(): void {
    for (const [car, q] of this.queues) {
      if (q.length === 0) {
        this.queues.delete(car);
        continue;
      }
      let next = Math.max(this.nextAt.get(car) ?? 0, car.readyAt);
      while (q.length > 0 && next <= this.now && this.walkers.length < this.cfg.maxWalkers) {
        let at0 = -1;
        let pts: Vec3[] | null = null;
        const n = Math.min(q.length, 32);
        for (let i = 0; i < n && !pts; i++) {
          pts = this.ready(q[i]);
          if (pts) at0 = i;
        }
        if (!pts) break;
        const job = this.claim(q, at0, pts);
        this.spawn(job, pts);
        this.onSend(job);
        // 落后太多就不补了：一帧最多连着放几个
        next = Math.max(next + this.cfg.gap, this.now - this.cfg.gap * 2);
      }
      this.nextAt.set(car, next);
    }
  }

  /** 把队里第 i 颗派出去（记下这一格派走了几颗、最晚什么时候被抱起来） */
  private claim(q: Job[], i: number, pts: Vec3[]): Job {
    const job = q.splice(i, 1)[0];
    this.rank.delete(job);
    this.routes.delete(job);
    this.cellSent.set(job.cell, (this.cellSent.get(job.cell) ?? 0) + 1);
    this.cellPickAt.set(job.cell, Math.max(this.cellPickAt.get(job.cell) ?? 0, this.now + Crew.len(pts) / this.cfg.walk));
    return job;
  }

  /** 刚放完豆的小人：这一队还有现在就能去搬的，直接去搬（从车厢后沿走过去，不过桥） */
  private takeNext(w: Walker): boolean {
    const car = w.job.car;
    const q = this.queues.get(car);
    if (!q || q.length === 0 || this.now < car.readyAt) return false;
    const from = new Vec3(w.x, w.y, 0);
    const n = Math.min(q.length, 32);
    for (let i = 0; i < n; i++) {
      const pts = this.ready(q[i], from);
      if (!pts) continue;
      const job = this.claim(q, i, pts);
      w.job = job;
      w.pts = [from, ...pts];
      w.seg = 0;
      w.phase = 0;
      w.pace = 1;
      this.onSend(job);
      return true;
    }
    return false;
  }

  private spawn(job: Job, pts: Vec3[]): void {
    let w = this.pool.pop();
    if (!w) {
      w = {
        body: img(this.bodyL, 'kit/wk_b_0b', undefined, H, 'w'),
        top: img(this.topL, 'kit/wk_b_0t', undefined, H, 'w'),
        cube: img(this.cubeL, 'kit/cube', CUBE, CUBE * 1.1, 'c'),
        cubeB: img(this.cubeBackL, 'kit/cube', CUBE, CUBE * 1.1, 'c'),
        carry: false,
        job,
        pts,
        seg: 0,
        x: 0,
        y: 0,
        phase: 0,
        pace: 1,
        eta: 0,
        home: new Vec3(),
        drop: null,
        ox: 0,
        oy: 0,
        step: 0,
        mdx: 0,
        mdy: 1,
        shown: '',
      };
    }
    w.job = job;
    w.pts = pts;
    w.seg = 0;
    // 从方块里走出来（方块顶上），走完回到这里
    const from = this.field.carPos(job.car);
    w.home = new Vec3(from.x, from.y, 0);
    w.x = from.x;
    w.y = from.y;
    w.phase = 0;
    w.pace = 1;
    w.drop = null;
    w.ox = (Math.random() - 0.5) * 14;
    w.oy = (Math.random() - 0.5) * 10;
    w.step = Math.random() * 6;
    w.mdx = 0;
    w.mdy = 1;
    w.shown = '';
    const col = this.colors[job.color] ?? Color.WHITE;
    (w.body.getComponent(Sprite) as Sprite).color = col;
    (w.cube.getComponent(Sprite) as Sprite).color = col;
    (w.cubeB.getComponent(Sprite) as Sprite).color = col;
    w.body.active = true;
    w.top.active = true;
    w.carry = false;
    w.cube.active = false;
    w.cubeB.active = false;
    w.body.setScale(1, 1, 1);
    w.top.setScale(1, 1, 1);
    this.walkers.push(w);
    this.draw(w, 0);
  }

  private free(i: number): void {
    const w = this.walkers[i];
    this.walkers[i] = this.walkers[this.walkers.length - 1];
    this.walkers.pop();
    w.body.active = false;
    w.top.active = false;
    w.cube.active = false;
    w.cubeB.active = false;
    this.pool.push(w);
  }
}
