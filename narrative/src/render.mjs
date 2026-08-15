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

function setText(element, text) {
  element.textContent = String(text ?? '');
}

function renderAvatar(documentRef, bubble) {
  const avatar = makeElement(documentRef, 'div', 're0-dialogue__avatar');
  avatar.dataset.portraitKey = bubble.portraitKey;
  avatar.dataset.icon = bubble.icon;
  const initial = makeElement(documentRef, 'span', 're0-dialogue__initial', bubble.initial || '?');
  avatar.append(initial);
  return avatar;
}

function renderNarration(documentRef, block) {
  return makeElement(documentRef, 'p', 're0-narration', block.text);
}

function renderDialogue(documentRef, block, themeName) {
  const bubble = resolveBubble(block.speaker, themeName);
  const article = makeElement(documentRef, 'article', ['re0-dialogue', ...bubble.classNames].join(' '));
  article.dataset.portraitKey = bubble.portraitKey;
  article.dataset.bubbleCode = bubble.code;
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

function renderBlocks(documentRef, blocks, themeName) {
  const fragment = documentRef.createDocumentFragment();
  for (const block of blocks) {
    if (block.type === 'dialogue') fragment.append(renderDialogue(documentRef, block, themeName));
    else if (block.type === 'scene') fragment.append(renderScene(documentRef, block));
    else if (block.type === 'ability') fragment.append(renderAbility(documentRef, block));
    else if (block.type === 'check') fragment.append(renderCheck(documentRef, block));
    else if (block.type === 'restart') fragment.append(renderRestart(documentRef, block));
    else fragment.append(renderNarration(documentRef, block));
  }
  return fragment;
}

function bindThemeControls(mount, app, parsed, sourceText) {
  mount.querySelectorAll('[data-action]').forEach((button) => {
    button.addEventListener('click', () => {
      const action = button.dataset.action || 'theme-auto';
      const preference = action.replace('theme-', '');
      try { globalThis.localStorage?.setItem('re0:narrative-theme', preference); } catch (_error) {}
      renderNarrative(app, parsed.ok ? parsed : sourceText, { themePreference: preference });
    });
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
  const theme = resolveTheme({ preference: options.themePreference || storedPreference || 'auto', period });
  app.dataset.theme = theme.name;
  app.dataset.themeSource = theme.source;
  app.setAttribute('aria-busy', 'false');
  const card = makeElement(documentRef, 'article', 're0-narrative-card');
  if (parsed.ok) {
    card.append(renderHeader(documentRef, parsed));
    const story = makeElement(documentRef, 'section', 're0-story-flow');
    story.append(renderBlocks(documentRef, parsed.blocks, theme.name));
    card.append(story);
  } else {
    card.append(renderFallback(documentRef, parsed));
  }
  app.replaceChildren(card);
  const mount = app.closest?.('[data-re0-narrative-mount]');
  if (mount) bindThemeControls(mount, app, parsed, source);
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
