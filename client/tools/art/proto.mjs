#!/usr/bin/env node
// 代码画的图（SVG，按 3 倍渲染）：拼豆、小队方块、铁轨、三个技能图标。小人、火车、小桥、花草是 Codex 画的，由 tools/art/sprites.py 切出来。
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

// ---- 拼豆（显示 40 × 50）：带厚度的小方块，看着是立体的：左上亮、右下暗、侧面最深，面上一小条高光。
// 局内整张染色：白 → 豆的颜色，灰 → 深一档
out(
  'kit/bead',
  40,
  50,
  `<rect x="0" y="9" width="40" height="41" rx="7" fill="#8f8f8f"/>
   <rect x="0" y="0" width="40" height="40" rx="7" fill="#c9c9c9"/>
   <rect x="1.5" y="1.5" width="35" height="35" rx="6" fill="#ffffff"/>
   <rect x="4" y="4" width="33" height="33" rx="5" fill="#eeeeee"/>
   <rect x="6.5" y="6.5" width="13" height="5" rx="2.5" fill="#ffffff"/>`,
);

// ---- 小队方块（显示 100 × 92）：圆角方块，下面压一道深边；整张染色
out(
  'kit/block_body',
  100,
  92,
  `<rect x="0" y="12" width="100" height="80" rx="20" fill="#a8a8a8"/>
   <rect x="0" y="0" width="100" height="78" rx="20" fill="#fff"/>`,
);
// 最前排的白边
out(
  'kit/block_rim',
  112,
  104,
  `<rect x="3" y="3" width="106" height="98" rx="25" fill="none" stroke="#fff" stroke-width="6"/>`,
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
