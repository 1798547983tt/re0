export function isHttpsReleaseUrl(value) {
  if (!value) return false;
  try {
    return new URL(value).protocol === 'https:';
  } catch (_error) {
    return false;
  }
}

export function findNarrativeAsset(manifest, id) {
  return (manifest?.assets || []).find((asset) => asset.id === id) || null;
}

export function resolveNarrativeAsset(manifest, id, { preferRelease = true } = {}) {
  const asset = findNarrativeAsset(manifest, id);
  if (!asset) return { asset: null, url: '', fallback: true, reason: 'missing-manifest-entry' };
  if (preferRelease && isHttpsReleaseUrl(asset.releaseUrl)) {
    return { asset, url: asset.releaseUrl, fallback: false, reason: 'release-url' };
  }
  if (asset.localPath) return { asset, url: asset.localPath, fallback: false, reason: 'local-path' };
  return { asset, url: '', fallback: true, reason: 'missing-url' };
}

export async function loadNarrativeAssetManifest(mount) {
  const embedded = typeof EMBEDDED_ASSET_MANIFEST !== 'undefined' ? EMBEDDED_ASSET_MANIFEST : null;
  if (embedded?.assets) return embedded;
  const url = mount?.dataset?.assetManifestUrl;
  if (!url || typeof fetch !== 'function') return null;
  try {
    const response = await fetch(url, { credentials: 'same-origin' });
    if (!response.ok) return null;
    const manifest = await response.json();
    return manifest?.assets ? manifest : null;
  } catch (_error) {
    return null;
  }
}

export function themeAssetId(kind, themeName) {
  return `${kind}:${themeName || 'day'}`;
}
