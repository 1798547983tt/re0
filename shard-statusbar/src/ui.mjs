import { isSafeAssetUrl, resolveCharacterVisual } from './assets.mjs';

const SLOT_TONES = Object.freeze(['violet', 'cyan', 'gold', 'rose', 'mint', 'blue']);

function element(documentRef, tagName, className = '', text = '') {
  const node = documentRef.createElement(tagName);
  if (className) node.className = className;
  if (text !== '') node.textContent = String(text);
  return node;
}

function button(documentRef, label, action, className = '') {
  const node = element(documentRef, 'button', className, label);
  node.type = 'button';
  node.dataset.action = action;
  return node;
}

function compactText(value, limit = 28) {
  const text = String(value ?? '').replace(/\s+/gu, ' ').trim();
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
}

function setImage(node, url, alt = '') {
  if (!url || !isSafeAssetUrl(url)) return false;
  const image = node.ownerDocument.createElement('img');
  image.src = url;
  image.alt = alt;
  image.loading = 'lazy';
  image.decoding = 'async';
  image.addEventListener('error', () => image.remove(), { once: true });
  node.append(image);
  return true;
}

function avatar(documentRef, person, options = {}) {
  const shell = element(documentRef, 'span', `re0-replica-avatar ${options.className || ''}`.trim());
  const portraitKey = person?.portrait?.portraitKey || '';
  const url = options.url || (portraitKey ? resolveCharacterVisual(portraitKey, { search: options.search, base: options.assetBase }) : '');
  if (!setImage(shell, url, `${person?.name || '人物'}头像`)) {
    shell.append(element(documentRef, 'span', 're0-replica-avatar__initial', person?.portrait?.initial || String(person?.name || '?').trim().slice(0, 1) || '?'));
  }
  return shell;
}

function renderBrand(documentRef) {
  const brand = element(documentRef, 'div', 're0-replica-brand');
  const mark = element(documentRef, 'span', 're0-replica-brand__mark', '✦');
  mark.setAttribute('aria-hidden', 'true');
  brand.append(
    mark,
    element(documentRef, 'div', 're0-replica-brand__copy', '星屑同调'),
    element(documentRef, 'strong', 're0-replica-brand__title', 'Re:0 / 档案'),
  );
  return brand;
}

function renderLeftRail(documentRef, model, state) {
  const rail = element(documentRef, 'aside', 're0-replica-left-rail');
  rail.append(renderBrand(documentRef));
  const nav = element(documentRef, 'nav', 're0-replica-nav');
  nav.setAttribute('aria-label', '状态领域');
  for (const page of model.navigation) {
    const item = button(documentRef, '', 'select-replica-nav', 're0-replica-nav__item');
    item.dataset.pageId = page.id;
    item.setAttribute('aria-current', String(state.pageId === page.id));
    item.append(
      element(documentRef, 'span', 're0-replica-nav__glyph', page.glyph),
      element(documentRef, 'span', 're0-replica-nav__label', page.label),
    );
    nav.append(item);
  }
  rail.append(nav);
  return rail;
}

function renderPersonRail(documentRef, model, state, options) {
  const rail = element(documentRef, 'header', 're0-replica-person-rail');
  rail.setAttribute('aria-label', '人物轨道');
  const alert = element(documentRef, 'button', 're0-replica-alert', '');
  alert.type = 'button';
  alert.dataset.action = 'refresh-replica';
  alert.setAttribute('aria-label', '刷新当前状态');
  alert.append(element(documentRef, 'span', '', '!'));
  rail.append(alert);
  const list = element(documentRef, 'div', 're0-replica-person-rail__list');
  for (const person of model.people) {
    const item = button(documentRef, '', 'select-replica-person', 're0-replica-person');
    item.dataset.personName = person.name;
    item.setAttribute('aria-label', `切换到${person.name}`);
    item.setAttribute('aria-current', String(person.name === model.activePerson.name));
    if (person.name === model.activePerson.name) item.dataset.active = 'true';
    item.append(avatar(documentRef, person, options));
    list.append(item);
  }
  rail.append(list);
  const guide = element(documentRef, 'div', 're0-replica-guide');
  guide.append(element(documentRef, 'span', 're0-replica-guide__badge', '新'), element(documentRef, 'span', '', '角色档案'));
  rail.append(guide);
  const close = button(documentRef, '×', 'close-replica', 're0-replica-close');
  close.setAttribute('aria-label', '关闭状态栏');
  rail.append(close);
  return rail;
}

function renderSlot(documentRef, slot, pageId, state, options) {
  const item = button(documentRef, '', 'select-replica-slot', `re0-replica-fragment re0-replica-fragment--${slot.number}`);
  item.dataset.replicaSlot = String(slot.number);
  item.setAttribute('data-replica-slot', String(slot.number));
  item.dataset.pageId = pageId;
  item.setAttribute('aria-pressed', String(state.detailOpen && state.slotNumber === slot.number));
  item.style.setProperty('--re0-slot-tone', slot.tone || SLOT_TONES[slot.number - 1]);
  const marker = element(documentRef, 'span', 're0-replica-fragment__marker');
  marker.append(
    element(documentRef, 'span', 're0-replica-fragment__icon', slot.icon),
    element(documentRef, 'strong', 're0-replica-fragment__number', String(slot.number)),
  );
  const copy = element(documentRef, 'span', 're0-replica-fragment__copy');
  copy.append(element(documentRef, 'strong', '', slot.title), element(documentRef, 'small', '', compactText(slot.summary)));
  item.append(marker, copy);
  return item;
}

function renderStage(documentRef, page, state, options) {
  const stage = element(documentRef, 'main', 're0-replica-stage');
  stage.setAttribute('aria-label', `${page.label}六槽位碎片`);
  for (const slot of page.slots) stage.append(renderSlot(documentRef, slot, page.id, state, options));
  return stage;
}

function renderDetail(documentRef, model, state) {
  const detail = element(documentRef, 'aside', 're0-replica-detail');
  detail.dataset.replicaDetail = 'true';
  detail.setAttribute('data-replica-detail', 'true');
  detail.setAttribute('aria-label', '碎片详情');
  const page = model.navigation.find((entry) => entry.id === state.pageId) || model.navigation[0];
  const slot = page.slots.find((entry) => entry.number === state.slotNumber) || page.slots[0];
  const iconBox = element(documentRef, 'div', 're0-replica-detail__iconbox');
  iconBox.append(element(documentRef, 'span', 're0-replica-detail__icon', slot.icon));
  const copy = element(documentRef, 'div', 're0-replica-detail__copy');
  copy.append(
    element(documentRef, 'span', 're0-replica-detail__eyebrow', `${page.label} · ${slot.number}`),
    element(documentRef, 'h2', '', slot.title),
    element(documentRef, 'p', '', slot.detail),
  );
  detail.append(iconBox, copy);
  if (page.id === 'details' && model.activePerson.category === '主角') {
    const upload = button(documentRef, '编辑主角头像', 'edit-replica-avatar', 're0-replica-detail__avatar-action');
    detail.append(upload);
  }
  return detail;
}

export function createReplicaSurface(documentRef) {
  const root = element(documentRef, 'div', 're0-replica-root');
  root.id = 're0-shard-statusbar-root';
  root.dataset.re0ReplicaVersion = '1';
  const scene = element(documentRef, 'section', 're0-replica-scene');
  scene.setAttribute('aria-label', 'Re:0 星屑碎片状态栏');
  const art = element(documentRef, 'div', 're0-replica-art');
  art.setAttribute('aria-hidden', 'true');
  const leftRailMount = element(documentRef, 'div', 're0-replica-left-rail-mount');
  const personRailMount = element(documentRef, 'div', 're0-replica-person-rail-mount');
  const stageMount = element(documentRef, 'div', 're0-replica-stage-mount');
  const detailMount = element(documentRef, 'div', 're0-replica-detail-mount');
  const back = button(documentRef, '↶', 'back-to-replica', 're0-replica-back');
  back.setAttribute('aria-label', '返回碎片主界面');
  const active = element(documentRef, 'div', 're0-replica-active');
  active.dataset.replicaActive = 'true';
  active.setAttribute('data-replica-active', 'true');
  const uid = element(documentRef, 'div', 're0-replica-uid');
  uid.dataset.replicaUid = 'true';
  uid.setAttribute('data-replica-uid', 'true');
  const grid = button(documentRef, '▦', 'replica-grid', 're0-replica-grid');
  grid.setAttribute('aria-label', '状态栏菜单');
  const status = element(documentRef, 'p', 're0-replica-status');
  status.setAttribute('aria-live', 'polite');
  scene.append(art, leftRailMount, personRailMount, stageMount, detailMount, back, active, uid, grid, status);
  const orb = button(documentRef, '', 'toggle-panel', 're0-shard-orb');
  orb.dataset.role = 'orb';
  orb.setAttribute('aria-label', '打开 Re:0 星屑状态栏');
  orb.append(element(documentRef, 'span', 're0-shard-orb__halo'), element(documentRef, 'span', 're0-shard-orb__sigil'), element(documentRef, 'span', 're0-shard-orb__sr', '星屑状态栏'));
  root.append(scene, orb);
  return Object.freeze({ root, scene, art, leftRailMount, personRailMount, stageMount, detailMount, back, active, uid, grid, status, orb });
}

export function renderReplicaSurface(surface, model, state = {}, options = {}) {
  const documentRef = surface.root.ownerDocument;
  surface.root.dataset.open = String(Boolean(state.panelOpen));
  surface.root.dataset.detailOpen = String(Boolean(state.detailOpen));
  surface.root.dataset.pageId = state.pageId || model.selectedPage;
  surface.root.dataset.theme = 'night';
  surface.root.style.setProperty('--re0-replica-art', options.sceneUrl && isSafeAssetUrl(options.sceneUrl) ? `url(${JSON.stringify(options.sceneUrl)})` : 'none');
  surface.root.style.setProperty('--re0-replica-orb-sigil', options.sigilUrl && isSafeAssetUrl(options.sigilUrl) ? `url(${JSON.stringify(options.sigilUrl)})` : 'none');
  const page = model.navigation.find((entry) => entry.id === (state.pageId || model.selectedPage)) || model.navigation[0];
  surface.leftRailMount.replaceChildren(renderLeftRail(documentRef, model, state));
  surface.personRailMount.replaceChildren(renderPersonRail(documentRef, model, state, options));
  surface.personRailMount.hidden = Boolean(state.detailOpen);
  surface.stageMount.replaceChildren(renderStage(documentRef, page, state, options));
  surface.detailMount.replaceChildren(state.detailOpen ? renderDetail(documentRef, model, state) : element(documentRef, 'div'));
  surface.detailMount.hidden = !state.detailOpen;
  surface.back.hidden = !state.detailOpen;
  surface.active.textContent = state.detailOpen ? (page.slots.find((slot) => slot.number === state.slotNumber)?.active ? model.activePill : '未记录') : '';
  surface.active.hidden = !state.detailOpen;
  surface.uid.textContent = `UID:${model.uid}`;
  surface.status.textContent = options.message || `${model.coverage.declaredLeafCount || 172} 个变量映射 · ${model.activePerson.name}`;
}

export function setReplicaOpen(surface, open) {
  surface.root.dataset.open = String(Boolean(open));
  surface.orb.setAttribute('aria-expanded', String(Boolean(open)));
  surface.orb.setAttribute('aria-label', open ? '关闭 Re:0 星屑状态栏' : '打开 Re:0 星屑状态栏');
}

export function setReplicaDragging(surface, dragging) {
  surface.root.dataset.dragging = String(Boolean(dragging));
}
