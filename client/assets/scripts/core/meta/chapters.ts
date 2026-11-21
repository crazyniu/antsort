// 章节：地图页上一大段关卡一章（背景、名字、收藏册可以按章分）。数值在 economy.json 的 chapters。
import type { Chapter, EconomyConfig } from '../config';

export function list(eco: EconomyConfig): Chapter[] {
  return eco.chapters ?? [];
}

/** 第 fileId 关（传 Meta.levelFile 换算后的编号）在第几章，返回下标 */
export function forLevel(eco: EconomyConfig, fileId: number): number {
  const all = list(eco);
  let at = 0;
  for (let i = 0; i < all.length; i++) if (fileId >= all[i].levelFrom) at = i;
  return at;
}
