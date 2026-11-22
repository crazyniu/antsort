// 每一关用哪几幅画、多少条待发线、车厢多大、要多难（docs/02 第 5 节）。build.ts 按它生成关卡文件。
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
  // 1–2：基本操作，怎么点都能过
  { id: 1, layers: ['popsicle'], tracks: 2, car: [4, 30], maxCars: 4, mechanics: [], target: { random: [1, 1], safe: [1, 1] } },
  { id: 2, layers: ['apple'], tracks: 2, car: [4, 40], maxCars: 5, mechanics: [], target: { random: [1, 1], safe: [1, 1] } },
  // 3：被围住的颜色挖不到，叫早了占位
  { id: 3, layers: ['egg_fried'], tracks: 2, car: [8, 20], mechanics: [], target: { random: [0.85, 1], safe: [1, 1] } },
  // 4：技能「加位」的教学关
  { id: 4, layers: ['melon'], tracks: 2, car: [6, 16], mechanics: [], target: { random: [0.85, 1], safe: [1, 1] } },
  // 5：第一个难关
  { id: 5, layers: ['mushroom'], tracks: 2, car: [6, 18], mechanics: [], target: { random: [0.25, 0.45], safe: [0.7, 0.9] } },
  // 6：双层画首发（教学关），待发线变 3 条
  { id: 6, layers: ['chick', 'eggshell'], tracks: 3, car: [4, 80], maxCars: 5, mechanics: ['layers'], target: { random: [1, 1], safe: [1, 1] } },
  // 7：双层练习
  { id: 7, layers: ['bear', 'gift'], tracks: 3, car: [6, 20], mechanics: ['layers'], target: { random: [0.8, 0.95], safe: [1, 1] } },
  // 8：技能「调车」
  { id: 8, layers: ['rainbow', 'cloud'], tracks: 3, car: [6, 18], mechanics: ['layers'], target: { random: [0.75, 0.95], safe: [1, 1] } },
  // 9：技能「透视」
  { id: 9, layers: ['gems', 'chest'], tracks: 3, car: [6, 18], mechanics: ['layers'], target: { random: [0.7, 0.9], safe: [1, 1] } },
  // 10：第一个超难关，开始限时
  { id: 10, layers: ['cat', 'cake'], tracks: 3, car: [8, 22], timeLimit: 150, mechanics: ['layers'], target: { random: [0.1, 0.3], safe: [0.6, 0.85] } },
];
