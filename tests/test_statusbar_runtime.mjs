import test from 'node:test';
import assert from 'node:assert/strict';

import { createRuntimeBridge } from '../statusbar/src/runtime.mjs';

test('runtime reads stat_data from the iframe message floor without writing', async () => {
  const calls = [];
  const scope = {
    getCurrentMessageId: () => 7,
    getVariables: (options) => {
      calls.push(options);
      return { stat_data: { 规则: { 初始化完成: true } } };
    },
    getTavernVersion: () => '1.18.0',
    getTavernHelperVersion: () => '4.8.19',
  };
  const bridge = createRuntimeBridge(scope);
  const result = await bridge.read();

  assert.deepEqual(calls, [{ type: 'message', message_id: 7 }]);
  assert.equal(result.status, 'ready');
  assert.equal(result.statData.规则.初始化完成, true);
  assert.equal(result.source, 'getVariables');
  assert.equal('replaceVariables' in bridge, false);
  assert.equal('replaceMvuData' in bridge, false);
  assert.deepEqual(bridge.probe(), {
    tavern: '1.18.0',
    helper: '4.8.19',
    messageId: 7,
    hasGetVariables: true,
    hasMvu: false,
  });
});

test('runtime falls back to the read-only Mvu message API', async () => {
  const calls = [];
  const scope = {
    getCurrentMessageId: () => 11,
    Mvu: {
      getMvuData: (options) => {
        calls.push(options);
        return { stat_data: { 世界: { 危机等级: '低' } } };
      },
    },
  };
  const result = await createRuntimeBridge(scope).read();

  assert.deepEqual(calls, [{ type: 'message', message_id: 11 }]);
  assert.equal(result.status, 'ready');
  assert.equal(result.source, 'Mvu.getMvuData');
});

test('runtime subscribes through exported MVU constants and cleans up', () => {
  const stopped = [];
  const listened = [];
  const scope = {
    Mvu: {
      events: {
        VARIABLE_INITIALIZED: 'init',
        VARIABLE_UPDATE_ENDED: 'ended',
      },
    },
    eventOn: (event) => {
      listened.push(event);
      return { stop: () => stopped.push(event) };
    },
  };
  const dispose = createRuntimeBridge(scope).subscribe(() => {});

  assert.deepEqual(listened, ['init', 'ended']);
  dispose();
  assert.deepEqual(stopped, ['init', 'ended']);
});

test('runtime keeps the last good state when a later read fails', async () => {
  const scope = {
    getCurrentMessageId: () => 3,
    getVariables: () => {
      throw new Error('host unavailable');
    },
  };
  const lastGood = { 主角档案: { 姓名: '艾米莉亚' } };
  const result = await createRuntimeBridge(scope).read(lastGood);

  assert.equal(result.status, 'stale');
  assert.equal(result.statData, lastGood);
  assert.match(result.message, /host unavailable/);
});

test('runtime exposes an unavailable result instead of guessing missing APIs', async () => {
  const result = await createRuntimeBridge({}).read();
  assert.equal(result.status, 'unavailable');
  assert.deepEqual(result.statData, {});
  assert.match(result.message, /Tavern Helper|MVU/);
});
