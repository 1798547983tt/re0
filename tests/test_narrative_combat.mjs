import test from 'node:test';
import assert from 'node:assert/strict';
import {
  consumeRoll,
  deriveTierValue,
  resolveCheck,
  resolveDefense,
  resolveDamage,
  resolveDying,
  createBattleState,
  finishBattle,
} from '../narrative/src/combat-core.mjs';

test('consumeRoll consumes rolls left to right and rejects an exhausted pool', () => {
  const pool = [7, 12];
  assert.equal(consumeRoll(pool), 7);
  assert.equal(consumeRoll(pool), 12);
  assert.deepEqual(pool, []);
  assert.throws(() => consumeRoll(pool), /骰池耗尽/);
});

test('deriveTierValue maps seven levels and only upper/lower positions', () => {
  assert.equal(deriveTierValue({ level: '1阶', position: '下位' }), 1);
  assert.equal(deriveTierValue({ level: '7阶', position: '上位' }), 14);
  assert.equal(deriveTierValue({ level: 3, position: '上位' }), 6);
  for (const value of [
    { level: '3阶', position: '中位' }, { level: '未定', position: '上位' },
    { level: '不入阶', position: '下位' }, { level: 'x', position: '上位' },
    { level: null, position: '上位' },
  ]) assert.equal(deriveTierValue(value), null);
});

test('resolveCheck computes margin, grades, natural one failure and natural twenty promotion', () => {
  assert.deepEqual(resolveCheck({ roll: 1, dc: 1, modifiers: [10] }), {
    roll: 1, dc: 1, modifiers: [10], total: 11, margin: 10, grade: '失败', natural: 1, success: false,
  });
  assert.equal(resolveCheck({ roll: 10, dc: 10, modifiers: [] }).grade, '成功');
  assert.equal(resolveCheck({ roll: 15, dc: 10, modifiers: [] }).grade, '强成功');
  assert.equal(resolveCheck({ roll: 20, dc: 20, modifiers: [] }).grade, '强成功');
  assert.equal(resolveCheck({ roll: 20, dc: 10, modifiers: [] }).grade, '暴击');
  assert.equal(resolveCheck({ roll: 20, dc: 100, modifiers: [] }).success, true);
});

test('resolveDefense returns reaction modifiers with safe fallback', () => {
  assert.deepEqual(resolveDefense('闪避'), { dcModifier: 2, damageMultiplier: 0, counterWindow: false });
  assert.deepEqual(resolveDefense('格挡'), { dcModifier: 0, damageMultiplier: 0.5, counterWindow: false });
  assert.deepEqual(resolveDefense('反击'), { dcModifier: -2, damageMultiplier: 1, counterWindow: true });
  assert.deepEqual(resolveDefense('未知'), { dcModifier: 0, damageMultiplier: 1, counterWindow: false });
});

test('resolveDamage applies grade multipliers, guard floor and break-gate', () => {
  assert.deepEqual(resolveDamage({ grade: '失败', baseDamage: 10, defenderTierGap: 0, breakQualified: true }), { damage: 0, baseDamage: 10, multiplier: 0, reason: '检定失败' });
  assert.equal(resolveDamage({ grade: '强成功', baseDamage: 10, defenderTierGap: 0, breakQualified: true }).damage, 15);
  assert.equal(resolveDamage({ grade: '暴击', baseDamage: 9, defenderTierGap: 0, breakQualified: true, damageMultiplier: 0.5 }).damage, 9);
  assert.deepEqual(resolveDamage({ grade: '成功', baseDamage: 10, defenderTierGap: 4, breakQualified: false }), { damage: 0, baseDamage: 10, multiplier: 1, reason: '无法破阶' });
});

test('resolveDying preserves counters and applies natural outcomes', () => {
  assert.deepEqual(resolveDying({ successes: 0, failures: 0, roll: 20 }), { successes: 0, failures: 0, status: '存活', hp: 1 });
  assert.deepEqual(resolveDying({ successes: 0, failures: 0, roll: 1 }), { successes: 0, failures: 2, status: '濒死' });
  assert.deepEqual(resolveDying({ successes: 2, failures: 1, roll: 10 }), { successes: 3, failures: 1, status: '昏迷' });
  assert.deepEqual(resolveDying({ successes: 1, failures: 2, roll: 2 }), { successes: 1, failures: 3, status: '死亡' });
  assert.deepEqual(resolveDying({ successes: 1, failures: 1, roll: 10 }), { successes: 2, failures: 1, status: '濒死' });
});

test('battle state initializes and finishBattle clears short-lived fields', () => {
  const participants = [{ id: 'a' }, { id: 'b' }];
  const state = createBattleState({ id: 'battle-1', participants });
  assert.equal(state.inProgress, true);
  assert.equal(state.id, 'battle-1');
  assert.equal(state.round, 1);
  assert.deepEqual(state.participants, participants);
  assert.deepEqual(state.actionOrder, ['a', 'b']);
  assert.equal(state.currentActor, 'a');
  assert.deepEqual(finishBattle(state), {
    ...state,
    inProgress: false, round: 0, participants: [], actionOrder: [], currentActor: '',
    actionBudget: {}, distance: {}, cover: {}, ongoingEffects: {}, dyingCounters: {}, lastCheck: null,
  });
  assert.deepEqual(state.participants, participants);
});
