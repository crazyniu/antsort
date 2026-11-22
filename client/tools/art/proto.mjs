#!/usr/bin/env node
// 代码画的图（SVG，按 3 倍渲染）：最前排方块的白边、加速键的图标、四个技能图标。宝石、方块、小人、火车、铁轨、拱桥是 Codex 画的，由 tools/art/sprites.py 切出来。
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




// 最前排的白边
out(
  'kit/block_rim',
  112,
  96,
  `<rect x="3" y="3" width="106" height="90" rx="25" fill="none" stroke="#fff" stroke-width="6"/>`,
);

// ---- 加速键上的图标（显示 64 × 64）：两个朝右的圆角三角（快进），白的，下面压一道淡淡的深色
const ff = (dx, dy, fill, op) =>
  `<g transform="translate(${dx},${dy})" fill="${fill}" fill-opacity="${op}" stroke="${fill}" stroke-opacity="${op}" stroke-width="7" stroke-linejoin="round">
   <path d="M9 16 L29 32 L9 48 Z"/><path d="M35 16 L55 32 L35 48 Z"/></g>`;
out('kit/ic_speed', 64, 64, `${ff(0, 3, '#0b2c66', 0.28)}${ff(0, 0, '#ffffff', 1)}`);

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
// 铲子：一把斜着的小铲子，铲头下面几颗飞起来的豆
out(
  'icon/skill_shovel',
  128,
  128,
  `<g transform="rotate(-35 64 64)">
   <rect x="57" y="10" width="14" height="58" rx="6" fill="#d98b3a" stroke="#8a4b16" stroke-width="5"/>
   <rect x="46" y="6" width="36" height="14" rx="7" fill="#f2b55a" stroke="#8a4b16" stroke-width="5"/>
   <path d="M40 66 H88 V92 Q88 116 64 122 Q40 116 40 92 Z" fill="#c9d3e2" stroke="#55627a" stroke-width="5" stroke-linejoin="round"/>
   <path d="M48 72 H58 V96 Q58 106 52 108" fill="none" stroke="#ffffff" stroke-opacity="0.7" stroke-width="5" stroke-linecap="round"/></g>
   <rect x="86" y="88" width="20" height="20" rx="5" fill="#ff7386" stroke="#9f565b" stroke-width="4"/>
   <rect x="98" y="62" width="16" height="16" rx="4" fill="#ffe129" stroke="#9f565b" stroke-width="4"/>
   <rect x="74" y="104" width="14" height="14" rx="4" fill="#19ceec" stroke="#9f565b" stroke-width="4"/>`,
);
