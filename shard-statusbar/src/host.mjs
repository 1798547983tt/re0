import { buildReplicaModel } from './replica-model.mjs';
import { resolvePortraitAsset, resolveShardAsset } from './assets.mjs';
import {
  createPortraitRepository,
  cropPortrait,
  portraitKeys,
} from '../../statusbar/src/portraits.mjs';
import { createShardRuntime, discoverShardRuntimeScope } from './runtime.mjs';
import { createOrbDragController } from './orb.mjs';
import {
  createReplicaSurface,
  renderReplicaSurface,
  setReplicaDragging,
  setReplicaOpen,
} from './ui.mjs';

export const SINGLETON_KEY = '__RE0_SHARD_STATUSBAR__';
const POSITION_KEY = 're0:shard-statusbar:orb-position:v2';
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

function normalizePosition(value) {
  return {
    x: Math.min(1, Math.max(0, Number(value?.x) || 0.82)),
    y: Math.min(1, Math.max(0, Number(value?.y) || 0.5)),
  };
}

function imageUrl(cache, key, blob, URLApi) {
  if (!blob || typeof URLApi?.createObjectURL !== 'function') return '';
  const old = cache.get(`${key}:url`);
  if (old) return old;
  try {
    const url = URLApi.createObjectURL(blob);
    cache.set(`${key}:url`, url);
    return url;
  } catch {
    return '';
  }
}

function resolveScene(model, search, base) {
  return resolveShardAsset('scene:universal', { search, base })
    || resolveShardAsset('background:night', { search, base });
}

export function startShardStatusBar({
  scope = discoverRuntimeScope(globalThis),
  host = hostWindow(scope),
  documentRef = hostDocument(scope),
  cssText = '',
  assetBase = '',
} = {}) {
  if (!documentRef?.body) throw new Error('无法访问 SillyTavern 宿主文档');
  try {
    const existing = host[SINGLETON_KEY];
    if (existing?.version === 2 && typeof existing.destroy === 'function') return existing;
    existing?.destroy?.();
  } catch {}

  const storage = storageFor(host);
  const surface = createReplicaSurface(documentRef);
  const orbPosition = normalizePosition(readLocal(storage, POSITION_KEY, { x: 0.82, y: 0.5 }));
  const state = {
    panelOpen: false,
    detailOpen: false,
    pageId: 'details',
    slotNumber: 1,
    personName: '',
    status: 'loading',
    message: '正在读取当前消息楼层…',
    statData: null,
    model: null,
    lastFocus: null,
    refreshEpoch: 0,
    destroyed: false,
  };
  const runtime = createShardRuntime(scope);
  const cache = new Map();
  const objectUrls = new Set();
  let portraitRepository = null;
  try { portraitRepository = createPortraitRepository({ databaseName: 're0-shard-statusbar' }); } catch {}

  injectStyles(documentRef, cssText);
  documentRef.body.append(surface.root);

  const fileInput = documentRef.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'image/png,image/jpeg,image/webp,image/gif';
  fileInput.hidden = true;
  fileInput.dataset.replicaAvatarFile = 'true';
  surface.root.append(fileInput);

  const previousOverflow = documentRef.body.style.overflow;
  const assetSearch = (() => { try { return host.location?.search || ''; } catch { return ''; } })();
  const chatId = getChatId(scope);

  const positionOrb = () => {
    surface.orb.style.left = `${orbPosition.x * 100}%`;
    surface.orb.style.top = `${orbPosition.y * 100}%`;
  };
  positionOrb();

  const render = () => {
    if (state.destroyed || !state.model) return;
    const active = documentRef.activeElement;
    const focusAction = active && surface.scene.contains(active) ? active.dataset?.action || '' : '';
    const sceneUrl = resolveScene(state.model, assetSearch, assetBase);
    renderReplicaSurface(surface, state.model, state, {
      sceneUrl,
      sigilUrl: resolveShardAsset('orb:sigil', { search: assetSearch, base: assetBase }),
      search: assetSearch,
      assetBase,
      message: state.message,
    });
    setReplicaOpen(surface, state.panelOpen);
    positionOrb();
    if (focusAction && state.panelOpen) {
      queueMicrotask(() => surface.scene.querySelector(`[data-action="${CSS.escape(focusAction)}"]`)?.focus());
    }
  };

  const hydratePortraits = async () => {
    if (!portraitRepository || !state.model) return;
    const identities = [
      { namespace: 'protagonist', name: state.model.activePerson.name },
      ...state.model.people.map((person) => ({ namespace: 'person', name: person.name })),
    ];
    await Promise.all(identities.map(async (identity) => {
      const keys = portraitKeys({ ...identity, chatId });
      try {
        const shared = await portraitRepository.get(keys.shared);
        if (shared) {
          cache.set(keys.shared, shared);
          if (shared.kind === 'blob') {
            const url = imageUrl(cache, keys.shared, shared.value, host.URL || globalThis.URL);
            if (url) objectUrls.add(url);
          }
        }
        if (keys.override) {
          const override = await portraitRepository.get(keys.override);
          if (override) {
            cache.set(keys.override, override);
            if (override.kind === 'blob') {
              const url = imageUrl(cache, keys.override, override.value, host.URL || globalThis.URL);
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
    state.model = buildReplicaModel(result.statData, { personName: state.personName, pageId: state.pageId });
    render();
    hydratePortraits();
  };

  const setOpen = (open, opener = null) => {
    state.panelOpen = Boolean(open);
    if (open && opener) state.lastFocus = opener;
    documentRef.body.style.overflow = state.panelOpen ? 'hidden' : previousOverflow;
    setReplicaOpen(surface, state.panelOpen);
    render();
    if (state.panelOpen) queueMicrotask(() => surface.scene.querySelector('[data-action="select-replica-nav"]')?.focus());
    else {
      state.detailOpen = false;
      state.lastFocus?.focus?.();
      state.lastFocus = null;
    }
  };

  const rebuildModel = () => {
    if (state.statData) state.model = buildReplicaModel(state.statData, { personName: state.personName, pageId: state.pageId });
    render();
  };

  const saveAvatar = async (file) => {
    if (!portraitRepository || !state.model || !file) return;
    const name = state.model.activePerson.name;
    const keys = portraitKeys({ namespace: 'protagonist', name, chatId });
    const blob = await cropPortrait({ source: file, size: 512, document: documentRef, URL: host.URL || globalThis.URL, createImageBitmap: host.createImageBitmap?.bind(host) });
    const record = { kind: 'blob', value: blob };
    await portraitRepository.put(keys.shared, record);
    cache.set(keys.shared, record);
    const url = imageUrl(cache, keys.shared, blob, host.URL || globalThis.URL);
    if (url) objectUrls.add(url);
    state.message = '主角头像已保存在本机。';
    render();
  };

  const handleClick = (event) => {
    const actionNode = event.target?.closest?.('[data-action]');
    if (!actionNode || !surface.root.contains(actionNode)) return;
    const action = actionNode.dataset.action;
    if (action === 'toggle-panel') setOpen(!state.panelOpen, actionNode);
    else if (action === 'close-replica') setOpen(false);
    else if (action === 'back-to-replica') { state.detailOpen = false; render(); }
    else if (action === 'select-replica-nav') {
      state.pageId = actionNode.dataset.pageId || 'details';
      state.slotNumber = 1;
      state.detailOpen = false;
      rebuildModel();
    } else if (action === 'select-replica-person') {
      state.personName = actionNode.dataset.personName || '';
      state.pageId = 'details';
      state.slotNumber = 1;
      state.detailOpen = false;
      rebuildModel();
    } else if (action === 'select-replica-slot') {
      state.pageId = actionNode.dataset.pageId || state.pageId;
      state.slotNumber = Number(actionNode.dataset.replicaSlot) || 1;
      state.detailOpen = true;
      render();
      queueMicrotask(() => surface.back.focus());
    } else if (action === 'refresh-replica') refresh();
    else if (action === 'edit-replica-avatar') fileInput.click();
    else if (action === 'replica-grid') state.message = '当前界面为只读状态栏。';
  };

  const keydown = (event) => {
    if (event.key === 'Escape' && state.panelOpen) {
      event.preventDefault();
      if (state.detailOpen) { state.detailOpen = false; render(); }
      else setOpen(false);
      return;
    }
    if (event.key === 'Tab' && state.panelOpen) {
      const focusable = [...surface.scene.querySelectorAll('button, input, select, textarea')]
        .filter((node) => !node.disabled && !node.hidden && node.getClientRects().length > 0);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable.at(-1);
      if (event.shiftKey && documentRef.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && documentRef.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  };

  const orbGesture = createOrbDragController({
    initial: orbPosition,
    viewport: () => ({ width: host.innerWidth || 1, height: host.innerHeight || 1 }),
    onStateChange: ({ dragging }) => setReplicaDragging(surface, dragging),
    onPositionChange: (next) => {
      orbPosition.x = next.x;
      orbPosition.y = next.y;
      positionOrb();
      writeLocal(storage, POSITION_KEY, normalizePosition(orbPosition));
    },
  });
  const pointerDown = (event) => {
    if (!event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0)) return;
    try { surface.orb.setPointerCapture(event.pointerId); } catch {}
    orbGesture.pointerDown(event);
  };
  const pointerMove = (event) => orbGesture.pointerMove(event);
  const pointerUp = (event) => { orbGesture.pointerUp(event); try { surface.orb.releasePointerCapture(event.pointerId); } catch {} };
  const pointerCancel = (event) => orbGesture.pointerCancel(event);
  const fileChange = (event) => saveAvatar(event.target.files?.[0]).catch((error) => { state.message = error.message; render(); });

  surface.root.addEventListener('click', handleClick);
  surface.root.addEventListener('keydown', keydown);
  surface.orb.addEventListener('pointerdown', pointerDown);
  surface.orb.addEventListener('pointermove', pointerMove);
  surface.orb.addEventListener('pointerup', pointerUp);
  surface.orb.addEventListener('pointercancel', pointerCancel);
  fileInput.addEventListener('change', fileChange);
  const stopRuntime = runtime.subscribe(() => refresh());

  const destroy = () => {
    if (state.destroyed) return;
    state.destroyed = true;
    stopRuntime();
    documentRef.body.style.overflow = previousOverflow;
    surface.root.removeEventListener('click', handleClick);
    surface.root.removeEventListener('keydown', keydown);
    surface.orb.removeEventListener('pointerdown', pointerDown);
    surface.orb.removeEventListener('pointermove', pointerMove);
    surface.orb.removeEventListener('pointerup', pointerUp);
    surface.orb.removeEventListener('pointercancel', pointerCancel);
    fileInput.removeEventListener('change', fileChange);
    for (const url of objectUrls) { try { (host.URL || globalThis.URL)?.revokeObjectURL(url); } catch {} }
    portraitRepository?.close?.().catch?.(() => {});
    surface.root.remove();
    try { delete host[SINGLETON_KEY]; } catch {}
  };

  const api = Object.freeze({ version: 2, refresh, open: () => setOpen(true, surface.orb), close: () => setOpen(false), destroy, surface, runtime });
  try { host[SINGLETON_KEY] = api; } catch {}
  refresh();
  return api;
}

function discoverRuntimeScope(start) {
  return discoverShardRuntimeScope(start);
}

export { hostWindow, hostDocument };
