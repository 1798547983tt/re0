export const READING_FONTS = Object.freeze([
  Object.freeze({ id: 'serif', label: '典籍宋体', stack: '"Noto Serif SC", "Source Han Serif SC", "Songti SC", SimSun, serif' }),
  Object.freeze({ id: 'sans', label: '清晰黑体', stack: '"Noto Sans SC", "Source Han Sans SC", "Microsoft YaHei", sans-serif' }),
  Object.freeze({ id: 'wenkai', label: '霞鹜文楷', stack: '"LXGW WenKai", "STKaiti", KaiTi, serif' }),
  Object.freeze({ id: 'xiaowei', label: '站酷小薇', stack: '"ZCOOL XiaoWei", "FZShuTi", "STKaiti", serif' }),
]);

export const READING_SIZES = Object.freeze([
  Object.freeze({ id: 'small', label: '小', px: 15 }),
  Object.freeze({ id: 'medium', label: '中', px: 17 }),
  Object.freeze({ id: 'large', label: '大', px: 19 }),
  Object.freeze({ id: 'xlarge', label: '特大', px: 22 }),
]);

export const STORAGE_KEYS = Object.freeze({
  theme: 're0:narrative-v2:theme',
  font: 're0:narrative-v2:font',
  size: 're0:narrative-v2:size',
  staticMode: 're0:narrative-v2:static',
});

export const DEFAULT_READING_SETTINGS = Object.freeze({
  theme: 'auto',
  font: 'serif',
  size: 'medium',
  staticMode: false,
});

const THEMES = new Set(['auto', 'day', 'night', 'tea']);
const FONTS = new Set(READING_FONTS.map((item) => item.id));
const SIZES = new Set(READING_SIZES.map((item) => item.id));

export function normalizeReadingSettings(value = {}) {
  return {
    theme: THEMES.has(value?.theme) ? value.theme : DEFAULT_READING_SETTINGS.theme,
    font: FONTS.has(value?.font) ? value.font : DEFAULT_READING_SETTINGS.font,
    size: SIZES.has(value?.size) ? value.size : DEFAULT_READING_SETTINGS.size,
    staticMode: value?.staticMode === true,
  };
}

function safeRead(storage, key) {
  try { return storage?.getItem?.(key) ?? null; } catch { return null; }
}

export function readReadingSettings(storage = globalThis.localStorage) {
  return normalizeReadingSettings({
    theme: safeRead(storage, STORAGE_KEYS.theme),
    font: safeRead(storage, STORAGE_KEYS.font),
    size: safeRead(storage, STORAGE_KEYS.size),
    staticMode: safeRead(storage, STORAGE_KEYS.staticMode) === 'true',
  });
}

export function writeReadingSettings(settings, storage = globalThis.localStorage) {
  const normalized = normalizeReadingSettings(settings);
  try {
    storage?.setItem?.(STORAGE_KEYS.theme, normalized.theme);
    storage?.setItem?.(STORAGE_KEYS.font, normalized.font);
    storage?.setItem?.(STORAGE_KEYS.size, normalized.size);
    storage?.setItem?.(STORAGE_KEYS.staticMode, String(normalized.staticMode));
  } catch {
    return normalized;
  }
  return normalized;
}

export function fontById(id) {
  return READING_FONTS.find((item) => item.id === id) ?? READING_FONTS[0];
}

export function sizeById(id) {
  return READING_SIZES.find((item) => item.id === id) ?? READING_SIZES[1];
}
