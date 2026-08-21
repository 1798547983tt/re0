import { buildShardModel } from './model.mjs';
import { resolveShardAsset } from './assets.mjs';
import {
  createPortraitRepository,
  cropPortrait,
  portraitKeys,
  resolvePortrait,
  validatePortraitUrl,
} from '../../statusbar/src/portraits.mjs';
import { createShardRuntime, discoverShardRuntimeScope } from './runtime.mjs';
import { createOrbDragController } from './orb.mjs';
import {
  createShardSurface,
  renderShardSurface,
  setSurfaceDragging,
  setSurfaceOpen,
} from './ui.mjs';

const SINGLETON_KEY = '__RE0_SHARD_STATUSBAR__';
const POSITION_KEY = 're0:shard-statusbar:orb-position:v1';
const THEME_KEY = 're0:shard-statusbar:theme:v1';
const STYLE_ID = 're0-shard-statusbar-style';

function hostWindow(start = globalThis) {
  try {
    if (start?.parent && start.parent !== start && start.parent.document) return start.parent;
  } catch {}
  return start;
}

function hostDocument(start = globalThis) {
  const host = hostWindow(start);
  try { return host.document || start.document; } catch { return start.document; }
}

function readLocal(storage, key, fallback) {
  try {
    const value = storage?.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function writeLocal(storage, key, value) {
  try { storage?.setItem(key, JSON.stringify(value)); } catch {}
}

function storageFor(host) {
  try { return host.localStorage; } catch { return null; }
}

function injectStyles(documentRef, cssText) {
  if (!cssText || !documentRef?.head) return null;
  const existing = documentRef.getElementById(STYLE_ID);
  if (existing) return existing;
  const style = documentRef.createElement('style');
  style.id = STYLE_ID;
  style.textContent = cssText;
  documentRef.head.append(style);
  return style;
}

function getChatId(scope) {
  for (const name of ['getChatId', 'getCurrentChatId', 'getCurrentChat']) {
    try {
      if (typeof scope?.[name] === 'function') {
        const value = scope[name]();
        if (typeof value === 'string' || typeof value === 'number') return String(value);
      }
    } catch {}
  }
  return '';
}

function serializePosition(position) {
  return {
    x: Math.min(1, Math.max(0, Number(position?.x) || 0.82)),
    y: Math.min(1, Math.max(0, Number(position?.y) || 0.5)),
  };
}

function currentPortraitView(cache, identity) {
  const keys = portraitKeys(identity);
  const portrait = resolvePortrait({
    name: identity.name,
    shared: cache.get(keys.shared) || null,
    override: keys.override ? cache.get(keys.override) || null : null,
  });
  if (portrait.kind === 'blob') {
    const sourceKey = portrait.source === 'override' && keys.override ? keys.override : keys.shared;
    return { ...portrait, url: cache.get(`${sourceKey}:url`) || '' };
  }
  if (portrait.kind === 'url') return { ...portrait, url: portrait.value };
  return portrait;
}

function imageObjectUrl(cache, key, blob, UrlApi) {
  if (!blob || typeof UrlApi?.createObjectURL !== 'function') return '';
  const previous = cache.get(`${key}:url`);
  if (previous) return previous;
  try {
    const url = UrlApi.createObjectURL(blob);
    cache.set(`${key}:url`, url);
    return url;
  } catch {
    return '';
  }
}

export function startShardStatusBar({
  scope = discoverShardRuntimeScope(globalThis),
  host = hostWindow(scope),
  documentRef = hostDocument(scope),
  cssText = '',
  assetBase = '',
} = {}) {
  if (!documentRef?.body) throw new Error('无法访问 SillyTavern 宿主文档');
  try {
    const existing = host[SINGLETON_KEY];
    if (existing?.version === 1 && typeof existing.destroy === 'function') return existing;
    existing?.destroy?.();
  } catch {}

  const storage = storageFor(host);
  const surface = createShardSurface(documentRef);
  const position = readLocal(storage, POSITION_KEY, { x: 0.82, y: 0.5 });
  const state = {
    panelOpen: false,
    selectedShard: 'protagonist',
    selectedPerson: '',
    themePreference: readLocal(storage, THEME_KEY, 'auto'),
    status: 'loading',
    message: '正在读取当前消息楼层…',
    model: null,
    statData: null,
    destroyed: false,
    lastFocus: null,
    refreshEpoch: 0,
  };
  const runtime = createShardRuntime(scope);
  const cache = new Map();
  const objectUrls = new Set();
  let portraitRepository = null;
  try {
    portraitRepository = createPortraitRepository({ databaseName: 're0-shard-statusbar' });
  } catch {}

  injectStyles(documentRef, cssText);
  documentRef.body.append(surface.root);

  const positionOrb = () => {
    surface.orb.style.left = `${position.x * 100}%`;
    surface.orb.style.top = `${position.y * 100}%`;
  };
  positionOrb();

  const chatId = getChatId(scope);
  const resolvePortraitFor = (identity) => currentPortraitView(cache, { ...identity, chatId });
  const assetSearch = (() => {
    try { return host.location?.search || ''; } catch { return ''; }
  })();
  const backgroundUrl = () => resolveShardAsset(`background:${state.model?.theme.mode === 'night' ? 'night' : 'day'}`, { search: assetSearch, base: assetBase });

  const render = () => {
    if (state.destroyed || !state.model) return;
    const active = documentRef.activeElement;
    const focusDescriptor = active && surface.panel.contains(active)
      ? {
        action: active.dataset?.action || '',
        shardId: active.dataset?.shardId || '',
        personName: active.dataset?.personName || '',
      }
      : null;
    renderShardSurface(surface, state.model, state, {
      status: state.status,
      message: state.message,
      backgroundUrl: backgroundUrl(),
      sigilUrl: resolveShardAsset('orb:sigil', { search: assetSearch, base: assetBase }),
      chatId,
      resolvePortrait: resolvePortraitFor,
    });
    setSurfaceOpen(surface, state.panelOpen);
    positionOrb();
    if (state.panelOpen && focusDescriptor?.action) {
      queueMicrotask(() => {
        const candidates = [...surface.panel.querySelectorAll('[data-action]')];
        const match = candidates.find((node) => (
          node.dataset.action === focusDescriptor.action
          && (!focusDescriptor.shardId || node.dataset.shardId === focusDescriptor.shardId)
          && (!focusDescriptor.personName || node.dataset.personName === focusDescriptor.personName)
        ));
        match?.focus();
      });
    }
  };

  const hydratePortraits = async () => {
    if (!portraitRepository || !state.model) return;
    const identities = [
      { namespace: 'protagonist', name: state.model.overview.protagonist.name },
      ...state.model.people.map((person) => ({ namespace: 'person', name: person.name })),
    ].filter((identity) => identity.name);
    const chatId = getChatId(scope);
    await Promise.all(identities.map(async (identity) => {
      const keys = portraitKeys({ ...identity, chatId });
      try {
        const shared = await portraitRepository.get(keys.shared);
        if (shared) {
          cache.set(keys.shared, shared);
          if (shared.kind === 'blob') {
            const url = imageObjectUrl(cache, keys.shared, shared.value, host.URL || globalThis.URL);
            if (url) objectUrls.add(url);
          }
        }
        if (keys.override) {
          const override = await portraitRepository.get(keys.override);
          if (override) {
            cache.set(keys.override, override);
            if (override.kind === 'blob') {
              const url = imageObjectUrl(cache, keys.override, override.value, host.URL || globalThis.URL);
              if (url) objectUrls.add(url);
            }
          }
        }
      } catch {}
    }));
    if (!state.destroyed) render();
  };

  const refresh = async () => {
    if (state.destroyed) return;
    const epoch = ++state.refreshEpoch;
    state.status = state.model ? 'refreshing' : 'loading';
    state.message = '正在读取当前消息楼层…';
    render();
    const result = await runtime.read(state.statData);
    if (state.destroyed || epoch !== state.refreshEpoch) return;
    state.status = result.status;
    state.message = result.message || (result.status === 'ready' ? '状态已同步' : '状态暂不可用');
    state.statData = result.statData;
    state.model = buildShardModel(result.statData, { themePreference: state.themePreference });
    render();
    hydratePortraits();
  };

  const setOpen = (open, opener = null) => {
    state.panelOpen = Boolean(open);
    if (open && opener) state.lastFocus = opener;
    setSurfaceOpen(surface, state.panelOpen);
    render();
    if (state.panelOpen) {
      queueMicrotask(() => surface.panel.querySelector('[data-action="close-panel"]')?.focus());
    } else {
      state.lastFocus?.focus?.();
      state.lastFocus = null;
    }
  };

  const selectShard = (id) => {
    if (!state.model?.shards.some((shard) => shard.id === id)) return;
    state.selectedShard = id;
    state.selectedPerson = '';
    render();
  };

  const savePortrait = async (form) => {
    if (!portraitRepository || !state.model) throw new Error('当前环境不支持本地头像库');
    const name = state.model.overview.protagonist.name || '主角';
    const chatId = getChatId(scope);
    const keys = portraitKeys({ namespace: 'protagonist', name, chatId });
    const file = form.querySelector('[data-portrait-file]')?.files?.[0] || null;
    const urlValue = form.querySelector('[data-portrait-url]')?.value || '';
    let record = null;
    if (file) {
      const blob = await cropPortrait({ source: file, size: 512, document: documentRef, createImageBitmap: host.createImageBitmap?.bind(host), URL: host.URL || globalThis.URL });
      record = { kind: 'blob', value: blob };
    } else if (urlValue.trim()) {
      const validation = validatePortraitUrl(urlValue);
      if (!validation.ok) throw new Error(validation.error);
      record = { kind: 'url', value: validation.value };
    } else {
      throw new Error('请选择图片文件或填写 HTTPS 图片 URL');
    }
    const scopeName = form.querySelector('[data-portrait-scope]')?.value === 'override' ? 'override' : 'shared';
    if (scopeName === 'override' && !keys.override) throw new Error('当前聊天没有可用的覆盖范围');
    const key = scopeName === 'shared' ? keys.shared : keys.override;
    await portraitRepository.put(key, record);
    cache.set(key, record);
    if (record.kind === 'blob') {
      const url = imageObjectUrl(cache, key, record.value, host.URL || globalThis.URL);
      if (url) objectUrls.add(url);
    }
    state.message = '主角头像已保存在本机。';
    render();
  };

  const removePortrait = async (form = null) => {
    if (!portraitRepository || !state.model) return;
    const name = state.model.overview.protagonist.name || '主角';
    const currentChatId = getChatId(scope);
    const keys = portraitKeys({ namespace: 'protagonist', name, chatId: currentChatId });
    const scopeName = form?.querySelector('[data-portrait-scope]')?.value === 'override' ? 'override' : 'shared';
    if (scopeName === 'override' && !keys.override) throw new Error('当前聊天没有可用的覆盖范围');
    const key = scopeName === 'shared' ? keys.shared : keys.override;
    await portraitRepository.remove(key);
    cache.delete(key);
    state.message = scopeName === 'shared' ? '已移除主角的共享头像。' : '已移除当前聊天的主角头像覆盖。';
    render();
  };

  const handleClick = (event) => {
    const actionNode = event.target?.closest?.('[data-action]');
    if (!actionNode || !surface.root.contains(actionNode)) return;
    const action = actionNode.dataset.action;
    if (action === 'toggle-panel') setOpen(!state.panelOpen, actionNode);
    else if (action === 'close-panel') setOpen(false);
    else if (action === 'select-shard') selectShard(actionNode.dataset.shardId);
    else if (action === 'close-detail') { state.selectedShard = ''; render(); }
    else if (action === 'open-person') {
      state.selectedShard = 'relations';
      state.selectedPerson = actionNode.dataset.personName || '';
      render();
    } else if (action === 'edit-protagonist') {
      state.selectedShard = 'protagonist';
      render();
      surface.panel.querySelector('[data-portrait-file]')?.focus();
    } else if (action === 'refresh') refresh();
    else if (action === 'theme-auto') {
      state.themePreference = 'auto';
      writeLocal(storage, THEME_KEY, state.themePreference);
      if (state.statData) state.model = buildShardModel(state.statData, { themePreference: 'auto' });
      refresh();
    } else if (action === 'cycle-theme') {
      const current = state.model?.theme.mode === 'night' ? 'night' : 'day';
      state.themePreference = current === 'day' ? 'night' : 'day';
      writeLocal(storage, THEME_KEY, state.themePreference);
      if (state.statData) state.model = buildShardModel(state.statData, { themePreference: state.themePreference });
      render();
    } else if (action === 'remove-protagonist-portrait') {
      removePortrait(actionNode.closest('form')).catch((error) => { state.message = error.message; render(); });
    } else if (action === 'save-protagonist-portrait') {
      const form = actionNode.closest('form');
      if (form) {
        event.preventDefault();
        savePortrait(form).catch((error) => { state.message = error.message; render(); });
      }
    }
  };

  const handleSubmit = (event) => {
    if (event.target?.matches?.('[data-action="save-protagonist-portrait"]')) {
      event.preventDefault();
      savePortrait(event.target).catch((error) => { state.message = error.message; render(); });
    }
  };

  const orbGesture = createOrbDragController({
    initial: position,
    viewport: () => ({ width: host.innerWidth || 1, height: host.innerHeight || 1 }),
    onStateChange: ({ dragging }) => setSurfaceDragging(surface, dragging),
    onPositionChange: (next) => {
      position.x = next.x;
      position.y = next.y;
      positionOrb();
      writeLocal(storage, POSITION_KEY, serializePosition(position));
    },
  });

  const pointerDown = (event) => {
    if (!event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0)) return;
    try { surface.orb.setPointerCapture(event.pointerId); } catch {}
    orbGesture.pointerDown(event);
  };
  const pointerMove = (event) => orbGesture.pointerMove(event);
  const pointerUp = (event) => {
    orbGesture.pointerUp(event);
    try { surface.orb.releasePointerCapture(event.pointerId); } catch {}
  };
  const pointerCancel = (event) => orbGesture.pointerCancel(event);
  const keydown = (event) => {
    if (event.key === 'Escape' && state.panelOpen) {
      event.preventDefault();
      setOpen(false);
      return;
    }
    if (event.key === 'Tab' && state.panelOpen) {
      const focusable = [...surface.panel.querySelectorAll('button, input, select, textarea, a[href]')]
        .filter((node) => !node.disabled && !node.hidden && node.getClientRects().length > 0);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable.at(-1);
      if (event.shiftKey && documentRef.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && documentRef.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  };
  surface.root.addEventListener('click', handleClick);
  surface.root.addEventListener('submit', handleSubmit);
  surface.orb.addEventListener('pointerdown', pointerDown);
  surface.orb.addEventListener('pointermove', pointerMove);
  surface.orb.addEventListener('pointerup', pointerUp);
  surface.orb.addEventListener('pointercancel', pointerCancel);
  documentRef.addEventListener('keydown', keydown);
  const stopRuntime = runtime.subscribe(() => refresh());

  const destroy = () => {
    if (state.destroyed) return;
    state.destroyed = true;
    stopRuntime();
    surface.root.removeEventListener('click', handleClick);
    surface.root.removeEventListener('submit', handleSubmit);
    surface.orb.removeEventListener('pointerdown', pointerDown);
    surface.orb.removeEventListener('pointermove', pointerMove);
    surface.orb.removeEventListener('pointerup', pointerUp);
    surface.orb.removeEventListener('pointercancel', pointerCancel);
    documentRef.removeEventListener('keydown', keydown);
    for (const url of objectUrls) {
      try { (host.URL || globalThis.URL)?.revokeObjectURL(url); } catch {}
    }
    portraitRepository?.close?.().catch?.(() => {});
    surface.root.remove();
    try { delete host[SINGLETON_KEY]; } catch {}
  };

  const api = Object.freeze({ version: 1, refresh, open: () => setOpen(true, surface.orb), close: () => setOpen(false), destroy, surface, runtime });
  try { host[SINGLETON_KEY] = api; } catch {}
  refresh();
  return api;
}

export { hostWindow, hostDocument, SINGLETON_KEY };
