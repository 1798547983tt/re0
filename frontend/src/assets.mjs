// The art commit is kept separate so the published GitHub URLs remain immutable.
export const ASSET_COMMIT = 'a6aeb9cca0f0066bd10aec2aba0fd4b220301788';
export const PINNED_GITHUB_ASSET_BASE = `https://raw.githubusercontent.com/1798547983tt/re0/${ASSET_COMMIT}/frontend/assets/`;

function useGithubAssets() {
  try {
    return window.__RE0_USE_GITHUB_ASSETS__ === true
      || new URLSearchParams(window.location.search).get('assets') === 'github';
  } catch {
    return false;
  }
}

export function assetUrl(filename) {
  if (useGithubAssets()) return `${PINNED_GITHUB_ASSET_BASE}${encodeURIComponent(filename)}`;
  return new URL(`../assets/${filename}`, import.meta.url).href;
}
