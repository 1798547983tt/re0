import { normalizeStoryIndex } from './creator-core.mjs';

export async function loadStoryIndex(url = './data/story-index.json') {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error(`剧情索引加载失败：${response.status}`);
  const data = await response.json();
  return normalizeStoryIndex(data);
}
