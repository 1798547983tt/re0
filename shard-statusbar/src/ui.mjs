import { asText, clampMeter } from '../../statusbar/src/status-core.mjs';
import { portraitKeys, resolvePortrait } from '../../statusbar/src/portraits.mjs';
import { isSafeAssetUrl, resolvePortraitAsset } from './assets.mjs';

const TONES = Object.freeze({
  violet: '#b8a1ff',
  cyan: '#85e6ff',
  rose: '#f49ab8',
  gold: '#f5d58b',
  ember: '#ffb48a',
  mint: '#9de8c9',
  blue: '#9dbdff',
  slate: '#b8c7d8',
});

function element(documentRef, tag, className = '', text = '') {
  const node = documentRef.createElement(tag);
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

function fieldList(documentRef, fields) {
  const list = element(documentRef, 'dl', 're0-shard-fields');
  for (const field of fields || []) {
    const row = element(documentRef, 'div', 're0-shard-field');
    row.append(
      element(documentRef, 'dt', '', field.path || field.key || '字段'),
      element(documentRef, 'dd', '', field.value ?? '未记录'),
    );
    list.append(row);
  }
  return list;
}

function setImage(node, url, alt = '') {
  if (!url || !isSafeAssetUrl(url)) return false;
  const image = node.ownerDocument.createElement('img');
  image.loading = 'lazy';
  image.decoding = 'async';
  image.alt = alt;
  image.src = url;
  image.addEventListener('error', () => image.remove(), { once: true });
  node.append(image);
  return true;
}

function avatarNode(documentRef, { name, portrait, url = '', className = '' }) {
  const shell = element(documentRef, 'span', `re0-shard-avatar ${className}`.trim());
  shell.setAttribute('aria-hidden', 'true');
  const resolved = url || (portrait?.portraitKey ? resolvePortraitAsset(portrait.portraitKey) : '');
  if (!setImage(shell, resolved, `${name || '人物'}头像`)) {
    shell.append(element(documentRef, 'span', 're0-shard-avatar__initial', portrait?.initial || String(name || '?').trim().slice(0, 1) || '?'));
  }
  return shell;
}

function meter(documentRef, instrument) {
  const wrapper = element(documentRef, 'div', `re0-shard-meter re0-shard-meter--${instrument.tone || 'neutral'}`);
  const label = element(documentRef, 'div', 're0-shard-meter__label');
  label.append(element(documentRef, 'span', '', instrument.label), element(documentRef, 'strong', '', String(Math.round(clampMeter(instrument.value)))));
  const track = element(documentRef, 'div', 're0-shard-meter__track');
  track.setAttribute('role', 'meter');
  track.setAttribute('aria-label', instrument.label);
  track.setAttribute('aria-valuemin', '0');
  track.setAttribute('aria-valuemax', '100');
  track.setAttribute('aria-valuenow', String(clampMeter(instrument.value)));
  const fill = element(documentRef, 'span', 're0-shard-meter__fill');
  fill.style.setProperty('--re0-meter-value', `${clampMeter(instrument.value)}%`);
  track.append(fill);
  wrapper.append(label, track);
  return wrapper;
}

function renderHero(documentRef, model, options) {
  const hero = element(documentRef, 'section', 're0-shard-hero');
  const identity = element(documentRef, 'div', 're0-shard-hero__identity');
  const avatarButton = button(documentRef, '', 'edit-protagonist', 're0-shard-hero__avatar');
  avatarButton.setAttribute('aria-label', `更换${model.overview.protagonist.name || '主角'}头像`);
  const portrait = options.resolvePortrait?.({ namespace: 'protagonist', name: model.overview.protagonist.name });
  avatarButton.append(avatarNode(documentRef, {
    name: model.overview.protagonist.name,
    portrait: portrait || { initial: model.initials.protagonist },
    url: portrait?.url || '',
    className: 're0-shard-avatar--hero',
  }));
  const copy = element(documentRef, 'div', 're0-shard-hero__copy');
  copy.append(
    element(documentRef, 'span', 're0-shard-kicker', 'CURRENT PROTAGONIST'),
    element(documentRef, 'h2', '', model.overview.protagonist.name || '未命名主角'),
    element(documentRef, 'p', '', `${model.overview.protagonist.identity || '身份未记录'} · ${model.overview.protagonist.status || '状态未知'}`),
  );
  avatarButton.append(copy);
  identity.append(avatarButton);

  const pulse = element(documentRef, 'div', 're0-shard-hero__pulse');
  pulse.append(
    element(documentRef, 'span', 're0-shard-kicker', 'WORLD PULSE'),
    element(documentRef, 'strong', '', `${model.overview.time.date} · ${model.overview.time.period}`),
    element(documentRef, 'span', '', model.overview.location.filter(Boolean).join(' · ') || '地点未记录'),
  );
  hero.append(identity, pulse);

  const meters = element(documentRef, 'div', 're0-shard-hero__meters');
  for (const instrument of model.overview.instruments) meters.append(meter(documentRef, instrument));
  hero.append(meters);

  const target = element(documentRef, 'p', 're0-shard-hero__target');
  target.append(element(documentRef, 'span', 're0-shard-kicker', 'ACTIVE INTENT'), element(documentRef, 'span', '', model.overview.target || '当前目标未记录'));
  hero.append(target);
  return hero;
}

function renderPeople(documentRef, model) {
  const strip = element(documentRef, 'nav', 're0-shard-people');
  strip.setAttribute('aria-label', '当前关系人物');
  strip.append(element(documentRef, 'span', 're0-shard-people__label', '关系人物'));
  if (!model.people.length) {
    strip.append(element(documentRef, 'span', 're0-shard-muted', '暂无当前关系记录'));
    return strip;
  }
  for (const person of model.people.slice(0, 12)) {
    const chip = button(documentRef, '', 'open-person', 're0-shard-person-chip');
    chip.dataset.personName = person.name;
    chip.dataset.personCategory = person.category;
    chip.setAttribute('aria-label', `查看${person.name}的关系档案`);
    chip.append(avatarNode(documentRef, { name: person.name, portrait: person.portrait }));
    chip.append(element(documentRef, 'span', 're0-shard-person-chip__name', person.name));
    strip.append(chip);
  }
  return strip;
}

function renderShardButton(documentRef, shard, selected, options) {
  const node = button(documentRef, '', 'select-shard', `re0-shard-fragment re0-shard-fragment--${shard.tone}`);
  node.dataset.shardId = shard.id;
  node.dataset.index = String(options.index);
  node.setAttribute('aria-pressed', String(selected));
  node.style.setProperty('--re0-shard-accent', TONES[shard.tone] || TONES.slate);
  if (options.backgroundUrl && isSafeAssetUrl(options.backgroundUrl)) node.style.setProperty('--re0-shard-image', `url(${JSON.stringify(options.backgroundUrl)})`);
  const edge = element(documentRef, 'span', 're0-shard-fragment__edge');
  const glyph = element(documentRef, 'span', 're0-shard-fragment__glyph', shard.glyph);
  glyph.setAttribute('aria-hidden', 'true');
  const copy = element(documentRef, 'span', 're0-shard-fragment__copy');
  copy.append(
    element(documentRef, 'span', 're0-shard-kicker', shard.eyebrow),
    element(documentRef, 'strong', '', shard.title),
    element(documentRef, 'small', '', shard.summary),
  );
  const count = element(documentRef, 'span', 're0-shard-fragment__count', String(shard.metric));
  count.setAttribute('aria-label', `${shard.metric} 项`);
  node.append(edge, glyph, copy, count);
  return node;
}

function renderShardStage(documentRef, model, state, options) {
  const stage = element(documentRef, 'section', 're0-shard-stage');
  stage.setAttribute('aria-label', '状态碎片');
  stage.append(element(documentRef, 'div', 're0-shard-stage__halo'));
  for (const [index, shard] of model.shards.entries()) {
    stage.append(renderShardButton(documentRef, shard, state.selectedShard === shard.id, {
      index,
      backgroundUrl: options.backgroundUrl,
    }));
  }
  return stage;
}

function renderRecord(documentRef, record, options = {}) {
  const card = options.interactive ? button(documentRef, '', options.action || 'open-record', 're0-shard-record re0-shard-record--button') : element(documentRef, 'article', 're0-shard-record');
  if (options.interactive) {
    card.dataset.recordId = record.id || '';
    card.dataset.personName = record.name || '';
    card.setAttribute('aria-label', `查看${record.name || record.标题 || record.名称 || record.id || '记录'}`);
  }
  const title = record.name || record.标题 || record.名称 || record.id || '记录';
  card.append(element(documentRef, 'strong', 're0-shard-record__title', title));
  const meta = [record.category, record.阶段, record.状态, record.关系阶段, record.立场].filter(Boolean).join(' · ');
  if (meta) card.append(element(documentRef, 'span', 're0-shard-record__meta', meta));
  const detail = record.描述 || record.当前行动 || record.当前效果 || record.下一步 || record.结果 || record.直接原因;
  if (detail) card.append(element(documentRef, 'p', 're0-shard-record__detail', detail));
  if (record.portrait) card.prepend(avatarNode(documentRef, { name: record.name, portrait: record.portrait }));
  return card;
}

function renderDetail(documentRef, model, state, options) {
  const detail = element(documentRef, 'aside', 're0-shard-detail');
  detail.dataset.open = state.selectedShard ? 'true' : 'false';
  if (!state.selectedShard) {
    detail.append(element(documentRef, 'div', 're0-shard-detail__empty', '点击任一碎片查看档案详情'));
    return detail;
  }
  const shard = model.shards.find((entry) => entry.id === state.selectedShard) || model.shards[0];
  const header = element(documentRef, 'header', 're0-shard-detail__header');
  const heading = element(documentRef, 'div', 're0-shard-detail__heading');
  heading.append(element(documentRef, 'span', 're0-shard-kicker', shard.eyebrow), element(documentRef, 'h2', '', shard.title), element(documentRef, 'p', '', shard.summary));
  header.append(heading, button(documentRef, '关闭详情', 'close-detail', 're0-shard-button re0-shard-button--quiet'));
  detail.append(header);

  const scroll = element(documentRef, 'div', 're0-shard-detail__scroll');
  if (shard.id === 'protagonist') {
    const form = renderPortraitForm(documentRef, model, options);
    if (form) scroll.append(form);
  }
  if (shard.id === 'relations' && state.selectedPerson) {
    const person = model.people.find((entry) => entry.name === state.selectedPerson);
    if (person) {
      const focus = element(documentRef, 'section', 're0-shard-record re0-shard-record--focused');
      focus.append(avatarNode(documentRef, { name: person.name, portrait: person.portrait }));
      const copy = element(documentRef, 'div', 're0-shard-record__focus-copy');
      copy.append(
        element(documentRef, 'span', 're0-shard-kicker', person.category || '关系人物'),
        element(documentRef, 'strong', 're0-shard-record__title', person.name),
        element(documentRef, 'p', 're0-shard-record__detail', person.当前行动 || person.当前地点 || '当前行动未记录'),
      );
      focus.append(copy);
      scroll.append(focus);
    }
  }
  if (shard.records.length) {
    const records = element(documentRef, 'section', 're0-shard-detail__records');
    records.append(element(documentRef, 'h3', '', '动态记录'));
    for (const record of shard.records.slice(0, 48)) {
      const interactive = shard.id === 'relations' && Boolean(record.name);
      records.append(renderRecord(documentRef, record, interactive ? { interactive: true, action: 'open-person' } : {}));
    }
    scroll.append(records);
  }
  for (const group of shard.groups) {
    const disclosure = element(documentRef, 'details', 're0-shard-detail__group');
    if (group.id === Object.keys(shard.raw || {})[0]) disclosure.open = true;
    const summary = element(documentRef, 'summary', '', `${group.title} · ${group.summary}`);
    disclosure.append(summary, fieldList(documentRef, group.fields));
    scroll.append(disclosure);
  }
  if (shard.id === 'rules' && model.diagnostics.unknown.length) {
    const diagnostics = element(documentRef, 'section', 're0-shard-diagnostics');
    diagnostics.append(element(documentRef, 'h3', '', '未知字段（只读诊断）'), fieldList(documentRef, model.diagnostics.unknown));
    scroll.append(diagnostics);
  }
  detail.append(scroll);
  return detail;
}

function renderPortraitForm(documentRef, model, options) {
  const name = model.overview.protagonist.name || '主角';
  const form = element(documentRef, 'form', 're0-shard-portrait-form');
  form.dataset.action = 'save-protagonist-portrait';
  form.append(element(documentRef, 'h3', '', '自定义主角头像'));
  const note = element(documentRef, 'p', 're0-shard-muted', '头像仅保存在本机，不写入状态变量，也不会上传。');
  form.append(note);
  const fileLabel = element(documentRef, 'label', 're0-shard-file-label', '上传本地图片');
  const file = documentRef.createElement('input');
  file.type = 'file';
  file.accept = 'image/png,image/jpeg,image/webp,image/gif';
  file.dataset.portraitFile = 'protagonist';
  fileLabel.append(file);
  form.append(fileLabel);
  const urlLabel = element(documentRef, 'label', 're0-shard-field-label', '或使用 HTTPS 图片 URL');
  const url = documentRef.createElement('input');
  url.type = 'url';
  url.placeholder = 'https://example.com/portrait.webp';
  url.dataset.portraitUrl = 'protagonist';
  url.autocomplete = 'off';
  urlLabel.append(url);
  form.append(urlLabel);
  const actions = element(documentRef, 'div', 're0-shard-form-actions');
  actions.append(button(documentRef, `保存「${name}」头像`, 'save-protagonist-portrait', 're0-shard-button'));
  actions.append(button(documentRef, '移除本地头像', 'remove-protagonist-portrait', 're0-shard-button re0-shard-button--quiet'));
  form.append(actions);
  return form;
}

export function createShardSurface(documentRef) {
  const root = element(documentRef, 'div', 're0-shard-statusbar');
  root.id = 're0-shard-statusbar-root';
  root.dataset.re0ShardVersion = '1';
  const orb = button(documentRef, '', 'toggle-panel', 're0-shard-orb');
  orb.setAttribute('aria-label', '打开 Re:0 星屑状态栏');
  orb.setAttribute('aria-expanded', 'false');
  orb.setAttribute('aria-controls', 're0-shard-panel');
  orb.dataset.role = 'orb';
  orb.append(element(documentRef, 'span', 're0-shard-orb__halo'), element(documentRef, 'span', 're0-shard-orb__sigil'), element(documentRef, 'span', 're0-shard-orb__sr', '星屑状态栏'));

  const overlay = button(documentRef, '', 'close-panel', 're0-shard-overlay');
  overlay.setAttribute('aria-label', '关闭状态栏');
  overlay.tabIndex = -1;
  const panel = element(documentRef, 'section', 're0-shard-panel');
  panel.id = 're0-shard-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  panel.setAttribute('aria-labelledby', 're0-shard-title');
  panel.hidden = true;
  panel.setAttribute('aria-hidden', 'true');
  const header = element(documentRef, 'header', 're0-shard-panel__header');
  const title = element(documentRef, 'div', 're0-shard-panel__title');
  title.append(element(documentRef, 'span', 're0-shard-kicker', 'RE:ZERO // STAR FRAGMENTS'), element(documentRef, 'h1', '', '星屑状态档案'));
  title.querySelector('h1').id = 're0-shard-title';
  title.append(element(documentRef, 'p', 're0-shard-panel__context', '等待状态读取…'));
  const actions = element(documentRef, 'div', 're0-shard-panel__actions');
  actions.append(button(documentRef, '日 / 夜', 'cycle-theme', 're0-shard-button re0-shard-button--quiet'), button(documentRef, '自动', 'theme-auto', 're0-shard-button re0-shard-button--quiet'), button(documentRef, '刷新', 'refresh', 're0-shard-button re0-shard-button--quiet'), button(documentRef, '关闭', 'close-panel', 're0-shard-button'));
  header.append(title, actions);
  const body = element(documentRef, 'div', 're0-shard-panel__body');
  const heroMount = element(documentRef, 'div', 're0-shard-panel__hero-mount');
  const peopleMount = element(documentRef, 'div', 're0-shard-panel__people-mount');
  const stageMount = element(documentRef, 'div', 're0-shard-panel__stage-mount');
  const detailMount = element(documentRef, 'div', 're0-shard-panel__detail-mount');
  const status = element(documentRef, 'p', 're0-shard-panel__status');
  status.setAttribute('aria-live', 'polite');
  body.append(heroMount, peopleMount, stageMount, detailMount, status);
  panel.append(header, body);
  root.append(overlay, panel, orb);
  return Object.freeze({ root, orb, overlay, panel, heroMount, peopleMount, stageMount, detailMount, status, context: title.querySelector('.re0-shard-panel__context') });
}

export function renderShardSurface(surface, model, state = {}, options = {}) {
  const { root, panel, orb, heroMount, peopleMount, stageMount, detailMount, status, context } = surface;
  root.dataset.theme = model.theme.mode;
  root.dataset.transition = model.theme.transition;
  root.dataset.status = options.status || 'ready';
  if (options.backgroundUrl && isSafeAssetUrl(options.backgroundUrl)) {
    root.style.setProperty('--re0-shard-background-image', `url(${JSON.stringify(options.backgroundUrl)})`);
  } else {
    root.style.removeProperty('--re0-shard-background-image');
  }
  if (options.sigilUrl && isSafeAssetUrl(options.sigilUrl)) {
    root.style.setProperty('--re0-orb-sigil', `url(${JSON.stringify(options.sigilUrl)})`);
  } else {
    root.style.removeProperty('--re0-orb-sigil');
  }
  panel.dataset.selectedShard = state.selectedShard || '';
  orb.setAttribute('aria-expanded', String(Boolean(state.panelOpen)));
  orb.setAttribute('aria-label', state.panelOpen ? '关闭 Re:0 星屑状态栏' : '打开 Re:0 星屑状态栏');
  context.textContent = `${model.overview.time.date} · ${model.overview.time.period} · ${model.overview.location.filter(Boolean).join(' / ') || '地点未记录'}`;
  heroMount.replaceChildren(renderHero(surface.root.ownerDocument, model, options));
  peopleMount.replaceChildren(renderPeople(surface.root.ownerDocument, model));
  stageMount.replaceChildren(renderShardStage(surface.root.ownerDocument, model, state, options));
  detailMount.replaceChildren(renderDetail(surface.root.ownerDocument, model, state, options));
  status.textContent = options.message || `只读映射 · ${model.coverage.declaredLeafCount} 个声明叶路径 · ${model.people.length} 位关系人物`;
}

export function setSurfaceOpen(surface, open) {
  surface.panel.hidden = !open;
  surface.panel.setAttribute('aria-hidden', String(!open));
  surface.overlay.hidden = !open;
  surface.root.dataset.open = String(Boolean(open));
  surface.orb.setAttribute('aria-expanded', String(Boolean(open)));
}

export function setSurfaceDragging(surface, dragging) {
  surface.root.dataset.dragging = String(Boolean(dragging));
}

export function updateSurfacePortrait(surface, identity, record) {
  const buttonNode = surface.root.querySelector('[data-action="edit-protagonist"]');
  if (!buttonNode) return;
  const current = buttonNode.querySelector('.re0-shard-avatar');
  if (!current) return;
  current.replaceChildren(avatarNode(surface.root.ownerDocument, {
    name: identity.name,
    portrait: record || { initial: String(identity.name || '?').slice(0, 1) },
  }).firstChild || element(surface.root.ownerDocument, 'span'));
}

export { TONES };
