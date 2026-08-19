export const AVATAR_STORAGE_KEY = 're0:narrative-v2:avatar-overrides';
export const MAX_AVATAR_FILE_BYTES = 1_500_000;
const MAX_AVATAR_SOURCE_CHARACTERS = 2_100_000;
const MAX_AVATAR_OVERRIDES = 96;
const AVATAR_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'image/avif',
]);
const DATA_IMAGE_PATTERN = /^data:image\/(?:png|jpeg|webp|gif|avif);base64,[A-Za-z0-9+/]+={0,2}$/u;
const AVATAR_KEY_PATTERN = /^[a-z0-9][a-z0-9-]{0,79}$/iu;

function failure(error) {
  return { ok: false, source: '', error };
}

function normalizeAvatarKey(value) {
  const key = String(value ?? '').trim();
  return AVATAR_KEY_PATTERN.test(key) ? key.toLowerCase() : '';
}

export function normalizeAvatarSource(value, { allowData = false } = {}) {
  if (typeof value !== 'string') return failure('invalid-source');
  const source = value.trim();
  if (!source || source.length > MAX_AVATAR_SOURCE_CHARACTERS) return failure('invalid-source');
  if (allowData && DATA_IMAGE_PATTERN.test(source)) {
    return { ok: true, source, error: '' };
  }
  let url;
  try {
    url = new URL(source);
  } catch {
    return failure('invalid-url');
  }
  if (url.protocol !== 'https:' || !url.hostname || url.username || url.password) {
    return failure('unsafe-url');
  }
  return { ok: true, source: url.href, error: '' };
}

function bytesToBase64(bytes) {
  let binary = '';
  const chunkSize = 0x8000;
  for (let start = 0; start < bytes.length; start += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(start, start + chunkSize));
  }
  return globalThis.btoa(binary);
}

export async function avatarFileToDataUrl(file) {
  const type = String(file?.type ?? '').toLowerCase();
  const size = Number(file?.size);
  if (!AVATAR_MIME_TYPES.has(type)) return failure('file-type');
  if (!Number.isFinite(size) || size <= 0 || size > MAX_AVATAR_FILE_BYTES) return failure('file-size');
  if (typeof file?.arrayBuffer !== 'function' || typeof globalThis.btoa !== 'function') return failure('file-read');
  try {
    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    if (!bytes.length || bytes.byteLength > MAX_AVATAR_FILE_BYTES) return failure('file-size');
    const source = `data:${type};base64,${bytesToBase64(bytes)}`;
    return normalizeAvatarSource(source, { allowData: true });
  } catch {
    return failure('file-read');
  }
}

function readAvatarOverrides(storage) {
  let parsed;
  try {
    const raw = storage?.getItem?.(AVATAR_STORAGE_KEY);
    parsed = raw ? JSON.parse(raw) : {};
  } catch {
    return Object.create(null);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return Object.create(null);
  const overrides = Object.create(null);
  for (const [rawKey, rawSource] of Object.entries(parsed).slice(0, MAX_AVATAR_OVERRIDES)) {
    const key = normalizeAvatarKey(rawKey);
    const source = normalizeAvatarSource(rawSource, { allowData: true });
    if (key && source.ok) overrides[key] = source.source;
  }
  return overrides;
}

export function readAvatarOverride(characterId, storage = globalThis.localStorage) {
  const key = normalizeAvatarKey(characterId);
  if (!key) return '';
  return readAvatarOverrides(storage)[key] ?? '';
}

export function writeAvatarOverride(characterId, value, storage = globalThis.localStorage) {
  const key = normalizeAvatarKey(characterId);
  const source = normalizeAvatarSource(value, { allowData: true });
  if (!key || !source.ok) return failure(source.error || 'invalid-key');
  const overrides = readAvatarOverrides(storage);
  overrides[key] = source.source;
  try {
    if (typeof storage?.setItem !== 'function') throw new TypeError('storage unavailable');
    storage.setItem(AVATAR_STORAGE_KEY, JSON.stringify(overrides));
  } catch {
    return failure('storage');
  }
  return { ok: true, source: source.source, error: '' };
}

export function removeAvatarOverride(characterId, storage = globalThis.localStorage) {
  const key = normalizeAvatarKey(characterId);
  if (!key) return { ok: false, error: 'invalid-key' };
  const overrides = readAvatarOverrides(storage);
  delete overrides[key];
  try {
    if (typeof storage?.setItem !== 'function') throw new TypeError('storage unavailable');
    if (Object.keys(overrides).length || typeof storage.removeItem !== 'function') {
      storage.setItem(AVATAR_STORAGE_KEY, JSON.stringify(overrides));
    } else {
      storage.removeItem(AVATAR_STORAGE_KEY);
    }
  } catch {
    return { ok: false, error: 'storage' };
  }
  return { ok: true, error: '' };
}
