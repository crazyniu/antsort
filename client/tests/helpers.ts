// 测试共用：读配置、建存档。
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { AdsConfig, CardDef, EconomyConfig, GameUiConfig, LevelsConfig } from '../assets/scripts/core/config';
import * as PlayerData from '../assets/scripts/core/meta/playerData';
import type { SaveData } from '../assets/scripts/core/meta/save';

export const CLIENT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const ROOT = join(CLIENT, '..');
export const CONFIG = join(CLIENT, 'assets/resources/config');

export function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

export const eco = (): EconomyConfig => readJson<EconomyConfig>(join(CONFIG, 'economy.json'));
export const ads = (): AdsConfig => readJson<AdsConfig>(join(CONFIG, 'ads.json'));
export const levels = (): LevelsConfig => readJson<LevelsConfig>(join(CONFIG, 'levels.json'));
export const ui = (): GameUiConfig => readJson<GameUiConfig>(join(CONFIG, 'game_ui.json'));
export const cards = (): CardDef[] => readJson<{ cards: CardDef[] }>(join(CONFIG, 'cards.json')).cards;

/** 一份新存档，进度在第 level 关 */
export function fresh(e: EconomyConfig, level = 1): SaveData {
  const s = PlayerData.create(e);
  s.level = level;
  return s;
}
