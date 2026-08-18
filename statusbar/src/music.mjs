import { BUILT_IN_TRACKS, builtInTrackList } from './builtin-media.mjs';

const MUSIC_STORAGE_KEY = 're0-statusbar:music:v1';
const MUSIC_DATABASE_NAME = 're0-statusbar-music';
const MUSIC_DATABASE_VERSION = 1;
const MUSIC_STORE_NAME = 'tracks';
const MAX_MUSIC_BYTES = 100 * 1024 * 1024;
const BUILT_IN_IDS = new Set(BUILT_IN_TRACKS.map((track) => track.id));

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function clamp(value, minimum, maximum, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(maximum, Math.max(minimum, number)) : fallback;
}

function cleanTitle(value, fallback = '未命名曲目') {
  const title = String(value ?? '').replace(/\s+/gu, ' ').trim();
  return (title || fallback).slice(0, 120);
}

export function validateMusicUrl(input) {
  const value = String(input ?? '').trim();
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'https:') return { ok: false, error: '音乐 URL 必须使用 HTTPS' };
    if (!parsed.hostname || parsed.username || parsed.password) {
      return { ok: false, error: '音乐 URL 不能包含账号信息' };
    }
    return { ok: true, value: parsed.href };
  } catch {
    return { ok: false, error: '请输入有效的 HTTPS 音乐 URL' };
  }
}

function normalizeUrlTracks(value) {
  if (!Array.isArray(value)) return [];
  const tracks = [];
  const ids = new Set();
  for (const source of value.slice(0, 100)) {
    const record = asObject(source);
    const id = typeof record.id === 'string' && record.id.startsWith('url:') ? record.id.slice(0, 160) : '';
    const validation = validateMusicUrl(record.url);
    if (!id || ids.has(id) || !validation.ok) continue;
    ids.add(id);
    tracks.push({
      id,
      title: cleanTitle(record.title, '远程曲目'),
      url: validation.value,
      kind: 'url',
    });
  }
  return tracks;
}

function normalizeLocalTracks(value) {
  if (!Array.isArray(value)) return [];
  const tracks = [];
  const ids = new Set();
  for (const source of value.slice(0, 100)) {
    const record = asObject(source);
    const id = typeof record.id === 'string' && record.id.startsWith('local:') ? record.id.slice(0, 160) : '';
    const type = typeof record.type === 'string' && record.type.startsWith('audio/') ? record.type.slice(0, 120) : '';
    const size = Math.floor(Number(record.size));
    if (!id || ids.has(id) || !type || !Number.isFinite(size) || size < 0 || size > MAX_MUSIC_BYTES) continue;
    ids.add(id);
    tracks.push({
      id,
      title: cleanTitle(record.title, '本地曲目'),
      fileName: String(record.fileName || 'audio').slice(0, 240),
      type,
      size,
      kind: 'local',
    });
  }
  return tracks;
}

export function normalizeMusicPreferences(value) {
  const source = asObject(value);
  const hiddenBuiltIns = Array.isArray(source.hiddenBuiltIns)
    ? [...new Set(source.hiddenBuiltIns.filter((id) => typeof id === 'string' && BUILT_IN_IDS.has(id)))]
    : [];
  return {
    mode: source.mode === 'single' ? 'single' : 'sequence',
    volume: clamp(source.volume, 0, 1, 0.72),
    currentId: typeof source.currentId === 'string' ? source.currentId.slice(0, 160) : '',
    hiddenBuiltIns,
    urlTracks: normalizeUrlTracks(source.urlTracks),
    localTracks: normalizeLocalTracks(source.localTracks),
  };
}

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('音乐库请求失败'));
  });
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error('音乐库存储失败'));
    transaction.onabort = () => reject(transaction.error || new Error('音乐库存储已取消'));
  });
}

export function createMusicRepository({
  indexedDB = globalThis.indexedDB,
  databaseName = MUSIC_DATABASE_NAME,
} = {}) {
  if (!indexedDB || typeof indexedDB.open !== 'function') {
    throw new Error('当前环境不支持 IndexedDB，无法保存本地音乐');
  }
  const database = new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, MUSIC_DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(MUSIC_STORE_NAME)) {
        db.createObjectStore(MUSIC_STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('无法打开本地音乐库'));
    request.onblocked = () => reject(new Error('本地音乐库正在被另一页面升级'));
  });

  return Object.freeze({
    async get(id) {
      if (!id) return null;
      const db = await database;
      const transaction = db.transaction(MUSIC_STORE_NAME, 'readonly');
      const record = await requestResult(transaction.objectStore(MUSIC_STORE_NAME).get(id));
      return record?.blob instanceof Blob ? record.blob : null;
    },
    async put(id, blob) {
      if (!id || !(blob instanceof Blob) || !blob.type.startsWith('audio/')) {
        throw new TypeError('本地音乐必须是有效的音频文件');
      }
      const db = await database;
      const transaction = db.transaction(MUSIC_STORE_NAME, 'readwrite');
      transaction.objectStore(MUSIC_STORE_NAME).put({ id, blob, updatedAt: new Date().toISOString() });
      await transactionDone(transaction);
    },
    async remove(id) {
      if (!id) return;
      const db = await database;
      const transaction = db.transaction(MUSIC_STORE_NAME, 'readwrite');
      transaction.objectStore(MUSIC_STORE_NAME).delete(id);
      await transactionDone(transaction);
    },
    async close() {
      const db = await database;
      db.close();
    },
  });
}

function defaultId(prefix) {
  const value = globalThis.crypto?.randomUUID?.()
    || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}:${value}`;
}

function readPreferences(storage, storageKey) {
  if (!storage) return normalizeMusicPreferences({});
  try {
    return normalizeMusicPreferences(JSON.parse(storage.getItem(storageKey) || '{}'));
  } catch {
    return normalizeMusicPreferences({});
  }
}

export function createMusicController({
  audio = typeof globalThis.Audio === 'function' ? new globalThis.Audio() : null,
  storage = globalThis.localStorage || null,
  storageKey = MUSIC_STORAGE_KEY,
  repository = null,
  search = globalThis.location?.search || '',
  URL: UrlApi = globalThis.URL,
  idFactory = defaultId,
} = {}) {
  const preferences = readPreferences(storage, storageKey);
  const builtIns = builtInTrackList({ search });
  const hiddenBuiltIns = new Set(preferences.hiddenBuiltIns);
  const urlTracks = [...preferences.urlTracks];
  const localTracks = [...preferences.localTracks];
  const listeners = new Set();
  const objectUrls = new Map();
  let currentId = preferences.currentId;
  let mode = preferences.mode;
  let volume = preferences.volume;
  let playing = false;
  let error = '';
  let destroyed = false;
  let operation = 0;
  let loadedTrackId = '';

  if (audio) {
    audio.preload = 'metadata';
    audio.volume = volume;
    audio.loop = false;
  }

  const tracks = () => [
    ...builtIns.filter((track) => !hiddenBuiltIns.has(track.id)),
    ...urlTracks,
    ...localTracks,
  ];

  const currentTrack = () => tracks().find((track) => track.id === currentId) || null;

  const persist = () => {
    if (!storage) return;
    try {
      storage.setItem(storageKey, JSON.stringify({
        mode,
        volume,
        currentId,
        hiddenBuiltIns: [...hiddenBuiltIns],
        urlTracks,
        localTracks,
      }));
    } catch {}
  };

  const snapshot = () => Object.freeze({
    tracks: Object.freeze(tracks().map((track) => Object.freeze({ ...track }))),
    currentId,
    current: currentTrack(),
    mode,
    volume,
    playing,
    currentTime: Number.isFinite(Number(audio?.currentTime)) ? Number(audio.currentTime) : 0,
    duration: Number.isFinite(Number(audio?.duration)) ? Number(audio.duration) : 0,
    error,
    hiddenBuiltIns: Object.freeze([...hiddenBuiltIns]),
  });

  const notify = () => {
    if (destroyed) return;
    const value = snapshot();
    for (const listener of listeners) {
      try { listener(value); } catch {}
    }
  };

  const setError = (reason) => {
    error = reason instanceof Error ? reason.message : String(reason || '音乐播放失败');
    playing = false;
    notify();
  };

  const sourceFor = async (track) => {
    if (track.kind !== 'local') return track.url;
    if (objectUrls.has(track.id)) return objectUrls.get(track.id);
    if (!repository) throw new Error('当前环境无法读取已上传的本地音乐');
    const blob = await repository.get(track.id);
    if (!(blob instanceof Blob) || !blob.type.startsWith('audio/')) {
      throw new Error(`本地音乐「${track.title}」已经不可用，请删除后重新上传`);
    }
    if (!UrlApi?.createObjectURL) throw new Error('当前环境无法播放本地音乐');
    const objectUrl = UrlApi.createObjectURL(blob);
    objectUrls.set(track.id, objectUrl);
    return objectUrl;
  };

  const selectTrack = async (track) => {
    if (!audio) throw new Error('当前环境不支持音频播放');
    const source = await sourceFor(track);
    const changed = loadedTrackId !== track.id;
    currentId = track.id;
    if (changed) {
      audio.src = source;
      audio.currentTime = 0;
      audio.load?.();
      loadedTrackId = track.id;
    }
    persist();
  };

  const pause = () => {
    operation += 1;
    audio?.pause?.();
    playing = false;
    notify();
  };

  const play = async (id = currentId) => {
    const list = tracks();
    const track = list.find((item) => item.id === id) || list[0];
    if (!track) throw new Error('音乐库为空，请先添加曲目');
    const token = ++operation;
    error = '';
    try {
      await selectTrack(track);
      await audio.play();
      if (token !== operation || destroyed) return snapshot();
      playing = true;
      notify();
      return snapshot();
    } catch (reason) {
      if (token === operation && !destroyed) setError(reason);
      throw reason;
    }
  };

  const relativeTrack = (direction) => {
    const list = tracks();
    if (!list.length) return null;
    const index = Math.max(0, list.findIndex((track) => track.id === currentId));
    return list[(index + direction + list.length) % list.length];
  };

  const next = async () => {
    const track = relativeTrack(1);
    if (!track) throw new Error('音乐库为空，请先添加曲目');
    return play(track.id);
  };

  const previous = async () => {
    if (audio && Number(audio.currentTime) > 4 && currentTrack()) {
      audio.currentTime = 0;
      notify();
      return snapshot();
    }
    const track = relativeTrack(-1);
    if (!track) throw new Error('音乐库为空，请先添加曲目');
    return play(track.id);
  };

  const handleEnded = async () => {
    if (mode === 'single' && currentTrack()) {
      if (audio) audio.currentTime = 0;
      await play(currentId);
    } else {
      await next();
    }
  };

  const toggle = async () => {
    if (playing || (audio && !audio.paused)) {
      pause();
      return snapshot();
    }
    return play(currentId);
  };

  const seek = (seconds) => {
    if (!audio) return;
    const duration = Number.isFinite(Number(audio.duration)) ? Number(audio.duration) : 0;
    audio.currentTime = clamp(seconds, 0, Math.max(0, duration), 0);
    notify();
  };

  const setVolume = (value) => {
    volume = clamp(value, 0, 1, volume);
    if (audio) audio.volume = volume;
    persist();
    notify();
  };

  const setMode = (value) => {
    mode = value === 'single' ? 'single' : 'sequence';
    persist();
    notify();
  };

  const addUrl = async ({ title, url }) => {
    const validation = validateMusicUrl(url);
    if (!validation.ok) throw new TypeError(validation.error);
    const pathname = new URL(validation.value).pathname.split('/').at(-1) || '远程曲目';
    const track = {
      id: idFactory('url'),
      title: cleanTitle(title, decodeURIComponent(pathname).replace(/\.[^.]+$/u, '')),
      url: validation.value,
      kind: 'url',
    };
    urlTracks.push(track);
    if (!currentId) currentId = track.id;
    persist();
    notify();
    return Object.freeze({ ...track });
  };

  const addFile = async (file) => {
    if (!(file instanceof Blob) || !file.type.startsWith('audio/')) throw new TypeError('请选择有效的音频文件');
    if (file.size <= 0) throw new RangeError('音频文件为空');
    if (file.size > MAX_MUSIC_BYTES) throw new RangeError('单个音频文件不能超过 100 MB');
    if (!repository) throw new Error('当前环境无法保存本地音乐');
    const fileName = String(file.name || '本地曲目').slice(0, 240);
    const track = {
      id: idFactory('local'),
      title: cleanTitle(fileName.replace(/\.[^.]+$/u, ''), '本地曲目'),
      fileName,
      type: file.type,
      size: file.size,
      kind: 'local',
    };
    await repository.put(track.id, file);
    localTracks.push(track);
    if (!currentId) currentId = track.id;
    persist();
    notify();
    return Object.freeze({ ...track });
  };

  const remove = async (id) => {
    const target = tracks().find((track) => track.id === id);
    if (!target) return;
    if (target.kind === 'builtin') hiddenBuiltIns.add(target.id);
    if (target.kind === 'url') {
      const index = urlTracks.findIndex((track) => track.id === target.id);
      if (index >= 0) urlTracks.splice(index, 1);
    }
    if (target.kind === 'local') {
      const index = localTracks.findIndex((track) => track.id === target.id);
      if (index >= 0) localTracks.splice(index, 1);
      await repository?.remove?.(target.id);
      const objectUrl = objectUrls.get(target.id);
      if (objectUrl) UrlApi?.revokeObjectURL?.(objectUrl);
      objectUrls.delete(target.id);
    }
    if (currentId === target.id) {
      pause();
      currentId = tracks()[0]?.id || '';
      if (audio) {
        audio.src = '';
        audio.currentTime = 0;
        audio.load?.();
      }
      loadedTrackId = '';
    }
    persist();
    notify();
  };

  const restoreBuiltIns = () => {
    hiddenBuiltIns.clear();
    if (!currentId) currentId = builtIns[0]?.id || '';
    persist();
    notify();
  };

  const audioListeners = [
    ['play', () => { playing = true; error = ''; notify(); }],
    ['pause', () => { playing = false; notify(); }],
    ['timeupdate', notify],
    ['loadedmetadata', notify],
    ['durationchange', notify],
    ['ended', () => { handleEnded().catch(setError); }],
    ['error', () => {
      loadedTrackId = '';
      setError(audio?.error?.message || '当前音乐无法加载');
    }],
  ];
  for (const [type, listener] of audioListeners) audio?.addEventListener?.(type, listener);

  if (!tracks().some((track) => track.id === currentId)) currentId = tracks()[0]?.id || '';
  persist();

  return Object.freeze({
    snapshot,
    subscribe(listener) {
      if (typeof listener !== 'function') return () => {};
      listeners.add(listener);
      listener(snapshot());
      return () => listeners.delete(listener);
    },
    toggle,
    play,
    previous,
    next,
    seek,
    setVolume,
    setMode,
    addUrl,
    addFile,
    remove,
    restoreBuiltIns,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      operation += 1;
      audio?.pause?.();
      for (const [type, listener] of audioListeners) audio?.removeEventListener?.(type, listener);
      for (const objectUrl of objectUrls.values()) UrlApi?.revokeObjectURL?.(objectUrl);
      objectUrls.clear();
      listeners.clear();
      repository?.close?.().catch?.(() => {});
    },
  });
}
