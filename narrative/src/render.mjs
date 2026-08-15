import { parseNarrativeResponse } from './protocol.mjs';
import { resolveBubble, resolveTheme } from './theme-core.mjs';

const SAMPLE = `<content>
<story volume="01"></story>
<time period="下午" layer="主线" basis="编辑演算">魔女历1000年01月01日</time>
<now_plot>
王都档案的冷白纸面掠过银蓝光泽。

{菜月昴}「这次从这里重新开始。」
</now_plot>
</content>`;

function makeElement(documentRef, tagName, className = '', text = '') {
  const element = documentRef.createElement(tagName);
  if (className) element.className = className;
  if (text !== '') element.textContent = text;
  return element;
}

function renderAvatar(documentRef, bubble) {
  const avatar = makeElement(documentRef, 'div', 're0-dialogue__avatar');
  avatar.dataset.portraitKey = bubble.portraitKey;
  avatar.dataset.icon = bubble.icon;
  avatar.style.setProperty('--re0-avatar-accent', bubble.styleProperties['--re0-avatar-accent']);
  const initial = makeElement(documentRef, 'span', 're0-dialogue__initial', bubble.initial || '?');
  avatar.append(initial);
  return avatar;
}

function renderNarration(documentRef, block) {
  return makeElement(documentRef, 'p', 're0-narration', block.text);
}

export function resolveDialogueSide(block, { playerName = '' } = {}) {
  return String(block?.speakerName || '').trim() && String(block.speakerName).trim() === String(playerName).trim()
    ? 'player'
    : 'npc';
}

function applyBubbleStyle(element, bubble) {
  element.style.setProperty('--re0-bubble-accent', bubble.styleProperties['--re0-bubble-accent']);
  element.style.setProperty('--re0-avatar-accent', bubble.styleProperties['--re0-avatar-accent']);
  element.style.setProperty('--re0-bubble-motif', bubble.styleProperties['--re0-bubble-motif']);
}

function renderDialogue(documentRef, block, themeName, options) {
  const bubble = resolveBubble(block.speaker, themeName);
  const article = makeElement(documentRef, 'article', ['re0-dialogue', ...bubble.classNames].join(' '));
  applyBubbleStyle(article, bubble);
  article.dataset.portraitKey = bubble.portraitKey;
  article.dataset.side = resolveDialogueSide(block, options);
  article.dataset.role = bubble.role;
  article.dataset.accent = bubble.accent;
  article.dataset.code = bubble.code;
  article.dataset.borderToken = bubble.border;
  article.dataset.textureToken = bubble.texture;
  article.append(renderAvatar(documentRef, bubble));
  const body = makeElement(documentRef, 'div', 're0-dialogue__body');
  body.append(
    makeElement(documentRef, 'strong', 're0-dialogue__speaker', bubble.displayName),
    makeElement(documentRef, 'p', 're0-dialogue__text', block.text),
  );
  article.append(body);
  return article;
}

function metadataLine(documentRef, items) {
  const line = makeElement(documentRef, 'p', 're0-card__meta');
  line.append(...items.filter(Boolean).map((item) => makeElement(documentRef, 'span', '', item)));
  return line;
}

function renderScene(documentRef, block) {
  const section = makeElement(documentRef, 'section', 're0-scene-card');
  section.append(
    makeElement(documentRef, 'h3', '', block.attributes.location),
    metadataLine(documentRef, [block.attributes.time, block.attributes.mood]),
    makeElement(documentRef, 'p', '', block.text),
  );
  return section;
}

function renderAbility(documentRef, block) {
  const section = makeElement(documentRef, 'section', 're0-ability-card');
  section.append(
    makeElement(documentRef, 'p', 're0-card__eyebrow', block.attributes.kind),
    makeElement(documentRef, 'h3', '', block.attributes.name),
    metadataLine(documentRef, [block.attributes.user, block.attributes.desc]),
    makeElement(documentRef, 'p', '', block.text),
  );
  return section;
}

function renderCheck(documentRef, block) {
  const section = makeElement(documentRef, 'section', 're0-check-card');
  section.append(
    makeElement(documentRef, 'p', 're0-card__eyebrow', `检定｜${block.attributes.type}`),
    metadataLine(documentRef, [block.attributes.actor, block.attributes.target]),
    makeElement(documentRef, 'pre', 're0-check-card__ledger', block.text),
  );
  return section;
}

function renderRestart(documentRef, block) {
  const section = makeElement(documentRef, 'section', 're0-restart-card');
  section.append(
    makeElement(documentRef, 'p', 're0-card__eyebrow', '世界重启'),
    metadataLine(documentRef, [block.attributes.deathId, block.attributes.checkpoint]),
    makeElement(documentRef, 'p', '', block.text),
  );
  return section;
}

function renderFallback(documentRef, parsed) {
  const section = makeElement(documentRef, 'section', 're0-fallback');
  section.setAttribute('role', 'note');
  section.append(
    makeElement(documentRef, 'h2', '', '未识别的正文协议'),
    makeElement(documentRef, 'pre', '', parsed.rawText || ''),
  );
  return section;
}

function renderHeader(documentRef, parsed) {
  const header = makeElement(documentRef, 'header', 're0-title-plate');
  const logo = makeElement(documentRef, 'div', 're0-logo-slot');
  logo.dataset.logoSlot = 'message-card';
  logo.setAttribute('aria-hidden', 'true');
  logo.append(makeElement(documentRef, 'span', '', 'RE0'));
  const text = makeElement(documentRef, 'div', 're0-title-plate__text');
  text.append(
    makeElement(documentRef, 'p', 're0-title-plate__kicker', '王都档案 × 魔女残香'),
    makeElement(documentRef, 'h1', '', parsed.visible.heading),
    makeElement(documentRef, 'time', '', parsed.visible.date),
  );
  header.append(logo, text);
  return header;
}

function renderBlocks(documentRef, blocks, themeName, options) {
  const fragment = documentRef.createDocumentFragment();
  for (const block of blocks) {
    if (block.type === 'dialogue') fragment.append(renderDialogue(documentRef, block, themeName, options));
    else if (block.type === 'scene') fragment.append(renderScene(documentRef, block));
    else if (block.type === 'ability') fragment.append(renderAbility(documentRef, block));
    else if (block.type === 'check') fragment.append(renderCheck(documentRef, block));
    else if (block.type === 'restart') fragment.append(renderRestart(documentRef, block));
    else fragment.append(renderNarration(documentRef, block));
  }
  return fragment;
}

export function getThemeButtonState(action, { preference = 'auto', themeName = 'day' } = {}) {
  const mode = String(action || '').replace('theme-', '');
  const pressed = preference === 'auto' ? mode === 'auto' : mode === preference;
  return {
    ariaPressed: String(pressed),
    mode,
    label: mode === 'auto' ? `自动主题：${themeName}` : `手动主题：${mode}`,
  };
}

function updateThemeButtons(mount, state) {
  mount.querySelectorAll('[data-action]').forEach((button) => {
    const buttonState = getThemeButtonState(button.dataset.action, state);
    button.setAttribute('aria-pressed', buttonState.ariaPressed);
    button.dataset.themeMode = buttonState.mode;
  });
}

function bindThemeControls(mount) {
  if (mount.getAttribute('data-re0-theme-bound') === 'true') return;
  mount.setAttribute('data-re0-theme-bound', 'true');
  mount.addEventListener('click', (event) => {
    const button = event.target?.closest?.('[data-action]');
    if (!button || !mount.contains(button)) return;
    const state = mount.__re0NarrativeState;
    if (!state?.app) return;
    const preference = String(button.dataset.action || 'theme-auto').replace('theme-', '');
    try { globalThis.localStorage?.setItem('re0:narrative-theme', preference); } catch (_error) {}
    renderNarrative(state.app, state.source, { ...state.options, themePreference: preference });
  });
}

export function renderNarrative(target, source = SAMPLE, options = {}) {
  const app = target?.id === 're0-narrative-app' ? target : target?.querySelector?.('#re0-narrative-app') || target;
  if (!app?.ownerDocument) throw new TypeError('renderNarrative requires a DOM element target');
  const documentRef = app.ownerDocument;
  const parsed = typeof source === 'string' ? parseNarrativeResponse(source) : source;
  const period = parsed.ok ? parsed.time.metadata.period : '';
  const storedPreference = (() => {
    try { return globalThis.localStorage?.getItem('re0:narrative-theme') || null; } catch (_error) { return null; }
  })();
  const preference = options.themePreference || storedPreference || 'auto';
  const theme = resolveTheme({ preference, period });
  app.dataset.theme = theme.name;
  app.dataset.themeSource = theme.source;
  app.setAttribute('aria-busy', 'false');
  const card = makeElement(documentRef, 'article', 're0-narrative-card');
  if (parsed.ok) {
    card.append(renderHeader(documentRef, parsed));
    const story = makeElement(documentRef, 'section', 're0-story-flow');
    story.append(renderBlocks(documentRef, parsed.blocks, theme.name, options));
    card.append(story);
  } else {
    card.append(renderFallback(documentRef, parsed));
  }
  app.replaceChildren(card);
  const mount = app.closest?.('[data-re0-narrative-mount]');
  if (mount) {
    mount.__re0NarrativeState = { app, source, options };
    bindThemeControls(mount);
    updateThemeButtons(mount, { preference, themeName: theme.name });
  }
  return { parsed, theme };
}

function boot() {
  const mount = document.querySelector('[data-re0-narrative-mount]');
  const app = document.querySelector('#re0-narrative-app');
  if (!mount || !app) return;
  renderNarrative(app, mount.dataset.sampleProtocol || SAMPLE);
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
}
