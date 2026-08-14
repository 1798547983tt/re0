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
  prepareAiPatch,
  serializeDraft,
  suggestOffline,
  validateDraft,
} from './creator-core.mjs';
import {
  buildAiPrompt,
  fetchAllModels,
  requestOpenAiCompatible,
  requestTavernHelper,
} from './ai-provider.mjs';
import { loadStoryIndex } from './story-index.mjs';
import { assetUrl } from './assets.mjs';

const DRAFT_STORAGE_KEY = 're0.creator.draft.v1';
const SETTINGS_STORAGE_KEY = 're0.creator.settings.v1';
const FINAL_STORAGE_KEY = 're0.creator.final.v1';
const PORTRAIT_STORAGE_KEY = 're0.creator.portrait.v1';
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

const STEP_VISUALS = [
  { label: '身份之页', caption: '月夜茶会中的银发旅人' },
  { label: '出身之页', caption: '雪原尽头的命运入口' },
  { label: '内心之页', caption: '月影下无法言说的秘密' },
  { label: '羁绊之页', caption: '能力与誓约交织的瞬间' },
  { label: '启程之页', caption: '魔女茶会前的最终确认' },
];

const DEFAULT_SETTINGS = {
  provider: 'tavern',
  apiUrl: 'https://api.openai.com/v1',
  apiKey: '',
  model: '',
  reducedMotion: false,
};

const appScope = document.currentScript?.closest('[data-re0-creator-mount]') ?? document;
const app = appScope.querySelector('#re0-creator-app');

if (!app) throw new Error('找不到创角向导挂载点 #re0-creator-app');

function escapeHtml(value = '') {
  // Build entity values at runtime instead of embedding literal `&...;`
  // sequences. Tavern Helper serializes message HTML through an intermediate
  // DOM; that pass decodes entity-looking text inside inline scripts. A
  // literal `&#039;` therefore becomes a bare quote and can invalidate the
  // whole script before the message iframe mounts.
  const amp = String.fromCharCode(38);
  const entities = {
    '&': `${amp}amp;`,
    '<': `${amp}lt;`,
    '>': `${amp}gt;`,
    '"': `${amp}quot;`,
    "'": `${amp}#039;`,
  };
  return String(value ?? '').replace(/[&<>"']/g, (character) => entities[character]);
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

function loadPortrait() {
  const serialized = safeReadStorage(PORTRAIT_STORAGE_KEY);
  if (!serialized) return { customDataUrl: '' };
  try {
    const value = JSON.parse(serialized);
    return {
      customDataUrl: typeof value.customDataUrl === 'string' && value.customDataUrl.startsWith('data:image/') ? value.customDataUrl : '',
    };
  } catch {
    return { customDataUrl: '' };
  }
}

const state = {
  draft: loadSavedDraft(),
  storyIndex: [],
  settings: loadSettings(),
  portrait: loadPortrait(),
  ui: {
    screen: 'title',
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
    modelOptions: [],
    modelFilter: '',
    modelStatus: '可填写根地址、/v1 或完整聊天地址，再拉取全部模型。',
    modelTone: '',
    modelLoading: false,
    aiStatus: '尚未发送请求。选择帮填方式后，可生成本页或全档案建议。',
    aiTone: '',
    aiPreview: null,
    aiTrace: null,
    lastAiScope: 'page',
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

function portraitSource() {
  if (state.ui.activeStep === 1 && state.portrait.customDataUrl) return state.portrait.customDataUrl;
  return PORTRAIT_ART[state.ui.activeStep] || PORTRAIT_ART[0];
}

function persistPortrait() {
  return safeWriteStorage(PORTRAIT_STORAGE_KEY, JSON.stringify(state.portrait));
}

function providerLabel() {
  return ({
    tavern: '酒馆当前模型',
    remote: state.settings.model ? `独立直连 · ${state.settings.model}` : '独立 OpenAI 兼容直连',
    offline: '离线灵感模式',
  })[state.settings.provider] || '未选择';
}

function safeEndpointLabel(value) {
  try {
    const parsed = new URL(String(value || ''));
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return String(value || '未提供');
  }
}

function tracePhaseLabel(phase) {
  return ({ prepared: '提示词已准备', sending: '调用已发起', response: '已收到接口响应', parsed: '回复已解析', filtered: '补丁已筛选', failed: '调用失败' })[phase] || '等待调用';
}

function updateAiTrace(event = {}) {
  state.ui.aiTrace = { ...(state.ui.aiTrace ?? {}), ...event };
  const trace = state.ui.aiTrace;
  const phaseNode = app.querySelector('[data-ai-trace-phase]');
  const targetNode = app.querySelector('[data-ai-trace-target]');
  const modelNode = app.querySelector('[data-ai-trace-model]');
  const promptNode = app.querySelector('[data-ai-trace-prompt]');
  if (phaseNode) phaseNode.textContent = tracePhaseLabel(trace.phase);
  if (targetNode) targetNode.textContent = trace.target || '—';
  if (modelNode) modelNode.textContent = trace.model || '酒馆当前模型';
  if (promptNode) promptNode.textContent = trace.promptLength ? `${trace.promptLength} 字` : '—';
  const statusNode = app.querySelector('[data-ai-status] > span');
  if (statusNode && trace.message) statusNode.textContent = trace.message;
}

function hasSavedDraft() {
  return Boolean(safeReadStorage(DRAFT_STORAGE_KEY));
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
  const visual = STEP_VISUALS[state.ui.activeStep] || STEP_VISUALS[0];
  const event = currentEvent();
  const name = state.draft.protagonist.name || '未命名旅人';
  const appearance = state.draft.protagonist.appearance || '外貌尚未描写；可在“来历与处境”页补充发色、瞳色与显眼特征。';
  const completion = [0, 1, 2, 3, 4].filter(stepIsComplete).length;
  return `<aside class="rail">
    <section class="rail-card portrait-dossier">
      <div class="portrait">
        <img src="${escapeHtml(portraitSource())}" alt="${escapeHtml(visual.caption)}" data-portrait-image data-step-visual="${escapeHtml(step.id)}">
        <div class="portrait-vignette"></div>
        <div class="portrait-copy"><small>CHARACTER DOSSIER</small><strong data-live-name>${escapeHtml(name)}</strong><span data-live-identity>${escapeHtml(state.draft.protagonist.identity || '身份尚未落笔')} · ${escapeHtml(state.draft.protagonist.faction || '中立')}</span><p data-live-appearance>${escapeHtml(appearance)}</p></div>
      </div>
      <div class="rail-card-body">
        ${state.ui.activeStep === 1 ? `<div class="portrait-toolbar" aria-label="自定义角色肖像"><div class="step-visual-note"><small>${escapeHtml(visual.label)}</small><strong>${escapeHtml(state.portrait.customDataUrl ? '正在使用本机肖像' : visual.caption)}</strong></div><label class="portrait-upload">上传角色肖像<input class="sr-only" type="file" accept="image/png,image/jpeg,image/webp,image/gif" data-portrait-file></label>${state.portrait.customDataUrl ? '<button type="button" class="portrait-clear" data-action="clear-portrait">恢复本页画面</button>' : ''}</div><p class="portrait-local-note">上传仅替换“出身”页画面并保存在本机；其他填表页仍显示各自的剧情画面。</p>` : `<div class="step-visual-note"><small>${escapeHtml(visual.label)} · AUTO SWITCH</small><strong>${escapeHtml(visual.caption)}</strong><span>翻到下一页时，画面会随填写主题自动切换。</span></div>`}
        <div class="mini-grid">
          <div class="mini-stat"><small>PROGRESS</small><b data-live-progress>${completion} / 5 页完整</b></div>
          <div class="mini-stat"><small>TYPE</small><b>${escapeHtml(state.draft.protagonist.roleType || '未选择')}</b></div>
          <div class="mini-stat"><small>POWER</small><b>${escapeHtml(state.draft.combatTier?.level && state.draft.combatTier?.position ? `${state.draft.combatTier.level}${state.draft.combatTier.position}` : '未选择')}</b></div>
          <div class="mini-stat"><small>VOLUME</small><b>${state.draft.storyAnchor.volumeNumber ? `第 ${String(state.draft.storyAnchor.volumeNumber).padStart(2, '0')} 卷` : '未选择'}</b></div>
          <div class="mini-stat"><small>STEP</small><b>${escapeHtml(step.label)}</b></div>
        </div>
        <div class="portrait-anchor"><small>CURRENT STORY · ${state.draft.storyAnchor.volumeNumber ? `第 ${String(state.draft.storyAnchor.volumeNumber).padStart(2, '0')} 卷` : '未选择卷数'}</small><strong>${escapeHtml(event?.title || '尚未选择事件')}</strong><span>${escapeHtml(event?.time || '选择事件后会显示对应日期、时段与时间线。')}</span></div>
      </div>
    </section>
    <section class="rail-card ai-card">
      <div class="rail-card-head"><h3>AI 帮填</h3><small>REVIEW BEFORE APPLY</small></div>
      <div class="rail-card-body">
        <div class="ai-status"><span class="orb${state.settings.provider !== 'offline' ? ' remote' : ''}"></span><span>${escapeHtml(providerLabel())}</span></div>
        <textarea class="control ai-idea" data-ai-idea placeholder="可选：写一句角色灵感或希望保留的气质">${escapeHtml(state.ui.aiIdea)}</textarea>
        <div class="button-row ai-actions">
          <button type="button" class="primary-btn" data-action="run-ai"${state.ui.busy ? ' disabled' : ''}>生成本页建议</button>
          <button type="button" class="ghost-btn" data-action="run-ai-all"${state.ui.busy ? ' disabled' : ''}>生成全档案</button>
          <button type="button" class="ghost-btn" data-action="open-settings">设置</button>
        </div>
        <div class="ai-feedback ${escapeHtml(state.ui.aiTone)}" data-ai-status aria-live="polite"><strong>${escapeHtml(state.ui.aiTone === 'bad' ? '请求未完成' : state.ui.aiTone === 'ok' ? '已收到回复' : '请求状态')}</strong><span>${escapeHtml(state.ui.aiStatus)}</span>${state.ui.aiTone === 'bad' ? '<div class="button-row"><button type="button" class="ghost-btn" data-action="retry-ai">重试</button><button type="button" class="ghost-btn" data-action="run-ai-offline">改用离线灵感</button></div>' : ''}</div>
        ${state.ui.aiTrace ? `<details class="ai-trace"><summary>本次调用记录</summary><dl><div><dt>阶段</dt><dd data-ai-trace-phase>${escapeHtml(tracePhaseLabel(state.ui.aiTrace.phase))}</dd></div><div><dt>通道</dt><dd>${escapeHtml(state.ui.aiTrace.channel || '—')}</dd></div><div><dt>目标</dt><dd data-ai-trace-target>${escapeHtml(state.ui.aiTrace.target || '—')}</dd></div><div><dt>模型</dt><dd data-ai-trace-model>${escapeHtml(state.ui.aiTrace.model || '酒馆当前模型')}</dd></div><div><dt>提示词</dt><dd data-ai-trace-prompt>${state.ui.aiTrace.promptLength ? `${state.ui.aiTrace.promptLength} 字` : '—'}</dd></div></dl>${state.ui.aiTrace.channel === '独立 API 直连' ? '<p>此通道由浏览器直接请求接口，不经过 SillyTavern 后台；请在独立 API 服务端查看 POST 记录。</p>' : ''}</details>` : ''}
        <p class="rail-note">模型回复会先进入变更预览；确认后才补入空白字段，已有内容不会被覆盖。</p>
      </div>
    </section>
  </aside>`;
}

function renderSettingsModal() {
  if (state.ui.modal !== 'settings') return '';
  const modelNeedle = state.ui.modelFilter.trim().toLowerCase();
  return `<div class="overlay" data-overlay="settings">
    <section class="modal" role="dialog" aria-modal="true" aria-labelledby="settings-title">
      <div class="modal-head"><div><h2 id="settings-title">模型连接与显示</h2><p>优先使用酒馆当前连接；也可切换独立兼容接口，或完全离线。</p></div><button type="button" class="close-btn" data-action="close-modal" aria-label="关闭">×</button></div>
      <div class="modal-body">
        <div class="field-grid">
          <div class="field full"><label for="setting-provider"><span>帮填方式</span><small>PROVIDER</small></label><select class="control" id="setting-provider" data-setting="provider"><option value="tavern"${state.settings.provider === 'tavern' ? ' selected' : ''}>酒馆当前连接（使用当前模型）</option><option value="remote"${state.settings.provider === 'remote' ? ' selected' : ''}>独立 OpenAI 兼容接口（浏览器直连）</option><option value="offline"${state.settings.provider === 'offline' ? ' selected' : ''}>离线灵感（无需请求）</option></select></div>
          ${state.settings.provider === 'tavern' ? '<div class="provider-note field full"><strong>酒馆当前连接</strong><span>通过 Tavern Helper 的 generateRaw 静默生成，不新增聊天楼层。若当前 iframe 无此能力，会显示明确错误并提供离线降级。</span></div>' : ''}
          ${state.settings.provider === 'offline' ? '<div class="provider-note field full"><strong>离线灵感</strong><span>不发送任何网络请求，使用内置 Re:Zero 角色灵感；仍会先预览再应用。</span></div>' : ''}
          ${state.settings.provider === 'remote' ? `${inputSetting('apiUrl', '接口地址', 'https://example.com、/v1 或完整 /chat/completions', 'url', true)}
          <div class="field full model-picker">
            <label for="setting-model"><span>模型名称</span><small>${state.ui.modelOptions.length ? `${state.ui.modelOptions.length} MODELS` : 'MANUAL OR FETCH'}</small></label>
            <div class="model-input-row"><input class="control" id="setting-model" data-setting="model" value="${escapeHtml(state.settings.model)}" placeholder="搜索已拉取模型，或手动填写"><button type="button" class="ghost-btn" data-action="fetch-models"${state.ui.modelLoading ? ' disabled' : ''}>${state.ui.modelLoading ? '拉取中…' : '拉取全部模型'}</button></div>
            <div class="model-status ${escapeHtml(state.ui.modelTone)}" data-model-status aria-live="polite">${escapeHtml(state.ui.modelStatus)}</div>
            ${state.ui.modelOptions.length ? `<div class="model-list" data-model-list role="listbox" aria-label="全部模型">${state.ui.modelOptions.map((model) => `<button type="button" class="model-option${state.settings.model === model ? ' is-selected' : ''}" data-action="choose-model" data-model-value="${escapeHtml(model)}" role="option" aria-selected="${state.settings.model === model ? 'true' : 'false'}"${modelNeedle && !model.toLowerCase().includes(modelNeedle) ? ' hidden' : ''}>${escapeHtml(model)}</button>`).join('')}<p data-model-empty${state.ui.modelOptions.some((model) => !modelNeedle || model.toLowerCase().includes(modelNeedle)) ? ' hidden' : ''}>没有匹配项；保留输入内容即可手动使用。</p></div>` : ''}
          </div>
          ${inputSetting('apiKey', 'API Key（可选）', '本地服务可留空；只保存在本机浏览器', 'password', true)}
          <div class="provider-note field full"><strong>浏览器直连说明</strong><span>补全 POST 会从当前消息 iframe 直接发送到该接口，不经过 SillyTavern 后台，因此酒馆控制台不会出现这条请求。接口必须允许浏览器 CORS；调用记录会显示实际目标、模型与提示词长度。</span></div>` : ''}
          <label class="reduced-motion-toggle field full"><input type="checkbox" data-setting="reducedMotion"${state.settings.reducedMotion ? ' checked' : ''}> 减少翻页与背景动效</label>
        </div>
        <p class="field-note">独立接口请求只包含当前草稿和灵感提示。模型列表不会静默过滤；API Key 不会进入角色状态或导出 JSON。</p>
        <div class="button-row end"><button type="button" class="primary-btn" data-action="save-settings">保存设置</button></div>
      </div>
    </section>
  </div>`;
}

function inputSetting(key, label, placeholder, type = 'text', full = false) {
  return `<div class="field${full ? ' full' : ''}"><label for="setting-${key}"><span>${escapeHtml(label)}</span></label><input class="control" id="setting-${key}" type="${type}" data-setting="${key}" value="${escapeHtml(state.settings[key])}" placeholder="${escapeHtml(placeholder)}"></div>`;
}

function renderAiPreviewModal() {
  if (state.ui.modal !== 'ai-preview' || !state.ui.aiPreview) return '';
  const preview = state.ui.aiPreview;
  const changes = preview.appliedPaths.map((path) => {
    const value = getAt(preview.draft, path);
    const shown = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
    return `<li><code>${escapeHtml(path)}</code><span>${escapeHtml(shown)}</span></li>`;
  }).join('');
  return `<div class="overlay" data-overlay="ai-preview"><section class="modal ai-preview-modal" role="dialog" aria-modal="true" aria-labelledby="ai-preview-title">
    <div class="modal-head"><div><h2 id="ai-preview-title">模型回复已收到</h2><p>${escapeHtml(preview.source)} · ${preview.scope === 'all' ? '全档案建议' : '当前页建议'} · 只补空白</p></div><button type="button" class="close-btn" data-action="discard-ai-preview" aria-label="关闭">×</button></div>
    <div class="modal-body">
      <div class="preview-summary"><strong>${preview.appliedPaths.length}</strong><span>处可应用</span><strong>${preview.skippedPaths.length}</strong><span>处因已有内容而跳过</span><strong>${preview.ignoredPaths?.length || 0}</strong><span>个范围外字段已忽略</span></div>
      ${changes ? `<ul class="ai-change-list">${changes}</ul>` : '<div class="provider-note"><strong>没有可应用的空白</strong><span>请求和回复均已完成，但当前建议对应的字段已有内容，或模型返回了空补丁。</span></div>'}
      ${preview.ignoredPaths?.length ? `<div class="provider-note"><strong>已安全忽略范围外字段</strong><span>${escapeHtml(preview.ignoredPaths.join('、'))}</span></div>` : ''}
      <details class="raw-patch"><summary>查看可应用 JSON 补丁</summary><pre>${escapeHtml(JSON.stringify(preview.patch, null, 2))}</pre></details>
      <details class="raw-patch"><summary>查看模型原始 JSON 回复</summary><pre>${escapeHtml(JSON.stringify(preview.rawPatch ?? preview.patch, null, 2))}</pre></details>
      <div class="button-row end"><button type="button" class="ghost-btn" data-action="discard-ai-preview">放弃</button><button type="button" class="primary-btn" data-action="apply-ai-preview"${preview.appliedPaths.length ? '' : ' disabled'}>确认补入 ${preview.appliedPaths.length} 处</button></div>
    </div>
  </section></div>`;
}

function renderArchiveModal() {
  if (state.ui.modal !== 'archive') return '';
  const savedAt = state.draft.meta?.updatedAt ? new Date(state.draft.meta.updatedAt).toLocaleString('zh-CN') : '尚未保存';
  return `<div class="overlay" data-overlay="archive"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="archive-title">
    <div class="modal-head"><div><h2 id="archive-title">角色档案</h2><p>本机自动草稿与可携带 JSON 分开管理。</p></div><button type="button" class="close-btn" data-action="close-modal" aria-label="关闭">×</button></div>
    <div class="modal-body"><div class="archive-card"><small>AUTOSAVE</small><strong>${escapeHtml(state.draft.protagonist.name || '未命名旅人')}</strong><span>最后记录：${escapeHtml(savedAt)}</span><span>${escapeHtml(storyVolumeLabel(currentVolume()) || '尚未选择剧情卷')}</span></div>
      <div class="button-row"><button type="button" class="primary-btn" data-action="save-draft">立即保存</button><button type="button" class="ghost-btn" data-action="download-json">提取角色 JSON</button><label class="import-label">导入角色 JSON<input class="sr-only" type="file" accept="application/json,.json" data-import-draft></label></div>
    </div>
  </section></div>`;
}

function renderNewConfirmModal() {
  if (state.ui.modal !== 'new-confirm') return '';
  return `<div class="overlay" data-overlay="new-confirm"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="new-title">
    <div class="modal-head"><div><h2 id="new-title">开启新的轮回？</h2><p>当前草稿仍可先提取为 JSON。</p></div><button type="button" class="close-btn" data-action="close-modal" aria-label="关闭">×</button></div>
    <div class="modal-body"><p class="field-note">确认后会以空白档案开始，现有本机自动草稿将被替换；独立接口设置和本机肖像不会清除。</p><div class="button-row end"><button type="button" class="ghost-btn" data-action="close-modal">取消</button><button type="button" class="danger-btn" data-action="confirm-new">确认新建</button></div></div>
  </section></div>`;
}

function renderHelpModal() {
  if (state.ui.modal !== 'help') return '';
  return `<div class="overlay" data-overlay="help"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="help-title">
    <div class="modal-head"><div><h2 id="help-title">这份档案如何工作</h2><p>创角过程始终是草稿；最终确认前，不会把状态标记为初始化完成。</p></div><button type="button" class="close-btn" data-action="close-modal" aria-label="关闭">×</button></div>
    <div class="modal-body">
      <ul class="validation-list">
        <li class="validation-item ok"><span>01</span><span>五页信息会自动保存在当前浏览器，可随时返回修改。</span></li>
        <li class="validation-item ok"><span>02</span><span>剧情锚点来自项目的 39 卷剧情总结，卷数决定可选事件，事件决定时间。</span></li>
        <li class="validation-item ok"><span>03</span><span>AI 建议会先进入预览，只补空白字段；可使用酒馆当前模型、独立 OpenAI 兼容接口或离线灵感。</span></li>
        <li class="validation-item ok"><span>04</span><span>最终页可复制、下载或尝试写入 SillyTavern 输入框；若找不到宿主控件会安全回退到剪贴板。</span></li>
      </ul>
    </div>
  </section></div>`;
}

function renderChromeLayers() {
  let layers = app.querySelector('[data-chrome-layers]');
  if (!layers) return;
  layers.innerHTML = `${renderSettingsModal()}${renderHelpModal()}${renderAiPreviewModal()}${renderArchiveModal()}${renderNewConfirmModal()}${state.ui.toast ? `<div class="toast ${escapeHtml(state.ui.toast.tone)}" role="status">${escapeHtml(state.ui.toast.message)}</div>` : ''}${state.ui.busy ? `<div class="busy" role="status" aria-live="assertive"><div class="busy-card"><span class="spinner"></span><span>${escapeHtml(state.ui.busy)}</span><small>请求最长等待 60 秒；超时后会显示可重试原因。</small></div></div>` : ''}`;
}

function renderTitleScreen() {
  const saved = hasSavedDraft();
  const event = currentEvent();
  return `<section class="title-screen" data-screen="title" data-motion="${state.settings.reducedMotion ? 'off' : 'on'}">
    <div class="title-art"><img src="${escapeHtml(PAGE_ART[0])}" alt="月夜茶会中的银发少女"><div class="title-art-wash"></div></div>
    <div class="title-frame" aria-hidden="true"></div>
    <header class="title-topbar"><div class="brand"><span class="brand-mark">零</span><span class="brand-copy"><strong>RE:ZERO / ANOTHER CHRONICLE</strong><span>从零开始的异世界生活 · 角色档案</span></span></div><button type="button" class="icon-btn" data-action="open-settings" aria-label="设置" title="设置">⚙</button></header>
    <div class="title-main">
      <div class="title-copy"><p class="eyebrow">RETURN BY DEATH · WITCH'S TEA PARTY</p><h1>从零开始<span>异世界角色创建</span></h1><p class="title-motto">“在命运翻页以前，先决定这一次要以谁的名字活下去。”</p><div class="title-prologue"><span>银月落进茶杯，书页停在尚未写下的名字前。</span><span>选择一个剧情锚点，把愿望、恐惧与力量带进第一幕。</span></div></div>
      <nav class="title-menu" aria-label="开始游戏菜单">
        <button type="button" class="title-menu-btn primary" data-action="start-new"><span>01</span><b>开始游戏<small>NEW CHRONICLE</small></b><i>›</i></button>
        <button type="button" class="title-menu-btn" data-action="continue-draft"${saved ? '' : ' disabled'}><span>02</span><b>继续游戏<small>CONTINUE AUTOSAVE</small></b><i>›</i></button>
        <button type="button" class="title-menu-btn" data-action="open-archive"><span>03</span><b>存档管理<small>CHARACTER ARCHIVE</small></b><i>›</i></button>
        <label class="title-menu-btn"><span>04</span><b>导入角色档案<small>IMPORT JSON</small></b><i>↥</i><input class="sr-only" type="file" accept="application/json,.json" data-import-draft></label>
        <button type="button" class="title-menu-btn" data-action="export-draft"><span>05</span><b>提取角色档案<small>EXPORT JSON</small></b><i>↓</i></button>
        <button type="button" class="title-menu-btn" data-action="open-settings"><span>06</span><b>设置<small>MODEL & DISPLAY</small></b><i>›</i></button>
      </nav>
    </div>
    <footer class="title-footer"><div><span class="status-dot ${state.ui.storyStatus === 'error' ? 'bad' : ''}"></span><b>${state.ui.storyStatus === 'ready' ? `剧情索引已就绪 · ${state.storyIndex.length} 卷` : state.ui.storyStatus === 'error' ? '剧情索引加载失败' : '正在展开剧情索引…'}</b></div><p>${saved ? `本机草稿：${escapeHtml(state.draft.protagonist.name || '未命名旅人')} · ${escapeHtml(event?.title || '尚未选择事件')}` : '尚无本机草稿；选择“开始游戏”建立新的角色档案。'}</p></footer>
  </section>`;
}

function render() {
  if (state.ui.screen === 'title') {
    app.innerHTML = `${renderTitleScreen()}<div data-chrome-layers></div>`;
    renderChromeLayers();
    return;
  }
  const step = currentStep();
  const validation = validateDraft(state.draft);
  app.innerHTML = `<div class="forge creator-screen" data-screen="creator" data-motion="${state.settings.reducedMotion ? 'off' : 'on'}" style="--page-art:url('${PAGE_ART[state.ui.activeStep]}')">
    <div class="atmosphere"></div>
    <div class="shell">
      <header class="topbar">
        <button type="button" class="back-to-title" data-action="return-title" aria-label="返回开局页">←</button><div class="brand"><span class="brand-mark">零</span><span class="brand-copy"><strong>RE:ZERO / CHARACTER FORGE</strong><span>魔女茶会 · 创角向导</span></span></div>
        <div class="session-pill"><span class="dot"></span><span>${safeReadStorage(DRAFT_STORAGE_KEY) ? '本机草稿已恢复' : '新草稿已建立'}</span></div>
        <div class="top-actions">
          <button type="button" class="icon-btn" data-action="save-draft" aria-label="保存草稿" title="保存草稿">⌁</button>
          <label class="icon-btn" aria-label="导入草稿" title="导入草稿">↥<input class="sr-only" type="file" accept="application/json,.json" data-import-draft></label>
          <button type="button" class="icon-btn" data-action="open-help" aria-label="帮助" title="帮助">?</button>
          <button type="button" class="icon-btn" data-action="open-settings" aria-label="设置" title="设置">⚙</button>
        </div>
      </header>
      <section class="creator-ribbon"><div><small>WITCH'S TEA PARTY · DOSSIER 00</small><strong>在故事开始前，写下这一次的名字。</strong></div><span>${escapeHtml(storyVolumeLabel(currentVolume()) || '剧情锚点尚未选择')}</span></section>
      <nav class="progress" aria-label="创角步骤">${renderProgress()}</nav>
      <div class="workspace">
        <main class="stage">
          <header class="stage-head"><div><p class="stage-kicker">${escapeHtml(step.kicker)}</p><h2>${escapeHtml(step.title)}</h2><p>${pageDescription(step.id)}</p></div><span class="stage-count">PAGE ${String(step.index).padStart(2, '0')} / 05</span></header>
          ${renderPage()}
          <nav class="footer-nav" aria-label="翻页控制">
            <button type="button" class="nav-btn" data-action="previous-step"${state.ui.activeStep === 0 ? ' disabled' : ''}>← 上一页</button>
            <div class="footer-status"><b>${escapeHtml(step.label)} · ${escapeHtml(step.title)}</b><small>${validation.ok ? 'READY TO DEPART' : `${validation.errors.length} REQUIRED FIELDS REMAIN`}</small></div>
            <button type="button" class="nav-btn next" data-action="next-step"${state.ui.activeStep === STEP_DEFINITIONS.length - 1 ? ' disabled' : ''}>下一页 →</button>
          </nav>
        </main>
        ${renderRail()}
      </div>
    </div>
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
  const liveIdentity = app.querySelector('[data-live-identity]');
  if (liveIdentity) liveIdentity.textContent = `${state.draft.protagonist.identity || '身份尚未落笔'} · ${state.draft.protagonist.faction || '中立'}`;
  const liveAppearance = app.querySelector('[data-live-appearance]');
  if (liveAppearance) liveAppearance.textContent = state.draft.protagonist.appearance || '外貌尚未描写；可在“来历与处境”页补充发色、瞳色与显眼特征。';
  const liveProgress = app.querySelector('[data-live-progress]');
  if (liveProgress) liveProgress.textContent = `${[0, 1, 2, 3, 4].filter(stepIsComplete).length} / 5 页完整`;
  const jsonPreview = app.querySelector('[data-json-preview]');
  if (jsonPreview) jsonPreview.value = JSON.stringify(buildExportBundle(state.ui.confirmed), null, 2);
}

function filterModelList(value) {
  const needle = String(value || '').trim().toLowerCase();
  let visible = 0;
  app.querySelectorAll('[data-model-value]').forEach((button) => {
    const match = !needle || String(button.dataset.modelValue || '').toLowerCase().includes(needle);
    button.hidden = !match;
    if (match) visible += 1;
  });
  const empty = app.querySelector('[data-model-empty]');
  if (empty) empty.hidden = visible > 0;
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

async function fetchFromAvailableRealm(url, options) {
  const realms = [window];
  try { if (window.parent && window.parent !== window) realms.push(window.parent); } catch {}
  try { if (window.top && window.top !== window && !realms.includes(window.top)) realms.push(window.top); } catch {}
  let lastError;
  for (const realm of realms) {
    try {
      if (typeof realm.fetch !== 'function') continue;
      return await realm.fetch.call(realm, url, options);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error('当前运行环境没有可用的 fetch');
}

async function fetchModelCatalog() {
  if (state.ui.modelLoading) return;
  state.ui.modelLoading = true;
  state.ui.modelTone = '';
  state.ui.modelStatus = '正在连接模型目录并读取全部分页…';
  renderChromeLayers();
  try {
    const result = await fetchAllModels({
      apiUrl: state.settings.apiUrl,
      apiKey: state.settings.apiKey,
      fetchImpl: fetchFromAvailableRealm,
      timeoutMs: 15000,
    });
    state.ui.modelOptions = result.models;
    state.ui.modelFilter = '';
    if (!state.settings.model || !result.models.includes(state.settings.model)) state.settings.model = result.models[0];
    state.ui.modelTone = 'ok';
    state.ui.modelStatus = `已完整读取 ${result.models.length} 个模型（${result.pages} 页），未做隐藏过滤。`;
    safeWriteStorage(SETTINGS_STORAGE_KEY, JSON.stringify(state.settings));
  } catch (error) {
    state.ui.modelTone = 'bad';
    state.ui.modelStatus = error?.message || '模型目录拉取失败；你仍可手动填写模型名。';
  } finally {
    state.ui.modelLoading = false;
    renderChromeLayers();
  }
}

async function runAiFill(scope = 'page', providerOverride = '') {
  if (state.ui.busy) return;
  const provider = providerOverride || state.settings.provider;
  const stepId = scope === 'all' ? 'all-pages' : currentStep().id;
  const prompt = buildAiPrompt(state.draft, stepId, state.ui.aiIdea);
  state.ui.lastAiScope = scope;
  state.ui.aiTone = '';
  state.ui.aiStatus = provider === 'offline' ? '正在生成离线建议…' : `请求已提交给${provider === 'tavern' ? '酒馆当前模型' : '独立兼容接口'}，正在等待回复…`;
  state.ui.busy = provider === 'offline' ? '正在整理离线灵感…' : '请求已经发出，正在等待模型回复…';
  state.ui.aiTrace = {
    phase: 'prepared',
    channel: provider === 'tavern' ? 'Tavern Helper' : provider === 'remote' ? '独立 API 直连' : '本机离线规则',
    target: provider === 'tavern' ? 'generateRaw' : provider === 'remote' ? safeEndpointLabel(state.settings.apiUrl) : '当前浏览器',
    model: provider === 'remote' ? state.settings.model : provider === 'tavern' ? '酒馆当前模型' : '无需模型',
    promptLength: prompt.length,
  };
  render();
  try {
    const onStatus = (event) => {
      const target = event.endpoint ? safeEndpointLabel(event.endpoint) : state.ui.aiTrace?.target;
      const message = event.phase === 'sending'
        ? `${event.transport === 'direct' ? '补全 POST 已发起' : 'generateRaw 已调用'}：${event.model || '酒馆当前模型'}，提示词 ${event.promptLength || prompt.length} 字，等待回复…`
        : event.phase === 'response'
          ? `${event.status ? `接口返回 HTTP ${event.status}` : '酒馆模型已返回文本'}，正在解析回复…`
          : '模型回复已解析，正在筛选当前页允许字段…';
      state.ui.aiStatus = message;
      const traceEvent = { target, message };
      ['phase', 'transport', 'status', 'ok', 'model', 'promptLength', 'responseLength'].forEach((key) => {
        if (Object.prototype.hasOwnProperty.call(event, key)) traceEvent[key] = event[key];
      });
      updateAiTrace(traceEvent);
    };
    let patch;
    if (provider === 'tavern') {
      patch = await requestTavernHelper({ root: window, prompt, timeoutMs: 60000, onStatus });
    } else if (provider === 'remote') {
      if (!state.settings.apiUrl || !state.settings.model) throw new Error('请先在设置中填写接口地址，并选择或手动填写模型名称。');
      patch = await requestOpenAiCompatible({
        apiUrl: state.settings.apiUrl,
        apiKey: state.settings.apiKey,
        model: state.settings.model,
        prompt,
        fetchImpl: fetchFromAvailableRealm,
        timeoutMs: 60000,
        onStatus,
      });
    } else {
      updateAiTrace({ phase: 'sending', message: '正在运行本机离线补全规则，不会发送网络请求。' });
      patch = suggestOffline(state.draft, stepId);
    }
    const prepared = prepareAiPatch(patch, stepId);
    if (!Object.keys(prepared.patch).length) {
      const ignored = prepared.ignoredPaths.slice(0, 4).join('、');
      throw new Error(`模型已回复，但没有返回当前页可用字段${ignored ? `；已忽略：${ignored}` : ''}。请重试或补充更具体的要求。`);
    }
    const result = mergeAiPatch(state.draft, prepared.patch);
    updateAiTrace({ phase: 'filtered', ignoredCount: prepared.ignoredPaths.length, message: `补丁筛选完成：${result.appliedPaths.length} 处可补入，忽略 ${prepared.ignoredPaths.length} 个范围外字段。` });
    state.ui.aiPreview = {
      patch: prepared.patch,
      rawPatch: patch,
      ignoredPaths: prepared.ignoredPaths,
      draft: result.draft,
      appliedPaths: result.appliedPaths,
      skippedPaths: result.skippedPaths,
      scope,
      source: provider === 'tavern' ? '酒馆当前模型' : provider === 'remote' ? `独立接口 · ${state.settings.model}` : '离线灵感',
    };
    state.ui.aiTone = 'ok';
    state.ui.aiStatus = `回复已收到：${result.appliedPaths.length} 处可补入，${result.skippedPaths.length} 处已有内容被保护，${prepared.ignoredPaths.length} 个范围外字段已忽略。`;
    state.ui.busy = '';
    state.ui.modal = 'ai-preview';
    render();
  } catch (error) {
    state.ui.busy = '';
    state.ui.aiPreview = null;
    state.ui.aiTone = 'bad';
    state.ui.aiStatus = error?.message || 'AI 请求失败；没有改动任何字段。';
    updateAiTrace({ phase: 'failed', message: state.ui.aiStatus });
    render();
    showToast(state.ui.aiStatus, 'bad');
  }
}

function applyAiPreview() {
  const preview = state.ui.aiPreview;
  if (!preview) return;
  const result = mergeAiPatch(state.draft, preview.patch);
  state.draft = result.draft;
  state.ui.aiPreview = null;
  state.ui.modal = null;
  state.ui.confirmed = false;
  state.ui.aiTone = 'ok';
  state.ui.aiStatus = result.appliedPaths.length ? `已确认补入 ${result.appliedPaths.length} 处空白；已有内容保持不变。` : '没有可补入的空白字段。';
  saveDraft();
  render();
  showToast(state.ui.aiStatus, result.appliedPaths.length ? 'ok' : '');
}

function discardAiPreview() {
  state.ui.aiPreview = null;
  state.ui.modal = null;
  state.ui.aiStatus = '已放弃本次模型建议，角色草稿没有改变。';
  state.ui.aiTone = '';
  render();
}

function beginNewDraft() {
  state.draft = createDefaultDraft();
  state.ui.screen = 'creator';
  state.ui.modal = null;
  state.ui.activeStep = 0;
  state.ui.highestVisitedStep = 0;
  state.ui.confirmed = false;
  state.ui.openingEdited = false;
  state.ui.openingOverride = '';
  state.ui.aiPreview = null;
  saveDraft();
  render();
  window.scrollTo({ top: 0, behavior: 'auto' });
  showToast('新的角色档案已经展开。', 'ok');
}

async function handlePortraitFile(file) {
  if (!file) return;
  if (!file.type.startsWith('image/')) throw new Error('请选择 PNG、JPEG、WebP 或 GIF 图片。');
  if (file.size > 5 * 1024 * 1024) throw new Error('肖像文件请控制在 5 MB 以内。');
  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('读取肖像文件失败。'));
    reader.readAsDataURL(file);
  });
  state.portrait.customDataUrl = dataUrl;
  const persisted = persistPortrait();
  render();
  showToast(persisted ? '自定义肖像已保存在本机。' : '肖像已用于本次页面，但浏览器存储空间不足，刷新后可能丢失。', persisted ? 'ok' : 'bad');
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
    state.ui.screen = 'creator';
    state.ui.modal = null;
    syncStoryAnchor();
    saveDraft();
    render();
    window.scrollTo({ top: 0, behavior: 'auto' });
    showToast('草稿已导入并恢复。', 'ok');
  } catch (error) {
    showToast(`导入失败：${error.message}`, 'bad');
  }
}

async function handleAction(action, element) {
  if (action === 'start-new') {
    if (hasSavedDraft()) { state.ui.modal = 'new-confirm'; renderChromeLayers(); return; }
    return beginNewDraft();
  }
  if (action === 'confirm-new') return beginNewDraft();
  if (action === 'continue-draft') { state.ui.screen = 'creator'; state.ui.modal = null; render(); window.scrollTo({ top: 0, behavior: 'auto' }); return; }
  if (action === 'return-title') { saveDraft(); state.ui.screen = 'title'; state.ui.modal = null; render(); window.scrollTo({ top: 0, behavior: 'auto' }); return; }
  if (action === 'open-archive') { state.ui.modal = 'archive'; renderChromeLayers(); return; }
  if (action === 'export-draft') {
    downloadFile(`${sanitizedFilename()}-角色档案.json`, JSON.stringify(buildExportBundle(state.ui.confirmed), null, 2), 'application/json;charset=utf-8');
    return;
  }
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
  if (action === 'fetch-models') return fetchModelCatalog();
  if (action === 'choose-model') {
    state.settings.model = element.dataset.modelValue || '';
    state.ui.modelFilter = state.settings.model;
    state.ui.modelStatus = `已选择 ${state.settings.model}；也可以继续手动修改。`;
    state.ui.modelTone = 'ok';
    renderChromeLayers();
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
  if (action === 'run-ai') return runAiFill('page');
  if (action === 'run-ai-all') return runAiFill('all');
  if (action === 'retry-ai') return runAiFill(state.ui.lastAiScope || 'page');
  if (action === 'run-ai-offline') return runAiFill(state.ui.lastAiScope || 'page', 'offline');
  if (action === 'apply-ai-preview') return applyAiPreview();
  if (action === 'discard-ai-preview') return discardAiPreview();
  if (action === 'clear-portrait') {
    state.portrait.customDataUrl = '';
    persistPortrait();
    render();
    return;
  }
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
    if (key === 'model') {
      state.ui.modelFilter = target.value;
      filterModelList(target.value);
    }
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
  if (target.matches('[data-portrait-file]')) {
    Promise.resolve(handlePortraitFile(target.files?.[0])).catch((error) => showToast(error?.message || '肖像读取失败。', 'bad'));
    target.value = '';
    return;
  }
  if (target.matches('[data-setting]')) {
    const key = target.dataset.setting;
    state.settings[key] = target.type === 'checkbox' ? target.checked : target.value;
    if (key === 'provider') renderChromeLayers();
  }
});

app.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && state.ui.modal) {
    if (state.ui.modal === 'ai-preview') state.ui.aiPreview = null;
    state.ui.modal = null;
    renderChromeLayers();
  }
  if (event.key === 'Enter' && event.target.matches('[data-trait-entry]')) {
    event.preventDefault();
    addTrait();
  }
});

app.addEventListener('error', (event) => {
  const image = event.target;
  if (!image?.matches?.('[data-portrait-image]')) return;
  const fallback = PORTRAIT_ART[state.ui.activeStep] || PORTRAIT_ART[0];
  if (image.src === fallback) return;
  state.portrait.customDataUrl = '';
  image.src = fallback;
  image.alt = STEP_VISUALS[state.ui.activeStep]?.caption || '当前填表页画面';
  persistPortrait();
  showToast('肖像加载失败，已恢复默认预设。', 'bad');
}, true);

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
