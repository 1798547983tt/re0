export function isHttpsReleaseUrl(value) {
  if (!value) return false;
  try {
    return new URL(value).protocol === 'https:';
  } catch (_error) {
    return false;
  }
}

export function isPinnedReleaseUrl(value, releaseRevision) {
  const revision = typeof releaseRevision === 'string' ? releaseRevision.trim() : '';
  if (!revision || !isHttpsReleaseUrl(value)) return false;
  try {
    const url = new URL(value);
    const revisionBearingPart = decodeURIComponent(`${url.pathname}${url.search}${url.hash}`);
    return revisionBearingPart.includes(revision);
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
  if (preferRelease && isPinnedReleaseUrl(asset.releaseUrl, manifest?.releaseRevision)) {
    return { asset, url: asset.releaseUrl, fallback: false, reason: 'release-url' };
  }
  if (asset.localPath) return { asset, url: asset.localPath, fallback: false, reason: 'local-path' };
  return { asset, url: '', fallback: true, reason: 'missing-url' };
}

const cssAssetRequests = new WeakMap();

function setFallbackToken(element, token, enabled) {
  const tokens = new Set(String(element.dataset.assetFallback || '').split(/\s+/u).filter(Boolean));
  if (enabled) tokens.add(token);
  else tokens.delete(token);
  if (tokens.size > 0) element.dataset.assetFallback = [...tokens].join(' ');
  else delete element.dataset.assetFallback;
}

export function applyCssImageAsset(
  element,
  propertyName,
  url,
  fallbackToken,
  { ImageConstructor } = {},
) {
  if (!element?.style || !element?.dataset) throw new TypeError('CSS image target must expose style and dataset');
  const normalizedUrl = typeof url === 'string' ? url.trim() : '';
  setFallbackToken(element, fallbackToken, true);
  if (!normalizedUrl) {
    element.style.removeProperty(propertyName);
    return { status: 'fallback', probe: null };
  }

  const cssValue = `url(${JSON.stringify(normalizedUrl)})`;
  element.style.setProperty(propertyName, cssValue);
  const Constructor = ImageConstructor
    ?? element.ownerDocument?.defaultView?.Image
    ?? globalThis.Image;
  if (typeof Constructor !== 'function') return { status: 'unverified', probe: null };

  const probe = new Constructor();
  const requests = cssAssetRequests.get(element) || new Map();
  requests.set(propertyName, probe);
  cssAssetRequests.set(element, requests);
  const isCurrent = () => cssAssetRequests.get(element)?.get(propertyName) === probe;
  probe.onload = () => {
    if (isCurrent()) setFallbackToken(element, fallbackToken, false);
  };
  probe.onerror = () => {
    if (!isCurrent()) return;
    element.style.removeProperty(propertyName);
    setFallbackToken(element, fallbackToken, true);
  };
  probe.src = normalizedUrl;
  return { status: 'loading', probe };
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
