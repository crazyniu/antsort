// 游戏接难度调试页（底座 devtools/，docs/10 第 9 节）要给的东西：整体三档改什么、怎么试玩和演示、作弊按钮。
// 整体三档：装车位多几个、连击窗口几秒，数在 game_ui.json 的 labTiers（下标 = 档 + 1：困难、标准、简单）
import * as Lives from '../core/meta/lives';
import type { LabHooks } from '../devtools/labPage';
import { lab } from '../devtools/levelLab';
import { App } from '../services/app';
import { now } from '../services/clock';
import { ui } from '../ui/shell';
import * as Flow from './flow';

let comboWindow = 0;

/** 整体档变了：连击窗口跟着改（装车位在开局时用 labSlots 改） */
export function applyTier(tier: number): void {
  const eco = App.config.eco;
  if (comboWindow === 0) comboWindow = eco.combo.windowSeconds;
  const w = App.config.ui.labTiers[tier + 1].window;
  eco.combo.windowSeconds = w > 0 ? w : comboWindow;
}

/** 开局的装车位按整体档加减几个（不是开发版时是 0） */
export function labSlots(): number {
  return lab.enabled ? App.config.ui.labTiers[lab.tier + 1].slots : 0;
}

export const labHooks: LabHooks = {
  progress: () => App.save.data.level,
  levelCount: () => App.config.levelCount,
  play: (id) => {
    const s = App.save.data;
    // 还没打到的关先把进度设过去，不然结算不认
    if (id > s.level) {
      s.level = id;
      App.save.write();
    }
    Flow.startLevel(id);
  },
  demo: (id) => Flow.startDemo(id),
  tierNote: (t) => {
    const b = App.config.ui.labTiers[t + 1].slots;
    return `装车位 ${b > 0 ? `多 ${b} 个` : b < 0 ? `少 ${-b} 个` : '照设计'}，连击窗口 ${App.config.eco.combo.windowSeconds} 秒`;
  },
  extras: [
    {
      label: '金币 +1000',
      run: () => {
        App.save.data.coins += 1000;
        App.save.write();
        ui.refresh();
        ui.toast('金币 +1000');
      },
    },
    {
      label: '生命补满',
      run: () => {
        Lives.add(App.save.data, App.config.eco, App.config.eco.lives.max, now());
        App.save.write();
        ui.toast('生命已补满');
      },
    },
    {
      label: '进度到这关',
      run: (id) => {
        App.save.data.level = id;
        App.save.write();
        ui.toast(`进度已设到第 ${id} 关`);
      },
    },
  ],
};
