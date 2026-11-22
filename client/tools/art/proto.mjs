#!/usr/bin/env node
// 原型用的占位图（代码画的 SVG，按 3 倍渲染）：车厢、小挖机、三个技能图标。正式美术由 Codex 出（docs/03），到时同名替换。
// 车厢和挖机各分两张：*_body 是纯白的，局内按豆的颜色染色；*_top 是不染色的细节（轮子、窗、铲斗），叠在上面。
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

// ---- 车厢（显示 120 × 80）：敞口的货车斗
out(
  'kit/wagon_body',
  120,
  80,
  `<path d="M8 14 H112 a6 6 0 0 1 6 6 V52 a10 10 0 0 1 -10 10 H12 a10 10 0 0 1 -10 -10 V20 a6 6 0 0 1 6 -6 Z" fill="#fff"/>`,
);
out(
  'kit/wagon_top',
  120,
  80,
  `<rect x="2" y="14" width="116" height="9" rx="4.5" fill="#000" fill-opacity="0.22"/>
   <rect x="2" y="50" width="116" height="12" rx="6" fill="#000" fill-opacity="0.16"/>
   <rect x="20" y="60" width="80" height="6" rx="3" fill="#2b3040"/>
   <circle cx="30" cy="66" r="11" fill="#2b3040"/><circle cx="30" cy="66" r="4.5" fill="#cfd6e4"/>
   <circle cx="90" cy="66" r="11" fill="#2b3040"/><circle cx="90" cy="66" r="4.5" fill="#cfd6e4"/>`,
);

// ---- 小挖机（显示 56 × 56，朝右）
out(
  'kit/digger_body',
  56,
  56,
  `<rect x="6" y="22" width="26" height="18" rx="5" fill="#fff"/>
   <path d="M10 24 V13 a4 4 0 0 1 4 -4 H22 a4 4 0 0 1 4 4 V24 Z" fill="#fff"/>
   <path d="M27 27 L37 9 L48 21" fill="none" stroke="#fff" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>`,
);
out(
  'kit/digger_top',
  56,
  56,
  `<rect x="13" y="12.5" width="10" height="8.5" rx="2" fill="#dff3ff"/>
   <rect x="3" y="39" width="33" height="11" rx="5.5" fill="#2b3040"/>
   <circle cx="10" cy="44.5" r="3" fill="#cfd6e4"/><circle cx="19.5" cy="44.5" r="3" fill="#cfd6e4"/><circle cx="29" cy="44.5" r="3" fill="#cfd6e4"/>
   <path d="M43 20 L53 20 L50 31 a3 3 0 0 1 -3 2 L42 33 Z" fill="#2b3040"/>
   <circle cx="37" cy="9" r="2.6" fill="#2b3040"/>`,
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
// 透视：放大镜下面看得到藏着的豆
out(
  'icon/skill_xray',
  128,
  128,
  `${plate('#d9c2ff', '#9a5bd1')}
   <path d="M82 82 L108 108" stroke="#5a3b86" stroke-width="15" stroke-linecap="round"/>
   <circle cx="56" cy="56" r="38" fill="url(#g)" stroke="#5a3b86" stroke-width="7"/>
   <circle cx="44" cy="50" r="10" fill="#f8cb2e"/><circle cx="68" cy="50" r="10" fill="#4cb04a"/>
   <circle cx="44" cy="70" r="10" fill="#e5483f"/><circle cx="68" cy="70" r="10" fill="#3b82e0"/>
   <path d="M34 36 A28 28 0 0 1 60 26" fill="none" stroke="#fff" stroke-opacity="0.8" stroke-width="5" stroke-linecap="round"/>`,
);
