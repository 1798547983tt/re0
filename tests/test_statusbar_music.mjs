import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createMusicController,
  normalizeMusicPreferences,
  validateMusicUrl,
} from '../statusbar/src/music.mjs';

class FakeAudio extends EventTarget {
  constructor() {
    super();
    this._src = '';
    this.currentTime = 0;
    this.duration = 120;
    this.volume = 1;
    this.paused = true;
    this.preload = '';
    this.error = null;
    this.playCalls = 0;
    this.loadCalls = 0;
  }

  get src() {
    return this._src;
  }

  set src(value) {
    this._src = value ? new URL(value, 'http://127.0.0.1/statusbar/').href : '';
  }

  async play() {
    this.playCalls += 1;
    this.paused = false;
    this.dispatchEvent(new Event('play'));
  }

  pause() {
    this.paused = true;
    this.dispatchEvent(new Event('pause'));
  }

  load() {
    this.loadCalls += 1;
  }
}

function memoryStorage(seed = {}) {
  const values = new Map(Object.entries(seed));
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
    values,
  };
}

function memoryRepository() {
  const values = new Map();
  return {
    async get(key) { return values.get(key) || null; },
    async put(key, value) { values.set(key, value); },
    async remove(key) { values.delete(key); },
    async close() {},
    values,
  };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

test('music URLs accept HTTPS without credentials only', () => {
  assert.deepEqual(validateMusicUrl('https://example.com/audio/theme.mp3'), {
    ok: true,
    value: 'https://example.com/audio/theme.mp3',
  });
  assert.equal(validateMusicUrl('http://example.com/theme.mp3').ok, false);
  assert.equal(validateMusicUrl('javascript:alert(1)').ok, false);
  assert.equal(validateMusicUrl('https://user:pass@example.com/theme.mp3').ok, false);
  assert.equal(validateMusicUrl('not a url').ok, false);
});

test('music preferences reject malformed persisted values', () => {
  assert.deepEqual(normalizeMusicPreferences({
    mode: 'shuffle',
    volume: 8,
    hiddenBuiltIns: ['builtin:memento', 42, 'bad'],
    urlTracks: [{ id: 'url:one', title: 'One', url: 'https://example.com/one.mp3' }, { id: 'x', url: 'http://bad' }],
    localTracks: [{ id: 'local:one', title: 'Local', fileName: 'one.mp3', type: 'audio/mpeg', size: 12 }],
  }), {
    mode: 'sequence',
    volume: 1,
    currentId: '',
    hiddenBuiltIns: ['builtin:memento'],
    urlTracks: [{ id: 'url:one', title: 'One', url: 'https://example.com/one.mp3', kind: 'url' }],
    localTracks: [{ id: 'local:one', title: 'Local', fileName: 'one.mp3', type: 'audio/mpeg', size: 12, kind: 'local' }],
  });
});

test('sequence advances and single-track mode repeats without changing the selection', async () => {
  const audio = new FakeAudio();
  const player = createMusicController({ audio, storage: memoryStorage(), repository: memoryRepository() });
  await player.play('builtin:styx-helix');
  assert.equal(player.snapshot().currentId, 'builtin:styx-helix');

  player.setMode('sequence');
  audio.dispatchEvent(new Event('ended'));
  await settle();
  assert.equal(player.snapshot().currentId, 'builtin:memento');

  player.setMode('single');
  audio.currentTime = 77;
  audio.dispatchEvent(new Event('ended'));
  await settle();
  assert.equal(player.snapshot().currentId, 'builtin:memento');
  assert.equal(audio.currentTime, 0);
  assert.ok(audio.playCalls >= 3);
  player.destroy();
});

test('pausing and resuming a relative built-in source does not reload or lose progress', async () => {
  const audio = new FakeAudio();
  const player = createMusicController({
    audio,
    storage: memoryStorage(),
    repository: memoryRepository(),
    search: '?assets=local',
  });
  await player.play('builtin:styx-helix');
  audio.currentTime = 36;
  await player.toggle();
  await player.toggle();
  assert.equal(audio.loadCalls, 1);
  assert.equal(audio.currentTime, 36);
  player.destroy();
});

test('library can add and delete URL/local tracks and hide or restore built-ins', async () => {
  const storage = memoryStorage();
  const repository = memoryRepository();
  const player = createMusicController({ audio: new FakeAudio(), storage, repository });

  const urlTrack = await player.addUrl({ title: '远程曲目', url: 'https://example.com/remote.mp3' });
  assert.equal(player.snapshot().tracks.some((track) => track.id === urlTrack.id), true);

  const file = new File([new Uint8Array([1, 2, 3])], 'local-song.mp3', { type: 'audio/mpeg' });
  const localTrack = await player.addFile(file);
  assert.equal(player.snapshot().tracks.some((track) => track.id === localTrack.id && track.kind === 'local'), true);
  assert.equal(repository.values.has(localTrack.id), true);

  await player.remove(urlTrack.id);
  await player.remove(localTrack.id);
  await player.remove('builtin:memento');
  assert.equal(player.snapshot().tracks.some((track) => track.id === urlTrack.id), false);
  assert.equal(player.snapshot().tracks.some((track) => track.id === localTrack.id), false);
  assert.equal(player.snapshot().tracks.some((track) => track.id === 'builtin:memento'), false);
  assert.equal(repository.values.has(localTrack.id), false);

  player.restoreBuiltIns();
  assert.equal(player.snapshot().tracks.filter((track) => track.kind === 'builtin').length, 4);
  assert.ok(storage.values.size > 0);
  player.destroy();
});
