// 小人（docs/01 第 3 节）：从上场的方块里跑出来 → 过小桥 → 沿着画四周的路绕到离那颗豆最近的一边 → 走进去抱起豆
// → 绕回铁轨边放进车厢。只是表现：搬哪颗、谁先搬都是规则算好的（局内页面把一颗颗「活」排进来），这里只管什么时候出发、怎么走。
// 出发的先后要守住一条：后一轮才露出来的豆，不能比前一轮的豆先被搬走（不然看着像是从里面掏的）。
import { Color, Node, Sprite, SpriteFrame, Vec3 } from 'cc';
import { at, box, img, size } from '../ui/kit';
import { frame } from '../ui/res';
import type { CarView } from './station';
import type { Drop, Train } from './train';

/** 小人显示多高（kit/worker_body_0..3 / worker_top_0..3：走路两帧、举着手走两帧）、手里的豆多大 */
const H = 48;
const CUBE = 18;

export interface Job {
  car: CarView;
  /** 画上的哪个位置 */
  cell: number;
  color: number;
  /** 第几批：同一次点击里的同一轮是一批，批号越小越早 */
  group: number;
  /** 从画四周的路上的进入点，到那颗豆旁边（特效层的坐标）；第 0 个点在路上 */
  inside: Vec3[];
}

/** 场地的几何（特效层的坐标） */
export interface Field {
  /** 画四周那圈路的中线：左、右、下、上 */
  l: number;
  r: number;
  b: number;
  t: number;
  /** 小桥的中线、上场位和铁轨之间那条小路的高度 */
  bridgeX: number;
  laneY: number;
  /** 方块现在在哪里 */
  carPos: (car: CarView) => Vec3;
}

interface Walker {
  body: Node;
  top: Node;
  cube: Node;
  job: Job;
  pts: Vec3[];
  seg: number;
  x: number;
  y: number;
  /** 0 去搬、1 往火车走、2 在车厢边等火车停稳 */
  phase: number;
  drop: Drop | null;
  ox: number;
  oy: number;
  step: number;
  /** 现在显示的是第几帧（-1 = 还没定） */
  fi: number;
}

export class Crew {
  private bodyL: Node;
  private topL: Node;
  private cubeL: Node;
  private walkers: Walker[] = [];
  private pool: Walker[] = [];
  private queues = new Map<CarView, Job[]>();
  private nextAt = new Map<CarView, number>();
  private groups = new Map<number, { total: number; sent: number; doneAt: number }>();
  private order: number[] = [];
  /** 前面各批的豆最晚什么时候被搬走 */
  private prevDone = 0;
  /** 小人的时间（秒，按倍速走） */
  now = 0;
  private bodyF: SpriteFrame[] = [];
  private topF: SpriteFrame[] = [];
  private w = H;

  constructor(
    layer: Node,
    private colors: Color[],
    private field: Field,
    private train: Train,
    private cfg: { walk: number; gap: number; maxWalkers: number },
    private onPick: (job: Job) => void,
    private onSend: (job: Job) => void,
  ) {
    this.bodyL = box('bodies', layer);
    this.topL = box('tops', layer);
    this.cubeL = box('cubes', layer);
    for (let i = 0; i < 4; i++) {
      const b = frame(`kit/worker_body_${i}`);
      const p = frame(`kit/worker_top_${i}`);
      if (b && p) {
        this.bodyF.push(b);
        this.topF.push(p);
      }
    }
    const s = this.bodyF[0]?.originalSize;
    if (s) this.w = (H * s.width) / s.height;
  }

  /** 排进一颗要搬的豆（按批号从小到大排进来） */
  add(job: Job): void {
    let q = this.queues.get(job.car);
    if (!q) this.queues.set(job.car, (q = []));
    q.push(job);
    let g = this.groups.get(job.group);
    if (!g) {
      this.groups.set(job.group, (g = { total: 0, sent: 0, doneAt: 0 }));
      this.order.push(job.group);
    }
    g.total++;
  }

  /** 还有豆没被抱起来（排着队的、在路上的） */
  get busy(): boolean {
    if (this.order.length > 0) return true;
    return this.walkers.some((w) => w.phase === 0);
  }

  /** 场上一个小人都没有了 */
  get empty(): boolean {
    return this.order.length === 0 && this.walkers.length === 0;
  }

  /** 这个方块还有没出发的小人吗 */
  pending(car: CarView): boolean {
    return (this.queues.get(car)?.length ?? 0) > 0;
  }

  // ---------------------------------------------------------------- 路线

  /** 画四周那圈路上的一点，按「从左下角起逆时针走了多远」记 */
  private ringAt(s: number): Vec3 {
    const { l, r, b, t } = this.field;
    const w = r - l;
    const h = t - b;
    const P = 2 * (w + h);
    s = ((s % P) + P) % P;
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
    const corners = [0, w, w + h, 2 * w + h];
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

  /** 桥头：小桥上到那圈路的地方 */
  private bridgeTop(): Vec3 {
    return new Vec3(this.field.bridgeX, this.field.b, 0);
  }

  /** 去搬一颗豆的整条路 */
  private routeOut(job: Job): Vec3[] {
    const f = this.field;
    const from = f.carPos(job.car);
    const pts: Vec3[] = [new Vec3(from.x, from.y + 30, 0), new Vec3(from.x, f.laneY, 0), new Vec3(f.bridgeX, f.laneY, 0), this.bridgeTop()];
    const entry = job.inside[0];
    pts.push(...this.ring(this.bridgeTop(), entry));
    for (let i = 1; i < job.inside.length; i++) pts.push(job.inside[i]);
    return pts;
  }

  /** 抱着豆回火车的路：原路退到那圈路上，绕到车厢上面，下去 */
  private routeBack(job: Job, d: Drop): Vec3[] {
    const pts: Vec3[] = [];
    for (let i = job.inside.length - 2; i >= 0; i--) pts.push(job.inside[i]);
    const above = new Vec3(d.x, this.field.b, 0);
    pts.push(...this.ring(job.inside[0], above));
    pts.push(new Vec3(d.x, d.y, 0));
    return pts;
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
          this.train.drop(w.drop, w.job.color);
          this.free(i);
        }
        continue;
      }
      this.move(w, v);
      if (w.seg >= w.pts.length - 1) {
        if (w.phase === 0) {
          // 到豆旁边了：抱起来，定好放在哪节车厢，往回走
          this.onPick(w.job);
          w.cube.active = true;
          w.drop = this.train.reserve();
          w.pts = [new Vec3(w.x, w.y, 0), ...this.routeBack(w.job, w.drop)];
          w.seg = 0;
          w.phase = 1;
        } else {
          w.phase = 2;
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
      if (d <= dist) {
        w.x = to.x;
        w.y = to.y;
        w.seg++;
        dist -= d;
      } else {
        w.x += (dx / d) * dist;
        w.y += (dy / d) * dist;
        if (Math.abs(dx) > 0.5) w.body.setScale(dx < 0 ? -1 : 1, 1, 1);
        dist = 0;
      }
    }
  }

  /** 摆到位置上：走路时左右晃、上下颠 */
  private draw(w: Walker, step: number): void {
    w.step += step * 13;
    // 两帧换着来就是迈步；抱着豆的时候用举着手的那两帧。站着等的不动
    const walking = w.phase !== 2;
    const fi = (w.cube.active ? 2 : 0) + (walking ? Math.floor(w.step / Math.PI) % 2 : 0);
    if (fi !== w.fi) {
      w.fi = fi;
      (w.body.getComponent(Sprite) as Sprite).spriteFrame = this.bodyF[fi] ?? null;
      (w.top.getComponent(Sprite) as Sprite).spriteFrame = this.topF[fi] ?? null;
      size(w.body, this.w, H);
      size(w.top, this.w, H);
    }
    const hop = walking ? Math.abs(Math.sin(w.step)) * 2.5 : 0;
    const x = w.x + w.ox;
    const y = w.y + w.oy + hop;
    at(w.body, x, y + H * 0.34);
    at(w.top, x, y + H * 0.34);
    w.top.setScale(w.body.scale.x, 1, 1);
    if (w.cube.active) at(w.cube, x, y + H * 0.34 + H * 0.56);
  }

  /** 该出发的出发：每个方块隔 gap 秒放一个；后一批的要等前一批都出发了，而且不能比前一批先到 */
  private dispatch(): void {
    while (this.order.length > 0) {
      const g = this.groups.get(this.order[0]);
      if (g && g.sent < g.total) break;
      if (g) this.prevDone = Math.max(this.prevDone, g.doneAt);
      this.groups.delete(this.order[0]);
      this.order.shift();
    }
    if (this.order.length === 0) return;
    const head = this.order[0];
    const g = this.groups.get(head);
    if (!g) return;
    for (const [car, q] of this.queues) {
      if (q.length === 0) {
        this.queues.delete(car);
        continue;
      }
      let next = Math.max(this.nextAt.get(car) ?? 0, car.readyAt);
      while (q.length > 0 && q[0].group === head && next <= this.now && this.walkers.length < this.cfg.maxWalkers) {
        const job = q[0];
        const pts = this.routeOut(job);
        const arrive = this.now + Crew.len(pts) / this.cfg.walk;
        if (arrive < this.prevDone + 0.02) break;
        q.shift();
        g.sent++;
        g.doneAt = Math.max(g.doneAt, arrive);
        this.spawn(job, pts);
        this.onSend(job);
        // 落后太多就不补了：一帧最多连着放几个
        next = Math.max(next + this.cfg.gap, this.now - this.cfg.gap * 2);
      }
      this.nextAt.set(car, next);
    }
  }

  private spawn(job: Job, pts: Vec3[]): void {
    let w = this.pool.pop();
    if (!w) {
      w = {
        body: img(this.bodyL, 'kit/worker_body_0', this.w, H, 'w'),
        top: img(this.topL, 'kit/worker_top_0', this.w, H, 'w'),
        cube: img(this.cubeL, 'kit/bead', CUBE, CUBE * 1.25, 'c'),
        job,
        pts,
        seg: 0,
        x: 0,
        y: 0,
        phase: 0,
        drop: null,
        ox: 0,
        oy: 0,
        step: 0,
        fi: 0,
      };
    }
    w.job = job;
    w.pts = pts;
    w.seg = 0;
    w.x = pts[0].x;
    w.y = pts[0].y;
    w.phase = 0;
    w.drop = null;
    w.ox = (Math.random() - 0.5) * 14;
    w.oy = (Math.random() - 0.5) * 14;
    w.step = Math.random() * 6;
    w.fi = -1;
    const col = this.colors[job.color] ?? Color.WHITE;
    (w.body.getComponent(Sprite) as Sprite).color = col;
    (w.cube.getComponent(Sprite) as Sprite).color = col;
    w.body.active = true;
    w.top.active = true;
    w.cube.active = false;
    w.body.setScale(1, 1, 1);
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
    this.pool.push(w);
  }
}
