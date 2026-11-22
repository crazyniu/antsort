#!/usr/bin/env node
// 原型用的图（代码画的 SVG，按 3 倍渲染）：拼豆、小队方块、小人、火车、铁轨、小桥、三个技能图标。正式美术由 Codex 出（docs/03），到时同名替换。
// 白色的图（bead、block_body、worker_body）局内按颜色染色：白 → 那个颜色，灰 → 深一档。
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

// ---- 小人（显示 40 × 48）：俯视 3/4 的圆头小搬运工。*_body 是帽子和衣服（白的，局内染成小队的颜色），*_top 是脸、手、脚
out(
  'kit/worker_body',
  40,
  48,
  `<rect x="10.5" y="26" width="19" height="17" rx="7.5" fill="#fff"/>
   <rect x="10.5" y="36" width="19" height="7" rx="3.5" fill="#c9c9c9"/>
   <path d="M7 18 A13 13 0 0 1 33 18 Z" fill="#fff"/>
   <rect x="5" y="15.5" width="30" height="5.5" rx="2.75" fill="#dcdcdc"/>`,
);
out(
  'kit/worker_top',
  40,
  48,
  `<ellipse cx="14.5" cy="44.5" rx="5" ry="3.2" fill="#3a3348"/>
   <ellipse cx="25.5" cy="44.5" rx="5" ry="3.2" fill="#3a3348"/>
   <path d="M8.5 21 H31.5 A11.5 10.5 0 0 1 8.5 21 Z" fill="#ffd9b3"/>
   <circle cx="15.3" cy="24.6" r="1.9" fill="#3a3348"/><circle cx="24.7" cy="24.6" r="1.9" fill="#3a3348"/>
   <ellipse cx="12" cy="27.4" rx="2.2" ry="1.3" fill="#ff9d8a" fill-opacity="0.7"/><ellipse cx="28" cy="27.4" rx="2.2" ry="1.3" fill="#ff9d8a" fill-opacity="0.7"/>
   <circle cx="8.6" cy="33.5" r="3.6" fill="#ffd9b3"/><circle cx="31.4" cy="33.5" r="3.6" fill="#ffd9b3"/>`,
);

// ---- 火车头（显示 156 × 112，朝右）
out(
  'kit/loco',
  156,
  112,
  `<rect x="100" y="14" width="18" height="30" rx="3" fill="#3a3348"/>
   <rect x="95" y="10" width="28" height="9" rx="4.5" fill="#55506a"/>
   <rect x="52" y="44" width="84" height="40" rx="14" fill="#f2473b"/>
   <rect x="52" y="68" width="84" height="16" rx="8" fill="#c2332a"/>
   <rect x="74" y="44" width="8" height="40" fill="#ffc531"/>
   <rect x="8" y="22" width="52" height="62" rx="8" fill="#f2473b"/>
   <rect x="8" y="66" width="52" height="18" rx="8" fill="#c2332a"/>
   <rect x="2" y="14" width="64" height="12" rx="6" fill="#c2332a"/>
   <rect x="18" y="32" width="30" height="24" rx="5" fill="#bfe8ff"/>
   <circle cx="138" cy="60" r="9" fill="#ffc531"/><circle cx="138" cy="60" r="4.5" fill="#fff3c4"/>
   <path d="M134 84 H150 L156 100 H134 Z" fill="#9aa3b2"/>
   <rect x="4" y="82" width="140" height="10" rx="5" fill="#3a3348"/>
   <circle cx="26" cy="94" r="15" fill="#3a3348"/><circle cx="26" cy="94" r="6.5" fill="#ffc531"/>
   <circle cx="70" cy="97" r="12" fill="#3a3348"/><circle cx="70" cy="97" r="5" fill="#ffc531"/>
   <circle cx="104" cy="97" r="12" fill="#3a3348"/><circle cx="104" cy="97" r="5" fill="#ffc531"/>`,
);
// ---- 车厢（显示 112 × 84）：*_back 是斗里面，*_front 是前挡板和轮子；装的小方块夹在两张中间
out(
  'kit/wagon_back',
  112,
  84,
  `<rect x="8" y="26" width="96" height="40" rx="5" fill="#6a3d1c"/>`,
);
out(
  'kit/wagon_front',
  112,
  84,
  `<rect x="0" y="60" width="112" height="6" rx="3" fill="#3a3348"/>
   <rect x="4" y="38" width="104" height="30" rx="7" fill="#c47a35"/>
   <rect x="4" y="56" width="104" height="12" rx="6" fill="#96571f"/>
   <rect x="4" y="38" width="104" height="7" rx="3.5" fill="#e09a52"/>
   <circle cx="28" cy="72" r="11" fill="#3a3348"/><circle cx="28" cy="72" r="4.5" fill="#cfd6e4"/>
   <circle cx="84" cy="72" r="11" fill="#3a3348"/><circle cx="84" cy="72" r="4.5" fill="#cfd6e4"/>`,
);
// ---- 铁轨（显示 60 × 18，横着平铺）
out(
  'kit/track',
  60,
  18,
  `<rect x="4" y="7" width="12" height="11" rx="2" fill="#8a5a2c"/><rect x="24" y="7" width="12" height="11" rx="2" fill="#8a5a2c"/><rect x="44" y="7" width="12" height="11" rx="2" fill="#8a5a2c"/>
   <rect x="0" y="2" width="60" height="6" fill="#aab3c2"/><rect x="0" y="6" width="60" height="2" fill="#7f8898"/>`,
);
// ---- 小桥（显示 84 × 160，竖着跨过铁轨）
out(
  'kit/bridge',
  84,
  160,
  `<rect x="6" y="0" width="72" height="160" rx="10" fill="#d9dde6"/>
   <path d="M6 32 H78 M6 64 H78 M6 96 H78 M6 128 H78" stroke="#b9c0cd" stroke-width="3"/>
   <path d="M42 0 V32 M24 32 V64 M60 32 V64 M42 64 V96 M24 96 V128 M60 96 V128 M42 128 V160" stroke="#b9c0cd" stroke-width="3"/>
   <rect x="0" y="0" width="12" height="160" rx="6" fill="#9aa3b2"/><rect x="72" y="0" width="12" height="160" rx="6" fill="#9aa3b2"/>
   <rect x="0" y="0" width="12" height="160" rx="6" fill="none"/>`,
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
