// 挖豆小火车的规则和关卡（core/dig）。规则见 docs/01 第 1 节。
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { CarDef, DigLevel, LevelFile, STONE, fileName, kindOf, parse, problems, stack } from '../assets/scripts/core/dig/level';
import * as Rules from '../assets/scripts/core/dig/rules';
import { GameState, LoseReason, Status } from '../assets/scripts/core/dig/rules';
import { CONFIG, levels, readJson } from './helpers';

const CFG = levels();

/** 手写一关：layers 从下到上，每层几行字符 */
function level(layers: string[][], tracks: CarDef[][], slots = 5): DigLevel {
  const f: LevelFile = {
    id: 1,
    kind: 'normal',
    name: 'test',
    w: layers[0][0].length,
    h: layers[0].length,
    palette: ['#f00', '#0f0', '#00f', '#ff0'],
    layers,
    tracks,
    slots,
    mechanics: [],
    solution: [],
  };
  return parse(f);
}

const car = (c: number, n: number): CarDef => ({ c, n });

/** 一圈 0 包着一圈 1，中间一颗 2 */
const ONION = ['00000', '01110', '01210', '01110', '00000'];

describe('哪颗豆能挖', () => {
  it('从外往里：最外圈能挖，被同层围住的不能', () => {
    const s = GameState.fromLevel(level([ONION], [[car(0, 16), car(1, 8), car(2, 1)]]));
    const can = s.diggable();
    assert.equal(can.filter(Boolean).length, 16);
    assert.ok(can[0] && can[4] && can[24]);
    assert.ok(!can[6] && !can[12]);
  });

  it('挖掉外圈，里面一圈露出来', () => {
    const s = GameState.fromLevel(level([ONION], [[car(0, 16), car(1, 8), car(2, 1)]]));
    Rules.tap(s, 0);
    const can = s.diggable();
    assert.equal(can.filter(Boolean).length, 8);
    assert.ok(can[6] && !can[12]);
  });

  it('从上往下：被上层压住的挖不到，上层挖走才露出来', () => {
    // 下层整块 0，上层整块 1
    const s = GameState.fromLevel(level([['000', '000', '000'], ['111', '111', '111']], [[car(0, 9)], [car(1, 9)]]));
    assert.equal(Rules.gain(s, 0), 0, '下层的颜色现在一颗都装不上');
    assert.equal(Rules.gain(s, 1), 9, '上层由外到内能全部挖走');
  });

  it('上层挖开一圈后，上层里面的和下层外圈的都能挖（各自要有比它低、连到外面的邻格）', () => {
    const s = GameState.fromLevel(level([['000', '000', '000'], ['111', '111', '111']], [[car(1, 8)], [car(0, 8)], [car(1, 1)], [car(0, 1)]]));
    Rules.tap(s, 0);
    const can = s.diggable();
    // 中间那格还是两层高：顶上的 1 挨着一层高的邻格，能挖；四周一层高的 0 在最外圈，能挖
    assert.ok(can.every(Boolean));
    assert.equal(s.top(4), 1);
    assert.equal(s.top(0), 0);
  });

  it('画中间封闭的空洞不算外面', () => {
    const s = GameState.fromLevel(level([['00000', '01110', '01.10', '01110', '00000']], [[car(0, 16), car(1, 8)]]));
    assert.ok(!s.diggable()[6], '里面一圈挨着空洞，但空洞不通外面');
  });

  it('石块挖不动，挡连通；上层悬空的豆落到下面', () => {
    const s = GameState.fromLevel(level([['#####', '#0#1#', '#####']], [[car(0, 1)], [car(1, 1)]]));
    assert.equal(s.diggable().filter(Boolean).length, 0);
    assert.deepEqual(stack(2, 1, [['0.'], ['11']]), [[0, 1], [1]]);
    assert.equal(STONE, -2);
  });
});

describe('进站、装车、发车', () => {
  it('点一条线：最前面的车厢进站，装满发车，装车位空出来', () => {
    const s = GameState.fromLevel(level([ONION], [[car(0, 16), car(1, 8), car(2, 1)]]));
    const ev = Rules.tap(s, 0);
    assert.deepEqual(ev[0], { type: 'enter', track: 0, index: 0, slot: 0, c: 0, n: 16 });
    assert.ok(ev.some((e) => e.type === 'depart'));
    assert.equal(s.departed, 1);
    assert.equal(s.freeSlots(), 5);
    assert.equal(s.tracks[0].length, 2);
  });

  it('没豆可挖的车厢不退回，占着装车位；豆露出来以后接着装', () => {
    const s = GameState.fromLevel(level([ONION], [[car(1, 8)], [car(0, 16)], [car(2, 1)]]));
    Rules.tap(s, 0);
    assert.equal(s.freeSlots(), 4);
    assert.equal(s.slots[0]?.left, 8);
    // 外圈的车进站：外圈挖完，等着的那节跟着装满，两节都发车
    const ev = Rules.tap(s, 1);
    assert.equal(s.departed, 2);
    assert.equal(s.freeSlots(), 5);
    const rounds = ev.filter((e) => e.type === 'dig').map((e) => (e.type === 'dig' ? e.round : -1));
    assert.ok(Math.max(...rounds) >= 1, '里面一圈是下一轮才挖到的');
  });

  it('装不满的只装挖得到的；先装离站台近的（靠下的）', () => {
    const s = GameState.fromLevel(level([ONION], [[car(0, 5), car(0, 11), car(1, 8), car(2, 1)]]));
    const ev = Rules.tap(s, 0);
    const dig = ev.find((e) => e.type === 'dig');
    assert.ok(dig && dig.type === 'dig');
    assert.deepEqual(dig.cells.slice().sort((a, b) => a - b), [20, 21, 22, 23, 24]);
    assert.equal(dig.cells[0], 22, '最下面一行正中间的先挖');
  });

  it('两节同色的都在站台：先进站的先装', () => {
    const s = GameState.fromLevel(level([ONION], [[car(1, 4)], [car(1, 4)], [car(0, 16)], [car(2, 1)]]));
    Rules.tap(s, 1);
    Rules.tap(s, 0);
    const ev = Rules.tap(s, 2);
    const departs = ev.filter((e) => e.type === 'depart').map((e) => (e.type === 'depart' ? e.slot : -1));
    // 外圈那节在 2 号位，先进站的同色车在 0 号位
    assert.deepEqual(departs.slice(0, 2), [2, 0]);
    assert.equal(s.departed, 3);
  });

  it('点不动：没车的线、装车位满了、已经结束', () => {
    const s = GameState.fromLevel(level([ONION], [[car(1, 8)], [car(0, 16), car(2, 1)]], 1));
    assert.deepEqual(Rules.tap(s, 5), []);
    Rules.tap(s, 1);
    Rules.tap(s, 0);
    Rules.tap(s, 1);
    assert.equal(s.status, Status.WON);
    assert.deepEqual(Rules.tap(s, 0), []);
  });
});

describe('胜负', () => {
  it('豆全部挖完过关', () => {
    const s = GameState.fromLevel(level([ONION], [[car(0, 16), car(1, 8), car(2, 1)]]));
    Rules.tap(s, 0);
    Rules.tap(s, 0);
    const ev = Rules.tap(s, 0);
    assert.equal(s.status, Status.WON);
    assert.deepEqual(ev[ev.length - 1], { type: 'win' });
    assert.equal(s.beads, 0);
  });

  it('站台堵死：装车位全被没装满的车厢占着', () => {
    const s = GameState.fromLevel(level([ONION], [[car(2, 1), car(0, 16)], [car(1, 8)]], 2));
    Rules.tap(s, 0);
    assert.equal(s.status, Status.PLAYING);
    const ev = Rules.tap(s, 1);
    assert.equal(s.status, Status.LOST);
    assert.equal(s.loseReason, LoseReason.JAM);
    assert.deepEqual(ev[ev.length - 1], { type: 'lose', reason: LoseReason.JAM });
  });

  it('复活：堵死的，场上每支小队直接吸走自己颜色的豆，位子腾空，接着玩', () => {
    const s = GameState.fromLevel(level([ONION], [[car(2, 1), car(0, 16)], [car(1, 8)]], 2));
    Rules.tap(s, 0);
    Rules.tap(s, 1);
    const ev = Rules.revive(s, 30);
    assert.ok(ev.some((e) => e.type === 'dig'));
    assert.equal(s.status, Status.PLAYING);
    assert.ok(s.revived);
    assert.equal(s.freeSlots(), 2, '两支小队都搬完离场了');
    assert.equal(s.beads, 16);
    assert.ok(!s.magnetUsed, '复活不算用过磁铁');
    Rules.tap(s, 0);
    assert.equal(s.status, Status.WON);
  });

  it('限时关到点就输；复活加时', () => {
    const s = GameState.fromLevel(level([ONION], [[car(0, 16), car(1, 8), car(2, 1)]]));
    s.clock = 1;
    Rules.tick(s, 0.5);
    assert.equal(s.status, Status.PLAYING);
    Rules.tick(s, 0.6);
    assert.equal(s.loseReason, LoseReason.CLOCK);
    Rules.revive(s, 30);
    assert.equal(s.clock, 30);
    assert.equal(s.slots.length, 5);
  });
});

describe('技能', () => {
  it('加位：多 1 个装车位，每局一次', () => {
    const s = GameState.fromLevel(level([ONION], [[car(0, 16), car(1, 8), car(2, 1)]]));
    assert.deepEqual(Rules.useSlot(s), [{ type: 'slot', count: 6 }]);
    assert.deepEqual(Rules.useSlot(s), []);
    assert.equal(s.slots.length, 6);
  });

  it('调车：后排的车厢直接进站；没有后排、没有空位时没效果', () => {
    const s = GameState.fromLevel(level([ONION], [[car(2, 1), car(1, 8), car(0, 16)]], 1));
    assert.ok(Rules.canShunt(s));
    assert.deepEqual(Rules.useShunt(s, 0, 0), [], '最前面的不算调车');
    const ev = Rules.useShunt(s, 0, 2);
    assert.deepEqual(ev[0], { type: 'enter', track: 0, index: 2, slot: 0, c: 0, n: 16 });
    assert.equal(s.tracks[0].length, 2);
    const one = GameState.fromLevel(level([ONION], [[car(0, 16)], [car(1, 8)], [car(2, 1)]]));
    assert.ok(!Rules.canShunt(one));
  });

  it('磁铁：场上的小队直接吸走同色的豆，不管露没露出来；每关最多 1 次', () => {
    const s = GameState.fromLevel(level([ONION], [[car(2, 1)], [car(1, 8)], [car(0, 16)]], 3));
    assert.ok(!Rules.canMagnet(s), '场上没有小队');
    Rules.tap(s, 0);
    Rules.tap(s, 1);
    assert.equal(s.status, Status.PLAYING);
    assert.ok(Rules.canMagnet(s));
    const ev = Rules.useMagnet(s);
    assert.equal(s.departed, 2, '中间那颗和里面一圈都被吸走了');
    assert.equal(s.beads, 16);
    assert.ok(ev.some((e) => e.type === 'depart'));
    assert.equal(s.status, Status.PLAYING);
    Rules.tap(s, 2);
    assert.equal(s.status, Status.WON);
    const again = GameState.fromLevel(level([ONION], [[car(2, 1)], [car(1, 8)], [car(0, 16)]], 3));
    Rules.tap(again, 0);
    Rules.useMagnet(again);
    Rules.tap(again, 1);
    assert.ok(!Rules.canMagnet(again), '用过一次了');
  });

  it('透视：有被盖住的豆才有东西看', () => {
    assert.ok(!GameState.fromLevel(level([ONION], [[car(0, 16), car(1, 8), car(2, 1)]])).hasHidden());
    assert.ok(GameState.fromLevel(level([['00', '00'], ['11', '11']], [[car(0, 4), car(1, 4)]])).hasHidden());
  });

  it('提示：挑点了以后装得最多的那条线', () => {
    const s = GameState.fromLevel(level([ONION], [[car(2, 1)], [car(1, 8)], [car(0, 16)]]));
    assert.equal(Rules.hint(s), 2);
    assert.deepEqual(Rules.safeTracks(s), [2]);
  });
});

describe('关卡文件', () => {
  it('难关、超难关按间隔出现', () => {
    assert.equal(kindOf(CFG, CFG.hardEvery), 'hard');
    assert.equal(kindOf(CFG, CFG.bossEvery), 'boss');
    assert.equal(kindOf(CFG, CFG.hardEvery + 1), 'normal');
  });

  it('每一关都有文件、数据对得上、参考解能过（含降档变体）；机关不早于首发关', () => {
    for (let id = 1; id <= CFG.total; id++) {
      const path = join(CONFIG, 'levels', `${fileName(id)}.json`);
      assert.ok(existsSync(path), `缺 ${fileName(id)}.json`);
      const f = readJson<LevelFile>(path);
      assert.equal(f.id, id);
      assert.equal(f.kind, kindOf(CFG, id), `第 ${id} 关的 kind`);
      assert.equal(f.slots, CFG.slots);
      for (const m of f.mechanics) assert.ok(id >= (CFG.mechanicFrom[m] ?? Infinity), `第 ${id} 关用了还没首发的机关 ${m}`);
      for (let ease = 0; ease <= (f.ease?.length ?? 0); ease++) {
        const lv = parse(f, ease);
        assert.deepEqual(problems(lv), [], `第 ${id} 关（降 ${ease} 档）`);
        const s = GameState.fromLevel(lv);
        for (const t of lv.solution) assert.ok(Rules.tap(s, t).length > 0, `第 ${id} 关（降 ${ease} 档）参考解点不下去`);
        assert.equal(s.status, Status.WON, `第 ${id} 关（降 ${ease} 档）参考解没过`);
      }
    }
  });
});
