// 配置、图、文案对得上：每加一个技能、任务、功能、卡、章节，对应的图和文案都要有（漏了这里会报出来）。
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { CLIENT, ROOT, cards, eco as loadEco, readJson, ui } from './helpers';

const ECO = loadEco();
const UI = join(CLIENT, 'assets/resources/ui');
const strings = readJson<Record<string, Record<string, string>>>(join(CLIENT, 'assets/resources/i18n/strings.json'));
const game = readJson<{ codeName: string; languages: { app: string[]; wechat: string[] } }>(join(ROOT, 'game.json'));

function hasKey(key: string): boolean {
  return Object.values(strings).some((lang) => key in lang);
}

describe('配置和资源对得上', () => {
  it('每个技能有图标和名字', () => {
    for (const id of ECO.skills.order) {
      assert.ok(existsSync(join(UI, 'icon', `skill_${id}.png`)), `icon/skill_${id}.png`);
      assert.ok(id in ECO.toolPrice, `toolPrice.${id}`);
      assert.ok(`skill_${id}` in ECO.features, `features.skill_${id}`);
    }
  });

  it('每张卡有图和名字', () => {
    for (const c of cards()) {
      assert.ok(existsSync(join(CLIENT, 'assets/resources/card', `${c.id}.png`)), `card/${c.id}.png`);
      assert.ok(hasKey(`CARD_${c.id.toUpperCase()}`), `文案 CARD_${c.id.toUpperCase()}`);
    }
  });

  it('每一章有背景和名字', () => {
    (ECO.chapters ?? []).forEach((ch, i) => {
      assert.ok(existsSync(join(UI, 'bg', `chapter_${ch.id}.jpg`)), `bg/chapter_${ch.id}.jpg`);
      assert.ok(hasKey(`CHAPTER_${i + 1}`), `文案 CHAPTER_${i + 1}`);
    });
  });

  it('每个每日任务有文案', () => {
    for (const t of ECO.tasks?.pool ?? []) assert.ok(hasKey(`TASK_NAME_${t.id.toUpperCase()}`), `文案 TASK_NAME_${t.id.toUpperCase()}`);
  });

  it('主页展示的卡都存在', () => {
    const ids = new Set(cards().map((c) => c.id));
    for (const [id] of ui().homeDeco.hero) assert.ok(ids.has(id), id);
  });

  it('game.json 的语言在文案表里都有一列', () => {
    const csvHead = readFileSync(join(ROOT, 'i18n/strings.csv'), 'utf8').split('\n')[0].split(',');
    for (const l of new Set([...game.languages.app, ...game.languages.wechat])) assert.ok(csvHead.includes(l), `strings.csv 缺 ${l} 列`);
  });
});
