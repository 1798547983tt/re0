import test from 'node:test';
import assert from 'node:assert/strict';

import { createShardRuntime } from '../shard-statusbar/src/runtime.mjs';

test('script runtime reads the latest message floor without exposing writes', async () => {
  const calls = [];
  const scope = {
    getVariables: (options) => {
      calls.push(options);
      return { stat_data: { 规则: { 初始化完成: true } } };
    },
    getTavernVersion: () => '1.18.0',
    getTavernHelperVersion: () => '4.8.19',
  };
  const runtime = createShardRuntime(scope);
  const result = await runtime.read();
  assert.deepEqual(calls, [{ type: 'message', message_id: 'latest' }]);
  assert.equal(result.status, 'ready');
  assert.equal(result.statData.规则.初始化完成, true);
  assert.equal('replaceVariables' in runtime, false);
  assert.equal('updateVariablesWith' in runtime, false);
});

test('runtime falls back to MVU and cleans event subscriptions', async () => {
  const listened = [];
  const stopped = [];
  const scope = {
    Mvu: {
      getMvuData: () => ({ stat_data: { 世界: { 危机等级: '低' } } }),
      events: { VARIABLE_UPDATE_ENDED: 'update-ended' },
    },
    eventOn: (event) => {
      listened.push(event);
      return { stop: () => stopped.push(event) };
    },
  };
  const runtime = createShardRuntime(scope);
  const result = await runtime.read();
  assert.equal(result.source, 'Mvu.getMvuData');
  const dispose = runtime.subscribe(() => {});
  assert.deepEqual(listened, ['update-ended']);
  dispose();
  assert.deepEqual(stopped, ['update-ended']);
});

test('runtime preserves the last good state on a later read failure', async () => {
  let fail = false;
  const scope = {
    getVariables: () => {
      if (fail) throw new Error('host unavailable');
      return { stat_data: { 规则: { 初始化完成: true } } };
    },
  };
  const runtime = createShardRuntime(scope);
  const first = await runtime.read();
  fail = true;
  const second = await runtime.read(first.statData);
  assert.equal(second.status, 'stale');
  assert.equal(second.statData.规则.初始化完成, true);
});
