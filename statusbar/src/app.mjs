import {
  asList,
  asRecord,
  asText,
  buildHudModel,
  clampMeter,
  firstGrapheme,
} from './status-core.mjs';
import {
  createPortraitRepository,
  cropPortrait,
  portraitKeys,
  portraitScopeOptions,
  resolvePortrait,
  validatePortraitUrl,
} from './portraits.mjs';
import { createRuntimeBridge, discoverRuntimeScope } from './runtime.mjs';
import { artworkUrls } from './assets.mjs';
import { selectPreviewFixture } from './preview.mjs';
import {
  growListLimit,
  normalizeUiPreferences,
  resetListLimit,
  resolveOpenGroup,
  toggleOpenGroup,
  uiStorageKey,
  visibleListLimit,
} from './ui-state.mjs';

const SECTION_IDS = Object.freeze([
  'overview',
  'protagonist',
  'world',
  'relations',
  'loop',
  'events',
  'clues',
  'assets',
  'diagnostics',
]);
const RELATION_FILTERS = Object.freeze([
  ['all', '全部'],
  ['伴侣', '伴侣'],
  ['契约伙伴', '契约'],
  ['人物', '人物'],
]);
const DEFAULT_GROUPS = Object.freeze({
  overview: 'pulse',
  protagonist: 'profile',
  world: 'position',
  relations: 'people',
  loop: 'summary',
  events: 'active',
  clues: 'current',
  assets: 'items',
  diagnostics: 'coverage',
});
let instanceSequence = 0;

function element(tagName, className = '', text = '') {
  const node = document.createElement(tagName);
  if (className) node.className = className;
  if (text !== '') node.textContent = String(text);
  return node;
}

function actionButton(label, action, className = '', attributes = {}) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  button.textContent = label;
  button.dataset.action = action;
  for (const [name, value] of Object.entries(attributes)) {
    if (value !== null && value !== undefined) button.setAttribute(name, String(value));
  }
  return button;
}

function setInert(node, value) {
  if (!node) return;
  if ('inert' in node) node.inert = value;
  if (value) node.setAttribute('inert', '');
  else node.removeAttribute('inert');
}

function isInteractiveTarget(target) {
  return Boolean(target?.closest?.(
    'button, a, input, select, textarea, summary, [data-no-shell-toggle]',
  ));
}

function safeStorage() {
  try {
    const storage = globalThis.localStorage;
    const probe = '__re0_statusbar_probe__';
    storage.setItem(probe, probe);
    storage.removeItem(probe);
    return storage;
  } catch {
    return null;
  }
}

function loadPreferences(storage, storageKey) {
  const options = {
    sectionIds: SECTION_IDS,
    relationFilterIds: RELATION_FILTERS.map(([id]) => id),
  };
  if (!storage) return normalizeUiPreferences({}, options);
  try {
    return normalizeUiPreferences(JSON.parse(storage.getItem(storageKey) || '{}'), options);
  } catch {
    return normalizeUiPreferences({}, options);
  }
}

function displayValue(value, fallback = '未记录') {
  if (value === true) return '是';
  if (value === false) return '否';
  if (value === null || value === undefined || value === '') return fallback;
  if (Array.isArray(value)) return value.length ? value.join(' · ') : '无';
  if (typeof value === 'object') return `${Object.keys(value).length} 项`;
  return String(value);
}

function sectionHeading(eyebrow, title, description = '', actions = null) {
  const header = element('header', 're0-section-heading');
  const copy = element('div', 're0-section-heading__copy');
  copy.append(element('span', 're0-section-heading__eyebrow', eyebrow));
  copy.append(element('h2', 're0-section-heading__title', title));
  if (description) copy.append(element('p', 're0-section-heading__description', description));
  header.append(copy);
  if (actions) header.append(actions);
  return header;
}

function themeLabel(model, state) {
  if (state.themePreference === 'auto') return `自动 · ${model.theme.mode === 'day' ? '日间' : '夜间'}`;
  return state.themePreference === 'day' ? '日间模式' : '夜间模式';
}

function themeButton(model, state, { compact = false } = {}) {
  const label = themeLabel(model, state);
  const button = actionButton(compact ? '' : label, 'cycle-theme', compact ? 're0-compact-theme' : 're0-theme-button', {
    title: '切换日间或夜间模式',
    'aria-label': `当前${label}，点击切换`,
  });
  button.prepend(element('span', 're0-theme-button__icon', model.theme.mode === 'day' ? '☼' : '☾'));
  if (compact) button.append(element('span', 're0-sr-only', label));
  return button;
}

function renderDetailToolbar(model, context) {
  const toolbar = element('div', 're0-detail-toolbar');
  toolbar.setAttribute('aria-label', '界面模式');
  toolbar.append(themeButton(model, context.state));
  if (context.state.themePreference !== 'auto') {
    toolbar.append(actionButton('恢复自动', 'restore-auto-theme', 're0-auto-button'));
  } else {
    const automatic = element('span', 're0-auto-indicator', '自动跟随');
    automatic.setAttribute('aria-label', '当前跟随世界时段自动切换');
    toolbar.append(automatic);
  }
  return toolbar;
}

function sectionIntro(model, context, eyebrow, title, description) {
  return sectionHeading(eyebrow, title, description, renderDetailToolbar(model, context));
}

function groupSummary(value, fallback = '点击查看详细记录') {
  const text = displayValue(value, fallback).replace(/\s+/g, ' ').trim();
  return text.length > 72 ? `${text.slice(0, 70)}…` : text;
}

function accordionGroup(context, { id, title, summary, count = null, render }) {
  const sectionId = context.state.activeSection;
  const open = context.openGroup(id);
  const group = element('section', 're0-accordion-group');
  group.dataset.group = id;
  group.dataset.open = open ? 'true' : 'false';
  const bodyId = `re0-${context.instanceId}-${sectionId}-${id}`;
  const trigger = actionButton('', 'toggle-group', 're0-accordion-group__trigger', {
    'aria-expanded': open,
    'aria-controls': bodyId,
  });
  trigger.dataset.group = id;
  const heading = element('span', 're0-accordion-group__heading');
  heading.append(element('strong', '', title));
  if (count !== null) heading.append(element('span', 're0-count', String(count)));
  trigger.append(heading, element('span', 're0-accordion-group__summary', groupSummary(summary)));
  trigger.append(element('span', 're0-accordion-group__chevron', '⌄'));
  const bodyShell = element('div', 're0-accordion-group__body-shell');
  bodyShell.id = bodyId;
  bodyShell.setAttribute('aria-hidden', String(!open));
  setInert(bodyShell, !open);
  if (open) {
    const body = element('div', 're0-accordion-group__body');
    const content = render();
    if (Array.isArray(content)) body.append(...content);
    else if (content) body.append(content);
    bodyShell.append(body);
  }
  group.append(trigger, bodyShell);
  return group;
}

function paginationControls(total, listKey, context) {
  const limit = visibleListLimit(context.state.listLimits, listKey, total);
  if (total <= 3) return null;
  const controls = element('div', 're0-pagination');
  controls.append(element('span', '', `已显示 ${limit} / ${total}`));
  const actions = element('div', 're0-pagination__actions');
  if (limit < total) {
    const more = actionButton(`再显示 ${Math.min(5, total - limit)} 条`, 'show-more', 're0-text-button');
    more.dataset.listKey = listKey;
    more.dataset.total = String(total);
    actions.append(more);
  }
  if (limit > 3) {
    const collapse = actionButton('收起列表', 'collapse-list', 're0-text-button');
    collapse.dataset.listKey = listKey;
    actions.append(collapse);
  }
  controls.append(actions);
  return controls;
}

function emptyState(title, description = '当前没有可展示的记录。') {
  const empty = element('div', 're0-empty');
  empty.append(element('span', 're0-empty__sigil', '◇'));
  empty.append(element('strong', '', title));
  empty.append(element('p', '', description));
  return empty;
}

function fieldList(title, source, fields, options = {}) {
  const card = element('section', `re0-card ${options.className || ''}`.trim());
  if (title) card.append(element('h3', 're0-card__title', title));
  const list = element('dl', 're0-field-list');
  for (const field of fields) {
    const [key, label = key] = Array.isArray(field) ? field : [field, field];
    const row = element('div', 're0-field-list__row');
    row.append(element('dt', '', label));
    row.append(element('dd', '', displayValue(source?.[key])));
    list.append(row);
  }
  card.append(list);
  return card;
}

function meter(instrument, compact = false) {
  const value = clampMeter(instrument.value);
  const wrapper = element('div', `re0-meter re0-meter--${instrument.tone || 'neutral'}${compact ? ' re0-meter--compact' : ''}`);
  wrapper.dataset.inverse = instrument.inverse ? 'true' : 'false';
  const label = element('div', 're0-meter__label');
  label.append(element('span', '', instrument.label));
  label.append(element('strong', '', `${Math.round(value)}`));
  const track = element('div', 're0-meter__track');
  track.setAttribute('role', 'meter');
  track.setAttribute('aria-label', instrument.label);
  track.setAttribute('aria-valuemin', '0');
  track.setAttribute('aria-valuemax', '100');
  track.setAttribute('aria-valuenow', String(value));
  const fill = element('span', 're0-meter__fill');
  fill.style.setProperty('--re0-meter-value', `${value}%`);
  track.append(fill);
  wrapper.append(label, track);
  return wrapper;
}

function valueTree(value, depth = 0) {
  if (depth > 8) return element('span', 're0-tree__value', '层级过深，已折叠');
  if (Array.isArray(value)) {
    if (!value.length) return element('span', 're0-tree__value', '无');
    const list = element('ul', 're0-tree re0-tree--array');
    for (const item of value) {
      const li = element('li');
      li.append(valueTree(item, depth + 1));
      list.append(li);
    }
    return list;
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value);
    if (!entries.length) return element('span', 're0-tree__value', '空记录');
    const list = element('dl', 're0-tree');
    for (const [key, child] of entries) {
      const row = element('div', 're0-tree__row');
      row.append(element('dt', '', key));
      const dd = element('dd');
      dd.append(valueTree(child, depth + 1));
      row.append(dd);
      list.append(row);
    }
    return list;
  }
  return element('span', 're0-tree__value', displayValue(value));
}

function recordCards(title, entries, options = {}) {
  const section = element('section', 're0-record-section');
  const heading = element('div', 're0-record-section__heading');
  heading.append(element('h3', '', title));
  heading.append(element('span', 're0-count', String(entries.length)));
  section.append(heading);
  if (!entries.length) {
    section.append(emptyState(`暂无${title}`));
    return section;
  }
  const listKey = options.listKey || '';
  const context = options.context;
  const limit = listKey && context ? visibleListLimit(context.state.listLimits, listKey, entries.length) : entries.length;
  const grid = element('div', `re0-record-grid ${options.className || ''}`.trim());
  for (const entry of entries.slice(0, limit)) {
    const card = element('article', 're0-record-card');
    const top = element('div', 're0-record-card__top');
    top.append(element('span', 're0-record-card__type', entry.category || options.label || '记录'));
    top.append(element('span', 're0-record-card__id', entry.id || '—'));
    card.append(top);
    if (options.render) {
      card.append(options.render(entry));
    } else {
      const payload = Object.fromEntries(
        Object.entries(entry).filter(([key]) => !['id', 'category'].includes(key)),
      );
      card.append(valueTree(payload));
    }
    grid.append(card);
  }
  section.append(grid);
  const pagination = listKey && context ? paginationControls(entries.length, listKey, context) : null;
  if (pagination) section.append(pagination);
  return section;
}

function statusChip(label, value, tone = '') {
  const chip = element('span', `re0-chip ${tone ? `re0-chip--${tone}` : ''}`.trim());
  chip.append(element('small', '', label));
  chip.append(element('strong', '', displayValue(value)));
  return chip;
}

function createAvatarButton(identity, className = '') {
  const button = actionButton('', 'edit-portrait', `re0-avatar ${className}`.trim(), {
    'aria-label': `更换${identity.name}的头像`,
    title: `点击更换${identity.name}的头像`,
  });
  button.dataset.namespace = identity.namespace;
  button.dataset.name = identity.name;
  const initial = element('span', 're0-avatar__initial', firstGrapheme(identity.name));
  initial.setAttribute('aria-hidden', 'true');
  button.append(initial);
  return button;
}

function renderOverview(model, context) {
  const section = element('section', 're0-overview-panel');
  section.append(sectionIntro(model, context, 'Current State', '轮回概览', '高频状态、当前位置与紧急信号。'));

  section.append(accordionGroup(context, {
    id: 'pulse',
    title: '状态脉搏',
    summary: `${model.overview.protagonist.name} · ${model.overview.protagonist.status} · ${model.overview.location.at(-1) || '地点未详'}`,
    count: model.overview.instruments.length,
    render: () => {
      const grid = element('div', 're0-overview-panel__grid');
      grid.append(fieldList('世界坐标', {
        日期: model.overview.time.date,
        时段: model.overview.time.period,
        时间层: model.overview.time.layer,
        分支: model.overview.time.branch,
        位置: model.overview.location.join(' · '),
        天气: model.overview.environment.weather,
        光照: model.overview.environment.light,
        危机: model.overview.crisis,
      }, ['日期', '时段', '时间层', '分支', '位置', '天气', '光照', '危机']));

      const protagonist = element('section', 're0-card re0-overview-protagonist');
      const identity = element('div', 're0-identity');
      identity.append(createAvatarButton({ namespace: 'protagonist', name: model.overview.protagonist.name }, 're0-avatar--large'));
      const copy = element('div');
      copy.append(element('span', 're0-kicker', 'Protagonist'));
      copy.append(element('h3', 're0-identity__name', model.overview.protagonist.name));
      copy.append(element('p', '', `${model.overview.protagonist.identity} · ${model.overview.protagonist.form}`));
      identity.append(copy);
      protagonist.append(identity);
      const meters = element('div', 're0-meter-grid');
      for (const instrument of model.overview.instruments) meters.append(meter(instrument));
      protagonist.append(meters);
      grid.append(protagonist);
      return grid;
    },
  }));

  section.append(accordionGroup(context, {
    id: 'signals',
    title: '目标与警示',
    summary: model.overview.target,
    count: model.overview.alerts.length,
    render: () => {
      const content = element('div', 're0-group-stack');
      const objective = element('section', 're0-objective');
      objective.append(element('span', 're0-objective__mark', '⌖'));
      const objectiveCopy = element('div');
      objectiveCopy.append(element('small', '', '当前目标'));
      objectiveCopy.append(element('p', '', model.overview.target));
      objective.append(objectiveCopy);
      content.append(objective);

      const alerts = element('section', 're0-alerts');
      alerts.append(element('h3', 're0-sr-only', '当前警示'));
      if (model.overview.alerts.length) {
        for (const alert of model.overview.alerts) {
          const item = element('article', `re0-alert re0-alert--${alert.kind}`);
          item.append(element('strong', '', alert.title));
          item.append(element('span', '', alert.detail));
          alerts.append(item);
        }
      } else {
        alerts.append(element('p', 're0-all-clear', '当前没有迫近警示。'));
      }
      content.append(alerts);
      return content;
    },
  }));

  context.queuePortraits(section);
  return section;
}

function renderProtagonist(model, context) {
  const source = model.protagonist.raw;
  const section = element('section', 're0-section-view');
  section.append(sectionIntro(model, context, 'Locked Profile', '主角档案', '当前聊天唯一锁定主角；状态栏不修改此档案。'));

  section.append(accordionGroup(context, {
    id: 'profile',
    title: '身份档案',
    summary: `${asText(source.姓名)} · ${asText(source.身份)} · ${asText(source.生存状态)}`,
    render: () => {
      const dossier = element('section', 're0-card re0-dossier');
      const identity = element('div', 're0-identity re0-identity--dossier');
      identity.append(createAvatarButton({ namespace: 'protagonist', name: asText(source.姓名) }, 're0-avatar--hero'));
      const copy = element('div');
      copy.append(element('span', 're0-kicker', source.主角锁定 ? 'PROFILE LOCKED' : 'PROFILE UNLOCKED'));
      copy.append(element('h2', 're0-identity__name', asText(source.姓名)));
      copy.append(element('p', '', `${asText(source.身份)} · ${asText(source.阵营)}`));
      identity.append(copy);
      dossier.append(identity);
      dossier.append(fieldList('', source, [
        '主角锁定', '角色类型', '性别', '年龄阶段', '种族', '身份', '阵营',
        '生存状态', '当前形态', '门状态',
      ], { className: 're0-card--inset' }));
      return dossier;
    },
  }));

  section.append(accordionGroup(context, {
    id: 'vitals',
    title: '状态仪表',
    summary: model.overview.instruments.slice(0, 4).map((item) => `${item.label} ${Math.round(clampMeter(item.value))}`).join(' · '),
    count: model.overview.instruments.length,
    render: () => {
      const meters = element('section', 're0-card');
      const meterGrid = element('div', 're0-meter-grid');
      for (const instrument of model.overview.instruments) meterGrid.append(meter(instrument));
      meters.append(meterGrid);
      return meters;
    },
  }));

  section.append(accordionGroup(context, {
    id: 'appearance',
    title: '容貌与衣着',
    summary: source.容貌,
    count: 2,
    render: () => fieldList('外观记录', source, ['容貌', '衣着']),
  }));

  section.append(accordionGroup(context, {
    id: 'conditions',
    title: '伤势、异常与战力',
    summary: `${model.protagonist.injuries.length} 处伤势 · ${model.protagonist.abnormalities.length} 项异常 · ${displayValue(source.战力等阶?.可战状态)}`,
    count: model.protagonist.injuries.length + model.protagonist.abnormalities.length,
    render: () => {
      const content = element('div', 're0-group-stack');
      content.append(recordCards('伤势', model.protagonist.injuries, { context, listKey: 'protagonist:injuries' }));
      content.append(recordCards('异常状态', model.protagonist.abnormalities, { context, listKey: 'protagonist:abnormalities' }));
      content.append(fieldList('战力等阶', asRecord(source.战力等阶), ['阶数', '位阶', '可战状态', '生效条件']));
      return content;
    },
  }));

  const abilityCount = model.protagonist.abilities.reduce((sum, group) => sum + group.items.length, 0);
  section.append(accordionGroup(context, {
    id: 'abilities',
    title: '能力谱系',
    summary: `${model.protagonist.abilities.filter((group) => group.items.length).length} 个分类含记录`,
    count: abilityCount,
    render: () => {
      const groups = element('div', 're0-ability-groups');
      for (const group of model.protagonist.abilities) {
        const details = element('details', 're0-ability-group');
        const summary = element('summary');
        summary.append(element('span', '', group.category));
        summary.append(element('span', 're0-count', String(group.items.length)));
        details.append(summary);
        details.append(recordCards(group.category, group.items, {
          className: 're0-record-grid--single',
          context,
          listKey: `protagonist:ability:${group.category}`,
        }));
        groups.append(details);
      }
      return groups;
    },
  }));

  section.append(accordionGroup(context, {
    id: 'objective',
    title: '行动锚点',
    summary: source.当前目标,
    render: () => fieldList('当前目标', source, ['当前目标']),
  }));
  context.queuePortraits(section);
  return section;
}

function renderWorld(model, context) {
  const world = model.world.raw;
  const section = element('section', 're0-section-view');
  section.append(sectionIntro(model, context, 'World Ledger', '世界态势', '时间、地点、环境与正在移动的力量。'));
  section.append(accordionGroup(context, {
    id: 'position',
    title: '时间、地点与环境',
    summary: `${displayValue(world.当前时间?.时段)} · ${displayValue(world.当前地点?.具体位置)} · ${displayValue(world.环境?.天气)}`,
    render: () => {
      const content = element('div', 're0-group-stack');
      const grid = element('div', 're0-triple-grid');
      grid.append(fieldList('当前时间', asRecord(world.当前时间), ['规范日期', '时段', '时间层', '轮回分支']));
      grid.append(fieldList('当前地点', asRecord(world.当前地点), ['国家', '地区', '场所', '具体位置']));
      grid.append(fieldList('环境', asRecord(world.环境), ['天气', '光照', '描述']));
      content.append(grid);
      const crisis = element('div', `re0-crisis re0-crisis--${asText(world.危机等级, '无')}`);
      crisis.append(element('span', '', '危机等级'));
      crisis.append(element('strong', '', asText(world.危机等级, '无')));
      content.append(crisis);
      return content;
    },
  }));
  section.append(accordionGroup(context, {
    id: 'movements',
    title: '世界动向',
    summary: model.world.movements[0]?.标题 || '当前没有显著动向',
    count: model.world.movements.length,
    render: () => recordCards('动向', model.world.movements, { context, listKey: 'world:movements' }),
  }));
  section.append(accordionGroup(context, {
    id: 'factions',
    title: '势力态势',
    summary: model.world.factions[0]?.id || '尚未记录势力变化',
    count: model.world.factions.length,
    render: () => recordCards('势力态势', model.world.factions, { context, listKey: 'world:factions' }),
  }));
  return section;
}

function personQuickFacts(person) {
  const facts = element('div', 're0-person-card__facts');
  for (const [label, key] of [['阶段', '关系阶段'], ['立场', '立场'], ['地点', '当前地点']]) {
    const fact = element('span');
    fact.append(element('small', '', label));
    fact.append(element('strong', '', displayValue(person[key])));
    facts.append(fact);
  }
  return facts;
}

function renderRelations(model, context) {
  const section = element('section', 're0-section-view');
  section.append(sectionIntro(model, context, 'Constellation', '人际星图', '伴侣、契约伙伴与其他人物的当前关系切面。'));
  const people = context.state.relationFilter === 'all'
    ? model.relations.people
    : model.relations.people.filter((person) => person.category === context.state.relationFilter);
  section.append(accordionGroup(context, {
    id: 'people',
    title: '关系人物',
    summary: `${model.relations.people.length} 人 · 当前筛选 ${RELATION_FILTERS.find(([id]) => id === context.state.relationFilter)?.[1] || '全部'}`,
    count: people.length,
    render: () => {
      const content = element('div', 're0-group-stack');
      const filters = element('div', 're0-segmented');
      filters.setAttribute('aria-label', '筛选关系人物');
      for (const [id, label] of RELATION_FILTERS) {
        const button = actionButton(label, 'filter-relations', '', {
          'aria-pressed': context.state.relationFilter === id,
        });
        button.dataset.filter = id;
        filters.append(button);
      }
      content.append(filters);

      if (!people.length) {
        content.append(emptyState('此分类暂无人物'));
        return content;
      }

      const listKey = `relations:${context.state.relationFilter}`;
      const limit = visibleListLimit(context.state.listLimits, listKey, people.length);
      const grid = element('div', 're0-people-grid');
      for (const person of people.slice(0, limit)) {
        const card = element('article', 're0-person-card');
        card.dataset.category = person.category;
        card.dataset.name = person.name;
        const top = element('div', 're0-person-card__top');
        top.append(createAvatarButton({ namespace: 'person', name: person.name }, 're0-avatar--person'));
        const copy = element('div');
        copy.append(element('span', 're0-kicker', person.category));
        copy.append(element('h3', '', person.name));
        copy.append(element('p', '', displayValue(person.身份 || person.契约状态 || person.关系阶段)));
        top.append(copy);
        card.append(top);
        card.append(personQuickFacts(person));
        const view = actionButton('查看完整档案', 'open-person', 're0-text-button');
        view.dataset.category = person.category;
        view.dataset.name = person.name;
        card.append(view);
        grid.append(card);
      }
      content.append(grid);
      const pagination = paginationControls(people.length, listKey, context);
      if (pagination) content.append(pagination);
      return content;
    },
  }));
  context.queuePortraits(section);
  return section;
}

function renderLoop(model, context) {
  const loop = model.loop.raw;
  const checkpoint = asRecord(loop.存档点);
  const section = element('section', 're0-section-view re0-section-view--loop');
  section.append(sectionIntro(model, context, 'Return by Death', '轮回账本', '敏感记录默认封存；状态栏不会执行回档。'));
  section.append(accordionGroup(context, {
    id: 'summary',
    title: '轮回刻度与最近记录',
    summary: `当前轮回 ${displayValue(loop.当前轮回编号)} · 重启 ${displayValue(loop.世界重启次数)} 次`,
    render: () => {
      const content = element('div', 're0-triple-grid');
      content.append(fieldList('轮回刻度', loop, ['世界重启次数', '当前轮回编号']));
      content.append(fieldList('最近一次重启', asRecord(loop.最近一次重启), ['死亡事件ID', '重启编号', '触发时间', '恢复结果']));
      content.append(fieldList('最近一次死亡', asRecord(loop.最近一次死亡), ['死亡ID', '直接原因', '死亡经过']));
      return content;
    },
  }));

  section.append(accordionGroup(context, {
    id: 'checkpoint',
    title: '死亡回归存档点',
    summary: `${displayValue(checkpoint.有效)} · ${displayValue(checkpoint.创建时间)}`,
    render: () => {
      const checkpointCard = element('section', 're0-card re0-checkpoint');
      checkpointCard.append(fieldList('', checkpoint, ['有效', '创建时间'], { className: 're0-card--inset' }));
      const snapshotButton = actionButton(
        context.state.snapshotVisible ? '收起状态快照' : '确认并查看状态快照',
        'toggle-snapshot',
        're0-button re0-button--quiet',
        { 'aria-expanded': context.state.snapshotVisible },
      );
      checkpointCard.append(snapshotButton);
      if (context.state.snapshotVisible) {
        const snapshot = element('div', 're0-sensitive-data');
        snapshot.append(element('p', 're0-sensitive-data__notice', '以下是存档点的完整六域快照，可能包含失败轮状态。'));
        snapshot.append(valueTree(asRecord(checkpoint.状态快照)));
        checkpointCard.append(snapshot);
      } else {
        checkpointCard.append(element('p', 're0-sensitive-hint', '状态快照体积可能很大，且可能泄露失败轮信息。'));
      }
      return checkpointCard;
    },
  }));

  section.append(accordionGroup(context, {
    id: 'deaths',
    title: '菜月昴死亡记录',
    summary: model.loop.deaths[0]?.直接原因 || '死亡之书尚无记录',
    count: model.loop.deaths.length,
    render: () => {
      const deathBook = element('section', 're0-record-section re0-death-book');
      if (!model.loop.deaths.length) {
        deathBook.append(emptyState('死亡之书尚无记录'));
        return deathBook;
      }
      const listKey = 'loop:deaths';
      const limit = visibleListLimit(context.state.listLimits, listKey, model.loop.deaths.length);
      for (const death of model.loop.deaths.slice(0, limit)) {
        const details = element('details', 're0-death-entry');
        const summary = element('summary');
        summary.append(element('span', 're0-death-entry__id', death.id));
        summary.append(element('strong', '', displayValue(death.直接原因)));
        summary.append(element('span', '', displayValue(death.死亡时规范日期与时段)));
        details.append(summary);
        const payload = Object.fromEntries(Object.entries(death).filter(([key]) => !['id', 'category'].includes(key)));
        details.append(valueTree(payload));
        deathBook.append(details);
      }
      const pagination = paginationControls(model.loop.deaths.length, listKey, context);
      if (pagination) deathBook.append(pagination);
      return deathBook;
    },
  }));
  return section;
}

function renderEvents(model, context) {
  const section = element('section', 're0-section-view');
  section.append(sectionIntro(model, context, 'Event Threads', '事件脉络', '进行中的事件与近期已经落定的结果。'));
  section.append(accordionGroup(context, {
    id: 'active',
    title: '进行中的事件',
    summary: model.events.active[0]?.标题 || '当前没有进行中事件',
    count: model.events.active.length,
    render: () => recordCards('进行中', model.events.active, { context, listKey: 'events:active' }),
  }));
  section.append(accordionGroup(context, {
    id: 'recent',
    title: '近期记录',
    summary: model.events.recent[0]?.标题 || '尚无近期事件记录',
    count: model.events.recent.length,
    render: () => recordCards('近期记录', model.events.recent, { context, listKey: 'events:recent' }),
  }));
  return section;
}

function renderClues(model, context) {
  const section = element('section', 're0-section-view');
  section.append(sectionIntro(model, context, 'Unfinished Questions', '线索簿', '已获得的线索与尚未回答的问题。'));
  section.append(accordionGroup(context, {
    id: 'current',
    title: '当前线索',
    summary: model.clues.current[0]?.标题 || '当前没有可追踪线索',
    count: model.clues.current.length,
    render: () => recordCards('当前线索', model.clues.current, { context, listKey: 'clues:current' }),
  }));
  section.append(accordionGroup(context, {
    id: 'questions',
    title: '未解问题',
    summary: model.clues.questions[0] || '当前没有未解问题',
    count: model.clues.questions.length,
    render: () => {
      const questions = element('section', 're0-card');
      if (!model.clues.questions.length) {
        questions.append(emptyState('暂无未解问题'));
        return questions;
      }
      const listKey = 'clues:questions';
      const limit = visibleListLimit(context.state.listLimits, listKey, model.clues.questions.length);
      const list = element('ol', 're0-question-list');
      for (const question of model.clues.questions.slice(0, limit)) list.append(element('li', '', displayValue(question)));
      questions.append(list);
      const pagination = paginationControls(model.clues.questions.length, listKey, context);
      if (pagination) questions.append(pagination);
      return questions;
    },
  }));
  return section;
}

function renderAssets(model, context) {
  const section = element('section', 're0-section-view');
  section.append(sectionIntro(model, context, 'Assets Ledger', '资产 · 行囊与据点', '货币、物品、装备及可使用的存放地点。'));
  for (const group of [
    ['currencies', '货币', model.assets.currencies, 'assets:currencies'],
    ['items', '物品', model.assets.items, 'assets:items'],
    ['equipment', '装备', model.assets.equipment, 'assets:equipment'],
    ['locations', '据点与存放', model.assets.locations, 'assets:locations'],
  ]) {
    const [id, title, entries, listKey] = group;
    section.append(accordionGroup(context, {
      id,
      title,
      summary: entries[0]?.名称 || entries[0]?.id || `暂无${title}`,
      count: entries.length,
      render: () => recordCards(title, entries, { context, listKey }),
    }));
  }
  return section;
}

function renderDiagnostics(model, context) {
  const section = element('section', 're0-section-view');
  section.append(sectionIntro(model, context, 'Protocol Lens', '诊断', '协议覆盖、运行时来源与透传字段；仅供核对。'));

  section.append(accordionGroup(context, {
    id: 'coverage',
    title: '完整状态映射',
    summary: '八域 · 172 个已声明叶路径 · 只读',
    count: 172,
    render: () => {
      const content = element('div', 're0-group-stack');
      const notice = element('section', 're0-readonly-notice');
      notice.append(element('span', '', 'READ ONLY'));
      notice.append(element('p', '', '本界面只读取状态。剧情变量仍仅由每轮 <UpdateVariable> 更新流程写入。'));
      content.append(notice);
      const coverage = element('section', 're0-card');
      const coverageGrid = element('div', 're0-coverage-grid');
      let total = 0;
      for (const [domain, count] of Object.entries(model.diagnostics.declaredDomainCounts)) {
        total += count;
        coverageGrid.append(statusChip(domain, `${count} 叶`));
      }
      coverageGrid.prepend(statusChip('合计', `${total} 叶`, 'accent'));
      coverage.append(coverageGrid);
      content.append(coverage);
      return content;
    },
  }));

  section.append(accordionGroup(context, {
    id: 'rules',
    title: '规则元数据',
    summary: `${displayValue(model.rules.schema版本)} · 初始化 ${displayValue(model.rules.初始化完成)}`,
    render: () => fieldList('规则元数据', model.rules, ['schema版本', '初始化完成']),
  }));

  section.append(accordionGroup(context, {
    id: 'runtime',
    title: '运行时探测',
    summary: `${context.runtime.status} · ${context.runtime.source || '无来源'}`,
    render: () => fieldList('运行时探测', {
      状态: context.runtime.status,
      来源: context.runtime.source || '无',
      消息: context.runtime.message || '读取正常',
      SillyTavern: context.runtime.probe?.tavern || '未报告',
      TavernHelper: context.runtime.probe?.helper || '未报告',
      消息楼层: context.runtime.probe?.messageId ?? '未报告',
      MVU: context.runtime.probe?.hasMvu ? '可用' : '未检测到',
    }, ['状态', '来源', '消息', 'SillyTavern', 'TavernHelper', '消息楼层', 'MVU']),
  }));

  section.append(accordionGroup(context, {
    id: 'unknown',
    title: '未知透传字段',
    summary: model.diagnostics.unknown.length ? model.diagnostics.unknown[0].path : '当前状态树与已声明映射一致',
    count: model.diagnostics.unknown.length,
    render: () => {
      const unknown = element('section', 're0-card');
      if (!model.diagnostics.unknown.length) {
        unknown.append(emptyState('没有发现协议外叶字段', '当前状态树与已声明映射一致。'));
      } else {
        const listKey = 'diagnostics:unknown';
        const limit = visibleListLimit(context.state.listLimits, listKey, model.diagnostics.unknown.length);
        const list = element('dl', 're0-tree');
        for (const entry of model.diagnostics.unknown.slice(0, limit)) {
          const row = element('div', 're0-tree__row');
          row.append(element('dt', '', entry.path));
          const dd = element('dd');
          dd.append(valueTree(entry.value));
          row.append(dd);
          list.append(row);
        }
        unknown.append(list);
        const pagination = paginationControls(model.diagnostics.unknown.length, listKey, context);
        if (pagination) unknown.append(pagination);
      }
      return unknown;
    },
  }));
  return section;
}

const SECTION_RENDERERS = Object.freeze({
  overview: renderOverview,
  protagonist: renderProtagonist,
  world: renderWorld,
  relations: renderRelations,
  loop: renderLoop,
  events: renderEvents,
  clues: renderClues,
  assets: renderAssets,
  diagnostics: renderDiagnostics,
});

function readChatId(scope) {
  try {
    const value = scope?.SillyTavern?.getCurrentChatId?.();
    return value === null || value === undefined ? '' : String(value);
  } catch {
    return '';
  }
}

function createPortraitModal(identity, context) {
  const backdrop = element('div', 're0-overlay-backdrop');
  backdrop.dataset.action = 'close-overlay';
  const dialog = element('section', 're0-dialog re0-portrait-dialog');
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-labelledby', 're0-portrait-title');
  dialog.tabIndex = -1;

  const header = element('header', 're0-dialog__header');
  const titleCopy = element('div');
  titleCopy.append(element('span', 're0-kicker', identity.namespace === 'protagonist' ? 'PROTAGONIST' : 'RELATION'));
  const title = element('h2', '', `更换「${identity.name}」头像`);
  title.id = 're0-portrait-title';
  titleCopy.append(title);
  header.append(titleCopy, actionButton('关闭', 'close-overlay', 're0-icon-button', { 'aria-label': '关闭头像编辑' }));
  dialog.append(header);

  const form = element('form', 're0-portrait-form');
  const preview = element('div', 're0-crop-preview');
  preview.append(element('span', 're0-avatar__initial', firstGrapheme(identity.name)));
  const previewImage = element('img', 're0-crop-preview__image');
  previewImage.alt = '';
  previewImage.referrerPolicy = 'no-referrer';
  previewImage.hidden = true;
  preview.append(previewImage);
  form.append(preview);

  const fileLabel = element('label', 're0-input-group');
  fileLabel.append(element('span', '', '上传本地图片'));
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'image/*';
  fileInput.name = 'portrait-file';
  fileLabel.append(fileInput);
  form.append(fileLabel);

  const divider = element('div', 're0-form-divider', '或');
  form.append(divider);
  const urlLabel = element('label', 're0-input-group');
  urlLabel.append(element('span', '', 'HTTPS 图片 URL'));
  const urlInput = document.createElement('input');
  urlInput.type = 'url';
  urlInput.name = 'portrait-url';
  urlInput.placeholder = 'https://example.com/portrait.webp';
  urlInput.autocomplete = 'url';
  urlLabel.append(urlInput);
  form.append(urlLabel);

  const sliders = element('fieldset', 're0-crop-controls');
  sliders.append(element('legend', '', '本地图片裁切'));
  const sliderDefinitions = [
    ['zoom', '缩放', '1', '4', '0.05', '1'],
    ['offsetX', '水平位置', '-1', '1', '0.05', '0'],
    ['offsetY', '垂直位置', '-1', '1', '0.05', '0'],
  ];
  const rangeInputs = {};
  for (const [name, label, min, max, step, value] of sliderDefinitions) {
    const row = element('label', 're0-range');
    row.append(element('span', '', label));
    const input = document.createElement('input');
    input.type = 'range';
    input.name = name;
    input.min = min;
    input.max = max;
    input.step = step;
    input.value = value;
    rangeInputs[name] = input;
    row.append(input);
    sliders.append(row);
  }
  form.append(sliders);

  const scopeField = element('fieldset', 're0-scope-picker');
  scopeField.append(element('legend', '', '保存范围'));
  const scopeOptions = portraitScopeOptions(context.chatId);
  for (const [value, label] of [['shared', '同名人物跨聊天复用'], ['override', '只覆盖当前聊天']]) {
    const choice = element('label');
    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.name = 'portrait-scope';
    radio.value = value;
    radio.checked = value === scopeOptions.selected;
    radio.disabled = value === 'override' && scopeOptions.overrideDisabled;
    choice.append(radio, element('span', '', label));
    scopeField.append(choice);
  }
  form.append(scopeField);

  const message = element('p', 're0-form-message');
  message.setAttribute('aria-live', 'assertive');
  form.append(message);
  const actions = element('div', 're0-dialog__actions');
  const remove = actionButton('移除当前范围头像', 'remove-portrait', 're0-button re0-button--danger');
  const reset = actionButton('重置输入', 'reset-portrait', 're0-button re0-button--quiet');
  const save = document.createElement('button');
  save.type = 'submit';
  save.className = 're0-button re0-button--primary';
  save.textContent = '保存头像';
  actions.append(remove, reset, save);
  form.append(actions);
  dialog.append(form);

  let selectedFile = null;
  let previewUrl = '';
  const clearPreviewUrl = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = '';
  };
  const updateTransform = () => {
    const zoom = Number(rangeInputs.zoom.value);
    const x = Number(rangeInputs.offsetX.value) * 24;
    const y = Number(rangeInputs.offsetY.value) * 24;
    previewImage.style.transform = `translate(${x}%, ${y}%) scale(${zoom})`;
  };
  const showError = (error) => {
    message.textContent = error instanceof Error ? error.message : String(error);
  };
  const targetKey = () => {
    const keys = portraitKeys({ ...identity, chatId: context.chatId });
    const selected = form.querySelector('input[name="portrait-scope"]:checked')?.value;
    return selected === 'override' && keys.override ? keys.override : keys.shared;
  };

  fileInput.addEventListener('change', () => {
    message.textContent = '';
    selectedFile = fileInput.files?.[0] || null;
    clearPreviewUrl();
    if (!selectedFile) {
      previewImage.hidden = true;
      return;
    }
    if (!selectedFile.type.startsWith('image/')) {
      selectedFile = null;
      fileInput.value = '';
      previewImage.hidden = true;
      showError('请选择图片文件。');
      return;
    }
    previewUrl = URL.createObjectURL(selectedFile);
    previewImage.src = previewUrl;
    previewImage.hidden = false;
    urlInput.value = '';
    updateTransform();
  });
  urlInput.addEventListener('input', () => {
    message.textContent = '';
    if (!urlInput.value.trim()) return;
    const validation = validatePortraitUrl(urlInput.value);
    if (validation.ok) {
      clearPreviewUrl();
      selectedFile = null;
      fileInput.value = '';
      previewImage.src = validation.value;
      previewImage.style.transform = '';
      previewImage.hidden = false;
    }
  });
  previewImage.addEventListener('error', () => {
    previewImage.hidden = true;
    showError('图片无法加载，请检查文件或 URL。');
  });
  for (const input of Object.values(rangeInputs)) input.addEventListener('input', updateTransform);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    message.textContent = '';
    save.disabled = true;
    save.textContent = '正在保存…';
    try {
      if (!context.portraitRepository) throw new Error('当前环境无法使用本地头像库。');
      let record;
      if (selectedFile) {
        const blob = await cropPortrait({
          source: selectedFile,
          zoom: rangeInputs.zoom.value,
          offsetX: rangeInputs.offsetX.value,
          offsetY: rangeInputs.offsetY.value,
        });
        record = {
          kind: 'blob',
          value: blob,
          crop: {
            zoom: Number(rangeInputs.zoom.value),
            offsetX: Number(rangeInputs.offsetX.value),
            offsetY: Number(rangeInputs.offsetY.value),
          },
        };
      } else {
        const validation = validatePortraitUrl(urlInput.value);
        if (!validation.ok) throw new Error(validation.error);
        record = { kind: 'url', value: validation.value };
      }
      await context.portraitRepository.put(targetKey(), record);
      clearPreviewUrl();
      context.closeOverlay();
      context.render();
    } catch (error) {
      showError(error);
      save.disabled = false;
      save.textContent = '保存头像';
    }
  });

  remove.addEventListener('click', async () => {
    message.textContent = '';
    try {
      if (!context.portraitRepository) throw new Error('当前环境无法使用本地头像库。');
      await context.portraitRepository.remove(targetKey());
      clearPreviewUrl();
      context.closeOverlay();
      context.render();
    } catch (error) {
      showError(error);
    }
  });
  reset.addEventListener('click', () => {
    selectedFile = null;
    fileInput.value = '';
    urlInput.value = '';
    rangeInputs.zoom.value = '1';
    rangeInputs.offsetX.value = '0';
    rangeInputs.offsetY.value = '0';
    clearPreviewUrl();
    previewImage.removeAttribute('src');
    previewImage.style.transform = '';
    previewImage.hidden = true;
    message.textContent = '';
  });

  dialog.addEventListener('re0:dispose', clearPreviewUrl, { once: true });
  return { backdrop, dialog };
}

function createPersonDrawer(person) {
  const backdrop = element('div', 're0-overlay-backdrop');
  backdrop.dataset.action = 'close-overlay';
  const drawer = element('aside', 're0-dialog re0-person-drawer');
  drawer.setAttribute('role', 'dialog');
  drawer.setAttribute('aria-modal', 'true');
  drawer.setAttribute('aria-labelledby', 're0-person-title');
  drawer.tabIndex = -1;

  const header = element('header', 're0-dialog__header');
  const identity = element('div', 're0-identity');
  identity.append(createAvatarButton({ namespace: 'person', name: person.name }, 're0-avatar--large'));
  const copy = element('div');
  copy.append(element('span', 're0-kicker', person.category));
  const title = element('h2', '', person.name);
  title.id = 're0-person-title';
  copy.append(title, element('p', '', displayValue(person.身份 || person.契约状态 || person.关系阶段)));
  identity.append(copy);
  header.append(identity, actionButton('关闭', 'close-overlay', 're0-icon-button', { 'aria-label': '关闭人物档案' }));
  drawer.append(header);
  const payload = Object.fromEntries(Object.entries(person).filter(([key]) => !['id', 'name', 'category'].includes(key)));
  drawer.append(valueTree(payload));
  return { backdrop, dialog: drawer };
}

export function createStatusBar(root, { runtimeScope = discoverRuntimeScope(globalThis) } = {}) {
  if (!root) throw new Error('Re:Zero 状态栏挂载点不存在');
  const app = root.querySelector('#re0-statusbar-app');
  const overlay = root.querySelector('#re0-statusbar-overlay-root');
  if (!app || !overlay) throw new Error('Re:Zero 状态栏结构不完整');

  const storage = safeStorage();
  const chatId = readChatId(runtimeScope);
  const storageKey = uiStorageKey(chatId);
  const instanceId = ++instanceSequence;
  const state = {
    ...loadPreferences(storage, storageKey),
    snapshotVisible: false,
    model: null,
    statData: null,
    lastGood: null,
    destroyed: false,
    renderEpoch: 0,
    overlayReturnFocus: null,
  };
  const runtimeBridge = createRuntimeBridge(runtimeScope);
  const runtime = {
    status: 'loading',
    source: '',
    message: '',
    probe: runtimeBridge.probe(),
  };
  const artwork = artworkUrls();
  const asCssUrl = (value) => `url("${String(value).replaceAll('\\', '\\\\').replaceAll('"', '\\"')}")`;
  app.style.setProperty('--re0-day-art', asCssUrl(artwork.day.wide));
  app.style.setProperty('--re0-day-art-mobile', asCssUrl(artwork.day.mobile));
  app.style.setProperty('--re0-night-art', asCssUrl(artwork.night.wide));
  app.style.setProperty('--re0-night-art-mobile', asCssUrl(artwork.night.mobile));
  let portraitRepository = null;
  try {
    portraitRepository = createPortraitRepository();
  } catch {}
  let objectUrls = [];
  let refreshFrame = 0;
  let stopRuntime = () => {};
  let observer = null;
  let layoutObserver = null;
  let compactLayout = root.getBoundingClientRect().width <= 700;

  const persist = () => {
    if (!storage) return;
    storage.setItem(storageKey, JSON.stringify({
      activeSection: state.activeSection,
      detailsOpen: state.detailsOpen,
      relationFilter: state.relationFilter,
      themePreference: state.themePreference,
      openGroupBySection: state.openGroupBySection,
      listLimits: state.listLimits,
    }));
  };

  const revokeObjectUrls = (urls) => {
    for (const url of urls) URL.revokeObjectURL(url);
  };

  const clearObjectUrls = () => {
    revokeObjectUrls(objectUrls);
    objectUrls = [];
  };

  const hydrateAvatar = async (button, epoch) => {
    if (!portraitRepository || state.destroyed) return;
    const identity = {
      namespace: button.dataset.namespace,
      name: button.dataset.name,
      chatId,
    };
    const keys = portraitKeys(identity);
    try {
      const [shared, overrideRecord] = await Promise.all([
        portraitRepository.get(keys.shared),
        keys.override ? portraitRepository.get(keys.override) : null,
      ]);
      if (state.destroyed || epoch !== state.renderEpoch || !button.isConnected) return;
      const portrait = resolvePortrait({ name: identity.name, shared, override: overrideRecord });
      if (portrait.kind === 'initial') return;
      const image = element('img', 're0-avatar__image');
      image.alt = '';
      image.referrerPolicy = 'no-referrer';
      image.decoding = 'async';
      image.addEventListener('error', () => image.remove(), { once: true });
      if (portrait.kind === 'blob') {
        const url = URL.createObjectURL(portrait.value);
        objectUrls.push(url);
        image.src = url;
      } else {
        image.src = portrait.value;
      }
      button.append(image);
    } catch {}
  };

  const queuePortraits = (container) => {
    const epoch = state.renderEpoch;
    for (const button of container.querySelectorAll('.re0-avatar')) hydrateAvatar(button, epoch);
  };

  const closeOverlay = () => {
    const dialog = overlay.querySelector('[role="dialog"]');
    dialog?.dispatchEvent(new CustomEvent('re0:dispose'));
    overlay.replaceChildren();
    overlay.hidden = true;
    root.classList.remove('re0-has-overlay');
    const target = state.overlayReturnFocus;
    state.overlayReturnFocus = null;
    if (target?.isConnected) target.focus();
  };

  const trapFocus = (event) => {
    if (event.key !== 'Tab' || overlay.hidden) return;
    const dialog = overlay.querySelector('[role="dialog"]');
    if (!dialog) return;
    const focusable = [...dialog.querySelectorAll('button:not([disabled]), input:not([disabled]), summary, [tabindex]:not([tabindex="-1"])')];
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const openOverlay = ({ backdrop, dialog }, trigger) => {
    closeOverlay();
    state.overlayReturnFocus = trigger || document.activeElement;
    overlay.append(backdrop, dialog);
    overlay.hidden = false;
    root.classList.add('re0-has-overlay');
    queuePortraits(dialog);
    requestAnimationFrame(() => dialog.focus());
  };

  const context = {
    state,
    runtime,
    chatId,
    instanceId,
    portraitRepository,
    queuePortraits,
    closeOverlay,
    openGroup: (groupId) => resolveOpenGroup(
      state.openGroupBySection,
      state.activeSection,
      DEFAULT_GROUPS[state.activeSection],
      { compact: compactLayout },
    ) === groupId,
    render: (reason = 'data') => render(reason),
  };

  const renderLoading = () => {
    app.setAttribute('aria-busy', 'true');
    const loading = element('section', 're0-loading');
    loading.append(element('span', 're0-loading__crest', '✦'));
    const copy = element('div');
    copy.append(element('strong', '', '正在读取当前轮回'));
    copy.append(element('span', '', '校准消息楼层与 MVU 状态…'));
    loading.append(copy);
    const skeleton = element('div', 're0-loading__skeleton');
    for (let index = 0; index < 4; index += 1) skeleton.append(element('span'));
    loading.append(skeleton);
    app.replaceChildren(loading);
  };

  const renderUnavailable = () => {
    app.setAttribute('aria-busy', 'false');
    const panel = element('section', 're0-unavailable');
    panel.append(element('span', 're0-unavailable__mark', '◇'));
    panel.append(element('h2', '', '暂时无法读取状态'));
    panel.append(element('p', '', runtime.message));
    panel.append(actionButton('重新读取', 'retry', 're0-button re0-button--primary'));
    app.replaceChildren(panel);
  };

  const renderHeader = (model) => {
    const header = element('header', 're0-statusbar__header');
    header.dataset.shellToggle = 'true';
    header.tabIndex = 0;
    header.setAttribute('role', 'button');
    header.setAttribute('aria-controls', 're0-statusbar-details');
    header.setAttribute('aria-expanded', state.detailsOpen);
    header.setAttribute('aria-label', state.detailsOpen ? '收起状态栏详情' : '展开状态栏详情');
    const brand = element('div', 're0-brand');
    brand.append(element('span', 're0-brand__sigil', 'R:0'));
    const title = element('div');
    title.append(element('span', 're0-kicker', `${model.overview.time.date} · ${model.overview.time.period}`));
    title.append(element('h1', '', model.overview.location.at(-1) || '世界状态'));
    brand.append(title);
    header.append(brand);
    return header;
  };

  const renderCompact = (model) => {
    const compact = element('section', 're0-compact');
    compact.dataset.shellToggle = 'true';
    compact.setAttribute('aria-expanded', state.detailsOpen);
    compact.setAttribute('aria-controls', 're0-statusbar-details');
    compact.setAttribute('aria-label', state.detailsOpen ? '收起状态栏详情' : '展开状态栏详情');
    const identity = element('div', 're0-compact__identity');
    identity.append(createAvatarButton({ namespace: 'protagonist', name: model.overview.protagonist.name }, 're0-avatar--compact'));
    const copy = element('div');
    copy.append(element('strong', '', model.overview.protagonist.name));
    copy.append(element('span', '', `${model.overview.protagonist.status} · 轮回 ${model.overview.loop.number}`));
    identity.append(copy);
    compact.append(identity);

    const meters = element('div', 're0-compact__meters');
    for (const instrument of model.overview.instruments.slice(0, 4)) meters.append(meter(instrument, true));
    compact.append(meters);

    const signals = element('div', 're0-compact__signals');
    signals.append(statusChip('危机', model.overview.crisis, model.overview.crisis === '无' ? 'safe' : 'warning'));
    signals.append(statusChip('重启', model.overview.loop.restarts));
    if (runtime.status === 'stale') signals.append(statusChip('数据', '旧', 'warning'));
    compact.append(signals);
    const actions = element('div', 're0-compact__actions');
    if (!state.detailsOpen) actions.append(themeButton(model, state, { compact: true }));
    compact.append(actions);
    queuePortraits(compact);
    return compact;
  };

  const createSectionPanel = (model) => {
    const panel = element('div', 're0-section-panel');
    panel.id = 're0-section-panel';
    panel.setAttribute('role', 'tabpanel');
    panel.tabIndex = 0;
    const renderer = SECTION_RENDERERS[state.activeSection] || renderOverview;
    panel.append(renderer(model, context));
    return panel;
  };

  const renderDetails = (model) => {
    const details = element('div', 're0-details');
    details.id = 're0-statusbar-details';
    details.dataset.open = state.detailsOpen ? 'true' : 'false';
    details.setAttribute('aria-hidden', String(!state.detailsOpen));
    setInert(details, !state.detailsOpen);
    const inner = element('div', 're0-details__inner');
    const navigation = element('nav', 're0-navigation');
    navigation.setAttribute('aria-label', '状态栏分区');
    navigation.setAttribute('role', 'tablist');
    for (const section of model.sections) {
      const tab = actionButton('', 'select-section', 're0-nav-button', {
        role: 'tab',
        'aria-selected': state.activeSection === section.id,
        'aria-controls': 're0-section-panel',
        tabindex: state.activeSection === section.id ? '0' : '-1',
      });
      tab.dataset.section = section.id;
      tab.append(element('span', 're0-nav-button__glyph', section.glyph));
      tab.append(element('span', '', section.label));
      navigation.append(tab);
    }
    inner.append(navigation, createSectionPanel(model));
    details.append(inner);
    return details;
  };

  const motionReduced = () => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true;

  const animateFrameSwap = (frame, commit) => {
    const current = app.querySelector('.re0-statusbar');
    if (!current || motionReduced()) {
      commit();
      return;
    }
    if (typeof document.startViewTransition === 'function') {
      const transitionName = `re0-statusbar-${instanceId}`;
      current.style.viewTransitionName = transitionName;
      frame.style.viewTransitionName = transitionName;
      const transition = document.startViewTransition(() => commit());
      const cleanup = () => {
        current.style.viewTransitionName = '';
        frame.style.viewTransitionName = '';
      };
      transition.finished?.then(cleanup, cleanup);
      return;
    }
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      current.removeEventListener('animationend', onAnimationEnd);
      commit();
      requestAnimationFrame(() => frame.removeAttribute('data-motion'));
    };
    const onAnimationEnd = (event) => {
      if (event.animationName === 're0-frame-leave') finish();
    };
    current.dataset.motion = 'leave';
    frame.dataset.motion = 'enter';
    current.addEventListener('animationend', onAnimationEnd);
    globalThis.setTimeout(finish, 220);
  };

  const syncShellToggleSurfaces = (open) => {
    for (const surface of app.querySelectorAll('[data-shell-toggle]')) {
      surface.setAttribute('aria-expanded', String(open));
      surface.setAttribute('aria-label', open ? '收起状态栏详情' : '展开状态栏详情');
    }
  };

  const setDetailsOpen = (open) => {
    state.detailsOpen = Boolean(open);
    const details = app.querySelector('#re0-statusbar-details');
    if (!details) {
      render('interaction');
      return;
    }
    details.dataset.open = state.detailsOpen ? 'true' : 'false';
    details.setAttribute('aria-hidden', String(!state.detailsOpen));
    setInert(details, !state.detailsOpen);
    syncShellToggleSurfaces(state.detailsOpen);
  };

  const toggleDetails = () => {
    setDetailsOpen(!state.detailsOpen);
    persist();
  };

  const updateNavigation = () => {
    for (const tab of app.querySelectorAll('.re0-nav-button[data-section]')) {
      const selected = tab.dataset.section === state.activeSection;
      tab.setAttribute('aria-selected', String(selected));
      tab.setAttribute('tabindex', selected ? '0' : '-1');
    }
  };

  const updatePanelView = ({ focusSelector = '' } = {}) => {
    if (!state.model) return;
    const current = app.querySelector('#re0-section-panel');
    const next = createSectionPanel(state.model);
    const focusNext = () => {
      if (!focusSelector) return;
      const target = next.matches(focusSelector) ? next : next.querySelector(focusSelector);
      target?.focus();
    };
    updateNavigation();
    if (!current || motionReduced()) {
      current?.replaceWith(next);
      if (!current) render('interaction');
      else queuePortraits(next);
      focusNext();
      return;
    }

    next.dataset.motion = 'enter';
    current.dataset.motion = 'leave';
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      current.removeEventListener('animationend', onAnimationEnd);
      if (current.isConnected) current.replaceWith(next);
      queuePortraits(next);
      requestAnimationFrame(() => {
        next.removeAttribute('data-motion');
        focusNext();
      });
    };
    const onAnimationEnd = (event) => {
      if (event.animationName === 're0-panel-leave') finish();
    };
    current.addEventListener('animationend', onAnimationEnd);
    globalThis.setTimeout(finish, 180);
  };

  const updateGroupView = (focusGroupId) => {
    if (!state.model) return;
    const nextPanel = createSectionPanel(state.model);
    const nextGroups = new Map(
      [...nextPanel.querySelectorAll('.re0-accordion-group[data-group]')]
        .map((group) => [group.dataset.group, group]),
    );
    for (const group of app.querySelectorAll('#re0-section-panel .re0-accordion-group[data-group]')) {
      const next = nextGroups.get(group.dataset.group);
      if (!next || group.dataset.open === next.dataset.open) continue;
      const opening = next.dataset.open === 'true';
      const trigger = group.querySelector('.re0-accordion-group__trigger');
      const bodyShell = group.querySelector('.re0-accordion-group__body-shell');
      const nextShell = next.querySelector('.re0-accordion-group__body-shell');
      if (!trigger || !bodyShell || !nextShell) continue;

      trigger.setAttribute('aria-expanded', String(opening));
      bodyShell.setAttribute('aria-hidden', String(!opening));
      setInert(bodyShell, !opening);
      if (opening) {
        bodyShell.replaceChildren(...nextShell.childNodes);
        queuePortraits(bodyShell);
        if (motionReduced()) {
          group.dataset.open = 'true';
        } else {
          bodyShell.getBoundingClientRect();
          const stillOpen = resolveOpenGroup(
            state.openGroupBySection,
            state.activeSection,
            DEFAULT_GROUPS[state.activeSection],
            { compact: compactLayout },
          ) === group.dataset.group;
          if (!state.destroyed && group.isConnected && stillOpen) group.dataset.open = 'true';
        }
      } else {
        group.dataset.open = 'false';
        const cleanup = () => {
          if (!state.destroyed && group.isConnected && group.dataset.open === 'false') {
            bodyShell.replaceChildren();
          }
        };
        if (motionReduced()) cleanup();
        else globalThis.setTimeout(cleanup, 320);
      }
    }
    app.querySelector(
      `.re0-accordion-group[data-group="${CSS.escape(focusGroupId)}"] .re0-accordion-group__trigger`,
    )?.focus();
  };

  function render(reason = 'data') {
    if (state.destroyed) return;
    state.renderEpoch += 1;
    const previousObjectUrls = objectUrls;
    objectUrls = [];
    if (!state.model) {
      if (runtime.status === 'loading') renderLoading();
      else renderUnavailable();
      revokeObjectUrls(previousObjectUrls);
      return;
    }
    const model = state.model;
    app.setAttribute('aria-busy', 'false');
    const frame = element('article', 're0-statusbar');
    frame.append(element('div', 're0-ambient re0-ambient--back'));
    frame.append(renderHeader(model));
    frame.append(renderCompact(model));
    frame.append(renderDetails(model));
    frame.append(element('div', 're0-ambient re0-ambient--front'));
    const commit = () => {
      app.dataset.theme = model.theme.mode;
      app.dataset.transition = model.theme.transition;
      app.dataset.runtime = runtime.status;
      overlay.dataset.theme = model.theme.mode;
      app.replaceChildren(frame);
      revokeObjectUrls(previousObjectUrls);
    };
    if (reason === 'theme' && app.querySelector('.re0-statusbar')) {
      animateFrameSwap(frame, commit);
    } else {
      commit();
    }
  }

  const loadSample = async () => {
    const sampleUrl = root.dataset.sampleUrl;
    if (!sampleUrl) return null;
    try {
      const response = await fetch(new URL(sampleUrl, document.baseURI));
      if (!response.ok) return null;
      const sample = await response.json();
      const fixture = new URLSearchParams(globalThis.location?.search || '').get('fixture') || 'normal';
      return selectPreviewFixture(asRecord(sample.stat_data), fixture);
    } catch {
      return null;
    }
  };

  const refresh = async () => {
    if (state.destroyed) return;
    runtime.status = state.lastGood ? 'refreshing' : 'loading';
    if (!state.lastGood) render();
    await runtimeBridge.ready();
    runtime.probe = runtimeBridge.probe();
    const result = await runtimeBridge.read(state.lastGood);
    let statData = result.statData;
    if (result.status === 'unavailable') {
      const sample = await loadSample();
      if (sample && typeof sample.statData === 'object') {
        statData = sample.statData;
        runtime.status = sample.status;
        runtime.source = 'sample-state.json';
        runtime.message = sample.message;
      } else {
        runtime.status = result.status;
        runtime.source = result.source || '';
        runtime.message = result.message;
        state.model = null;
        render();
        return;
      }
    } else {
      runtime.status = result.status;
      runtime.source = result.source || runtime.source;
      runtime.message = result.message || '';
    }
    state.statData = asRecord(statData);
    if (result.status === 'ready' || ['preview', 'stale'].includes(runtime.status)) state.lastGood = state.statData;
    state.model = buildHudModel(state.statData, { themePreference: state.themePreference });
    render();
  };

  const scheduleRefresh = () => {
    cancelAnimationFrame(refreshFrame);
    refreshFrame = requestAnimationFrame(() => refresh());
  };

  const findPerson = (category, name) => state.model?.relations.people.find(
    (person) => person.category === category && person.name === name,
  );

  const handleAction = (event) => {
    const shell = event.target.closest?.('[data-shell-toggle]');
    if (shell && root.contains(shell) && !isInteractiveTarget(event.target)) {
      toggleDetails();
      return;
    }
    const button = event.target.closest('[data-action]');
    if (!button || !root.contains(button)) return;
    const { action } = button.dataset;
    if (action === 'select-section') {
      state.activeSection = SECTION_IDS.includes(button.dataset.section) ? button.dataset.section : 'overview';
      setDetailsOpen(true);
      persist();
      updatePanelView({ focusSelector: '#re0-section-panel' });
      app.querySelector(`[data-section="${state.activeSection}"]`)?.scrollIntoView({ block: 'nearest', inline: 'center' });
    } else if (action === 'toggle-group') {
      const groupId = String(button.dataset.group || '');
      if (!groupId) return;
      const current = resolveOpenGroup(
        state.openGroupBySection,
        state.activeSection,
        DEFAULT_GROUPS[state.activeSection],
        { compact: compactLayout },
      );
      state.openGroupBySection = toggleOpenGroup(
        state.openGroupBySection,
        state.activeSection,
        groupId,
        current,
      );
      persist();
      updateGroupView(groupId);
    } else if (action === 'show-more') {
      const listKey = String(button.dataset.listKey || '');
      if (!listKey) return;
      state.listLimits = growListLimit(state.listLimits, listKey, Number(button.dataset.total));
      persist();
      updatePanelView({ focusSelector: `[data-list-key="${CSS.escape(listKey)}"]` });
    } else if (action === 'collapse-list') {
      const listKey = String(button.dataset.listKey || '');
      if (!listKey) return;
      state.listLimits = resetListLimit(state.listLimits, listKey);
      persist();
      updatePanelView({ focusSelector: `[data-list-key="${CSS.escape(listKey)}"]` });
    } else if (action === 'cycle-theme') {
      const current = state.model?.theme.mode || 'day';
      state.themePreference = current === 'day' ? 'night' : 'day';
      state.model = buildHudModel(state.statData, { themePreference: state.themePreference });
      persist();
      render('theme');
    } else if (action === 'restore-auto-theme') {
      state.themePreference = 'auto';
      state.model = buildHudModel(state.statData, { themePreference: 'auto' });
      persist();
      render('theme');
    } else if (action === 'filter-relations') {
      state.relationFilter = button.dataset.filter;
      persist();
      updatePanelView({ focusSelector: `[data-filter="${CSS.escape(state.relationFilter)}"]` });
    } else if (action === 'open-person') {
      const person = findPerson(button.dataset.category, button.dataset.name);
      if (person) openOverlay(createPersonDrawer(person), button);
    } else if (action === 'edit-portrait') {
      openOverlay(createPortraitModal({
        namespace: button.dataset.namespace,
        name: button.dataset.name,
      }, context), button);
    } else if (action === 'toggle-snapshot') {
      state.snapshotVisible = !state.snapshotVisible;
      updatePanelView({ focusSelector: '[data-action="toggle-snapshot"]' });
    } else if (action === 'close-overlay') {
      closeOverlay();
    } else if (action === 'retry') {
      refresh();
    }
  };

  const handleKeydown = (event) => {
    if (event.key === 'Escape' && !overlay.hidden) {
      event.preventDefault();
      closeOverlay();
      return;
    }
    trapFocus(event);
    const shell = event.target.closest?.('[data-shell-toggle]');
    if (shell && root.contains(shell) && !isInteractiveTarget(event.target)
      && ['Enter', ' ', 'Spacebar'].includes(event.key)) {
      event.preventDefault();
      toggleDetails();
      return;
    }
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    const current = event.target.closest('[role="tab"]');
    if (!current) return;
    const tabs = [...root.querySelectorAll('[role="tab"]')];
    const index = tabs.indexOf(current);
    const next = event.key === 'Home'
      ? tabs[0]
      : event.key === 'End'
        ? tabs.at(-1)
        : tabs[(index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length];
    event.preventDefault();
    next?.focus();
    next?.click();
  };

  const handleVisibility = () => {
    root.dataset.paused = document.hidden ? 'true' : 'false';
  };
  root.addEventListener('click', handleAction);
  root.addEventListener('keydown', handleKeydown);
  document.addEventListener('visibilitychange', handleVisibility);
  globalThis.addEventListener?.('pagehide', () => destroy(), { once: true });
  if (Number(navigator.hardwareConcurrency || 8) <= 4) root.dataset.performance = 'low';
  if ('IntersectionObserver' in globalThis) {
    observer = new IntersectionObserver(([entry]) => {
      root.dataset.paused = entry.isIntersecting && !document.hidden ? 'false' : 'true';
    }, { rootMargin: '120px' });
    observer.observe(root);
  }
  if ('ResizeObserver' in globalThis) {
    layoutObserver = new ResizeObserver(([entry]) => {
      const nextCompact = entry.contentRect.width <= 700;
      if (nextCompact === compactLayout) return;
      compactLayout = nextCompact;
      if (state.model) render();
    });
    layoutObserver.observe(root);
  }

  function destroy() {
    if (state.destroyed) return;
    state.destroyed = true;
    cancelAnimationFrame(refreshFrame);
    stopRuntime();
    observer?.disconnect();
    layoutObserver?.disconnect();
    closeOverlay();
    clearObjectUrls();
    root.removeEventListener('click', handleAction);
    root.removeEventListener('keydown', handleKeydown);
    document.removeEventListener('visibilitychange', handleVisibility);
    portraitRepository?.close?.().catch(() => {});
  }

  renderLoading();
  refresh();
  stopRuntime = runtimeBridge.subscribe(scheduleRefresh);
  return Object.freeze({ refresh, render, destroy });
}

const mount = document.querySelector('[data-re0-statusbar-mount]');
if (mount) createStatusBar(mount);
