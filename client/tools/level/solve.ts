// 求解器和量具（docs/02 第 5.2 节）。求解器只用来保证有解、算「最少占位」；难度看两个只用屏幕信息的机器人。
import type { DigLevel } from '../../assets/scripts/core/dig/level';
import * as Rules from '../../assets/scripts/core/dig/rules';
import { GameState, Status } from '../../assets/scripts/core/dig/rules';
import { Rng } from '../../assets/scripts/core/rng/rng';

function key(s: GameState): string {
  const slots = s.slots
    .filter((c): c is Rules.Car => c !== null)
    .sort((a, b) => a.seq - b.seq)
    .map((c) => `${c.c}:${c.left}`)
    .join(',');
  return `${s.tracks.map((t) => t.length).join('/')}|${s.slots.length}|${slots}|${s.cols.map((c) => c.length).join('')}`;
}

/**
 * 找一条不用技能的解法（点待发线的顺序）；没有返回 null。slots：装车位数（不给用关卡自己的）。
 * 深搜 + 记住走不通的局面；先试装得多的那条线，一般很快
 */
export function solve(lv: DigLevel, slots = lv.slots, maxNodes = 200000): number[] | null {
  const start = GameState.fromLevel(lv);
  start.slots = Array.from({ length: slots }, () => null);
  const dead = new Set<string>();
  let nodes = 0;
  const path: number[] = [];
  const dfs = (s: GameState): boolean => {
    if (s.status === Status.WON) return true;
    if (s.status === Status.LOST) return false;
    const k = key(s);
    if (dead.has(k) || ++nodes > maxNodes) return false;
    const moves: { t: number; next: GameState; gain: number }[] = [];
    for (let t = 0; t < s.tracks.length; t++) {
      if (s.tracks[t].length === 0) continue;
      const next = s.clone();
      if (Rules.tap(next, t).length === 0) continue;
      moves.push({ t, next, gain: s.beads - next.beads });
    }
    moves.sort((a, b) => b.gain - a.gain);
    for (const m of moves) {
      path.push(m.t);
      if (dfs(m.next)) return true;
      path.pop();
    }
    dead.add(k);
    return false;
  };
  return dfs(start) ? path.slice() : null;
}

/** 最少占位：最少要几个装车位才有解（1 到关卡的装车位数）；没解返回 0 */
export function minSlots(lv: DigLevel): number {
  for (let k = 1; k <= lv.slots; k++) if (solve(lv, k, 50000)) return k;
  return 0;
}

/** 照着一串点击打一遍，返回打完的局面 */
export function replay(lv: DigLevel, taps: number[]): GameState {
  const s = GameState.fromLevel(lv);
  for (const t of taps) Rules.tap(s, t);
  return s;
}

/** 随手点：随机点一条有车的线 */
export function playRandom(lv: DigLevel, rng: Rng): boolean {
  const s = GameState.fromLevel(lv);
  while (s.status === Status.PLAYING) {
    const open = s.tracks.map((t, i) => (t.length > 0 ? i : -1)).filter((i) => i >= 0);
    Rules.tap(s, rng.pick(open));
  }
  return s.status === Status.WON;
}

/** 稳妥点：只叫现在有豆可挖的颜色（有多条就叫装得最多的）；没有这样的车厢才随机点 */
export function playSafe(lv: DigLevel, rng: Rng): boolean {
  const s = GameState.fromLevel(lv);
  while (s.status === Status.PLAYING) {
    const safe = Rules.safeTracks(s);
    if (safe.length > 0) {
      let best = safe[0];
      let bestGain = -1;
      for (const t of safe) {
        const g = Rules.gain(s, t);
        if (g > bestGain) {
          bestGain = g;
          best = t;
        }
      }
      Rules.tap(s, best);
    } else {
      const open = s.tracks.map((t, i) => (t.length > 0 ? i : -1)).filter((i) => i >= 0);
      Rules.tap(s, rng.pick(open));
    }
  }
  return s.status === Status.WON;
}

export interface Measure {
  /** 随手点、稳妥点的过关率（0–1） */
  random: number;
  safe: number;
  minSlots: number;
}

export function measure(lv: DigLevel, runs = 300, seed = 1): Measure {
  const rng = new Rng(seed);
  let r = 0;
  let sf = 0;
  for (let i = 0; i < runs; i++) {
    if (playRandom(lv, rng)) r++;
    if (playSafe(lv, rng)) sf++;
  }
  return { random: r / runs, safe: sf / runs, minSlots: minSlots(lv) };
}
