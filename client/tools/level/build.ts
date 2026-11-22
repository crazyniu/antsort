// 关卡生成（node 上跑：npx tsx tools/level/build.ts [起] [止]）。按 specs.ts 和图库生成 config/levels/level_XXXX.json。
// 做法（docs/02 第 4 节，按解构造）：
//   1. 模拟出一个合法的挖豆顺序：每次挑一种现在挖得到的颜色，切出一节车厢，让它装满开走；
//   2. 太小的车厢并进同色的另一节（那一节就要在站台上多等一会儿），每并一次都照顺序打一遍确认还能过；
//   3. 把车厢按先后分到几条待发线上，然后朝目标难度一步步打乱（对调、挪位置、合并成大车厢、拆开），每一步都用求解器确认有解、
//      用两个机器人量过关率，离目标不更远才留下；
//   4. 换几个起点各找一遍，挑最贴近目标的那一个。
import { fileURLToPath } from 'node:url';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { LevelsConfig } from '../../assets/scripts/core/config';
import { CarDef, DigLevel, EaseVariant, LevelFile, fileName, kindOf, parse, problems } from '../../assets/scripts/core/dig/level';
import * as Rules from '../../assets/scripts/core/dig/rules';
import { GameState, Status } from '../../assets/scripts/core/dig/rules';
import { Rng } from '../../assets/scripts/core/rng/rng';
import { Measure, measure, replay, solve } from './solve';
import { SPECS, Spec } from './specs';

const CONFIG = join(dirname(fileURLToPath(import.meta.url)), '../../assets/resources/config');
const OUT = join(CONFIG, 'levels');
const cfg = JSON.parse(readFileSync(join(CONFIG, 'levels.json'), 'utf8')) as LevelsConfig;
const DIGITS = '0123456789abcdefghijklmnopqrstuvwxyz';
/** 每关从几个不同的起点开始找 */
const TRIES = 8;
/** 每个起点最多改多少步 */
const STEPS = 250;
/** 量过关率跑多少局：找的时候少跑一点，定下来以后多跑 */
const QUICK_RUNS = 80;
const RUNS = 400;

interface Picture {
  name: string;
  /** 字母 → 色值 */
  colors: Record<string, string>;
  /** 一个字符一颗豆，'.' 是空格 */
  rows: string[];
}

/** 图库：tools/level/pictures/<名字>.json，由 import.ts 从像素画图片转出来（docs/02 第 4 节） */
function picture(k: string): Picture {
  return JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'pictures', `${k}.json`), 'utf8')) as Picture;
}

/** 一关的画：颜色表和每层的格子图（字母换成颜色编号） */
function board(spec: Spec): { w: number; h: number; palette: string[]; layers: string[][]; name: string } {
  const pics = spec.layers.map(picture);
  const h = pics[0].rows.length;
  const w = pics[0].rows[0].length;
  const palette: string[] = [];
  const layers = pics.map((p) => {
    if (p.rows.length !== h || p.rows.some((r) => r.length !== w)) throw new Error(`第 ${spec.id} 关：${p.name} 的大小不是 ${w}×${h}`);
    return p.rows.map((r) =>
      [...r]
        .map((ch) => {
          if (ch === '.' || ch === '#') return ch;
          const c = p.colors[ch];
          if (!c) throw new Error(`第 ${spec.id} 关：${p.name} 没有颜色 ${ch}`);
          if (!palette.includes(c)) palette.push(c);
          return DIGITS[palette.indexOf(c)];
        })
        .join(''),
    );
  });
  return { w, h, palette, layers, name: pics.map((p) => p.name).reverse().join(' / ') };
}

function fileOf(spec: Spec, b: ReturnType<typeof board>, tracks: CarDef[][], solution: number[]): LevelFile {
  return {
    id: spec.id,
    kind: kindOf(cfg, spec.id),
    name: b.name,
    w: b.w,
    h: b.h,
    palette: b.palette,
    layers: b.layers,
    tracks,
    slots: cfg.slots,
    ...(spec.timeLimit ? { timeLimit: spec.timeLimit } : {}),
    mechanics: spec.mechanics,
    solution,
  };
}

/** 现在让一节颜色 c、容量 n 的车厢单独进站，能装上几颗（不改 s） */
function reach(s: GameState, c: number, n: number): number {
  const t = s.clone();
  t.tracks = [[{ c, n }]];
  t.slots = [null];
  t.status = Status.PLAYING;
  const before = t.beads;
  Rules.tap(t, 0);
  return before - t.beads;
}

/** 第 1 步：一个合法的挖豆顺序，切成车厢（每节都能当场装满开走） */
function carve(lv: DigLevel, spec: Spec, rng: Rng): CarDef[] {
  const s = GameState.fromLevel(lv);
  const seq: CarDef[] = [];
  const [lo, hi] = spec.car;
  while (s.beads > 0) {
    const can = s.diggable();
    const colors = new Set<number>();
    can.forEach((ok, p) => {
      if (ok) colors.add(s.top(p));
    });
    const options = [...colors].map((c) => ({ c, all: reach(s, c, 100000) }));
    // 多半挑现在能挖得最多的颜色，偶尔挑别的（每个种子出来的顺序不一样）
    options.sort((a, b) => b.all - a.all);
    const pick = rng.randf() < 0.6 ? options[0] : rng.pick(options);
    let n = pick.all;
    if (n > hi) {
      n = rng.rangeI(lo, hi);
      // 别剩下一点点：剩的不够一节就一起装走
      if (pick.all - n < lo) n = pick.all <= Math.round(hi * 1.5) ? pick.all : pick.all - lo;
    }
    s.tracks = [[{ c: pick.c, n }]];
    s.slots = [null];
    s.status = Status.PLAYING;
    Rules.tap(s, 0);
    seq.push({ c: pick.c, n });
  }
  return seq;
}

/** 照这个先后顺序（一条线上排队）在 slots 个装车位里打得过吗 */
function inOrder(lv: DigLevel, seq: CarDef[]): boolean {
  const one: DigLevel = { ...lv, tracks: [seq.map((c) => ({ ...c }))], cars: seq.length };
  return replay(one, seq.map(() => 0)).status === Status.WON;
}

/** 把第 i 节并进同色的第 j 节（并完按顺序还打得过才算）；返回并没并成 */
function merge(lv: DigLevel, seq: CarDef[], i: number, j: number): boolean {
  if (i === j || seq[i].c !== seq[j].c) return false;
  const next = seq.map((c) => ({ ...c }));
  next[j].n += next[i].n;
  next.splice(i, 1);
  if (!inOrder(lv, next)) return false;
  seq.length = 0;
  seq.push(...next);
  return true;
}

/** 第 2 步：太小的车厢并掉；超过 maxCars 的接着并最小的 */
function tidy(lv: DigLevel, seq: CarDef[], spec: Spec, rng: Rng): void {
  const [lo] = spec.car;
  const small = (limit: number): number => {
    let at = -1;
    for (let i = 0; i < seq.length; i++) if (seq[i].n < limit && (at < 0 || seq[i].n < seq[at].n)) at = i;
    return at;
  };
  const tryMerge = (i: number): boolean => {
    // 先试离得近的同色车厢
    const others = seq.map((_, j) => j).filter((j) => j !== i && seq[j].c === seq[i].c);
    others.sort((a, b) => Math.abs(a - i) - Math.abs(b - i) || rng.rangeI(-1, 1));
    for (const j of others) if (merge(lv, seq, i, j)) return true;
    return false;
  };
  const stuck = new Set<string>();
  for (let guard = 0; guard < 200; guard++) {
    const limit = spec.maxCars !== undefined && seq.length > spec.maxCars ? Infinity : lo;
    let i = small(limit);
    // 并不动的先跳过，找下一个
    while (i >= 0 && stuck.has(`${i}:${seq[i].c}:${seq[i].n}:${seq.length}`)) {
      const skip = i;
      i = -1;
      for (let k = 0; k < seq.length; k++) {
        if (k === skip || seq[k].n >= limit || stuck.has(`${k}:${seq[k].c}:${seq[k].n}:${seq.length}`)) continue;
        if (i < 0 || seq[k].n < seq[i].n) i = k;
      }
    }
    if (i < 0) return;
    const tag = `${i}:${seq[i].c}:${seq[i].n}:${seq.length}`;
    if (!tryMerge(i)) stuck.add(tag);
  }
}

/** 第 3 步：按先后分到几条线上。stick：接着上一节排在同一条线上的可能（越大，别的线最前面越常是「以后才用得上」的车厢） */
function deal(seq: CarDef[], n: number, stick: number, rng: Rng): { tracks: CarDef[][]; solution: number[] } {
  const tracks: CarDef[][] = Array.from({ length: n }, () => []);
  const solution: number[] = [];
  const cap = Math.ceil(seq.length / n) + 1;
  let last = -1;
  seq.forEach((car, i) => {
    let t: number;
    if (stick <= 0) t = i % n;
    else {
      const open = tracks.map((x, k) => (x.length < cap ? k : -1)).filter((k) => k >= 0);
      t = last >= 0 && open.includes(last) && rng.randf() < stick ? last : rng.pick(open);
    }
    tracks[t].push({ ...car });
    solution.push(t);
    last = t;
  });
  return { tracks, solution };
}

interface Candidate {
  file: LevelFile;
  m: Measure;
  score: number;
  seed: number;
}

function distance(v: number, [lo, hi]: [number, number]): number {
  return v < lo ? lo - v : v > hi ? v - hi : 0;
}

function scoreOf(m: Measure, spec: Spec): number {
  return distance(m.random, spec.target.random) + distance(m.safe, spec.target.safe);
}

const copy = (tracks: CarDef[][]): CarDef[][] => tracks.map((t) => t.map((c) => ({ ...c })));

/**
 * 第 3 步的打乱：随机改一下车厢的排法（改完有没有解由调用方查）。四种改法：
 * 同一条线上相邻两节对调；一节挪到别的位置；两节同色的并成一节大的；一节大的拆成两节
 */
function mutate(tracks: CarDef[][], spec: Spec, rng: Rng): boolean {
  const [lo, hi] = spec.car;
  const cars = tracks.reduce((a, t) => a + t.length, 0);
  const longest = Math.ceil(cars / tracks.length) + 2;
  const where: [number, number][] = [];
  tracks.forEach((t, ti) => t.forEach((_, i) => where.push([ti, i])));
  const kind = rng.rangeI(0, 3);
  if (kind === 0) {
    const t = tracks[rng.rangeI(0, tracks.length - 1)];
    if (t.length < 2) return false;
    const at = rng.rangeI(0, t.length - 2);
    [t[at], t[at + 1]] = [t[at + 1], t[at]];
    return true;
  }
  if (kind === 1) {
    const [ti, i] = rng.pick(where);
    const to = rng.rangeI(0, tracks.length - 1);
    if (to !== ti && (tracks[ti].length <= 1 || tracks[to].length >= longest)) return false;
    const [car] = tracks[ti].splice(i, 1);
    tracks[to].splice(rng.rangeI(0, tracks[to].length), 0, car);
    return true;
  }
  if (kind === 2) {
    const [ti, i] = rng.pick(where);
    const a = tracks[ti][i];
    const same = where.filter(([tj, j]) => !(tj === ti && j === i) && tracks[tj][j].c === a.c && tracks[tj][j].n + a.n <= Math.round(hi * 1.6));
    if (same.length === 0) return false;
    const [tj, j] = rng.pick(same);
    if (tracks[tj].length <= 1) return false;
    a.n += tracks[tj][j].n;
    tracks[tj].splice(j, 1);
    return true;
  }
  if (spec.maxCars !== undefined && cars >= spec.maxCars) return false;
  const big = where.filter(([ti, i]) => tracks[ti][i].n >= lo * 2);
  if (big.length === 0) return false;
  const [ti, i] = rng.pick(big);
  const car = tracks[ti][i];
  const half = rng.rangeI(lo, car.n - lo);
  car.n -= half;
  const to = rng.rangeI(0, tracks.length - 1);
  if (tracks[to].length >= longest) return false;
  tracks[to].splice(rng.rangeI(0, tracks[to].length), 0, { c: car.c, n: half });
  return true;
}

function candidate(spec: Spec, b: ReturnType<typeof board>, seed: number): Candidate | null {
  const rng = new Rng((spec.id * 7919 + seed * 104729) >>> 0);
  const base = parse(fileOf(spec, b, [], []));
  const seq = carve(base, spec, rng);
  tidy(base, seq, spec, rng);
  if (spec.maxCars !== undefined && seq.length > spec.maxCars) return null;
  const dealt = deal(seq, spec.tracks, seed === 0 ? 0 : rng.randf() * 0.6, rng);
  let tracks = dealt.tracks;
  let solution = dealt.solution;
  const quick = (t: CarDef[][], sol: number[]): Measure => measure(parse(fileOf(spec, b, t, sol)), QUICK_RUNS, seed + 1);
  let score = scoreOf(quick(tracks, solution), spec);
  // 朝目标难度一步步改：改完有解、而且离目标不更远就留下
  for (let step = 0; step < STEPS && score > 0; step++) {
    const next = copy(tracks);
    if (!mutate(next, spec, rng)) continue;
    const sol = solve(parse(fileOf(spec, b, next, [])));
    if (!sol) continue;
    const sc = scoreOf(quick(next, sol), spec);
    if (sc <= score) {
      tracks = next;
      solution = sol;
      score = sc;
    }
  }
  const file = fileOf(spec, b, tracks, solution);
  const lv = parse(file);
  if (problems(lv).length > 0 || replay(lv, lv.solution).status !== Status.WON) return null;
  const m = measure(lv, RUNS, seed + 7);
  return { file, m, score: scoreOf(m, spec), seed };
}

/** 降档变体：第 1 档不打乱、按顺序轮流分到各条线；第 2 档再把大车厢拆成两节 */
function easeVariants(spec: Spec, b: ReturnType<typeof board>): EaseVariant[] {
  const rng = new Rng((spec.id * 7919) >>> 0);
  const base = parse(fileOf(spec, b, [], []));
  const seq = carve(base, spec, rng);
  tidy(base, seq, spec, rng);
  const one = deal(seq, spec.tracks, 0, rng);
  const [lo] = spec.car;
  const split: CarDef[] = [];
  for (const c of seq) {
    if (c.n >= Math.max(lo * 2, 10)) split.push({ c: c.c, n: Math.ceil(c.n / 2) }, { c: c.c, n: Math.floor(c.n / 2) });
    else split.push({ ...c });
  }
  const two = inOrder(base, split) ? deal(split, spec.tracks, 0, rng) : one;
  return [one, two];
}

function build(spec: Spec): void {
  const b = board(spec);
  let best: Candidate | null = null;
  for (let seed = 0; seed < TRIES; seed++) {
    const c = candidate(spec, b, seed);
    if (!c) continue;
    if (!best || c.score < best.score) best = c;
    if (best.score === 0) break;
  }
  if (!best) throw new Error(`第 ${spec.id} 关生成不出来`);
  const file = best.file;
  file.ease = easeVariants(spec, b);
  for (const [i, v] of file.ease.entries()) {
    const lv = parse(file, i + 1);
    if (problems(lv).length > 0 || replay(lv, v.solution).status !== Status.WON) throw new Error(`第 ${spec.id} 关降 ${i + 1} 档的参考解没过`);
  }
  const cars = file.tracks.reduce((a, t) => a + t.length, 0);
  const beads = parse(file).beads;
  file.meta = {
    seed: best.seed,
    beads,
    cars,
    random: Math.round(best.m.random * 100),
    safe: Math.round(best.m.safe * 100),
    minSlots: best.m.minSlots,
    onTarget: best.score === 0,
  };
  writeFileSync(join(OUT, `${fileName(spec.id)}.json`), `${JSON.stringify(file)}\n`);
  const pct = (v: number): string => `${Math.round(v * 100)}%`.padStart(4);
  console.log(
    `${best.score === 0 ? '✓' : '△'} 第 ${String(spec.id).padStart(3)} 关 ${file.kind.padEnd(6)} ${b.w}×${b.h}×${b.layers.length} ${String(beads).padStart(3)} 颗 ${String(cars).padStart(2)} 节 ` +
      `随手点 ${pct(best.m.random)} 稳妥点 ${pct(best.m.safe)} 最少占位 ${best.m.minSlots}  ${file.name}` +
      (best.score === 0 ? '' : `  （目标：随手点 ${spec.target.random.join('–')}，稳妥点 ${spec.target.safe.join('–')}）`),
  );
}

mkdirSync(OUT, { recursive: true });
const [from = 1, to = Infinity] = process.argv.slice(2).map(Number);
for (const spec of SPECS) if (spec.id >= from && spec.id <= to) build(spec);
