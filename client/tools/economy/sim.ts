// 金币的账（./run.sh eco-sim）：用游戏里真实的发奖代码，按「一个活跃玩家每天打几关」跑若干天，
// 看一天挣多少金币、道具要花多少、金币不够时要看几次广告。动 economy.json 的金币、价格、奖励前后都要跑（docs/01）。
// 用法：./run.sh eco-sim [--days=30] [--levels=10] [--win=0.7] [--items=1] [--runs=20] [--no-ads] [--eco=<另一份 economy.json>]
//   --win    不用道具一关能过的概率（示例：难度没有尺子量，先给一个数；有了机器人量具就换成量出来的）
//   --items  输了以后每局最多花几样道具再打（每样把输的概率乘 0.5）
//   --no-ads 没有广告：金币不够就买不了，只能白打
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import type { CardDef, EconomyConfig, LevelsConfig } from '../../assets/scripts/core/config';
import { kindOf } from '../../assets/scripts/core/dig/level';
import * as DailyChallenge from '../../assets/scripts/core/meta/dailyChallenge';
import * as LevelChest from '../../assets/scripts/core/meta/levelChest';
import * as Meta from '../../assets/scripts/core/meta/meta';
import * as PlayerData from '../../assets/scripts/core/meta/playerData';
import * as Settle from '../../assets/scripts/core/meta/settle';
import * as SignIn from '../../assets/scripts/core/meta/signIn';
import * as Skills from '../../assets/scripts/core/meta/skills';
import * as Tasks from '../../assets/scripts/core/meta/tasks';
import * as Wheel from '../../assets/scripts/core/meta/wheel';
import { Rng } from '../../assets/scripts/core/rng/rng';

const CONFIG = join(dirname(fileURLToPath(import.meta.url)), '../../assets/resources/config');
const arg = (k: string, d: string): string => process.argv.find((a) => a.startsWith(`--${k}=`))?.split('=')[1] ?? d;
const flag = (k: string): boolean => process.argv.includes(`--${k}`);
const ecoPath = arg('eco', join(CONFIG, 'economy.json'));
const eco = JSON.parse(readFileSync(resolve(ecoPath), 'utf8')) as EconomyConfig;
const levels = JSON.parse(readFileSync(join(CONFIG, 'levels.json'), 'utf8')) as LevelsConfig;
const cards = (JSON.parse(readFileSync(join(CONFIG, 'cards.json'), 'utf8')) as { cards: CardDef[] }).cards;
const DAYS = Number(arg('days', '30'));
const PER_DAY = Number(arg('levels', '10'));
const WIN = Number(arg('win', '0.7'));
const ITEMS = Number(arg('items', '1'));
const RUNS = Number(arg('runs', '20'));
const ADS = !flag('no-ads');

interface Tally {
  earned: number;
  spent: number;
  ads: number;
  levels: number;
}

function run(seed: number): Tally {
  const rng = new Rng(seed);
  const save = PlayerData.create(eco);
  const t: Tally = { earned: 0, spent: 0, ads: 0, levels: 0 };
  const earn = (f: () => unknown): void => {
    const before = save.coins;
    f();
    t.earned += Math.max(0, save.coins - before);
  };
  for (let d = 0; d < DAYS; d++) {
    const day = 1000 + d;
    const now = day * 86400;
    if (SignIn.canClaim(save, day)) earn(() => SignIn.claim(save, eco, cards, rng, day, now));
    if (ADS) for (let i = 0; i < eco.freeCoin.daily; i++) if (Meta.takeFreeCoin(save, eco, day)) t.ads++;
    let played = 0;
    let won = 0;
    while (won < PER_DAY && played < PER_DAY * 3) {
      played++;
      const level = save.level;
      const kind = kindOf(levels, Meta.levelFile(level, levels.total));
      let lose = 1 - WIN * (kind === 'boss' ? 0.6 : kind === 'hard' ? 0.8 : 1);
      // 输了想用道具：先免费次、再库存、再金币，金币不够看广告拿一个
      for (let k = 0; k < ITEMS && rng.randf() < lose; k++) {
        const id = Skills.unlockedIds(eco, save.level)[0];
        if (!id) break;
        const r = Skills.tryUse(save, eco, id, 0, day, level, k);
        if (!r.ok) {
          const price = Skills.price(eco, id);
          if (save.coins >= price) {
            save.coins -= price;
            t.spent += price;
          } else if (ADS) t.ads++;
          else break;
        }
        lose *= 0.5;
      }
      Tasks.add(save, eco, day, 'play');
      if (rng.randf() < lose) {
        Meta.failLevel(save, eco, level);
        continue;
      }
      won++;
      t.levels++;
      earn(() => {
        const res = Settle.win(save, eco, { level, challenge: kind !== 'normal', boss: kind === 'boss', day, now });
        if (res.chest_ok) LevelChest.open(save, eco, cards, level, kind !== 'normal', rng);
      });
      Tasks.add(save, eco, day, 'depart', 6);
    }
    if (DailyChallenge.canStartFree(save, day) && DailyChallenge.enter(save, eco, day, 'free') && rng.randf() < WIN)
      earn(() => DailyChallenge.win(save, eco, cards, day, now, rng, 4, day));
    let guard = 0;
    while (Wheel.spinsLeft(save, eco, day) > 0 && guard++ < 20) earn(() => Wheel.spin(save, eco, cards, rng, day, now, 'spin'));
    for (const scope of ['day', 'week'] as const)
      for (let i = 0; i < Tasks.tiers(eco, scope).length; i++) if (Tasks.canClaim(save, eco, scope, i, day)) earn(() => Tasks.claim(save, eco, cards, scope, i, day, now, rng));
  }
  return t;
}

const sum: Tally = { earned: 0, spent: 0, ads: 0, levels: 0 };
for (let r = 0; r < RUNS; r++) {
  const t = run(r + 1);
  sum.earned += t.earned;
  sum.spent += t.spent;
  sum.ads += t.ads;
  sum.levels += t.levels;
}
const per = (v: number): string => (v / RUNS / DAYS).toFixed(1);
console.log(`${DAYS} 天 × ${RUNS} 遍，每天目标 ${PER_DAY} 关，不用道具过关率 ${WIN}${ADS ? '' : '，没有广告'}`);
console.log(`一天：过 ${per(sum.levels)} 关 · 挣 ${per(sum.earned)} 金币 · 花 ${per(sum.spent)} 金币 · 看 ${per(sum.ads)} 次广告`);
