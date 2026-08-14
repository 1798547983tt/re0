export const INITIAL_LIST_LIMIT = 3;
export const LIST_BATCH_SIZE = 5;

const asObject = (value) => (value && typeof value === 'object' && !Array.isArray(value) ? value : {});

function safeMap(value, { keys = null, numeric = false } = {}) {
  const entries = Object.entries(asObject(value)).slice(0, 200);
  const result = {};
  for (const [key, raw] of entries) {
    if (!key || key.length > 160 || (keys && !keys.includes(key))) continue;
    if (numeric) {
      const count = Math.floor(Number(raw));
      if (Number.isFinite(count) && count >= INITIAL_LIST_LIMIT) result[key] = count;
    } else if (typeof raw === 'string' && raw.length <= 160) {
      result[key] = raw;
    }
  }
  return result;
}

export function uiStorageKey(chatId) {
  const scope = String(chatId ?? '').trim() || 'preview';
  return `re0-statusbar:ui:v2:${encodeURIComponent(scope)}`;
}

export function normalizeUiPreferences(value, { sectionIds = [], relationFilterIds = [] } = {}) {
  const source = asObject(value);
  return {
    activeSection: sectionIds.includes(source.activeSection) ? source.activeSection : (sectionIds[0] || 'overview'),
    detailsOpen: source.detailsOpen === true,
    relationFilter: relationFilterIds.includes(source.relationFilter) ? source.relationFilter : (relationFilterIds[0] || 'all'),
    themePreference: ['auto', 'day', 'night'].includes(source.themePreference) ? source.themePreference : 'auto',
    openGroupBySection: safeMap(source.openGroupBySection, { keys: sectionIds }),
    listLimits: safeMap(source.listLimits, { numeric: true }),
  };
}

export function resolveOpenGroup(openGroupBySection, sectionId, defaultGroupId, { compact = false } = {}) {
  const groups = asObject(openGroupBySection);
  if (Object.hasOwn(groups, sectionId)) return String(groups[sectionId] || '');
  return compact ? '' : String(defaultGroupId || '');
}

export function toggleOpenGroup(openGroupBySection, sectionId, groupId, currentGroupId) {
  return {
    ...asObject(openGroupBySection),
    [sectionId]: currentGroupId === groupId ? '' : groupId,
  };
}

export function visibleListLimit(listLimits, listKey, total) {
  const safeTotal = Math.max(0, Math.floor(Number(total) || 0));
  const configured = Math.floor(Number(asObject(listLimits)[listKey]));
  const requested = Number.isFinite(configured) && configured >= INITIAL_LIST_LIMIT
    ? configured
    : INITIAL_LIST_LIMIT;
  return Math.min(safeTotal, requested);
}

export function growListLimit(listLimits, listKey, total) {
  const current = visibleListLimit(listLimits, listKey, total);
  return {
    ...asObject(listLimits),
    [listKey]: Math.min(Math.max(0, Math.floor(Number(total) || 0)), current + LIST_BATCH_SIZE),
  };
}

export function resetListLimit(listLimits, listKey) {
  const next = { ...asObject(listLimits) };
  delete next[listKey];
  return next;
}
