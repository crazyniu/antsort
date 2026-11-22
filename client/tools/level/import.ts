// 把一张像素画图片转成关卡用的格子图（docs/02 第 4 节的图库）：npx tsx tools/level/import.ts <图片> <名字> <中文名> [最多几种颜色=8]
// 图是 Codex 按 art/briefs 画的（每个像素是一个纯色方块、铺满整张图，背景是品红）。做法：
//   1. 认出图里实际是几格（Codex 画的格数常常和要的差一两格，照要的格数去取颜色细节会错位）；
//   2. 每格取中间一块的颜色；品红的背景算空格子（画的外面）；
//   3. 相近的颜色并成一种，太少的颜色并进最接近的；
//   4. 每种颜色换成拼豆色板（PALETTE）里最接近的那个：整个游戏的豆都用这一套鲜艳的颜色；
//   5. 写成 tools/level/pictures/<名字>.json，另出一张预览图检查转得对不对。
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const HERE = dirname(fileURLToPath(import.meta.url));
const [file, name, title, nArg, kArg] = process.argv.slice(2);
// 以前第 4 个参数是格数，现在格数是从图里认出来的；只给一个数字就当「最多几种颜色」
if (!file || !name) {
  console.error('用法：npx tsx tools/level/import.ts <图片> <名字> <中文名> [最多几种颜色=8]');
  process.exit(1);
}
const K = Number(kArg ?? nArg ?? 8);
/** 两种颜色差多少以内算一种（RGB 距离） */
const NEAR = 46;
/** 一种颜色少于几格就并进最接近的（零星的杂色） */
const RARE = 3;
/** 背景色（品红）：离它这么近的格子算空的 */
const BG: [number, number, number] = [255, 0, 255];
const BG_NEAR = 120;
/** 拼豆色板（用户 2026-11-22 给的，docs/01 第 3 节）：整个游戏的豆只用这些颜色，每幅画挑几种 */
const PALETTE = [
  '#F4E8C9', // 奶油白（白色一律用它，不用死白）
  '#FFA21A', // 金橙
  '#FFE129', // 柠檬黄
  '#F6B39F', // 蜜桃粉
  '#19CEEC', // 青蓝
  '#129FE7', // 天蓝
  '#A8E522', // 青柠绿
  '#15C47B', // 翠绿
  '#FF7386', // 珊瑚粉
  '#F43D47', // 鲜红
  '#EF32BC', // 玫红
  '#9F565B', // 玫瑰棕（描边）
  '#5C4DEA', // 蓝紫（描边）
  '#8C38C9', // 葡萄紫（描边）
  '#45464C', // 炭灰（描边；不用纯黑）
];

type RGB = [number, number, number];
const dist = (a: RGB, b: RGB): number => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/**
 * 认格子：格子线上左右（上下）两边的颜色差得多。找一个格子边长 p 和起点 o，让几乎所有「颜色有变化的地方」都落在格子线上；
 * 这样的 p 里挑最大的（p 的一半、三分之一也都对得上，但那是把一格切碎了）。返回 [边长, 起点]
 */
function detect(data: Buffer, W: number, H: number, horizontal: boolean): [number, number] {
  const L = horizontal ? W : H;
  const M = horizontal ? H : W;
  const edge = new Float64Array(L);
  let max = 0;
  for (let i = 1; i < L; i++) {
    let sum = 0;
    for (let j = 0; j < M; j += 2) {
      const a = horizontal ? (j * W + i) * 3 : (i * W + j) * 3;
      const b = horizontal ? (j * W + i - 1) * 3 : ((i - 1) * W + j) * 3;
      sum += Math.abs(data[a] - data[b]) + Math.abs(data[a + 1] - data[b + 1]) + Math.abs(data[a + 2] - data[b + 2]);
    }
    edge[i] = sum;
    max = Math.max(max, sum);
  }
  // 太弱的不算（压缩的噪点）
  let total = 0;
  for (let i = 0; i < L; i++) {
    if (edge[i] < max * 0.08) edge[i] = 0;
    total += edge[i];
  }
  const R = 3;
  let best: [number, number] = [L / 32, 0];
  for (let p = L / 6; p >= L / 80; p -= 0.1) {
    let top = 0;
    let topO = 0;
    for (let o = 0; o < p; o += 0.5) {
      let on = 0;
      for (let x = o; x < L + R; x += p) {
        const c = Math.round(x);
        for (let d = -R; d <= R; d++) if (c + d > 0 && c + d < L) on += edge[c + d];
      }
      if (on > top) {
        top = on;
        topO = o;
      }
    }
    if (top >= total * 0.9) {
      best = [p, topO];
      break;
    }
  }
  return best;
}

async function main(): Promise<void> {
  const { data, info } = await sharp(file).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width;
  const H = info.height;
  const [px, ox] = detect(data, W, H, true);
  const [py, oy] = detect(data, W, H, false);
  // 两个方向的格子应该一样大：取小的那个（另一个方向可能正好没有奇数格的边，认成了两倍）
  const P = Math.min(px, py);
  const startX = px > P * 1.5 ? ox % P : ox;
  const startY = py > P * 1.5 ? oy % P : oy;
  // 格子从起点往两边铺，中心落在图里的都算
  const xs: number[] = [];
  for (let x = startX - Math.ceil(startX / P) * P + P / 2; x < W; x += P) if (x > 0) xs.push(x);
  const ys: number[] = [];
  for (let y = startY - Math.ceil(startY / P) * P + P / 2; y < H; y += P) if (y > 0) ys.push(y);
  const NX = xs.length;
  const NY = ys.length;
  // 每格取中间 40% 那一块各通道的中位数（躲开格子边上的杂边）
  const cells: RGB[] = [];
  for (const cy of ys) {
    for (const cx of xs) {
      const x0 = Math.max(0, Math.floor(cx - P * 0.2));
      const x1 = Math.min(W, Math.max(x0 + 1, Math.floor(cx + P * 0.2)));
      const y0 = Math.max(0, Math.floor(cy - P * 0.2));
      const y1 = Math.min(H, Math.max(y0 + 1, Math.floor(cy + P * 0.2)));
      const ch: number[][] = [[], [], []];
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) for (let c = 0; c < 3; c++) ch[c].push(data[(y * W + x) * 3 + c]);
      cells.push(ch.map((v) => v.sort((a, b) => a - b)[v.length >> 1]) as RGB);
    }
  }
  const empty = cells.map((c) => dist(c, BG) < BG_NEAR);
  // 相近的颜色并成一种：每一格归到第一个够近的颜色，没有就新开一种
  let groups: { sum: RGB; n: number }[] = [];
  const mean = (g: { sum: RGB; n: number }): RGB => [g.sum[0] / g.n, g.sum[1] / g.n, g.sum[2] / g.n];
  let owner = cells.map((c, i) => {
    if (empty[i]) return -1;
    let at = groups.findIndex((g) => dist(mean(g), c) < NEAR);
    if (at < 0) at = groups.push({ sum: [0, 0, 0], n: 0 }) - 1;
    const g = groups[at];
    g.sum = [g.sum[0] + c[0], g.sum[1] + c[1], g.sum[2] + c[2]];
    g.n++;
    return at;
  });
  // 太少的、超出上限的：最少的那种并进最接近的
  for (;;) {
    const live = groups.map((g, i) => ({ g, i })).filter((x) => x.g.n > 0);
    live.sort((a, b) => a.g.n - b.g.n);
    const small = live[0];
    if (live.length <= 1 || (live.length <= K && small.g.n >= RARE)) break;
    let best = live[1];
    for (const o of live.slice(1)) if (dist(mean(o.g), mean(small.g)) < dist(mean(best.g), mean(small.g))) best = o;
    // 并过去以后颜色不跟着变（少数那种是杂色，别把主色带偏）
    best.g.sum = [best.g.sum[0] * (1 + small.g.n / best.g.n), best.g.sum[1] * (1 + small.g.n / best.g.n), best.g.sum[2] * (1 + small.g.n / best.g.n)];
    best.g.n += small.g.n;
    small.g.n = 0;
    owner = owner.map((o) => (o === small.i ? best.i : o));
  }
  const live = groups.map((g, i) => ({ g, i })).filter((x) => x.g.n > 0);
  live.sort((a, b) => b.g.n - a.g.n);
  // 换成色板里的颜色：格子多的颜色先挑，每种色板颜色只给一种（两种颜色挑到同一个，后来的拿次接近的）
  const rgbOf = (h: string): RGB => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const used = new Set<string>();
  const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const letterOf = new Map(live.map((x, k) => [x.i, LETTERS[k]]));
  const colors: Record<string, string> = {};
  live.forEach((x, k) => {
    const c = mean(x.g);
    const pick = PALETTE.filter((h) => !used.has(h)).sort((a, b) => dist(rgbOf(a), c) - dist(rgbOf(b), c))[0];
    used.add(pick);
    colors[LETTERS[k]] = pick;
  });
  // 认出来的格子可能比画里真正的「一个像素」小（一个像素被切成了 2×2、3×3 格）：试着几格并一格，
  // 并完以后几乎每一块里面都是同一种颜色，就按并了的算（挑能并得最多的）
  let grid = owner;
  let GW = NX;
  let GH = NY;
  for (const f of [4, 3, 2]) {
    let pick: { ax: number; ay: number; ok: number } | null = null;
    for (let ay = 0; ay < f; ay++) {
      for (let ax = 0; ax < f; ax++) {
        let same = 0;
        let all = 0;
        for (let y = ay; y + f <= NY; y += f) {
          for (let x = ax; x + f <= NX; x += f) {
            const v = owner[y * NX + x];
            let uni = true;
            for (let dy = 0; dy < f && uni; dy++) for (let dx = 0; dx < f; dx++) if (owner[(y + dy) * NX + x + dx] !== v) uni = false;
            all++;
            if (uni) same++;
          }
        }
        const ok = all > 0 ? same / all : 0;
        if (!pick || ok > pick.ok) pick = { ax, ay, ok };
      }
    }
    if (pick && pick.ok >= 0.95) {
      const out: number[] = [];
      GW = Math.floor((NX - pick.ax) / f);
      GH = Math.floor((NY - pick.ay) / f);
      for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) out.push(owner[(pick.ay + y * f + (f >> 1)) * NX + pick.ax + x * f + (f >> 1)]);
      grid = out;
      break;
    }
  }
  const rows: string[] = [];
  for (let y = 0; y < GH; y++) rows.push(grid.slice(y * GW, (y + 1) * GW).map((o) => (o < 0 ? '.' : letterOf.get(o))).join(''));
  // 四边整行整列都是空的去掉
  while (rows.length > 1 && /^\.+$/.test(rows[0])) rows.shift();
  while (rows.length > 1 && /^\.+$/.test(rows[rows.length - 1])) rows.pop();
  while (rows[0].length > 1 && rows.every((r) => r[0] === '.')) rows.forEach((r, i) => (rows[i] = r.slice(1)));
  while (rows[0].length > 1 && rows.every((r) => r[r.length - 1] === '.')) rows.forEach((r, i) => (rows[i] = r.slice(0, -1)));
  const out = join(HERE, 'pictures', `${name}.json`);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, `${JSON.stringify({ name: title ?? name, colors, rows }, null, 1)}\n`);
  // 预览：左边原图，右边转出来的
  const S = 16;
  const PW = rows[0].length * S;
  const PH = rows.length * S;
  const buf = Buffer.alloc(PW * PH * 3);
  for (let y = 0; y < PH; y++) {
    for (let x = 0; x < PW; x++) {
      const ch = rows[Math.floor(y / S)][Math.floor(x / S)];
      const v = ch === '.' ? 0x2a2a2a : parseInt(colors[ch].slice(1), 16);
      const edge = ch !== '.' && (x % S === 0 || y % S === 0) ? 0.82 : 1;
      buf[(y * PW + x) * 3] = ((v >> 16) & 255) * edge;
      buf[(y * PW + x) * 3 + 1] = ((v >> 8) & 255) * edge;
      buf[(y * PW + x) * 3 + 2] = (v & 255) * edge;
    }
  }
  const right = await sharp(buf, { raw: { width: PW, height: PH, channels: 3 } }).png().toBuffer();
  const LS = Math.max(PW, PH);
  const left = await sharp(file).resize(LS, LS).png().toBuffer();
  const preview = process.env.PREVIEW_DIR ? join(process.env.PREVIEW_DIR, `${name}.png`) : join(dirname(file), `${name}_preview.png`);
  await sharp({ create: { width: LS + PW + 8, height: LS, channels: 3, background: '#222' } })
    .composite([{ input: left, left: 0, top: 0 }, { input: right, left: LS + 8, top: 0 }])
    .png()
    .toFile(preview);
  const beads = rows.join('').replace(/\./g, '').length;
  console.log(`✓ ${name}：图里一格 ${P.toFixed(1)} 像素、${NX}×${NY} 格，去掉空边后 ${rows[0].length}×${rows.length}，${beads} 颗，${live.length} 种颜色（${live.map((_, k) => colors[LETTERS[k]]).join(' ')}） → ${out}`);
}

void main();
