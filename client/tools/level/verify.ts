// 关卡校验（./run.sh level-verify [起] [止]）：每一关都有文件、数据对得上、参考解按顺序点一定能过（含降档变体）。CI 也跑。
// CLAUDE.md：进包的关卡必须可解。关卡文件由 build.ts 生成（docs/02 第 4 节）。
import { fileURLToPath } from 'node:url';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { LevelsConfig } from '../../assets/scripts/core/config';
import { LevelFile, fileName, kindOf, parse, problems } from '../../assets/scripts/core/dig/level';
import * as Rules from '../../assets/scripts/core/dig/rules';
import { GameState, Status } from '../../assets/scripts/core/dig/rules';

const CONFIG = join(dirname(fileURLToPath(import.meta.url)), '../../assets/resources/config');
const cfg = JSON.parse(readFileSync(join(CONFIG, 'levels.json'), 'utf8')) as LevelsConfig;
const [from = 1, to = cfg.total] = process.argv.slice(2).map(Number);
let bad = 0;
const fail = (msg: string): void => {
  bad++;
  console.log(`✗ ${msg}`);
};
const t0 = Date.now();
for (let id = from; id <= to; id++) {
  const path = join(CONFIG, 'levels', `${fileName(id)}.json`);
  if (!existsSync(path)) {
    fail(`第 ${id} 关没有关卡文件 ${fileName(id)}.json`);
    continue;
  }
  const f = JSON.parse(readFileSync(path, 'utf8')) as LevelFile;
  if (f.id !== id) fail(`${fileName(id)}.json 里写的是第 ${f.id} 关`);
  if (f.kind !== kindOf(cfg, id)) fail(`第 ${id} 关的 kind 是 ${f.kind}，按 levels.json 应该是 ${kindOf(cfg, id)}`);
  for (const m of f.mechanics) if (id < (cfg.mechanicFrom[m] ?? Infinity)) fail(`第 ${id} 关用了还没首发的机关 ${m}`);
  for (let ease = 0; ease <= (f.ease?.length ?? 0); ease++) {
    const lv = parse(f, ease);
    for (const p of problems(lv)) fail(`第 ${id} 关（降 ${ease} 档）${p}`);
    const s = GameState.fromLevel(lv);
    for (const t of lv.solution) Rules.tap(s, t);
    if (s.status !== Status.WON) fail(`第 ${id} 关（降 ${ease} 档）参考解没过`);
  }
}
if (bad > 0) {
  console.error(`✗ ${bad} 处有问题`);
  process.exit(1);
}
console.log(`✓ 第 ${from}–${to} 关（含降档变体）都能过（${Date.now() - t0} 毫秒）`);
