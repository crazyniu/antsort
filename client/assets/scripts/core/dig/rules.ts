// 挖豆小火车的规则（docs/01 第 1 节）。纯逻辑：不碰节点、时间、存储、Math.random；时间由调用方传入。
// 界面调 tap / useSlot / useShunt / tick / revive，拿回事件列表照着播动画。
// 结果只取决于点击的先后：一次点击当场算到「没有豆可装」为止，和动画快慢无关。
import { CarDef, DigLevel, STONE } from './level';

export enum Status {
  PLAYING,
  WON,
  LOST,
}

export enum LoseReason {
  NONE,
  /** 站台堵死：没赢，而且没有任何一节车厢点得动 */
  JAM,
  CLOCK,
}

/** 停在装车位上的车厢 */
export interface Car {
  c: number;
  n: number;
  /** 还差几颗 */
  left: number;
  /** 第几个进站的（同色的先进站先装） */
  seq: number;
}

export type GameEvent =
  /** 车厢进站：从第 track 条待发线的第 index 节（0 = 最前面）进了第 slot 个装车位 */
  | { type: 'enter'; track: number; index: number; slot: number; c: number; n: number }
  /**
   * 第 slot 个装车位的挖机挖走了 cells 这些位置最上面的豆（离站台近的在前）；under[i] 是挖走后那个位置露出来的东西
   * （颜色编号，STONE，或 -1 空了）。round：同一轮的各个装车位同时开工，下一轮等这一轮挖完
   */
  | { type: 'dig'; round: number; slot: number; c: number; cells: number[]; under: number[] }
  /** 装满发车，装车位空出来 */
  | { type: 'depart'; round: number; slot: number; c: number }
  /**
   * 技能「铲子」：按顺序挖掉 cells 这些位置最上面的豆（从外往里，c 是各自的颜色，under 是挖走后露出来的东西），直接装上火车；
   * cuts 是按顺序从哪些方块上扣了数（track/index 是扣的那一刻在排队区的位置，slot 是场上的位子；gone = 扣到 0 消失了）
   */
  | { type: 'shovel'; cells: number[]; c: number[]; under: number[]; cuts: ShovelCut[] }
  /** 装车位多了一个（技能「加位」、堵死后复活） */
  | { type: 'slot'; count: number }
  | { type: 'win' }
  | { type: 'lose'; reason: LoseReason };

/** 铲子从一个方块上扣的数：排队区的写 track、index，场上的写 slot */
export interface ShovelCut {
  c: number;
  k: number;
  gone: boolean;
  track?: number;
  index?: number;
  slot?: number;
}

export class GameState {
  w = 0;
  h = 0;
  /** 每个位置从下到上叠着的东西（颜色编号或 STONE） */
  cols: number[][] = [];
  /** 还剩几颗豆（不算石块） */
  beads = 0;
  /** 待发线：每条从前到后 */
  tracks: CarDef[][] = [];
  /** 装车位：null = 空着 */
  slots: (Car | null)[] = [];
  private seq = 0;
  /** 发走了几节、一共几节 */
  departed = 0;
  cars = 0;
  /** 整关倒计时剩几秒；Infinity = 不限时 */
  clock = Infinity;
  status = Status.PLAYING;
  loseReason = LoseReason.NONE;
  /** 复活过了吗（每关一次） */
  revived = false;
  /** 用过「加位」了吗（每关一次） */
  slotAdded = false;
  /** 这一关用过「磁铁」了（每关最多 1 次） */
  magnetUsed = false;
  /** 这一关用了几次「铲子」 */
  shovels = 0;

  static fromLevel(lv: DigLevel): GameState {
    const s = new GameState();
    s.w = lv.w;
    s.h = lv.h;
    s.cols = lv.cols.map((c) => c.slice());
    s.beads = lv.beads;
    s.tracks = lv.tracks.map((t) => t.map((c) => ({ c: c.c, n: c.n })));
    s.slots = Array.from({ length: lv.slots }, () => null);
    s.cars = lv.cars;
    s.clock = lv.clock > 0 ? lv.clock : Infinity;
    return s;
  }

  clone(): GameState {
    const s = new GameState();
    s.w = this.w;
    s.h = this.h;
    s.cols = this.cols.map((c) => c.slice());
    s.beads = this.beads;
    s.tracks = this.tracks.map((t) => t.map((c) => ({ c: c.c, n: c.n })));
    s.slots = this.slots.map((c) => (c ? { ...c } : null));
    s.seq = this.seq;
    s.departed = this.departed;
    s.cars = this.cars;
    s.clock = this.clock;
    s.status = this.status;
    s.loseReason = this.loseReason;
    s.revived = this.revived;
    s.slotAdded = this.slotAdded;
    s.magnetUsed = this.magnetUsed;
    s.shovels = this.shovels;
    return s;
  }

  nextSeq(): number {
    return this.seq++;
  }

  /** 这个位置最上面的东西：颜色编号、STONE，空的是 -1 */
  top(p: number): number {
    const col = this.cols[p];
    return col.length > 0 ? col[col.length - 1] : -1;
  }

  /** 第一个空着的装车位，没有返回 -1 */
  freeSlot(): number {
    return this.slots.indexOf(null);
  }

  freeSlots(): number {
    return this.slots.filter((c) => c === null).length;
  }

  /** 还有车厢点得动吗：有空装车位，而且待发线上还有车 */
  canTap(): boolean {
    return this.freeSlot() >= 0 && this.tracks.some((t) => t.length > 0);
  }

  /** 有没有被盖住的豆（「透视」有没有东西可看） */
  hasHidden(): boolean {
    return this.cols.some((col) => col.length >= 2 && col.slice(0, -1).some((b) => b >= 0));
  }

  /**
   * 每个位置最上面的豆现在能不能挖（docs/01 第 1.3 节）：挖机能从料场外面、沿着比它低的地方走到它旁边。
   * 做法：对每个高度 t，从料场外面出发，把「高度不超过 t」而且连得通的位置都标出来；一颗在第 t 层（高度 t + 1）的顶豆，
   * 在最外圈，或者挨着这样一个位置，就能挖
   */
  diggable(): boolean[] {
    const { w, h, cols } = this;
    const n = w * h;
    const out: boolean[] = new Array<boolean>(n).fill(false);
    let maxH = 0;
    for (const c of cols) if (c.length > maxH) maxH = c.length;
    const open = new Uint8Array(n);
    const queue = new Int32Array(n);
    for (let t = 0; t < maxH; t++) {
      // open[p] = 1：p 的高度不超过 t，而且从外面沿着这样的位置走得到
      open.fill(0);
      let head = 0;
      let tail = 0;
      for (let p = 0; p < n; p++) {
        const x = p % w;
        const y = (p - x) / w;
        if ((x === 0 || y === 0 || x === w - 1 || y === h - 1) && cols[p].length <= t) {
          open[p] = 1;
          queue[tail++] = p;
        }
      }
      while (head < tail) {
        const p = queue[head++];
        const x = p % w;
        const y = (p - x) / w;
        if (x > 0) tail = visit(p - 1, t, cols, open, queue, tail);
        if (x < w - 1) tail = visit(p + 1, t, cols, open, queue, tail);
        if (y > 0) tail = visit(p - w, t, cols, open, queue, tail);
        if (y < h - 1) tail = visit(p + w, t, cols, open, queue, tail);
      }
      for (let p = 0; p < n; p++) {
        const col = cols[p];
        if (col.length !== t + 1 || col[t] === STONE) continue;
        const x = p % w;
        const y = (p - x) / w;
        if (x === 0 || y === 0 || x === w - 1 || y === h - 1 || open[p - 1] || open[p + 1] || open[p - w] || open[p + w]) out[p] = true;
      }
    }
    return out;
  }
}

function visit(q: number, t: number, cols: number[][], open: Uint8Array, queue: Int32Array, tail: number): number {
  if (open[q] || cols[q].length > t) return tail;
  open[q] = 1;
  queue[tail] = q;
  return tail + 1;
}

/** 先挖离站台近的：靠下的行在前，同一行靠中间的在前 */
function nearFirst(s: GameState): (a: number, b: number) => number {
  const mid = (s.w - 1) / 2;
  return (a, b) => {
    const ax = a % s.w;
    const bx = b % s.w;
    const ay = (a - ax) / s.w;
    const by = (b - bx) / s.w;
    return by - ay || Math.abs(ax - mid) - Math.abs(bx - mid) || ax - bx;
  };
}

/**
 * 站台上的车厢一直装到没有豆可装为止。一轮：按这一轮开始时的局面，每节车厢（先进站的先来）把挖得到的同色豆装上，
 * 装满的发车；挖走的豆让别的豆露出来，下一轮接着装
 */
function settle(s: GameState, ev: GameEvent[], firstRound = 0): void {
  const cmp = nearFirst(s);
  for (let round = firstRound; ; round++) {
    const can = s.diggable();
    // 每种颜色这一轮挖得到的位置
    const byColor = new Map<number, number[]>();
    for (let p = 0; p < can.length; p++) {
      if (!can[p]) continue;
      const c = s.top(p);
      const list = byColor.get(c);
      if (list) list.push(p);
      else byColor.set(c, [p]);
    }
    const order = s.slots.map((car, i) => ({ car, i })).filter((x): x is { car: Car; i: number } => x.car !== null);
    order.sort((a, b) => a.car.seq - b.car.seq);
    let any = false;
    for (const { car, i } of order) {
      const list = byColor.get(car.c);
      if (!list || list.length === 0 || car.left <= 0) continue;
      list.sort(cmp);
      const cells = list.splice(0, car.left);
      const under: number[] = [];
      for (const p of cells) {
        s.cols[p].pop();
        under.push(s.top(p));
      }
      s.beads -= cells.length;
      car.left -= cells.length;
      any = true;
      ev.push({ type: 'dig', round, slot: i, c: car.c, cells, under });
      if (car.left === 0) {
        s.slots[i] = null;
        s.departed++;
        ev.push({ type: 'depart', round, slot: i, c: car.c });
      }
    }
    if (!any) return;
  }
}

function check(s: GameState, ev: GameEvent[]): void {
  if (s.status !== Status.PLAYING) return;
  if (s.beads === 0) {
    s.status = Status.WON;
    ev.push({ type: 'win' });
  } else if (!s.canTap()) {
    lose(s, LoseReason.JAM, ev);
  }
}

function lose(s: GameState, reason: LoseReason, ev: GameEvent[]): void {
  s.status = Status.LOST;
  s.loseReason = reason;
  ev.push({ type: 'lose', reason });
}

/** 第 track 条待发线的第 index 节车厢进站，然后装到装不动为止 */
function enter(s: GameState, track: number, index: number): GameEvent[] {
  const slot = s.freeSlot();
  const def = s.tracks[track].splice(index, 1)[0];
  s.slots[slot] = { c: def.c, n: def.n, left: def.n, seq: s.nextSeq() };
  const ev: GameEvent[] = [{ type: 'enter', track, index, slot, c: def.c, n: def.n }];
  settle(s, ev);
  check(s, ev);
  return ev;
}

/** 点一条待发线：最前面的车厢进站。点不动（没车、没空装车位、这一局已经结束）返回 [] */
export function tap(s: GameState, track: number): GameEvent[] {
  if (s.status !== Status.PLAYING) return [];
  const t = s.tracks[track];
  if (!t || t.length === 0 || s.freeSlot() < 0) return [];
  return enter(s, track, 0);
}

/** 技能「调车」能用吗：有空装车位，而且有后排的车厢 */
export function canShunt(s: GameState): boolean {
  return s.status === Status.PLAYING && s.freeSlot() >= 0 && s.tracks.some((t) => t.length >= 2);
}

/** 技能「调车」：第 track 条待发线上不在最前面的第 index 节（index >= 1）直接进站 */
export function useShunt(s: GameState, track: number, index: number): GameEvent[] {
  if (!canShunt(s)) return [];
  const t = s.tracks[track];
  if (!t || index < 1 || index >= t.length) return [];
  return enter(s, track, index);
}

/** 技能「加位」：这一局多 1 个装车位（每局一次） */
export function useSlot(s: GameState): GameEvent[] {
  if (s.status !== Status.PLAYING || s.slotAdded) return [];
  s.slotAdded = true;
  s.slots.push(null);
  return [{ type: 'slot', count: s.slots.length }];
}

/** 技能「磁铁」能用吗：这一关还没用过，场上有没搬完的小队，而且画上还有它那种颜色的豆（露没露出来都算） */
export function canMagnet(s: GameState): boolean {
  if (s.status !== Status.PLAYING || s.magnetUsed) return false;
  const colors = new Set<number>();
  for (const car of s.slots) if (car && car.left > 0) colors.add(car.c);
  if (colors.size === 0) return false;
  for (let p = 0; p < s.cols.length; p++) if (colors.has(s.top(p))) return true;
  return false;
}

/** 场上每支小队（先上场的先来）不管露没露出来，直接吸走画上它那种颜色的豆，吸到数字为 0 或者吸完；之后照常接着搬 */
function pull(s: GameState, ev: GameEvent[]): void {
  const cmp = nearFirst(s);
  const order = s.slots.map((car, i) => ({ car, i })).filter((x): x is { car: Car; i: number } => x.car !== null);
  order.sort((a, b) => a.car.seq - b.car.seq);
  for (const { car, i } of order) {
    if (car.left <= 0) continue;
    const list: number[] = [];
    for (let p = 0; p < s.cols.length; p++) if (s.top(p) === car.c) list.push(p);
    if (list.length === 0) continue;
    list.sort(cmp);
    const cells = list.slice(0, car.left);
    const under: number[] = [];
    for (const p of cells) {
      s.cols[p].pop();
      under.push(s.top(p));
    }
    s.beads -= cells.length;
    car.left -= cells.length;
    ev.push({ type: 'dig', round: 0, slot: i, c: car.c, cells, under });
    if (car.left === 0) {
      s.slots[i] = null;
      s.departed++;
      ev.push({ type: 'depart', round: 0, slot: i, c: car.c });
    }
  }
  settle(s, ev, 1);
  check(s, ev);
}

/** 技能「磁铁」（每关最多 1 次，docs/01 第 1.6 节） */
export function useMagnet(s: GameState): GameEvent[] {
  if (!canMagnet(s)) return [];
  s.magnetUsed = true;
  const ev: GameEvent[] = [];
  pull(s, ev);
  return ev;
}

/**
 * 铲子要挖的那一串（docs/01 第 1.6 节）：从外往里的位置，不超过 dig 颗豆；没有要挖的返回 []。
 * 1. 给哪些颜色开路：场上卡住的小队（没搬完、画上又没有露出来的自己颜色的豆）；没有卡住的就给场上所有没搬完的；场上没有小队就给排队区最前排的。
 * 2. 这些颜色的顶豆里，挖开它要挖掉的豆最少的那颗（穿过几颗别的豆才到它旁边）；一样少的按「离火车近」（同 nearFirst），再按小队上场先后。
 * 3. 从外往里挖掉挡在它前面的那一串，最多 dig 颗。石块挖不动，路不穿过石块
 */
export function shovelPath(s: GameState, dig: number): number[] {
  if (s.status !== Status.PLAYING || dig <= 0) return [];
  const { w, h, cols } = s;
  const n = w * h;
  const can = s.diggable();
  const open = new Set<number>();
  for (let p = 0; p < n; p++) if (can[p] && s.top(p) >= 0) open.add(s.top(p));
  const team = s.slots.filter((x): x is Car => x !== null && x.left > 0).sort((a, b) => a.seq - b.seq);
  let colors = team.filter((x) => !open.has(x.c)).map((x) => x.c);
  if (colors.length === 0) colors = team.map((x) => x.c);
  if (colors.length === 0) colors = s.tracks.filter((t) => t.length > 0).map((t) => t[0].c);
  if (colors.length === 0) return [];
  const rank = new Map<number, number>();
  colors.forEach((c, i) => {
    if (!rank.has(c)) rank.set(c, i);
  });
  const cmp = nearFirst(s);
  // 挖空一个位置要挖几颗（有石块的挖不动）
  const cost = (p: number): number => (cols[p].includes(STONE) ? Infinity : cols[p].length);
  // D[p]：把 p 和从外面到 p 的一条路都挖空，最少挖几颗；from[p]：路上 p 前面那个位置（-1 = 外面）
  const D = new Float64Array(n).fill(Infinity);
  const from = new Int32Array(n).fill(-1);
  const done = new Uint8Array(n);
  for (let p = 0; p < n; p++) {
    const x = p % w;
    const y = (p - x) / w;
    if (x === 0 || y === 0 || x === w - 1 || y === h - 1) D[p] = cost(p);
  }
  // 格子不多（一千以内），直接每次挑最小的
  for (;;) {
    let u = -1;
    for (let p = 0; p < n; p++) if (!done[p] && D[p] < Infinity && (u < 0 || D[p] < D[u])) u = p;
    if (u < 0) break;
    done[u] = 1;
    const x = u % w;
    for (const v of [x > 0 ? u - 1 : -1, x < w - 1 ? u + 1 : -1, u - w, u + w]) {
      if (v < 0 || v >= n || done[v]) continue;
      const d = D[u] + cost(v);
      // 一样省的路，挑离火车近的那条
      if (d < D[v] || (d === D[v] && from[v] >= 0 && cmp(u, from[v]) < 0)) {
        D[v] = d;
        from[v] = u;
      }
    }
  }
  // 每颗目标顶豆：到它旁边要挖几颗（在最外圈 = 0），走哪个邻格进来
  let best = -1;
  let bestCost = Infinity;
  let bestVia = -1;
  for (let p = 0; p < n; p++) {
    const c = s.top(p);
    if (c < 0 || !rank.has(c)) continue;
    const x = p % w;
    const y = (p - x) / w;
    if (x === 0 || y === 0 || x === w - 1 || y === h - 1) continue;
    let via = -1;
    let k = Infinity;
    for (const q of [p - 1, p + 1, p - w, p + w]) {
      if (D[q] < k || (D[q] === k && via >= 0 && cmp(q, via) < 0)) {
        k = D[q];
        via = q;
      }
    }
    if (k === 0 || k === Infinity) continue;
    const better =
      best < 0 || k < bestCost || (k === bestCost && (cmp(p, best) < 0 || (cmp(p, best) === 0 && (rank.get(c) ?? 0) < (rank.get(s.top(best)) ?? 0))));
    if (better) {
      best = p;
      bestCost = k;
      bestVia = via;
    }
  }
  if (best < 0) return [];
  const path: number[] = [];
  for (let q = bestVia; q >= 0; q = from[q]) path.push(q);
  path.reverse();
  // 从外往里，每个位置从上往下挖，挖够 dig 颗为止（一个位置叠着几颗就记几次）
  const out: number[] = [];
  for (const p of path) {
    for (let i = 0; i < cols[p].length && out.length < dig; i++) out.push(p);
    if (out.length >= dig) break;
  }
  return out;
}

/** 技能「铲子」能用吗：这一关用了不到 perLevel 次，而且有要挖的 */
export function canShovel(s: GameState, dig: number, perLevel: number): boolean {
  return s.status === Status.PLAYING && s.shovels < perLevel && shovelPath(s, dig).length > 0;
}

/** 从颜色 c 的方块上扣掉 k：先扣排队区排得最靠后的，扣完再扣场上后上场的 */
function cutColor(s: GameState, c: number, k: number, cuts: ShovelCut[], ev: GameEvent[]): void {
  while (k > 0) {
    let track = -1;
    let index = -1;
    s.tracks.forEach((t, ti) => {
      t.forEach((def, i) => {
        if (def.c === c && (i > index || (i === index && ti > track))) {
          track = ti;
          index = i;
        }
      });
    });
    if (track >= 0) {
      const def = s.tracks[track][index];
      const take = Math.min(k, def.n);
      def.n -= take;
      k -= take;
      const gone = def.n === 0;
      if (gone) {
        s.tracks[track].splice(index, 1);
        s.cars--;
      }
      cuts.push({ c, k: take, gone, track, index });
      continue;
    }
    let slot = -1;
    s.slots.forEach((car, i) => {
      if (car && car.c === c && car.left > 0 && (slot < 0 || car.seq > (s.slots[slot] as Car).seq)) slot = i;
    });
    if (slot < 0) return;
    const car = s.slots[slot] as Car;
    const take = Math.min(k, car.left);
    car.left -= take;
    k -= take;
    const gone = car.left === 0;
    cuts.push({ c, k: take, gone, slot });
    if (gone) {
      s.slots[slot] = null;
      s.departed++;
      ev.push({ type: 'depart', round: 0, slot, c });
    }
  }
}

/** 技能「铲子」（docs/01 第 1.6 节）：挖掉 shovelPath 那一串，从同色的方块上扣数，然后场上的小队接着搬 */
export function useShovel(s: GameState, dig: number, perLevel: number): GameEvent[] {
  if (!canShovel(s, dig, perLevel)) return [];
  s.shovels++;
  const cells = shovelPath(s, dig);
  const colors: number[] = [];
  const under: number[] = [];
  const count = new Map<number, number>();
  for (const p of cells) {
    const c = s.cols[p].pop() as number;
    colors.push(c);
    under.push(s.top(p));
    count.set(c, (count.get(c) ?? 0) + 1);
  }
  s.beads -= cells.length;
  const cuts: ShovelCut[] = [];
  const ev: GameEvent[] = [];
  const shovel: GameEvent = { type: 'shovel', cells, c: colors, under, cuts };
  ev.push(shovel);
  for (const [c, k] of count) cutColor(s, c, k, cuts, ev);
  settle(s, ev, 1);
  check(s, ev);
  return ev;
}

/** 时间走 dt 秒（只有限时关会输） */
export function tick(s: GameState, dt: number): GameEvent[] {
  if (s.status !== Status.PLAYING || s.clock === Infinity) return [];
  s.clock = Math.max(0, s.clock - dt);
  const ev: GameEvent[] = [];
  if (s.clock <= 0) lose(s, LoseReason.CLOCK, ev);
  return ev;
}

/** 复活（每关一次）：堵死的，场上每支小队立刻吸走自己颜色的豆（同「磁铁」，不算用过磁铁）；时间到的加 seconds 秒 */
export function revive(s: GameState, seconds: number): GameEvent[] {
  if (s.status !== Status.LOST) return [];
  const reason = s.loseReason;
  s.revived = true;
  s.status = Status.PLAYING;
  s.loseReason = LoseReason.NONE;
  if (reason === LoseReason.CLOCK) {
    s.clock = seconds;
    return [];
  }
  const ev: GameEvent[] = [];
  pull(s, ev);
  return ev;
}

/** 点了第 track 条线以后，站台上一共能装上几颗（不改 s） */
export function gain(s: GameState, track: number): number {
  const t = s.clone();
  const before = t.beads;
  return tap(t, track).length === 0 ? -1 : before - t.beads;
}

/**
 * 提示（闲置提示、机器人代打、「稳妥点」量具共用）：点哪条待发线。挑点了以后能装得最多的那条；
 * 都装不上（最前面的颜色现在都挖不到）返回 -1 以外的第一条有车的线；一条都点不动返回 -1
 */
export function hint(s: GameState): number {
  if (s.status !== Status.PLAYING || s.freeSlot() < 0) return -1;
  let best = -1;
  let bestGain = -1;
  for (let i = 0; i < s.tracks.length; i++) {
    if (s.tracks[i].length === 0) continue;
    const g = gain(s, i);
    if (g > bestGain) {
      bestGain = g;
      best = i;
    }
  }
  return best;
}

/** 最前面的车厢里，现在点了能装上豆的那几条线（「稳妥点」只在这里面挑） */
export function safeTracks(s: GameState): number[] {
  const out: number[] = [];
  if (s.status !== Status.PLAYING || s.freeSlot() < 0) return out;
  for (let i = 0; i < s.tracks.length; i++) if (s.tracks[i].length > 0 && gain(s, i) > 0) out.push(i);
  return out;
}
