// 每一关用哪几幅画、排队区几列、一队的数字多大、要多难（docs/02 第 6 节）。build.ts 按它生成关卡文件。
// 代码里的名字沿用上一版：car = 小队方块，track = 排队区的一列。
// target：两个量具的过关率要落在的区间（随手点、稳妥点），生成器换着种子试，挑最贴近的。

export interface Spec {
  id: number;
  /** 图库里的画，从下到上 */
  layers: string[];
  /** 几条待发线 */
  tracks: number;
  /** 车厢容量大致在这个范围 */
  car: [number, number];
  /** 最多几节车厢（教学关用：不超过装车位数就怎么点都输不了） */
  maxCars?: number;
  /** 限时秒数（难关、超难关，第 10 关起） */
  timeLimit?: number;
  mechanics: string[];
  target: { random: [number, number]; safe: [number, number] };
}

export const SPECS: Spec[] = [
  // 现在只有试玩用的两关（给用户看效果）；正式的前 50 关按 docs/01 第 2.1 节的排布表做
  // 1：怎么点都能过
  { id: 1, layers: ['melon'], tracks: 2, car: [20, 120], maxCars: 5, mechanics: [], target: { random: [1, 1], safe: [1, 1] } },
  // 2：大一点的画，开始有「叫早了白占位子」
  { id: 2, layers: ['shortcake'], tracks: 3, car: [12, 70], mechanics: [], target: { random: [0.6, 0.9], safe: [1, 1] } },
];
