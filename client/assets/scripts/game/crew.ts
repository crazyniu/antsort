// 小人（docs/01 第 3 节）：从船上的方块里「跳」上岸（一道弧线）→ 沿着画四周的路绕到离那颗豆最近的一边 → 走进去抱起豆
// → 绕到画上面、走到车厢边放进火车 → 空着手沿铁轨走出画面消失。只是表现：搬哪颗、谁先搬都是规则算好的（局内页面把一颗颗「活」排进来），这里只管什么时候出发、怎么走。
// 出发的先后要守住一条：一颗豆要等它面前那条路上的豆都被搬走了才能去搬（不然看着像是从里面掏的）。只卡这一条，
// 不按「一队搬完下一队才动」排：几支小队只要各自的豆露出来了就同时干活，画面才热闹。
// 动画：正面（往下走）、侧面（朝右，往左翻转）、背面（往上走）各 4 帧，空手一套、双手伸在身前抱东西一套（kit/wk_*，tools/art/sprites.py 切的）。
// 抱着的豆（kit/cube）画在「身前」：往两边走在手那一侧，往下走在胸前（盖住身子），往上走在头顶后面（俯视的画面里，身前就是画面上方，被头挡住一半）。
import { Color, Node, Sprite, SpriteFrame, Vec3 } from 'cc';
import { at, box, img, size } from '../ui/kit';
import { frame } from '../ui/res';
import type { CarView } from './station';
import type { Drop, Train } from './train';

/** 小人显示多高、抱着的豆多宽（kit/cube 宽 40 高 44）、从船上跳上岸用几秒 */
const H = 46;
const CUBE = 23;
const JUMP = 0.3;
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
  /** 画四周那圈路的中线：左、右、下（河岸）、上（铁轨下面那条） */
  l: number;
  r: number;
  b: number;
  t: number;
  /** 那圈路四个角的圆角半径（中线上的） */
  rad: number;
  /** 方块现在在哪里（船上） */
  carPos: (car: CarView) => Vec3;
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
  /** 0 去搬、1 往火车走、2 在车厢边等火车停稳、3 放完了走出画面 */
  phase: number;
  /** 从船上跳上岸：起点和进度（-1 = 没在跳） */
  jx: number;
  jy: number;
  jumpT: number;
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

  /** 去搬一颗豆的整条路：第一个点是跳上岸的落点（船正上方的河岸路），再沿路绕到进入点，走进去 */
  private routeOut(job: Job): Vec3[] {
    const f = this.field;
    const from = f.carPos(job.car);
    // 落点避开两头的圆角（那里路往里拐了）
    const R = this.rad;
    const bank = new Vec3(Math.min(f.r - R, Math.max(f.l + R, from.x)), f.b, 0);
    const pts: Vec3[] = [bank];
    pts.push(...this.ring(bank, job.inside[0]));
    for (let i = 1; i < job.inside.length; i++) pts.push(job.inside[i]);
    return pts;
  }

  /** 抱着豆去火车的路：原路退到那圈路上，绕到画上面车厢那一格，再往上走到车厢边 */
  private routeBack(job: Job, d: Drop): Vec3[] {
    const pts: Vec3[] = [];
    for (let i = job.inside.length - 2; i >= 1; i--) pts.push(job.inside[i]);
    // 回到路上：第 0 个点落到路的中线上（角上是圆弧）
    pts.push(this.ringAt(this.ringS(job.inside[0])));
    const below = new Vec3(Math.min(this.field.r, Math.max(this.field.l, d.x)), this.field.t, 0);
    pts.push(...this.ring(job.inside[0], below));
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
    /** 放完豆空着手走出去的走快一点，铁轨边不堆人 */
    const vOut = v * 1.6;
    for (let i = this.walkers.length - 1; i >= 0; i--) {
      const w = this.walkers[i];
      if (w.phase === 2) {
        if (w.drop && this.train.ready(w.drop.train)) {
          // 放进车厢，然后空着手沿铁轨走出画面
          this.train.drop(w.drop, w.job.color);
          w.carry = false;
          const exitX = (w.x >= 0 ? 1 : -1) * (this.cfg.width / 2 + 40);
          w.pts = [new Vec3(w.x, w.y, 0), new Vec3(exitX, w.y + 10, 0)];
          w.seg = 0;
          w.phase = 3;
        }
        this.draw(w, step);
        continue;
      }
      // 从船上跳上岸：一道弧线，落地才开始走
      if (w.jumpT >= 0) {
        w.jumpT = Math.min(1, w.jumpT + step / JUMP);
        const k = w.jumpT;
        w.x = w.jx + (w.pts[0].x - w.jx) * k;
        w.y = w.jy + (w.pts[0].y - w.jy) * k + Math.sin(Math.PI * k) * 30;
        if (w.jumpT >= 1) w.jumpT = -1;
        this.draw(w, step);
        continue;
      }
      this.move(w, w.phase === 3 ? vOut : v);
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
  private ready(job: Job): Vec3[] | null {
    if ((this.cellSent.get(job.cell) ?? 0) < (this.rank.get(job) ?? 0)) return null;
    for (const c of job.need) if (this.waitingOn(c)) return null;
    let pts = this.routes.get(job);
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
        const job = q.splice(at0, 1)[0];
        this.rank.delete(job);
        this.routes.delete(job);
        this.cellSent.set(job.cell, (this.cellSent.get(job.cell) ?? 0) + 1);
        this.cellPickAt.set(job.cell, Math.max(this.cellPickAt.get(job.cell) ?? 0, this.now + Crew.len(pts) / this.cfg.walk));
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
        drop: null,
        ox: 0,
        oy: 0,
        step: 0,
        mdx: 0,
        mdy: 1,
        shown: '',
        jx: 0,
        jy: 0,
        jumpT: -1,
      };
    }
    w.job = job;
    w.pts = pts;
    w.seg = 0;
    // 从船上（方块的位置）跳到岸上的第一个点
    const from = this.field.carPos(job.car);
    w.jx = from.x;
    w.jy = from.y + 10;
    w.x = w.jx;
    w.y = w.jy;
    w.jumpT = 0;
    w.phase = 0;
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
