// 关卡校验（./run.sh level-verify [起] [止]）：每一关都生成得出来、参考解按顺序点一定能过。CI 也跑。
// 示例玩法的关卡是现场生成的；换玩法后改成校验自己的关卡文件（CLAUDE.md：进包的关卡必须可解）。
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { LevelsConfig } from '../../assets/scripts/core/config';
import { generate } from '../../assets/scripts/core/demo/level';
import * as Rules from '../../assets/scripts/core/demo/rules';
import { GameState, Status } from '../../assets/scripts/core/demo/rules';

const CONFIG = join(dirname(fileURLToPath(import.meta.url)), '../../assets/resources/config');
const cfg = JSON.parse(readFileSync(join(CONFIG, 'levels.json'), 'utf8')) as LevelsConfig;
const [from = 1, to = cfg.total] = process.argv.slice(2).map(Number);
let bad = 0;
const t0 = Date.now();
for (let id = from; id <= to; id++) {
  for (let ease = 0; ease <= 2; ease++) {
    const lv = generate(cfg, id, ease);
    const s = GameState.fromLevel(lv);
    for (const i of lv.ref) Rules.tap(s, i);
    if (s.status !== Status.WON) {
      bad++;
      console.log(`✗ 第 ${id} 关（降 ${ease} 档）参考解没过`);
    }
  }
}
if (bad > 0) {
  console.error(`✗ ${bad} 关有问题`);
  process.exit(1);
}
console.log(`✓ 第 ${from}–${to} 关（含降档变体）都能过（${Date.now() - t0} 毫秒）`);
