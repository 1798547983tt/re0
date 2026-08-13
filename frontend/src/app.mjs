import {
  COMBAT_STATUSES,
  COMBAT_TIER_LEVELS,
  COMBAT_TIER_POSITIONS,
  FACTIONS,
  RELATION_STANCES,
  ROLE_TYPES,
  STEP_DEFINITIONS,
  buildOpeningMessage,
  buildStatePayload,
  createDefaultDraft,
  getStoryEvent,
  getStoryVolume,
  mergeAiPatch,
  parseDraft,
  serializeDraft,
  suggestOffline,
  validateDraft,
} from './creator-core.mjs';
import { buildAiPrompt, requestOpenAiCompatible } from './ai-provider.mjs';
import { loadStoryIndex } from './story-index.mjs';
import { assetUrl } from './assets.mjs';

const DRAFT_STORAGE_KEY = 're0.creator.draft.v1';
const SETTINGS_STORAGE_KEY = 're0.creator.settings.v1';
const FINAL_STORAGE_KEY = 're0.creator.final.v1';
const MAX_REPEATERS = 12;

const PAGE_ART = [
  assetUrl('emilia-blue-tea.png'),
  assetUrl('emilia-snow-tea.png'),
  assetUrl('satella-moon.png'),
  assetUrl('witch-harp-rose.png'),
  assetUrl('witch-table-tea.png'),
];

const PORTRAIT_ART = [
  assetUrl('emilia-blue-tea.png'),
  assetUrl('emilia-snow-tea.png'),
  assetUrl('satella-moon.png'),
  assetUrl('rem-tea-rose.png'),
  assetUrl('witch-table-tea.png'),
];

const DEFAULT_SETTINGS = {
  provider: 'offline',
  apiUrl: 'https://api.openai.com/v1/chat/completions',
  apiKey: '',
  model: '',
  reducedMotion: false,
};

const app = document.querySelector('#re0-creator-app');

if (!app) throw new Error('找不到创角向导挂载点 #re0-creator-app');

function escapeHtml(value = '') {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  })[character]);
}

function getAt(target, path) {
  return path.split('.').reduce((value, segment) => value?.[segment], target);
}

function setAt(target, path, value) {
  const segments = path.split('.');
  const finalSegment = segments.pop();
  const parent = segments.reduce((cursor, segment) => {
    if (!cursor[segment] || typeof cursor[segment] !== 'object') cursor[segment] = {};
    return cursor[segment];
  }, target);
  parent[finalSegment] = value;
}

function safeReadStorage(key) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeWriteStorage(key, value) {
  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function loadSavedDraft() {
  const serialized = safeReadStorage(DRAFT_STORAGE_KEY);
  if (!serialized) return createDefaultDraft();
  try {
    return parseDraft(serialized);
  } catch {
    return createDefaultDraft();
  }
}

function loadSettings() {
  const serialized = safeReadStorage(SETTINGS_STORAGE_KEY);
  if (!serialized) return { ...DEFAULT_SETTINGS };
  try {
    const parsed = JSON.parse(serialized);
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

const state = {
  draft: loadSavedDraft(),
  storyIndex: [],
  settings: loadSettings(),
  ui: {
    activeStep: 0,
    highestVisitedStep: 0,
    modal: null,
    busy: '',
    toast: null,
    toastTimer: null,
    aiIdea: '',
    openingOverride: '',
    openingEdited: false,
    storyStatus: 'loading',
    confirmed: false,
  },
};

function valueOf(path, fallback = '') {
  return getAt(state.draft, path) ?? fallback;
}

function currentStep() {
  return STEP_DEFINITIONS[state.ui.activeStep];
}

function currentVolume() {
  return getStoryVolume(state.storyIndex, state.draft.storyAnchor.volumeNumber);
}

function currentEvent() {
  return getStoryEvent(state.storyIndex, state.draft.storyAnchor.volumeNumber, state.draft.storyAnchor.eventId);
}

function storyVolumeLabel(volume) {
  if (!volume) return '';
  const title = volume.displayTitle || volume.title.replace(/^.*?｜/, '');
  return `第 ${String(volume.number).padStart(2, '0')} 卷 · ${title}`;
}

function saveDraft({ announce = false } = {}) {
  state.draft.meta = {
    ...(state.draft.meta ?? {}),
    updatedAt: new Date().toISOString(),
  };
  const saved = safeWriteStorage(DRAFT_STORAGE_KEY, serializeDraft(state.draft));
  if (announce) showToast(saved ? '草稿已封存到本机。' : '当前环境禁止本机存储，请下载草稿留存。', saved ? 'ok' : 'bad');
  return saved;
}

let saveTimer = null;
function queueSave() {
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => saveDraft(), 260);
}

function showToast(message, tone = '') {
  state.ui.toast = { message, tone };
  renderChromeLayers();
  window.clearTimeout(state.ui.toastTimer);
  state.ui.toastTimer = window.setTimeout(() => {
    state.ui.toast = null;
    renderChromeLayers();
  }, 3300);
}

function selectVolume(volumeNumber) {
  const volume = getStoryVolume(state.storyIndex, volumeNumber);
  if (!volume) return;
  state.draft.storyAnchor.volumeNumber = volume.number;
  state.draft.storyAnchor.volumeTitle = storyVolumeLabel(volume);
  const firstEvent = volume.events[0] ?? null;
  applyStoryEvent(firstEvent);
}

function applyStoryEvent(event) {
  const volume = currentVolume();
  state.draft.storyAnchor = {
    ...state.draft.storyAnchor,
    volumeNumber: volume?.number ?? null,
    volumeTitle: storyVolumeLabel(volume),
    eventId: event?.id ?? null,
    eventTitle: event?.title ?? '',
    eventTime: event?.time ?? '',
    date: event?.date ?? '',
    period: event?.period ?? '',
    layer: event?.layer ?? '',
    note: event?.note ?? '',
    timeDescription: event?.timeDescription ?? '',
  };
}

function syncStoryAnchor() {
  const volume = currentVolume();
  if (!volume) return;
  const event = getStoryEvent(state.storyIndex, volume.number, state.draft.storyAnchor.eventId) ?? volume.events[0] ?? null;
  applyStoryEvent(event);
}

function inputField({ path, label, hint = '', placeholder = '', type = 'text', full = false, required = false, min = '', max = '' }) {
  const id = `field-${path.replaceAll('.', '-')}`;
  const value = valueOf(path);
  const inputType = type === 'textarea' ? 'textarea' : 'input';
  const typeAttribute = type === 'textarea' ? '' : `type="${escapeHtml(type)}"`;
  const numericAttributes = `${min !== '' ? ` min="${escapeHtml(min)}"` : ''}${max !== '' ? ` max="${escapeHtml(max)}"` : ''}`;
  const control = inputType === 'textarea'
    ? `<textarea class="control" id="${id}" data-path="${escapeHtml(path)}" placeholder="${escapeHtml(placeholder)}"${required ? ' required' : ''}>${escapeHtml(value)}</textarea>`
    : `<input class="control" id="${id}" ${typeAttribute} data-path="${escapeHtml(path)}" value="${escapeHtml(value)}" placeholder="${escapeHtml(placeholder)}"${type === 'number' ? ' data-value-type="number"' : ''}${numericAttributes}${required ? ' required' : ''}>`;
  return `<div class="field${full ? ' full' : ''}">
    <label for="${id}"><span>${escapeHtml(label)}${required ? '＊' : ''}</span>${hint ? `<small>${escapeHtml(hint)}</small>` : ''}</label>
    ${control}
  </div>`;
}

function choiceField({ path, label, options, hint = '', full = true }) {
  const selected = String(valueOf(path));
  return `<div class="field${full ? ' full' : ''}">
    <div class="section-label"><span>${escapeHtml(label)}</span>${hint ? `<small>${escapeHtml(hint)}</small>` : ''}</div>
    <div class="choice-grid" role="group" aria-label="${escapeHtml(label)}">
      ${options.map((option) => `<button type="button" class="choice${selected === String(option) ? ' is-selected' : ''}" data-choice-path="${escapeHtml(path)}" data-choice-value="${escapeHtml(option)}" aria-pressed="${selected === String(option)}">${escapeHtml(option)}</button>`).join('')}
    </div>
  </div>`;
}

function selectField({ path, label, options, placeholder = '请选择', hint = '', full = false }) {
  const id = `field-${path.replaceAll('.', '-')}`;
  const selected = String(valueOf(path));
  return `<div class="field${full ? ' full' : ''}">
    <label for="${id}"><span>${escapeHtml(label)}</span>${hint ? `<small>${escapeHtml(hint)}</small>` : ''}</label>
    <select class="control" id="${id}" data-path="${escapeHtml(path)}">
      <option value="">${escapeHtml(placeholder)}</option>
      ${options.map((option) => {
        const item = typeof option === 'string' ? { value: option, label: option } : option;
        return `<option value="${escapeHtml(item.value)}"${selected === String(item.value) ? ' selected' : ''}>${escapeHtml(item.label)}</option>`;
      }).join('')}
    </select>
  </div>`;
}

function renderIdentityPage() {
  return `<div class="page" data-page="identity">
    <section class="section">
      <div class="field-grid">
        ${inputField({ path: 'protagonist.name', label: '角色姓名', hint: 'NAME', placeholder: '世界将以这个名字呼唤你', required: true })}
        ${inputField({ path: 'protagonist.identity', label: '表面身份', hint: 'IDENTITY', placeholder: '旅人、候补骑士、商人学徒……' })}
        ${choiceField({ path: 'protagonist.roleType', label: '角色类型＊', hint: 'ROLE ARCHETYPE', options: ROLE_TYPES })}
        ${inputField({ path: 'protagonist.gender', label: '性别 / 自我认同', placeholder: '自由填写' })}
        ${inputField({ path: 'protagonist.ageStage', label: '年龄阶段', placeholder: '少年、青年、成年……' })}
        ${inputField({ path: 'protagonist.race', label: '种族', placeholder: '人类、亚人、精灵……' })}
      </div>
      <p class="field-note">先写下能稳定角色轮廓的部分。未确定的信息可以留白，右侧的 AI 帮填只会补空白，不会覆盖你已经写好的内容。</p>
    </section>
  </div>`;
}

function renderStoryPicker() {
  const volume = currentVolume();
  const event = currentEvent();
  const volumeOptions = state.storyIndex.map((item) => `<option value="${item.number}"${volume?.number === item.number ? ' selected' : ''}>第 ${String(item.number).padStart(2, '0')} 卷 · ${escapeHtml(item.displayTitle || item.title.replace(/^.*?｜/, ''))}</option>`).join('');
  const eventOptions = (volume?.events ?? []).map((item) => `<option value="${item.id}"${event?.id === item.id ? ' selected' : ''}>${String(item.id).padStart(2, '0')} · ${escapeHtml(item.title)}</option>`).join('');
  const statusText = state.ui.storyStatus === 'loading' ? '剧情索引读取中…' : state.ui.storyStatus === 'error' ? '剧情索引未能加载' : `${state.storyIndex.length} 卷 · ${state.storyIndex.reduce((sum, item) => sum + item.events.length, 0)} 个事件`;
  return `<div class="story-picker">
    <div class="story-picker-head">
      <strong>剧情锚点</strong>
      <small>${escapeHtml(statusText)}</small>
    </div>
    <div class="field-grid">
      <div class="field">
        <label for="story-volume"><span>当前卷数＊</span><small>VOLUME</small></label>
        <select class="control" id="story-volume" data-story-select="volume"${state.ui.storyStatus !== 'ready' ? ' disabled' : ''}>
          <option value="">选择卷数与标题</option>${volumeOptions}
        </select>
      </div>
      <div class="field">
        <label for="story-event"><span>当前事件＊</span><small>EVENT</small></label>
        <select class="control" id="story-event" data-story-select="event"${!volume ? ' disabled' : ''}>
          <option value="">选择对应事件</option>${eventOptions}
        </select>
      </div>
    </div>
    <div class="story-meta">
      <div class="story-meta-card"><small>DATE</small><b>${escapeHtml(event?.date || '尚未选择')}</b></div>
      <div class="story-meta-card"><small>PERIOD</small><b>${escapeHtml(event?.period || '—')}</b></div>
      <div class="story-meta-card"><small>TIMELINE</small><b>${escapeHtml(event?.layer || '—')}</b></div>
      <div class="story-meta-card"><small>NOTE</small><b>${escapeHtml(event?.note || '—')}</b></div>
    </div>
    <div class="story-description">${escapeHtml(event?.timeDescription || event?.time || '选择卷数后，会显示该卷的事件标题与对应时间。')}</div>
  </div>`;
}

function renderOriginPage() {
  return `<div class="page" data-page="origin">
    <section class="section">${renderStoryPicker()}</section>
    <section class="section">
      <div class="section-head"><div><h3>抵达世界的方式</h3><p>剧情锚点负责时间，下面的信息负责你以什么姿态出现。</p></div></div>
      <div class="field-grid">
        ${choiceField({ path: 'protagonist.faction', label: '初始阵营', hint: 'FACTION', options: FACTIONS })}
        ${inputField({ path: 'world.currentLocation', label: '当前地点', placeholder: '王都贫民街、罗兹瓦尔宅邸……' })}
        ${inputField({ path: 'world.entryContext', label: '具体出现位置', placeholder: '巷口、庭院、会议室门外……' })}
        ${choiceField({ path: 'world.difficulty', label: '叙事难度', hint: 'DIFFICULTY', options: ['轻松', '标准', '困难'], full: false })}
        ${inputField({ path: 'protagonist.appearance', label: '外貌特征', placeholder: '发色、瞳色、体态、辨识特征', type: 'textarea', full: true })}
        ${inputField({ path: 'protagonist.clothing', label: '初始衣着', placeholder: '服装、随身配件与状态', type: 'textarea' })}
        ${inputField({ path: 'protagonist.currentGoal', label: '眼下目标', placeholder: '在这个事件中，第一件想完成的事', type: 'textarea' })}
      </div>
    </section>
  </div>`;
}

function renderTraits() {
  const traits = Array.isArray(state.draft.personality.traits) ? state.draft.personality.traits : [];
  return `<div class="field full">
    <div class="section-label"><span>性格关键词</span><small>TRAITS</small></div>
    <div class="choice-grid" data-trait-list>
      ${traits.map((trait, index) => `<button type="button" class="choice is-selected" data-action="remove-trait" data-index="${index}" title="点击移除">${escapeHtml(trait)} ×</button>`).join('')}
    </div>
    <div class="button-row" style="margin-top:9px">
      <input class="control" style="flex:1" data-trait-entry placeholder="输入关键词，按 Enter 添加" maxlength="16">
      <button type="button" class="add-btn" data-action="add-trait">添加</button>
    </div>
  </div>`;
}

function renderHeartPage() {
  return `<div class="page" data-page="heart">
    <section class="section">
      <div class="field-grid">
        ${renderTraits()}
        ${inputField({ path: 'personality.wish', label: '一句话愿望', hint: 'WISH', placeholder: '真正想守住或抵达的东西', type: 'textarea', required: true })}
        ${inputField({ path: 'personality.fear', label: '最深恐惧', hint: 'FEAR', placeholder: '最不愿面对的失去或真相', type: 'textarea' })}
        ${inputField({ path: 'personality.desire', label: '隐秘渴望', placeholder: '不一定愿意承认的欲求', type: 'textarea' })}
        ${inputField({ path: 'personality.boundary', label: '绝不越过的底线', hint: 'BOUNDARY', placeholder: '即使失败也不会做的事', type: 'textarea' })}
        ${inputField({ path: 'personality.speechStyle', label: '说话风格', placeholder: '语气、口癖、称呼习惯', type: 'textarea' })}
        ${inputField({ path: 'personality.habits', label: '动作习惯', placeholder: '紧张、思考或战斗时的小动作', type: 'textarea' })}
        ${inputField({ path: 'personality.secret', label: '不公开的秘密', hint: 'PRIVATE', placeholder: '只写给叙事系统看的信息', type: 'textarea', full: true })}
      </div>
    </section>
  </div>`;
}

function repeatInput({ section, index, key, label, value = '', type = 'text', placeholder = '', full = false, min = '', max = '' }) {
  const id = `${section.replaceAll('.', '-')}-${index}-${key}`;
  const control = type === 'textarea'
    ? `<textarea class="control" id="${id}" data-array-section="${escapeHtml(section)}" data-index="${index}" data-key="${escapeHtml(key)}" placeholder="${escapeHtml(placeholder)}">${escapeHtml(value)}</textarea>`
    : `<input class="control" id="${id}" type="${escapeHtml(type)}" data-array-section="${escapeHtml(section)}" data-index="${index}" data-key="${escapeHtml(key)}" value="${escapeHtml(value)}" placeholder="${escapeHtml(placeholder)}"${type === 'number' ? ' data-value-type="number"' : ''}${min !== '' ? ` min="${escapeHtml(min)}"` : ''}${max !== '' ? ` max="${escapeHtml(max)}"` : ''}>`;
  return `<div class="field${full ? ' full' : ''}"><label for="${id}"><span>${escapeHtml(label)}</span></label>${control}</div>`;
}

function renderAbilityList() {
  const abilities = state.draft.abilities ?? [];
  if (!abilities.length) return '<div class="empty-state">还没有记录能力。可以从一项真正会改变选择的能力开始。</div>';
  return `<div class="repeat-list">${abilities.map((ability, index) => `<article class="repeat-card">
    <div class="repeat-card-head"><strong>能力 ${String(index + 1).padStart(2, '0')}</strong><button type="button" class="remove-btn" data-action="remove-array-item" data-section="abilities" data-index="${index}" aria-label="移除能力">×</button></div>
    <div class="field-grid three">
      ${repeatInput({ section: 'abilities', index, key: 'name', label: '名称', value: ability.name, placeholder: '能力名称' })}
      ${repeatInput({ section: 'abilities', index, key: 'category', label: '类别', value: ability.category, placeholder: '加护、魔法、技能……' })}
      ${repeatInput({ section: 'abilities', index, key: 'status', label: '状态', value: ability.status, placeholder: '可用 / 封印' })}
      ${repeatInput({ section: 'abilities', index, key: 'cost', label: '代价 / 冷却', value: ability.cost, placeholder: '无、消耗魔力……' })}
      ${repeatInput({ section: 'abilities', index, key: 'description', label: '效果', value: ability.description, type: 'textarea', placeholder: '它能做到什么', full: true })}
      ${repeatInput({ section: 'abilities', index, key: 'limits', label: '限制', value: ability.limits, type: 'textarea', placeholder: '它不能做到什么', full: true })}
    </div>
  </article>`).join('')}</div>`;
}

function renderRelationshipList() {
  const relationships = state.draft.relationships ?? [];
  if (!relationships.length) return '<div class="empty-state">尚无预设关系。留白也可以，让相遇在剧情中自然发生。</div>';
  return `<div class="repeat-list">${relationships.map((relationship, index) => `<article class="repeat-card">
    <div class="repeat-card-head"><strong>关系 ${String(index + 1).padStart(2, '0')}</strong><button type="button" class="remove-btn" data-action="remove-array-item" data-section="relationships" data-index="${index}" aria-label="移除关系">×</button></div>
    <div class="field-grid three">
      ${repeatInput({ section: 'relationships', index, key: 'name', label: '人物', value: relationship.name, placeholder: '人物姓名' })}
      ${repeatInput({ section: 'relationships', index, key: 'relation', label: '关系', value: relationship.relation, placeholder: '同伴、恩人、宿敌……' })}
      <div class="field"><label for="relation-${index}-stance"><span>立场</span></label><select class="control" id="relation-${index}-stance" data-array-section="relationships" data-index="${index}" data-key="stance">${RELATION_STANCES.map((stance) => `<option${relationship.stance === stance ? ' selected' : ''}>${escapeHtml(stance)}</option>`).join('')}</select></div>
      ${repeatInput({ section: 'relationships', index, key: 'trust', label: '初始信任', value: relationship.trust, type: 'number', min: 0, max: 100 })}
      ${repeatInput({ section: 'relationships', index, key: 'notes', label: '备注', value: relationship.notes, type: 'textarea', placeholder: '关系起点、误解或未说出口的事', full: true })}
    </div>
  </article>`).join('')}</div>`;
}

function renderAssetList(section, label) {
  const items = getAt(state.draft, section) ?? [];
  if (!items.length) return `<div class="empty-state">没有记录${escapeHtml(label)}。</div>`;
  return `<div class="repeat-list">${items.map((item, index) => `<article class="repeat-card">
    <div class="repeat-card-head"><strong>${escapeHtml(label)} ${String(index + 1).padStart(2, '0')}</strong><button type="button" class="remove-btn" data-action="remove-array-item" data-section="${escapeHtml(section)}" data-index="${index}" aria-label="移除${escapeHtml(label)}">×</button></div>
    <div class="field-grid three">
      ${repeatInput({ section, index, key: 'name', label: '名称', value: item.name, placeholder: `${label}名称` })}
      ${repeatInput({ section, index, key: 'quantity', label: '数量', value: item.quantity, type: 'number', min: 0 })}
      ${repeatInput({ section, index, key: 'description', label: '说明', value: item.description, placeholder: '状态、用途或来源', full: true })}
    </div>
  </article>`).join('')}</div>`;
}

function renderArsenalPage() {
  return `<div class="page" data-page="arsenal">
    <section class="section combat-tier-panel">
      <div class="section-head"><div><h3>战力等阶</h3><p>同阶上、下位描述综合战斗表现；相性、环境与代价仍可能逆转结果。</p></div><span class="tier-sigil">TIER</span></div>
      <div class="field-grid">
        ${choiceField({ path: 'combatTier.level', label: '战力阶数＊', hint: '1—7', options: COMBAT_TIER_LEVELS })}
        ${choiceField({ path: 'combatTier.position', label: '阶内位次＊', hint: 'UPPER / LOWER', options: COMBAT_TIER_POSITIONS })}
        ${selectField({ path: 'combatTier.combatStatus', label: '当前可战状态', hint: 'COMBAT STATUS', options: COMBAT_STATUSES })}
        ${inputField({ path: 'combatTier.condition', label: '战力生效条件', hint: 'CONDITION', placeholder: '常态、持有武器、月光下、解除封印后……' })}
      </div>
      <p class="field-note">等阶从1阶（基础）到7阶（顶点）。上位 / 下位仅表示同阶内部参考，不代表必然胜负；请把关键前提写进生效条件。</p>
    </section>
    <section class="section">
      <div class="section-head"><div><h3>能力</h3><p>能力越强，越应该写清代价与限制。</p></div><button type="button" class="add-btn" data-action="add-array-item" data-section="abilities">＋ 新增能力</button></div>
      ${renderAbilityList()}
    </section>
    <section class="section">
      <div class="section-head"><div><h3>预设关系</h3><p>只记录开局前已经存在的羁绊。</p></div><button type="button" class="add-btn" data-action="add-array-item" data-section="relationships">＋ 新增关系</button></div>
      ${renderRelationshipList()}
    </section>
    <section class="section">
      <div class="section-head"><div><h3>货币</h3><p>只记录开局时实际持有的币种与数量。</p></div><button type="button" class="add-btn" data-action="add-array-item" data-section="assets.currency">＋ 新增货币</button></div>
      ${renderAssetList('assets.currency', '货币')}
    </section>
    <section class="section">
      <div class="section-head"><div><h3>随身物品</h3><p>会被带进第一幕的物件。</p></div><button type="button" class="add-btn" data-action="add-array-item" data-section="assets.items">＋ 新增物品</button></div>
      ${renderAssetList('assets.items', '物品')}
    </section>
    <section class="section">
      <div class="section-head"><div><h3>装备</h3><p>武器、护具或具有持续效果的物件。</p></div><button type="button" class="add-btn" data-action="add-array-item" data-section="assets.equipment">＋ 新增装备</button></div>
      ${renderAssetList('assets.equipment', '装备')}
    </section>
  </div>`;
}

function openingText() {
  return state.ui.openingEdited ? state.ui.openingOverride : buildOpeningMessage(state.draft);
}

function buildExportBundle(finalized = state.ui.confirmed) {
  const payload = buildStatePayload(state.draft);
  if (payload?.规则) payload.规则.初始化完成 = Boolean(finalized);
  return {
    format: 're0-character-creator-v1',
    finalized: Boolean(finalized),
    exportedAt: new Date().toISOString(),
    draft: structuredClone(state.draft),
    state: payload,
    openingMessage: openingText(),
  };
}

function renderReviewPage() {
  const validation = validateDraft(state.draft);
  const anchor = state.draft.storyAnchor;
  const checks = [
    { ok: Boolean(state.draft.protagonist.name), text: '角色姓名已确定' },
    { ok: ROLE_TYPES.includes(state.draft.protagonist.roleType), text: '角色类型已确定' },
    { ok: Boolean(anchor.volumeNumber && anchor.eventId), text: '卷数、事件与时间已经联动' },
    { ok: Boolean(state.draft.personality.wish), text: '一句话愿望已写下' },
    { ok: COMBAT_TIER_LEVELS.includes(state.draft.combatTier?.level) && COMBAT_TIER_POSITIONS.includes(state.draft.combatTier?.position), text: '战力阶数与上/下位已确定' },
  ];
  return `<div class="page" data-page="review">
    <section class="section">
      <div class="section-head"><div><h3>出发前检查</h3><p>只有点击“确认角色并启程”，正式状态才会标记为初始化完成。</p></div></div>
      <ul class="validation-list">${checks.map((check) => `<li class="validation-item${check.ok ? ' ok' : ''}"><span>${check.ok ? '✓' : '!'}</span><span>${escapeHtml(check.text)}</span></li>`).join('')}</ul>
      ${!validation.ok ? `<p class="field-note">还差 ${validation.errors.length} 项必填信息。点击下方提示可跳回对应页面。</p><div class="button-row">${validation.errors.map((item) => `<button type="button" class="ghost-btn" data-action="focus-error" data-error-path="${escapeHtml(item.path)}">${escapeHtml(item.message)}</button>`).join('')}</div>` : '<p class="field-note">基础信息已经完整。你仍可以继续润色开场文本，再决定写入酒馆或下载。</p>'}
    </section>
    <section class="section">
      <div class="section-head"><div><h3>开场文本</h3><p>可直接编辑；编辑后不再随表单自动改写，直到点击“恢复自动生成”。</p></div><button type="button" class="ghost-btn" data-action="reset-opening">恢复自动生成</button></div>
      <textarea class="code-preview" data-opening-text>${escapeHtml(openingText())}</textarea>
      <div class="button-row" style="margin-top:10px">
        <button type="button" class="primary-btn" data-action="copy-opening">复制开场文本</button>
        <button type="button" class="ghost-btn" data-action="download-opening">下载 TXT</button>
        <button type="button" class="ghost-btn" data-action="write-tavern">写入酒馆输入框</button>
      </div>
    </section>
    <section class="section">
      <div class="section-head"><div><h3>结构化档案</h3><p>包含创角草稿、ZOD 对齐状态和开场文本。</p></div></div>
      <textarea class="code-preview" data-json-preview readonly>${escapeHtml(JSON.stringify(buildExportBundle(state.ui.confirmed), null, 2))}</textarea>
      <div class="button-row" style="margin-top:10px">
        <button type="button" class="primary-btn" data-action="copy-json">复制 JSON</button>
        <button type="button" class="ghost-btn" data-action="download-json">下载 JSON</button>
      </div>
    </section>
    <section class="section">
      <div class="button-row end">
        <button type="button" class="primary-btn" data-action="confirm-start"${validation.ok ? '' : ' disabled'}>确认角色并启程</button>
      </div>
    </section>
  </div>`;
}

function renderPage() {
  return [renderIdentityPage, renderOriginPage, renderHeartPage, renderArsenalPage, renderReviewPage][state.ui.activeStep]();
}

function stepIsComplete(index) {
  if (index === 0) return Boolean(state.draft.protagonist.name && ROLE_TYPES.includes(state.draft.protagonist.roleType));
  if (index === 1) return Boolean(state.draft.storyAnchor.volumeNumber && state.draft.storyAnchor.eventId);
  if (index === 2) return Boolean(state.draft.personality.wish);
  if (index === 3) return state.ui.highestVisitedStep >= 3 && COMBAT_TIER_LEVELS.includes(state.draft.combatTier?.level) && COMBAT_TIER_POSITIONS.includes(state.draft.combatTier?.position);
  return state.ui.highestVisitedStep >= 4 && validateDraft(state.draft).ok;
}

function renderProgress() {
  return STEP_DEFINITIONS.map((step, index) => `<button type="button" class="step${index === state.ui.activeStep ? ' is-active' : ''}${stepIsComplete(index) ? ' is-complete' : ''}" data-action="go-step" data-step="${index}" aria-current="${index === state.ui.activeStep ? 'step' : 'false'}">
    <span class="step-index">${String(step.index).padStart(2, '0')}</span>
    <span class="step-copy"><b>${escapeHtml(step.label)}</b><small>${escapeHtml(step.kicker.split(' / ')[0])}</small></span>
  </button>`).join('');
}

function renderRail() {
  const step = currentStep();
  const event = currentEvent();
  const name = state.draft.protagonist.name || '未命名旅人';
  const completion = [0, 1, 2, 3, 4].filter(stepIsComplete).length;
  return `<aside class="rail">
    <section class="rail-card">
      <div class="portrait" style="--portrait-art:url('${PORTRAIT_ART[state.ui.activeStep]}')">
        <div class="portrait-copy"><small>CHARACTER DOSSIER</small><strong data-live-name>${escapeHtml(name)}</strong><span>${escapeHtml(state.draft.protagonist.identity || '身份尚未落笔')} · ${escapeHtml(state.draft.protagonist.faction || '中立')}</span></div>
      </div>
      <div class="rail-card-body">
        <div class="mini-grid">
          <div class="mini-stat"><small>PROGRESS</small><b data-live-progress>${completion} / 5 页完整</b></div>
          <div class="mini-stat"><small>TYPE</small><b>${escapeHtml(state.draft.protagonist.roleType || '未选择')}</b></div>
          <div class="mini-stat"><small>POWER</small><b>${escapeHtml(state.draft.combatTier?.level && state.draft.combatTier?.position ? `${state.draft.combatTier.level}${state.draft.combatTier.position}` : '未选择')}</b></div>
          <div class="mini-stat"><small>VOLUME</small><b>${state.draft.storyAnchor.volumeNumber ? `第 ${String(state.draft.storyAnchor.volumeNumber).padStart(2, '0')} 卷` : '未选择'}</b></div>
          <div class="mini-stat"><small>STEP</small><b>${escapeHtml(step.label)}</b></div>
        </div>
      </div>
    </section>
    <section class="rail-card ai-card">
      <div class="rail-card-head"><h3>AI 帮填</h3><small>FILL EMPTY ONLY</small></div>
      <div class="rail-card-body">
        <div class="ai-status"><span class="orb${state.settings.provider === 'remote' ? ' remote' : ''}"></span><span>${state.settings.provider === 'remote' ? 'OpenAI 兼容接口' : '离线灵感模式'}</span></div>
        <textarea class="control ai-idea" data-ai-idea placeholder="可选：写一句角色灵感或希望保留的气质">${escapeHtml(state.ui.aiIdea)}</textarea>
        <div class="button-row" style="margin-top:9px">
          <button type="button" class="primary-btn" data-action="run-ai">帮填本页</button>
          <button type="button" class="ghost-btn" data-action="open-settings">设置</button>
        </div>
        <p class="rail-note">建议会先生成补丁，再只填入空白字段；你写过的内容不会被覆盖。</p>
      </div>
    </section>
    <section class="rail-card anchor-card">
      <div class="rail-card-head"><h3>当前剧情</h3><small>STORY ANCHOR</small></div>
      <div class="rail-card-body">
        <strong>${escapeHtml(event?.title || '尚未选择事件')}</strong>
        <p>${escapeHtml(event?.time || '在第二页选择卷数后，这里会固定显示事件对应的日期、时段与时间线。')}</p>
      </div>
    </section>
  </aside>`;
}

function renderSettingsModal() {
  if (state.ui.modal !== 'settings') return '';
  return `<div class="overlay" data-overlay="settings">
    <section class="modal" role="dialog" aria-modal="true" aria-labelledby="settings-title">
      <div class="modal-head"><div><h2 id="settings-title">AI 与显示设置</h2><p>接口信息只保存在当前浏览器本机。离线模式无需密钥。</p></div><button type="button" class="close-btn" data-action="close-modal" aria-label="关闭">×</button></div>
      <div class="modal-body">
        <div class="field-grid">
          <div class="field full"><label for="setting-provider"><span>帮填方式</span><small>PROVIDER</small></label><select class="control" id="setting-provider" data-setting="provider"><option value="offline"${state.settings.provider === 'offline' ? ' selected' : ''}>离线灵感模式</option><option value="remote"${state.settings.provider === 'remote' ? ' selected' : ''}>OpenAI 兼容接口</option></select></div>
          ${inputSetting('apiUrl', '接口地址', 'https://…/v1/chat/completions', 'url')}
          ${inputSetting('model', '模型名称', '由你的接口服务提供')}
          ${inputSetting('apiKey', 'API Key', '仅保存在本机浏览器', 'password', true)}
          <label class="reduced-motion-toggle field full"><input type="checkbox" data-setting="reducedMotion"${state.settings.reducedMotion ? ' checked' : ''}> 减少翻页与背景动效</label>
        </div>
        <p class="field-note">远程 AI 只接收当前草稿和你的灵感提示。密钥不会进入导出的角色 JSON；共享电脑上建议使用离线模式。</p>
        <div class="button-row end"><button type="button" class="primary-btn" data-action="save-settings">保存设置</button></div>
      </div>
    </section>
  </div>`;
}

function inputSetting(key, label, placeholder, type = 'text', full = false) {
  return `<div class="field${full ? ' full' : ''}"><label for="setting-${key}"><span>${escapeHtml(label)}</span></label><input class="control" id="setting-${key}" type="${type}" data-setting="${key}" value="${escapeHtml(state.settings[key])}" placeholder="${escapeHtml(placeholder)}"></div>`;
}

function renderHelpModal() {
  if (state.ui.modal !== 'help') return '';
  return `<div class="overlay" data-overlay="help"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="help-title">
    <div class="modal-head"><div><h2 id="help-title">这份档案如何工作</h2><p>创角过程始终是草稿；最终确认前，不会把状态标记为初始化完成。</p></div><button type="button" class="close-btn" data-action="close-modal" aria-label="关闭">×</button></div>
    <div class="modal-body">
      <ul class="validation-list">
        <li class="validation-item ok"><span>01</span><span>五页信息会自动保存在当前浏览器，可随时返回修改。</span></li>
        <li class="validation-item ok"><span>02</span><span>剧情锚点来自项目的 39 卷剧情总结，卷数决定可选事件，事件决定时间。</span></li>
        <li class="validation-item ok"><span>03</span><span>AI 建议只补空白字段；远程模式使用你配置的 OpenAI 兼容接口。</span></li>
        <li class="validation-item ok"><span>04</span><span>最终页可复制、下载或尝试写入 SillyTavern 输入框；若找不到宿主控件会安全回退到剪贴板。</span></li>
      </ul>
    </div>
  </section></div>`;
}

function renderChromeLayers() {
  let layers = app.querySelector('[data-chrome-layers]');
  if (!layers) return;
  layers.innerHTML = `${renderSettingsModal()}${renderHelpModal()}${state.ui.toast ? `<div class="toast ${escapeHtml(state.ui.toast.tone)}" role="status">${escapeHtml(state.ui.toast.message)}</div>` : ''}${state.ui.busy ? `<div class="busy"><div class="busy-card"><span class="spinner"></span><span>${escapeHtml(state.ui.busy)}</span></div></div>` : ''}`;
}

function render() {
  const step = currentStep();
  const validation = validateDraft(state.draft);
  app.innerHTML = `<div class="forge" data-motion="${state.settings.reducedMotion ? 'off' : 'on'}" style="--page-art:url('${PAGE_ART[state.ui.activeStep]}')">
    <div class="atmosphere"></div>
    <div class="shell">
      <header class="topbar">
        <div class="brand"><span class="brand-mark">零</span><span class="brand-copy"><strong>RE:ZERO / CHARACTER FORGE</strong><span>魔女茶会 · 创角向导</span></span></div>
        <div class="session-pill"><span class="dot"></span><span>${safeReadStorage(DRAFT_STORAGE_KEY) ? '本机草稿已恢复' : '新草稿已建立'}</span></div>
        <div class="top-actions">
          <button type="button" class="icon-btn" data-action="save-draft" aria-label="保存草稿" title="保存草稿">⌁</button>
          <label class="icon-btn" aria-label="导入草稿" title="导入草稿">↥<input class="sr-only" type="file" accept="application/json,.json" data-import-draft></label>
          <button type="button" class="icon-btn" data-action="open-help" aria-label="帮助" title="帮助">?</button>
          <button type="button" class="icon-btn" data-action="open-settings" aria-label="设置" title="设置">⚙</button>
        </div>
      </header>
      <section class="hero">
        <div><p class="eyebrow">WITCH'S TEA PARTY · DOSSIER 00</p><h1>在故事开始前<span>CHOOSE WHO YOU BECOME</span></h1><p class="hero-copy">名字、愿望与一次准确的剧情落点，会决定世界第一次如何看见你。沿着五页档案写下答案，茶会会替你整理成可以带入故事的角色状态。</p></div>
        <div class="hero-motto">“命运并不要求你一次答对。它只要求你在翻页时，仍认得自己的名字。”<small>ARCHIVE NOTE / ECHIDNA</small></div>
      </section>
      <nav class="progress" aria-label="创角步骤">${renderProgress()}</nav>
      <div class="workspace">
        <main class="stage">
          <header class="stage-head"><div><p class="stage-kicker">${escapeHtml(step.kicker)}</p><h2>${escapeHtml(step.title)}</h2><p>${pageDescription(step.id)}</p></div><span class="stage-count">PAGE ${String(step.index).padStart(2, '0')} / 05</span></header>
          ${renderPage()}
        </main>
        ${renderRail()}
      </div>
    </div>
    <nav class="footer-nav" aria-label="翻页控制">
      <button type="button" class="nav-btn" data-action="previous-step"${state.ui.activeStep === 0 ? ' disabled' : ''}>← 上一页</button>
      <div class="footer-status"><b>${escapeHtml(step.label)} · ${escapeHtml(step.title)}</b><small>${validation.ok ? 'READY TO DEPART' : `${validation.errors.length} REQUIRED FIELDS REMAIN`}</small></div>
      <button type="button" class="nav-btn next" data-action="next-step"${state.ui.activeStep === STEP_DEFINITIONS.length - 1 ? ' disabled' : ''}>下一页 →</button>
    </nav>
  </div><div data-chrome-layers></div>`;
  renderChromeLayers();
}

function pageDescription(stepId) {
  return ({
    identity: '写下最先被看见的身份轮廓。空白可以保留，但名字与角色类型会成为后续叙事的主键。',
    origin: '先选择当前卷，再从该卷事件中确定开局；事件的日期、时段与时间线会自动带入档案。',
    heart: '愿望让角色前进，恐惧与底线决定他们在压力下会成为什么样的人。',
    arsenal: '能力、关系与物件不是清单，而是第一幕中可以真正影响选择的筹码。',
    review: '检查结构化状态与开场文字。确认前仍是草稿，确认后才会标记为正式初始化。',
  })[stepId] ?? '';
}

function goToStep(index) {
  const target = Math.max(0, Math.min(STEP_DEFINITIONS.length - 1, Number(index)));
  state.ui.activeStep = target;
  state.ui.highestVisitedStep = Math.max(state.ui.highestVisitedStep, target);
  state.ui.modal = null;
  render();
  window.scrollTo({ top: 0, behavior: state.settings.reducedMotion ? 'auto' : 'smooth' });
}

function addArrayItem(section) {
  const current = getAt(state.draft, section);
  if (!Array.isArray(current)) setAt(state.draft, section, []);
  const list = getAt(state.draft, section);
  if (list.length >= MAX_REPEATERS) {
    showToast(`每类最多记录 ${MAX_REPEATERS} 项。`, 'bad');
    return;
  }
  const templates = {
    abilities: { name: '', category: '一般技能', status: '可用', cost: '无', description: '', limits: '' },
    relationships: { name: '', relation: '', stance: '未知', trust: 0, notes: '' },
    'assets.items': { name: '', quantity: 1, description: '' },
    'assets.equipment': { name: '', quantity: 1, description: '' },
    'assets.currency': { name: '', quantity: 0, description: '' },
  };
  list.push(structuredClone(templates[section] ?? {}));
  queueSave();
  render();
}

function removeArrayItem(section, index) {
  const list = getAt(state.draft, section);
  if (!Array.isArray(list)) return;
  list.splice(Number(index), 1);
  queueSave();
  render();
}

function addTrait() {
  const input = app.querySelector('[data-trait-entry]');
  const value = input?.value.trim();
  if (!value) return;
  if (!Array.isArray(state.draft.personality.traits)) state.draft.personality.traits = [];
  if (state.draft.personality.traits.length >= 8) {
    showToast('性格关键词最多保留 8 个。', 'bad');
    return;
  }
  if (!state.draft.personality.traits.includes(value)) state.draft.personality.traits.push(value);
  queueSave();
  render();
}

function updateLivePreview() {
  const liveName = app.querySelector('[data-live-name]');
  if (liveName) liveName.textContent = state.draft.protagonist.name || '未命名旅人';
  const liveProgress = app.querySelector('[data-live-progress]');
  if (liveProgress) liveProgress.textContent = `${[0, 1, 2, 3, 4].filter(stepIsComplete).length} / 5 页完整`;
  const jsonPreview = app.querySelector('[data-json-preview]');
  if (jsonPreview) jsonPreview.value = JSON.stringify(buildExportBundle(state.ui.confirmed), null, 2);
}

async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.append(textarea);
  textarea.select();
  const copied = document.execCommand('copy');
  textarea.remove();
  if (!copied) throw new Error('当前浏览器不允许写入剪贴板');
}

function downloadFile(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function sanitizedFilename() {
  return (state.draft.protagonist.name || '未命名角色').replace(/[\\/:*?"<>|]/g, '_');
}

async function runAiFill() {
  const stepId = currentStep().id;
  state.ui.busy = state.settings.provider === 'remote' ? '正在询问远程灵感……' : '正在整理离线灵感……';
  renderChromeLayers();
  try {
    let patch;
    if (state.settings.provider === 'remote') {
      if (!state.settings.apiUrl || !state.settings.model) throw new Error('请先在设置中填写接口地址与模型名称');
      const prompt = buildAiPrompt(state.draft, stepId, state.ui.aiIdea);
      patch = await requestOpenAiCompatible({
        apiUrl: state.settings.apiUrl,
        apiKey: state.settings.apiKey,
        model: state.settings.model,
        prompt,
      });
    } else {
      patch = suggestOffline(state.draft, stepId);
    }
    const result = mergeAiPatch(state.draft, patch);
    state.draft = result.draft;
    state.ui.busy = '';
    saveDraft();
    render();
    showToast(result.appliedPaths.length ? `已补全 ${result.appliedPaths.length} 处空白；已有内容保持不变。` : '这一页没有可补的空白字段。', result.appliedPaths.length ? 'ok' : '');
  } catch (error) {
    state.ui.busy = '';
    renderChromeLayers();
    showToast(error?.message || 'AI 帮填失败，请检查设置。', 'bad');
  }
}

function candidateHostDocuments() {
  const documents = [document];
  for (const frame of [window.parent, window.top]) {
    try {
      if (frame?.document && !documents.includes(frame.document)) documents.push(frame.document);
    } catch {
      // 跨域父页面不可读时保持沙箱内运行。
    }
  }
  return documents;
}

function findTavernComposer() {
  for (const hostDocument of candidateHostDocuments()) {
    const textarea = hostDocument.querySelector('#send_textarea, textarea[data-i18n="Type a message"], textarea[placeholder*="message" i]');
    if (!textarea) continue;
    const sendButton = hostDocument.querySelector('#send_but, button[title*="Send" i], button[aria-label*="Send" i]');
    return { textarea, sendButton };
  }
  return null;
}

async function writeToTavern({ send = false } = {}) {
  const text = openingText();
  const composer = findTavernComposer();
  if (!composer) {
    await copyText(text);
    throw new Error('未找到酒馆输入框，开场文本已复制到剪贴板');
  }
  if (composer.textarea.value.trim()) {
    await copyText(text);
    throw new Error('酒馆输入框已有内容，为避免覆盖，开场文本已复制');
  }
  composer.textarea.value = text;
  composer.textarea.dispatchEvent(new Event('input', { bubbles: true }));
  composer.textarea.dispatchEvent(new Event('change', { bubbles: true }));
  composer.textarea.focus();
  if (!send) return '已写入酒馆输入框，请确认后发送。';
  if (!composer.sendButton || composer.sendButton.disabled) return '已写入酒馆输入框，但未能确认发送按钮状态，请手动发送。';
  composer.sendButton.click();
  return '角色已确认，开场文本已交给酒馆发送。';
}

async function confirmStart() {
  const validation = validateDraft(state.draft);
  if (!validation.ok) {
    showToast('还有必填信息未完成。', 'bad');
    return;
  }
  state.ui.confirmed = true;
  const bundle = buildExportBundle(true);
  safeWriteStorage(FINAL_STORAGE_KEY, JSON.stringify(bundle));
  window.__RE0_CREATOR_EXPORT__ = structuredClone(bundle);
  try {
    const message = await writeToTavern({ send: true });
    showToast(message, 'ok');
  } catch (error) {
    showToast(`${error.message}；正式档案已保存在本机。`, 'ok');
  }
  render();
}

async function importDraft(file) {
  if (!file) return;
  try {
    const parsed = JSON.parse(await file.text());
    const candidate = parsed?.draft ?? parsed;
    state.draft = parseDraft(candidate);
    state.ui.confirmed = false;
    state.ui.openingEdited = false;
    state.ui.openingOverride = '';
    syncStoryAnchor();
    saveDraft();
    render();
    showToast('草稿已导入并恢复。', 'ok');
  } catch (error) {
    showToast(`导入失败：${error.message}`, 'bad');
  }
}

async function handleAction(action, element) {
  if (action === 'go-step') return goToStep(element.dataset.step);
  if (action === 'previous-step') return goToStep(state.ui.activeStep - 1);
  if (action === 'next-step') return goToStep(state.ui.activeStep + 1);
  if (action === 'save-draft') return saveDraft({ announce: true });
  if (action === 'open-settings') { state.ui.modal = 'settings'; renderChromeLayers(); return; }
  if (action === 'open-help') { state.ui.modal = 'help'; renderChromeLayers(); return; }
  if (action === 'close-modal') { state.ui.modal = null; renderChromeLayers(); return; }
  if (action === 'save-settings') {
    safeWriteStorage(SETTINGS_STORAGE_KEY, JSON.stringify(state.settings));
    state.ui.modal = null;
    render();
    showToast('设置已保存在本机。', 'ok');
    return;
  }
  if (action === 'add-array-item') return addArrayItem(element.dataset.section);
  if (action === 'remove-array-item') return removeArrayItem(element.dataset.section, element.dataset.index);
  if (action === 'add-trait') return addTrait();
  if (action === 'remove-trait') {
    state.draft.personality.traits.splice(Number(element.dataset.index), 1);
    queueSave();
    render();
    return;
  }
  if (action === 'run-ai') return runAiFill();
  if (action === 'reset-opening') {
    state.ui.openingEdited = false;
    state.ui.openingOverride = '';
    render();
    showToast('已恢复随档案自动生成。', 'ok');
    return;
  }
  if (action === 'copy-opening') {
    await copyText(openingText());
    showToast('开场文本已复制。', 'ok');
    return;
  }
  if (action === 'download-opening') {
    downloadFile(`${sanitizedFilename()}-开场.txt`, openingText(), 'text/plain;charset=utf-8');
    return;
  }
  if (action === 'copy-json') {
    await copyText(JSON.stringify(buildExportBundle(state.ui.confirmed), null, 2));
    showToast('角色 JSON 已复制。', 'ok');
    return;
  }
  if (action === 'download-json') {
    downloadFile(`${sanitizedFilename()}-角色档案.json`, JSON.stringify(buildExportBundle(state.ui.confirmed), null, 2), 'application/json;charset=utf-8');
    return;
  }
  if (action === 'write-tavern') {
    try { showToast(await writeToTavern(), 'ok'); } catch (error) { showToast(error.message, 'bad'); }
    return;
  }
  if (action === 'confirm-start') return confirmStart();
  if (action === 'focus-error') {
    const stepMap = { 'protagonist.name': 0, 'protagonist.roleType': 0, 'storyAnchor.volumeNumber': 1, 'storyAnchor.eventId': 1, 'personality.wish': 2, 'combatTier.level': 3, 'combatTier.position': 3 };
    return goToStep(stepMap[element.dataset.errorPath] ?? 0);
  }
}

app.addEventListener('click', (event) => {
  const choice = event.target.closest('[data-choice-path]');
  if (choice) {
    setAt(state.draft, choice.dataset.choicePath, choice.dataset.choiceValue);
    queueSave();
    render();
    return;
  }
  const actionElement = event.target.closest('[data-action]');
  if (!actionElement) return;
  Promise.resolve(handleAction(actionElement.dataset.action, actionElement)).catch((error) => showToast(error?.message || '操作失败', 'bad'));
});

app.addEventListener('input', (event) => {
  const target = event.target;
  if (target.matches('[data-path]')) {
    const value = target.dataset.valueType === 'number' ? Number(target.value) : target.value;
    setAt(state.draft, target.dataset.path, value);
    state.ui.confirmed = false;
    queueSave();
    updateLivePreview();
    return;
  }
  if (target.matches('[data-array-section]')) {
    const list = getAt(state.draft, target.dataset.arraySection);
    const item = list?.[Number(target.dataset.index)];
    if (item) item[target.dataset.key] = target.dataset.valueType === 'number' ? Number(target.value) : target.value;
    state.ui.confirmed = false;
    queueSave();
    updateLivePreview();
    return;
  }
  if (target.matches('[data-ai-idea]')) state.ui.aiIdea = target.value;
  if (target.matches('[data-opening-text]')) {
    state.ui.openingEdited = true;
    state.ui.openingOverride = target.value;
  }
  if (target.matches('[data-setting]')) {
    const key = target.dataset.setting;
    state.settings[key] = target.type === 'checkbox' ? target.checked : target.value;
  }
});

app.addEventListener('change', (event) => {
  const target = event.target;
  if (target.matches('[data-story-select="volume"]')) {
    selectVolume(target.value);
    state.ui.confirmed = false;
    queueSave();
    render();
    return;
  }
  if (target.matches('[data-story-select="event"]')) {
    applyStoryEvent(getStoryEvent(state.storyIndex, state.draft.storyAnchor.volumeNumber, target.value));
    state.ui.confirmed = false;
    queueSave();
    render();
    return;
  }
  if (target.matches('[data-import-draft]')) {
    importDraft(target.files?.[0]);
    target.value = '';
    return;
  }
  if (target.matches('[data-setting]')) {
    const key = target.dataset.setting;
    state.settings[key] = target.type === 'checkbox' ? target.checked : target.value;
  }
});

app.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && state.ui.modal) {
    state.ui.modal = null;
    renderChromeLayers();
  }
  if (event.key === 'Enter' && event.target.matches('[data-trait-entry]')) {
    event.preventDefault();
    addTrait();
  }
});

async function initialize() {
  render();
  try {
    state.storyIndex = await loadStoryIndex();
    state.ui.storyStatus = 'ready';
    syncStoryAnchor();
    render();
  } catch (error) {
    state.ui.storyStatus = 'error';
    render();
    showToast(error?.message || '剧情索引加载失败。', 'bad');
  }
}

window.__RE0_CREATOR_APP__ = {
  getDraft: () => structuredClone(state.draft),
  getBundle: (finalized = false) => structuredClone(buildExportBundle(finalized)),
  getStoryIndex: () => structuredClone(state.storyIndex),
  setStep: (index) => goToStep(index),
  render,
};

initialize();
