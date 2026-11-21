// 整数和浮点小工具（结果在各平台一致）。核心层不 import 'cc'，不碰时间、存储、全局随机。

/** 整除：向零取整 */
export function idiv(a: number, b: number): number {
  return Math.trunc(a / b);
}

/** 取模，结果总是非负 */
export function posmod(a: number, b: number): number {
  return ((a % b) + b) % b;
}

/** 四舍五入远离零（C 的 round），不是 Math.round */
export function roundi(x: number): number {
  return x < 0 ? -Math.round(-x) : Math.round(x);
}

export function clampi(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export const clampf = clampi;

/** 线性插值：from + (to - from) * t */
export function lerpf(from: number, to: number, t: number): number {
  return from + (to - from) * t;
}

/** 按步长取整：floor(v / step + 0.5) * step */
export function snappedf(v: number, step: number): number {
  return Math.floor(v / step + 0.5) * step;
}

const f32 = Math.fround;

/** 两点距离按 32 位浮点逐步计算（结果跨平台一致），再当 double 用 */
export function dist32(x1: number, y1: number, x2: number, y2: number): number {
  const dx = f32(f32(x1) - f32(x2));
  const dy = f32(f32(y1) - f32(y2));
  return f32(Math.sqrt(f32(f32(dx * dx) + f32(dy * dy))));
}

/** 数组里有几个等于 v 的元素 */
export function countOf<T>(arr: readonly T[], v: T): number {
  let n = 0;
  for (const x of arr) if (x === v) n++;
  return n;
}

/** 纯 JSON 数据的深拷贝（存档、配置片段） */
export function deepCopy<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

export function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
