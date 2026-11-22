// 关卡（docs/02 第 4 节）：一关一个文件 config/levels/level_XXXX.json，离线生成（client/tools/level/build.ts），带参考解。
// 这里只管读和检查；规则在 rules.ts。纯逻辑，不 import 'cc'。
import type { LevelsConfig } from '../config';

export type LevelKind = 'normal' | 'hard' | 'boss';

/** 一格里的东西：>= 0 是豆的颜色编号 */
export const STONE = -2;
export const NONE = -1;

/** 一节车厢：颜色编号、容量（要装几颗） */
export interface CarDef {
  c: number;
  n: number;
}

/** 降档变体：只换车厢和参考解，画不变 */
export interface EaseVariant {
  tracks: CarDef[][];
  solution: number[];
}

/** 关卡文件 */
export interface LevelFile {
  id: number;
  kind: LevelKind;
  /** 画的名字（调试、收藏册用，不直接给玩家看） */
  name: string;
  w: number;
  h: number;
  /** 颜色表：'#rrggbb'，下标是颜色编号 */
  palette: string[];
  /** 从下到上每层一张图：h 行、每行 w 个字符。'.' 空，'#' 石块，0-9 a-z 颜色编号 */
  layers: string[][];
  /** 每条待发线上的车厢，从前到后 */
  tracks: CarDef[][];
  /** 装车位数 */
  slots: number;
  /** 限时秒数；不限时不写 */
  timeLimit?: number;
  /** 这一关用到的机关（docs/01 第 1.7 节） */
  mechanics: string[];
  /** 参考解：按这个顺序点待发线（线的编号）一定能过，不用技能 */
  solution: number[];
  ease?: EaseVariant[];
  /** 生成种子、量出来的难度数据等（docs/02 第 5.2 节），游戏里不用 */
  meta?: Record<string, unknown>;
}

/** 解析好的一关（界面和规则用） */
export interface DigLevel {
  id: number;
  kind: LevelKind;
  name: string;
  w: number;
  h: number;
  palette: string[];
  /** 每个位置（y * w + x，y = 0 是最上面一行）从下到上叠着的东西：颜色编号或 STONE */
  cols: number[][];
  tracks: CarDef[][];
  slots: number;
  /** 整关限时秒数，0 = 不限时 */
  clock: number;
  mechanics: string[];
  solution: number[];
  /** 一共几颗豆、几节车厢 */
  beads: number;
  cars: number;
}

const DIGITS = '0123456789abcdefghijklmnopqrstuvwxyz';

/** 第 id 关是哪一种（id 传 Meta.levelFile 换算后的编号）。关卡文件里也写了 kind，level-verify 检查两边一致 */
export function kindOf(cfg: LevelsConfig, id: number): LevelKind {
  if (cfg.bossEvery > 0 && id % cfg.bossEvery === 0) return 'boss';
  if (cfg.hardEvery > 0 && id % cfg.hardEvery === 0) return 'hard';
  return 'normal';
}

/** 关卡文件名（不带扩展名）：level_0007 */
export function fileName(id: number): string {
  return `level_${String(id).padStart(4, '0')}`;
}

/** 几层图叠成每个位置的一摞：空格跳过（上层悬空的豆落到下面） */
export function stack(w: number, h: number, layers: string[][]): number[][] {
  const cols: number[][] = Array.from({ length: w * h }, () => []);
  for (const rows of layers) {
    for (let y = 0; y < h; y++) {
      const row = rows[y] ?? '';
      for (let x = 0; x < w; x++) {
        const ch = row[x] ?? '.';
        if (ch === '.' || ch === ' ') continue;
        cols[y * w + x].push(ch === '#' ? STONE : DIGITS.indexOf(ch));
      }
    }
  }
  return cols;
}

/** 读一关。ease：连输后降的档（0 = 原样；超过变体数用最后一档） */
export function parse(f: LevelFile, ease = 0): DigLevel {
  const v = ease > 0 && f.ease && f.ease.length > 0 ? f.ease[Math.min(ease, f.ease.length) - 1] : f;
  const cols = stack(f.w, f.h, f.layers);
  const tracks = v.tracks.map((t) => t.map((c) => ({ c: c.c, n: c.n })));
  return {
    id: f.id,
    kind: f.kind,
    name: f.name,
    w: f.w,
    h: f.h,
    palette: f.palette.slice(),
    cols,
    tracks,
    slots: f.slots,
    clock: f.timeLimit ?? 0,
    mechanics: f.mechanics.slice(),
    solution: v.solution.slice(),
    beads: cols.reduce((a, c) => a + c.filter((b) => b >= 0).length, 0),
    cars: tracks.reduce((a, t) => a + t.length, 0),
  };
}

/** 每种颜色有几颗豆 */
export function beadCount(lv: DigLevel): number[] {
  const n = lv.palette.map(() => 0);
  for (const col of lv.cols) for (const b of col) if (b >= 0) n[b] = (n[b] ?? 0) + 1;
  return n;
}

/** 检查一关的数据对不对（不查可解，可解由参考解保证）。返回问题列表，空 = 没问题 */
export function problems(lv: DigLevel): string[] {
  const out: string[] = [];
  if (lv.cols.length !== lv.w * lv.h) out.push('格子数和宽高对不上');
  if (lv.slots < 1) out.push('装车位数不对');
  const beads = beadCount(lv);
  const cap = lv.palette.map(() => 0);
  for (const col of lv.cols) for (const b of col) if (b !== STONE && (b < 0 || b >= lv.palette.length)) out.push(`豆的颜色编号 ${b} 不在颜色表里`);
  for (const t of lv.tracks) {
    for (const c of t) {
      if (c.c < 0 || c.c >= lv.palette.length) out.push(`车厢的颜色编号 ${c.c} 不在颜色表里`);
      else cap[c.c] += c.n;
      if (c.n < 1) out.push('有容量不到 1 的车厢');
    }
  }
  beads.forEach((n, c) => {
    if (n !== cap[c]) out.push(`颜色 ${c}：豆 ${n} 颗，车厢一共装 ${cap[c]} 颗`);
  });
  if (lv.beads === 0) out.push('没有豆');
  return out;
}
