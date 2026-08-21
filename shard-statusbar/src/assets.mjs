import shardManifest from '../assets/manifest.json' with { type: 'json' };
import narrativeManifest from '../../narrative/assets/manifest.json' with { type: 'json' };

export const SHARD_ASSET_MANIFEST = Object.freeze(shardManifest);
export const NARRATIVE_ASSET_MANIFEST = Object.freeze(narrativeManifest);
export const NARRATIVE_ASSET_REVISION = 'def1712b14100d7294549fa6b30cdf62d0910582';

function isLocalMode(search = globalThis.location?.search || '') {
  try {
    return new URLSearchParams(search).get('assets') === 'local';
  } catch {
    return false;
  }
}

function safeRelative(path) {
  return typeof path === 'string' && path.startsWith('assets/');
}

export function isSafeAssetUrl(value) {
  const text = String(value || '').trim();
  if (safeRelative(text)) return true;
  try {
    const parsed = new URL(text);
    return parsed.protocol === 'https:'
      || (parsed.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname));
  } catch {
    return false;
  }
}

export function resolveShardAsset(id, { search = globalThis.location?.search || '', base = '' } = {}) {
  const asset = (SHARD_ASSET_MANIFEST.assets || []).find((entry) => entry.id === id);
  if (!asset) return '';
  const local = isLocalMode(search)
    ? asset.localPath
    : asset.production;
  const url = isLocalMode(search) && base ? new URL(local, base).href : local;
  return isSafeAssetUrl(url) ? url : '';
}

export function resolvePortraitAsset(portraitKey, { local = false } = {}) {
  const key = String(portraitKey || '').trim();
  if (!/^[a-z0-9-]+$/u.test(key) || key === 'generic') return '';
  if (local) return `../../narrative/assets/avatars/${key}.webp`;
  return `https://raw.githubusercontent.com/1798547983tt/re0/${NARRATIVE_ASSET_REVISION}/narrative/assets/avatars/${key}.webp`;
}

export function assetRevision() {
  return String(SHARD_ASSET_MANIFEST.releaseRevision || '').trim();
}
