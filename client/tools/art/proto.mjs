#!/usr/bin/env node
// 代码画的图（SVG，按 3 倍渲染）：拼豆、小人抱着的豆、小队方块、铁轨、三个技能图标。小人、火车、小船、花草是 Codex 画的，由 tools/art/sprites.py 切出来。
// 白色的图（bead、block_body）局内按颜色染色：白 → 那个颜色，灰 → 深一档。
// 用法：node tools/art/proto.mjs，然后 ./run.sh art-compress（量化 + 补 .meta）
import { Resvg } from '@resvg/resvg-js';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const UI = join(ROOT, 'assets/resources/ui');
const RES = 3;

function out(path, w, h, body) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w * RES}" height="${h * RES}" viewBox="0 0 ${w} ${h}">${body}</svg>`;
  const png = new Resvg(svg, { fitTo: { mode: 'original' } }).render().asPng();
  const file = join(UI, `${path}.png`);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, png);
  console.log(`✓ ${path}.png ${w * RES}×${h * RES}`);
}

// ---- 拼豆（显示 40 × 50）：带厚度的小方块，照效果图的样子：圆角的面只占一格的八成多（33），下面永远露一条深一档的侧面，
// 整幅画是一颗颗凸起来的。面是纯白（染出来就是色板上那个颜色，不压暗）。面的圆角外面垫着同色深一档的底，
// 相邻的豆之间看到的缝是这个颜色深一点的样子，不会透出下面的草地。局内整张染色：白 → 豆的颜色，灰 → 深一档
out(
  'kit/bead',
  40,
  50,
  `<rect x="0" y="0" width="40" height="24" fill="#cdcdcd"/>
   <rect x="0" y="8" width="40" height="42" rx="6" fill="#bababa"/>
   <rect x="0.8" y="0.8" width="38.4" height="32.4" rx="7.5" fill="#ffffff"/>`,
);

// ---- 拼豆的高光片（显示 40 × 50，不染色，叠在豆上面）：面的上半截一片柔光、左上角一小条高光、侧面下沿压暗一点。
// 豆本体是整张染色的（乘法染色提不亮），光泽只能用这张不染色的叠出来；柔光不能重，重了颜色发白
out(
  'kit/bead_top',
  40,
  50,
  `<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="0.34"/><stop offset="0.62" stop-color="#fff" stop-opacity="0"/></linearGradient></defs>
   <rect x="0.8" y="0.8" width="38.4" height="32.4" rx="7.5" fill="url(#g)"/>
   <rect x="5.5" y="4.5" width="10" height="4.5" rx="2.25" fill="#fff" fill-opacity="0.6"/>
   <rect x="0" y="40" width="40" height="10" rx="5" fill="#000" fill-opacity="0.06"/>`,
);

// ---- 小人抱着的豆（显示 40 × 44）：斜着看的小方块，看得到上面和两个侧面；整张染色
out(
  'kit/cube',
  40,
  44,
  `<g stroke-linejoin="round" stroke-width="2">
   <path d="M2 11 L20 21 L20 42 L2 32 Z" fill="#d4d4d4" stroke="#d4d4d4"/>
   <path d="M20 21 L38 11 L38 32 L20 42 Z" fill="#a9a9a9" stroke="#a9a9a9"/>
   <path d="M20 2 L38 11 L20 21 L2 11 Z" fill="#ffffff" stroke="#ffffff"/></g>`,
);
// 抱着的豆的高光（不染色）：上面那一面亮一点
out(
  'kit/cube_top',
  40,
  44,
  `<path d="M20 3 L36 11 L20 19.5 L4 11 Z" fill="#fff" fill-opacity="0.3"/>
   <path d="M8 10 L19 4.5 L22 6 L11 11.5 Z" fill="#fff" fill-opacity="0.45"/>`,
);

// ---- 小队方块（显示 100 × 84）：圆角方块，下面压一道厚的深边（比例照效果图：扁一点、底边厚）；整张染色
out(
  'kit/block_body',
  100,
  84,
  `<rect x="0" y="16" width="100" height="68" rx="20" fill="#b0b0b0"/>
   <rect x="0" y="0" width="100" height="68" rx="20" fill="#fff"/>`,
);
// 方块面上的高光（不染色，叠在方块上）：上半截一片柔光
out(
  'kit/block_top',
  100,
  84,
  `<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="0.3"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient></defs>
   <rect x="5" y="4" width="90" height="30" rx="15" fill="url(#g)"/>`,
);
// 最前排的白边
out(
  'kit/block_rim',
  112,
  96,
  `<rect x="3" y="3" width="106" height="90" rx="25" fill="none" stroke="#fff" stroke-width="6"/>`,
);

// ---- 铁轨（显示 60 × 18，横着平铺）
out(
  'kit/track',
  60,
  18,
  `<rect x="4" y="7" width="12" height="11" rx="2" fill="#8a5a2c"/><rect x="24" y="7" width="12" height="11" rx="2" fill="#8a5a2c"/><rect x="44" y="7" width="12" height="11" rx="2" fill="#8a5a2c"/>
   <rect x="0" y="2" width="60" height="6" fill="#aab3c2"/><rect x="0" y="6" width="60" height="2" fill="#7f8898"/>`,
);
// ---- 技能图标（显示 128 × 128）
const plate = (c1, c2) =>
  `<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs>`;
// 加位：一个空的装车位，右上角一个加号
out(
  'icon/skill_slot',
  128,
  128,
  `${plate('#7fd0ff', '#3b8be8')}
   <rect x="18" y="34" width="78" height="70" rx="16" fill="url(#g)" stroke="#1d4f9c" stroke-width="5"/>
   <rect x="32" y="48" width="50" height="42" rx="9" fill="#1d4f9c" fill-opacity="0.35"/>
   <circle cx="92" cy="38" r="25" fill="#48c744" stroke="#1f7a2b" stroke-width="5"/>
   <path d="M92 25 V51 M79 38 H105" stroke="#fff" stroke-width="8" stroke-linecap="round"/>`,
);
// 调车：后面的车厢绕到前面
out(
  'icon/skill_shunt',
  128,
  128,
  `${plate('#ffd257', '#f59a1c')}
   <rect x="14" y="66" width="44" height="30" rx="8" fill="#9fb2cc" stroke="#55627a" stroke-width="5"/>
   <rect x="70" y="66" width="44" height="30" rx="8" fill="url(#g)" stroke="#a85b06" stroke-width="5"/>
   <circle cx="27" cy="100" r="8" fill="#2b3040"/><circle cx="46" cy="100" r="8" fill="#2b3040"/>
   <circle cx="83" cy="100" r="8" fill="#2b3040"/><circle cx="102" cy="100" r="8" fill="#2b3040"/>
   <path d="M92 56 C88 24, 44 20, 36 46" fill="none" stroke="#3b8be8" stroke-width="9" stroke-linecap="round"/>
   <path d="M22 36 L36 54 L52 38 Z" fill="#3b8be8"/>`,
);
// 磁铁：马蹄形磁铁
out(
  'icon/skill_magnet',
  128,
  128,
  `<path d="M30 30 V70 A34 34 0 0 0 98 70 V30 H74 V70 A10 10 0 0 1 54 70 V30 Z" fill="#f2473b" stroke="#8f211a" stroke-width="5" stroke-linejoin="round"/>
   <rect x="27.5" y="20" width="29" height="22" rx="4" fill="#e6ebf3" stroke="#6d7688" stroke-width="5"/>
   <rect x="71.5" y="20" width="29" height="22" rx="4" fill="#e6ebf3" stroke="#6d7688" stroke-width="5"/>
   <path d="M18 14 L24 22 M110 14 L104 22 M64 4 V14" stroke="#ffd21f" stroke-width="6" stroke-linecap="round"/>`,
);
