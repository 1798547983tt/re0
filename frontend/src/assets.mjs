// The art commit is kept separate so the published GitHub URLs remain immutable.
export const ASSET_COMMIT = 'a6aeb9cca0f0066bd10aec2aba0fd4b220301788';
export const PINNED_GITHUB_ASSET_BASE = `https://raw.githubusercontent.com/1798547983tt/re0/${ASSET_COMMIT}/frontend/assets/`;

function useGithubAssets() {
  try {
    const requestedMode = new URLSearchParams(window.location.search).get('assets');
    if (requestedMode === 'local') return false;
    if (requestedMode === 'github') return true;
    return window.__RE0_USE_GITHUB_ASSETS__ !== false;
  } catch {
    return true;
  }
}

export function assetUrl(filename) {
  if (useGithubAssets()) return `${PINNED_GITHUB_ASSET_BASE}${encodeURIComponent(filename)}`;
  return new URL(`../assets/${filename}`, import.meta.url).href;
}
