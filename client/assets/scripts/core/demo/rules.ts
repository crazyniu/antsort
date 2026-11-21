// 示例玩法的规则（纯逻辑，不碰节点、时间、存储、Math.random；时间和随机种子由调用方传入）。
// 界面调 tap / useUndo / useShuffle / tick，拿回事件列表照着播动画（docs/04：逻辑立即结算，动画不挡操作）。
import { Rng } from '../rng/rng';
import { covers, DemoLevel, Tile } from './level';

export enum Status {
  PLAYING,
  WON,
  LOST,
}

export enum LoseReason {
  NONE,
  TRAY_FULL,
  CLOCK,
}

export type GameEvent =
  | { type: 'move'; tile: number; slot: number }
  | { type: 'clear'; kind: number; tiles: number[] }
  | { type: 'shift'; order: number[] }
  | { type: 'shuffle' }
  | { type: 'win' }
  | { type: 'lose'; reason: LoseReason };

export class GameState {
  tiles: Tile[] = [];
  /** 每块还在场上吗 */
  alive: boolean[] = [];
  /** 暂存槽里的块（块的下标），按图案排好：同样的挨在一起 */
  tray: number[] = [];
  trayCap = 7;
  /** 整关倒计时剩几秒；Infinity = 不限时 */
  clock = Infinity;
  status = Status.PLAYING;
  loseReason = LoseReason.NONE;
  /** 复活过了吗（每关一次） */
  revived = false;
  /** 消掉了几组 */
  cleared = 0;

  static fromLevel(lv: DemoLevel): GameState {
    const s = new GameState();
    s.tiles = lv.tiles.map((t) => ({ ...t }));
    s.alive = lv.tiles.map(() => true);
    s.trayCap = lv.tray;
    s.clock = lv.clock > 0 ? lv.clock : Infinity;
    return s;
  }

  clone(): GameState {
    const s = new GameState();
    s.tiles = this.tiles.map((t) => ({ ...t }));
    s.alive = this.alive.slice();
    s.tray = this.tray.slice();
    s.trayCap = this.trayCap;
    s.clock = this.clock;
    s.status = this.status;
    s.loseReason = this.loseReason;
    s.revived = this.revived;
    s.cleared = this.cleared;
    return s;
  }

  /** 场上还剩几块（不算暂存槽里的） */
  left(): number {
    return this.alive.filter(Boolean).length;
  }

  /** 这块现在能点吗：在场上、没被压住 */
  free(i: number): boolean {
    if (!this.alive[i]) return false;
    const t = this.tiles[i];
    for (let j = 0; j < this.tiles.length; j++) if (j !== i && this.alive[j] && covers(this.tiles[j], t)) return false;
    return true;
  }

  freeTiles(): number[] {
    return this.tiles.map((_, i) => i).filter((i) => this.free(i));
  }
}

/** 点一块：进暂存槽（插在同图案的后面），凑满三个消掉；全部消完过关，槽满了输 */
export function tap(s: GameState, i: number): GameEvent[] {
  if (s.status !== Status.PLAYING || !s.free(i)) return [];
  s.alive[i] = false;
  const kind = s.tiles[i].kind;
  let at = s.tray.length;
  for (let k = s.tray.length - 1; k >= 0; k--) {
    if (s.tiles[s.tray[k]].kind === kind) {
      at = k + 1;
      break;
    }
  }
  s.tray.splice(at, 0, i);
  const ev: GameEvent[] = [{ type: 'move', tile: i, slot: at }];
  const same = s.tray.filter((t) => s.tiles[t].kind === kind);
  if (same.length >= 3) {
    const gone = same.slice(0, 3);
    s.tray = s.tray.filter((t) => !gone.includes(t));
    s.cleared++;
    ev.push({ type: 'clear', kind, tiles: gone }, { type: 'shift', order: s.tray.slice() });
  }
  return ev.concat(check(s));
}

function check(s: GameState): GameEvent[] {
  if (s.status !== Status.PLAYING) return [];
  if (s.left() === 0 && s.tray.length === 0) {
    s.status = Status.WON;
    return [{ type: 'win' }];
  }
  if (s.tray.length >= s.trayCap) return lose(s, LoseReason.TRAY_FULL);
  return [];
}

function lose(s: GameState, reason: LoseReason): GameEvent[] {
  s.status = Status.LOST;
  s.loseReason = reason;
  return [{ type: 'lose', reason }];
}

/** 时间走 dt 秒（只有限时关会输） */
export function tick(s: GameState, dt: number): GameEvent[] {
  if (s.status !== Status.PLAYING || s.clock === Infinity) return [];
  s.clock = Math.max(0, s.clock - dt);
  return s.clock <= 0 ? lose(s, LoseReason.CLOCK) : [];
}

/** 洗牌：场上剩下的块图案互换（位置不动），seed 由界面传 */
export function useShuffle(s: GameState, seed: number): GameEvent[] {
  if (s.status !== Status.PLAYING) return [];
  const idx = s.tiles.map((_, i) => i).filter((i) => s.alive[i]);
  if (idx.length < 2) return [];
  const kinds = idx.map((i) => s.tiles[i].kind);
  new Rng(seed).shuffle(kinds);
  idx.forEach((i, k) => (s.tiles[i].kind = kinds[k]));
  return [{ type: 'shuffle' }];
}

/** 提示：先找能凑满三个的，再找和暂存槽里一样的，最后随便一块能点的；没有返回 -1 */
export function hint(s: GameState): number {
  const free = s.freeTiles();
  if (free.length === 0) return -1;
  const inTray = (k: number) => s.tray.filter((t) => s.tiles[t].kind === k).length;
  return free.find((i) => inTray(s.tiles[i].kind) === 2) ?? free.find((i) => inTray(s.tiles[i].kind) === 1) ?? free[0];
}

/** 复活：暂存槽最后三块放回场上（原位），时间到的加 30 秒 */
export function revive(s: GameState): GameEvent[] {
  if (s.status !== Status.LOST) return [];
  s.revived = true;
  s.status = Status.PLAYING;
  if (s.loseReason === LoseReason.CLOCK) s.clock = 30;
  const back = s.tray.splice(Math.max(0, s.tray.length - 3));
  for (const t of back) s.alive[t] = true;
  s.loseReason = LoseReason.NONE;
  return [{ type: 'shift', order: s.tray.slice() }];
}
