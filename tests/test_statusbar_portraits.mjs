import test from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizePortraitName,
  portraitKeys,
  portraitScopeOptions,
  resolvePortrait,
  validatePortraitUrl,
} from '../statusbar/src/portraits.mjs';

test('portrait keys separate protagonist, shared person and chat override', () => {
  assert.deepEqual(
    portraitKeys({ namespace: 'person', name: ' 艾米莉亚 ', chatId: 'chat/1' }),
    {
      shared: 'person:艾米莉亚',
      override: 'chat:chat%2F1:person:艾米莉亚',
    },
  );
  assert.deepEqual(
    portraitKeys({ namespace: 'protagonist', name: '艾米莉亚', chatId: '' }),
    { shared: 'protagonist:艾米莉亚', override: null },
  );
  assert.equal(normalizePortraitName('  雷  姆 '), '雷 姆');
  assert.equal(normalizePortraitName('Ａlice'), 'Alice');
});

test('portrait scope defaults to shared when no current chat identity exists', () => {
  assert.deepEqual(portraitScopeOptions(''), {
    selected: 'shared',
    overrideDisabled: true,
  });
  assert.deepEqual(portraitScopeOptions('chat/1'), {
    selected: 'shared',
    overrideDisabled: false,
  });
});

test('portrait URLs accept HTTPS only', () => {
  assert.deepEqual(validatePortraitUrl('https://example.com/a.png'), {
    ok: true,
    value: 'https://example.com/a.png',
  });
  assert.equal(validatePortraitUrl('http://example.com/a.png').ok, false);
  assert.equal(validatePortraitUrl('javascript:alert(1)').ok, false);
  assert.equal(validatePortraitUrl('data:image/png;base64,AA').ok, false);
  assert.equal(validatePortraitUrl('https://user:pass@example.com/a.png').ok, false);
  assert.equal(validatePortraitUrl('not a url').ok, false);
});

test('portrait resolution prefers chat override, then shared, then initial', () => {
  assert.equal(
    resolvePortrait({
      name: '蕾姆',
      shared: { kind: 'url', value: 'https://a.test/a.png' },
      override: { kind: 'url', value: 'https://b.test/b.png' },
    }).value,
    'https://b.test/b.png',
  );
  assert.equal(
    resolvePortrait({
      name: '蕾姆',
      shared: { kind: 'url', value: 'https://a.test/a.png' },
    }).source,
    'shared',
  );
  assert.deepEqual(resolvePortrait({ name: '👩‍🚀星野' }), {
    kind: 'initial',
    initial: '👩‍🚀',
    source: 'fallback',
  });
});
