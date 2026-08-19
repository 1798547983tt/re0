import test from 'node:test';
import assert from 'node:assert/strict';

import {
  AVATAR_STORAGE_KEY,
  MAX_AVATAR_FILE_BYTES,
  avatarFileToDataUrl,
  normalizeAvatarSource,
  readAvatarOverride,
  removeAvatarOverride,
  writeAvatarOverride,
} from '../narrative-next/src/avatar-overrides.mjs';

function memoryStorage(seed = {}) {
  const values = new Map(Object.entries(seed));
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
    value: (key) => values.get(key) ?? null,
  };
}

test('avatar URL input accepts HTTPS images and rejects unsafe schemes or credentials', () => {
  assert.deepEqual(normalizeAvatarSource(' https://images.example/avatar.webp '), {
    ok: true,
    source: 'https://images.example/avatar.webp',
    error: '',
  });
  for (const source of [
    'http://images.example/avatar.png',
    'javascript:alert(1)',
    'data:image/png;base64,AA==',
    'https://user:pass@images.example/avatar.png',
  ]) {
    assert.equal(normalizeAvatarSource(source).ok, false, source);
  }
});

test('local avatar files become constrained image data URLs', async () => {
  const file = {
    type: 'image/png',
    size: 4,
    arrayBuffer: async () => Uint8Array.from([0x89, 0x50, 0x4e, 0x47]).buffer,
  };
  assert.deepEqual(await avatarFileToDataUrl(file), {
    ok: true,
    source: 'data:image/png;base64,iVBORw==',
    error: '',
  });

  assert.equal((await avatarFileToDataUrl({ ...file, type: 'image/svg+xml' })).ok, false);
  assert.equal((await avatarFileToDataUrl({ ...file, size: MAX_AVATAR_FILE_BYTES + 1 })).ok, false);
});

test('avatar overrides persist independently per character and can be removed', () => {
  const storage = memoryStorage();
  assert.equal(writeAvatarOverride('rem', 'https://images.example/rem.webp', storage).ok, true);
  assert.equal(writeAvatarOverride('emilia', 'https://images.example/emilia.png', storage).ok, true);
  assert.equal(readAvatarOverride('rem', storage), 'https://images.example/rem.webp');
  assert.equal(readAvatarOverride('emilia', storage), 'https://images.example/emilia.png');

  assert.equal(removeAvatarOverride('rem', storage).ok, true);
  assert.equal(readAvatarOverride('rem', storage), '');
  assert.equal(readAvatarOverride('emilia', storage), 'https://images.example/emilia.png');
  assert.match(storage.value(AVATAR_STORAGE_KEY), /emilia/);
});

test('malformed or hostile stored avatar data fails closed without throwing', () => {
  const malformed = memoryStorage({ [AVATAR_STORAGE_KEY]: '{bad json' });
  assert.equal(readAvatarOverride('rem', malformed), '');

  const hostile = memoryStorage({
    [AVATAR_STORAGE_KEY]: JSON.stringify({
      rem: 'javascript:alert(1)',
      emilia: 'https://images.example/emilia.png',
      __proto__: 'https://images.example/prototype.png',
    }),
  });
  assert.equal(readAvatarOverride('rem', hostile), '');
  assert.equal(readAvatarOverride('emilia', hostile), 'https://images.example/emilia.png');
});

test('storage write failures return an actionable result instead of breaking rendering', () => {
  const storage = {
    getItem: () => null,
    setItem: () => { throw new Error('quota'); },
  };
  const result = writeAvatarOverride('rem', 'https://images.example/rem.webp', storage);
  assert.equal(result.ok, false);
  assert.equal(result.error, 'storage');
});
