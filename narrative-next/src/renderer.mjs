import { parseNarrative, parseStreamingNarrative } from './protocol.mjs';
import { tokenizeInlineText } from './inline-format.mjs';
import {
  READING_FONTS,
  READING_SIZES,
  fontById,
  normalizeReadingSettings,
  readReadingSettings,
  sizeById,
  writeReadingSettings,
} from './settings.mjs';
import { resolveTheme } from './theme.mjs';
import { resolveCharacter, splitEmphasizedName } from './characters.mjs';
import { resolveVolumeTitle } from './titles.mjs';
import { resolveAbilityKind } from './abilities.mjs';
import {
  abilityVisualCss,
  applyThemeVisuals,
  resolveAbilityVisual,
} from './visual-assets.mjs';

const LOGO_LOCAL_URL = '../narrative/assets/logo-transparent.png';
const LOGO_PRIMARY_URL = 'https://cdn.jsdelivr.net/gh/1798547983tt/re0@d011efa6a5351dd984e00ef8462db3689cbb358b/avatars/%E5%A4%A7%E6%A0%87%E9%A2%98/logo-transparent.png';
const LOGO_FALLBACK_URL = 'https://raw.githubusercontent.com/1798547983tt/re0/d011efa6a5351dd984e00ef8462db3689cbb358b/avatars/%E5%A4%A7%E6%A0%87%E9%A2%98/logo-transparent.png';

function element(documentRef, tagName, className = '', text = '') {
  const node = documentRef.createElement(tagName);
  if (className) node.className = className;
  if (text !== '') node.textContent = String(text);
  return node;
}

function button(documentRef, className, text, action) {
  const node = element(documentRef, 'button', className, text);
  node.type = 'button';
  node.dataset.action = action;
  return node;
}

function appendInline(documentRef, target, text) {
  for (const token of tokenizeInlineText(String(text ?? ''))) {
    if (token.type === 'strong') target.append(element(documentRef, 'strong', '', token.text));
    else if (token.type === 'em') target.append(element(documentRef, 'em', '', token.text));
    else target.append(documentRef.createTextNode(token.text));
  }
  return target;
}

function canonicalSpeaker(block) {
  if (block.type === 'player-dialogue') return '#';
  return resolveCharacter(block.speaker).stableId;
}

export function dialogueSide(block) {
  return block?.type === 'player-dialogue' ? 'player' : 'npc';
}

export function resolveCheckActor(block) {
  return resolveCharacter(block?.actor);
}

export function mergeAdjacentDialogue(blocks) {
  const merged = [];
  for (const original of blocks ?? []) {
    const block = { ...original };
    const previous = merged.at(-1);
    const dialogue = block.type === 'dialogue' || block.type === 'player-dialogue';
    const previousDialogue = previous?.type === 'dialogue' || previous?.type === 'player-dialogue';
    if (dialogue && previousDialogue && canonicalSpeaker(block) === canonicalSpeaker(previous)) {
      previous.text = `${previous.text}\n${block.text}`;
      continue;
    }
    merged.push(block);
  }
  return merged;
}

function applyImageFallback(image, urls) {
  let cursor = 0;
  const advance = () => {
    const next = urls[cursor];
    cursor += 1;
    if (next) image.src = next;
    else image.remove();
  };
  image.addEventListener('error', advance);
  advance();
}

function renderLogo(documentRef) {
  const wrap = element(documentRef, 'div', 're0v2-logo');
  const fallback = element(documentRef, 'span', 're0v2-logo__fallback', 'Re:ZERO');
  const image = documentRef.createElement('img');
  image.alt = 'Re:从零开始的异世界生活';
  image.decoding = 'async';
  applyImageFallback(image, [LOGO_LOCAL_URL, LOGO_PRIMARY_URL, LOGO_FALLBACK_URL]);
  wrap.append(fallback, image);
  return wrap;
}

function renderSettings(documentRef, state) {
  const tools = element(documentRef, 'div', 're0v2-reader-tools');
  const toggle = button(documentRef, 're0v2-settings-toggle', '阅读设置', 'toggle-settings');
  toggle.setAttribute('aria-expanded', String(state.settingsOpen));
  toggle.setAttribute('aria-controls', 're0v2-settings-panel');
  toggle.title = '主题、字体、字号、缩进与动态效果';
  const glyph = element(documentRef, 'span', 're0v2-settings-toggle__glyph', '◐');
  glyph.setAttribute('aria-hidden', 'true');
  toggle.prepend(glyph);

  const panel = element(documentRef, 'section', 're0v2-settings-panel');
  panel.id = 're0v2-settings-panel';
  panel.hidden = !state.settingsOpen;
  panel.setAttribute('aria-label', '正文阅读设置');
  panel.append(element(documentRef, 'h2', '', '阅读设置'));

  const themeField = element(documentRef, 'fieldset', 're0v2-setting-group');
  themeField.append(element(documentRef, 'legend', '', '版面'));
  const themeButtons = element(documentRef, 'div', 're0v2-segmented');
  for (const [id, label] of [['auto', '自动'], ['day', '日'], ['night', '夜'], ['tea', '茶']]) {
    const option = button(documentRef, '', label, 'set-theme');
    option.dataset.value = id;
    option.setAttribute('aria-pressed', String(state.settings.theme === id));
    themeButtons.append(option);
  }
  themeField.append(themeButtons);

  const fontLabel = element(documentRef, 'label', 're0v2-setting-row');
  fontLabel.append(element(documentRef, 'span', '', '字体'));
  const fontSelect = documentRef.createElement('select');
  fontSelect.dataset.setting = 'font';
  fontSelect.setAttribute('aria-label', '正文字体');
  for (const font of READING_FONTS) {
    const option = element(documentRef, 'option', '', font.label);
    option.value = font.id;
    option.selected = state.settings.font === font.id;
    fontSelect.append(option);
  }
  fontLabel.append(fontSelect);

  const sizeField = element(documentRef, 'fieldset', 're0v2-setting-group');
  sizeField.append(element(documentRef, 'legend', '', '字号'));
  const sizeButtons = element(documentRef, 'div', 're0v2-segmented');
  for (const size of READING_SIZES) {
    const option = button(documentRef, '', size.label, 'set-size');
    option.dataset.value = size.id;
    option.setAttribute('aria-pressed', String(state.settings.size === size.id));
    option.title = `${size.px}px`;
    sizeButtons.append(option);
  }
  sizeField.append(sizeButtons);

  const indentLabel = element(documentRef, 'label', 're0v2-choice-toggle re0v2-indent-toggle');
  const indentInput = documentRef.createElement('input');
  indentInput.type = 'checkbox';
  indentInput.dataset.setting = 'indent';
  indentInput.checked = state.settings.indent;
  indentLabel.append(indentInput, element(documentRef, 'span', '', '自然段首行缩进'));

  const staticLabel = element(documentRef, 'label', 're0v2-choice-toggle re0v2-static-toggle');
  const staticInput = documentRef.createElement('input');
  staticInput.type = 'checkbox';
  staticInput.dataset.setting = 'staticMode';
  staticInput.checked = state.settings.staticMode;
  staticLabel.append(staticInput, element(documentRef, 'span', '', '关闭动态特效'));

  panel.append(themeField, fontLabel, sizeField, indentLabel, staticLabel);
  tools.append(toggle, panel);
  return tools;
}

function renderHeader(documentRef, state) {
  const header = element(documentRef, 'header', 're0v2-topbar');
  const identity = element(documentRef, 'div', 're0v2-identity');
  identity.append(renderLogo(documentRef));
  header.append(identity, renderSettings(documentRef, state));
  return header;
}

export function titleFitCqw(title) {
  const count = Math.max(1, title?.characters?.length || 0);
  const widthBudget = title?.family === 'departure' ? 73 : 86;
  return Math.min(10.5, widthBudget / count);
}

function renderTitle(documentRef, parsed) {
  const title = resolveVolumeTitle(parsed.story?.volume);
  const stage = element(documentRef, 'section', 're0v2-title-stage');
  stage.dataset.family = title.family;
  stage.dataset.length = title.characters.length > 18 ? 'long' : title.characters.length > 9 ? 'medium' : 'short';
  stage.setAttribute('aria-label', title.ariaLabel);

  const heading = element(documentRef, 'h1', 're0v2-title');
  heading.setAttribute('aria-label', title.title);
  const fitCqw = titleFitCqw(title);
  heading.style.setProperty('--re0v2-title-fit', `${fitCqw.toFixed(3)}cqw`);
  title.characters.forEach((character, index) => {
    const span = element(documentRef, 'span', 're0v2-title-char', character);
    span.style.setProperty('--re0v2-char-index', String(index));
    span.style.setProperty('--re0v2-char-count', String(title.characters.length));
    if (title.accentIndexes.includes(index)) span.dataset.accent = index % 2 ? 'secondary' : 'primary';
    heading.append(span);
  });
  const time = element(documentRef, 'p', 're0v2-title-time', parsed.time?.text || '时间未记录');
  stage.append(heading, time, element(documentRef, 'span', 're0v2-title-mark', 'R·0'));
  return stage;
}

function renderAvatar(documentRef, character) {
  const frame = element(documentRef, 'div', 're0v2-avatar');
  const initial = element(documentRef, 'span', 're0v2-avatar__initial', character.initial);
  frame.append(initial);
  if (character.kind === 'character') {
    const image = documentRef.createElement('img');
    image.alt = '';
    image.loading = 'lazy';
    image.decoding = 'async';
    applyImageFallback(image, [character.avatar.localUrl, character.avatar.primaryUrl, character.avatar.fallbackUrl]);
    frame.append(image);
  } else {
    frame.dataset.fallback = 'initial';
  }
  return frame;
}

function renderSpeakerName(documentRef, character) {
  const name = element(documentRef, 'strong', 're0v2-speaker-name');
  const displayName = character.shortName || character.rosterName || character.displayName;
  for (const part of splitEmphasizedName(displayName)) {
    const span = element(documentRef, 'span', part.emphasized ? 'is-emphasized' : '', part.character);
    name.append(span);
  }
  const symbol = element(documentRef, 'span', 're0v2-speaker-symbol', character.symbol);
  symbol.setAttribute('aria-hidden', 'true');
  name.append(symbol);
  return name;
}

function renderDialogue(documentRef, block, playerName) {
  const side = dialogueSide(block);
  const character = resolveCharacter(side === 'player' ? playerName : block.speaker);
  const article = element(documentRef, 'article', 're0v2-dialogue');
  article.dataset.side = side;
  article.dataset.skin = character.skinId;
  article.dataset.variant = String(character.variant ?? 0);
  article.dataset.shape = character.shape;
  article.dataset.texture = character.texture;
  article.dataset.motion = character.motion;
  article.style.setProperty('--re0v2-character-primary', character.primary);
  article.style.setProperty('--re0v2-character-secondary', character.secondary);
  article.style.setProperty('--re0v2-style-seed', String(character.styleSeed ?? 0));

  const body = element(documentRef, 'div', 're0v2-dialogue__body');
  body.append(renderSpeakerName(documentRef, character));
  const text = element(documentRef, 'p', 're0v2-dialogue__text');
  appendInline(documentRef, text, block.text);
  body.append(text);
  article.append(renderAvatar(documentRef, character), body);
  return article;
}

function renderNarration(documentRef, block) {
  return appendInline(documentRef, element(documentRef, 'p', 're0v2-narration'), block.text);
}

function renderScene(documentRef, block) {
  const scene = element(documentRef, 'section', 're0v2-scene');
  const compass = element(documentRef, 'span', 're0v2-scene__compass');
  compass.append(element(documentRef, 'span', '', '✦'));
  compass.setAttribute('aria-hidden', 'true');
  const copy = element(documentRef, 'div', 're0v2-scene__copy');
  copy.append(
    element(documentRef, 'p', 're0v2-scene__meta', [block.location, block.time, block.mood].filter(Boolean).join(' · ')),
    appendInline(documentRef, element(documentRef, 'p', ''), block.text),
  );
  scene.append(compass, copy);
  return scene;
}

function renderAbility(documentRef, block) {
  const kind = resolveAbilityKind(block.kind);
  const ability = element(documentRef, 'section', 're0v2-ability');
  ability.dataset.effect = kind.effect;
  ability.dataset.kind = kind.token;
  if (!kind.valid) ability.dataset.invalid = 'true';
  if (resolveAbilityVisual(kind.token)) {
    ability.style.setProperty('--re0v2-ability-art', abilityVisualCss(kind.token));
  }
  const sigil = element(documentRef, 'div', 're0v2-ability__sigil');
  sigil.setAttribute('aria-hidden', 'true');
  sigil.append(element(documentRef, 'span', '', kind.symbol));
  const body = element(documentRef, 'div', 're0v2-ability__body');
  const eyebrow = element(documentRef, 'p', 're0v2-ability__eyebrow', `${kind.label} · ${block.user || '未知使用者'}`);
  const heading = element(documentRef, 'h2', '', block.name || kind.kind);
  const affinities = block.affinities?.length
    ? element(documentRef, 'p', 're0v2-ability__affinity', `属性｜${block.affinities.join(' · ')}`)
    : null;
  const effect = appendInline(documentRef, element(documentRef, 'p', 're0v2-ability__effect'), block.effect || '能力效果未记录。');
  const details = element(documentRef, 'details', 're0v2-ability__description');
  details.open = true;
  details.append(
    element(documentRef, 'summary', '', '能力说明'),
    appendInline(documentRef, element(documentRef, 'p', ''), block.description || '暂无能力介绍。'),
  );
  body.append(eyebrow, heading);
  if (affinities) body.append(affinities);
  body.append(effect, details);
  ability.append(sigil, body);
  return ability;
}

function renderCheck(documentRef, block) {
  const character = resolveCheckActor(block);
  const check = element(documentRef, 'section', 're0v2-check');
  check.dataset.skin = character.skinId;
  check.style.setProperty('--re0v2-character-primary', character.primary);
  check.style.setProperty('--re0v2-character-secondary', character.secondary);

  const portrait = element(documentRef, 'div', 're0v2-check__portrait');
  const die = element(documentRef, 'span', 're0v2-check__die', 'D20');
  die.setAttribute('aria-hidden', 'true');
  portrait.append(renderAvatar(documentRef, character), die);

  const copy = element(documentRef, 'div', 're0v2-check__copy');
  copy.append(
    element(documentRef, 'p', 're0v2-check__meta', `检定｜${block.checkType} · ${block.actor} → ${block.target}`),
    element(documentRef, 'p', 're0v2-check__ledger', block.text),
  );
  check.append(portrait, copy);
  return check;
}

function renderRestart(documentRef, block) {
  const restart = element(documentRef, 'section', 're0v2-restart');
  restart.append(
    element(documentRef, 'p', 're0v2-restart__label', `RETURN BY DEATH · ${block.deathId || 'UNKNOWN'}`),
    element(documentRef, 'h2', '', block.checkpoint || '未命名检查点'),
    appendInline(documentRef, element(documentRef, 'p', ''), block.text),
  );
  return restart;
}

function renderInvalid(documentRef, block) {
  const note = element(documentRef, 'aside', 're0v2-invalid');
  note.setAttribute('role', 'note');
  note.append(
    element(documentRef, 'strong', '', '未能识别的正文片段'),
    element(documentRef, 'p', '', block.text || block.raw || block.reason || '格式不完整'),
  );
  return note;
}

function renderBlock(documentRef, block, parsed) {
  if (block.type === 'narration') return renderNarration(documentRef, block);
  if (block.type === 'dialogue' || block.type === 'player-dialogue') return renderDialogue(documentRef, block, parsed.player);
  if (block.type === 'scene') return renderScene(documentRef, block);
  if (block.type === 'ability') return renderAbility(documentRef, block);
  if (block.type === 'check') return renderCheck(documentRef, block);
  if (block.type === 'restart') return renderRestart(documentRef, block);
  return renderInvalid(documentRef, block);
}

function parseSource(source) {
  const text = String(source ?? '');
  if (/<\/content\s*>/iu.test(text)) return parseNarrative(text);
  return parseStreamingNarrative(text);
}

function renderFallback(documentRef, parsed, source) {
  const fallback = element(documentRef, 'section', 're0v2-fallback');
  fallback.setAttribute('role', 'alert');
  fallback.append(
    element(documentRef, 'p', 're0v2-fallback__mark', 'ERR—00'),
    element(documentRef, 'h1', '', '正文协议尚未成形'),
    element(documentRef, 'p', '', parsed.errors?.[0]?.message || '请等待生成完成，或检查正文输出格式。'),
    element(documentRef, 'pre', '', String(source ?? '').slice(0, 4000)),
  );
  return fallback;
}

function requestFrameResize() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  const frame = window.frameElement;
  if (!frame?.style) return;
  const resize = () => {
    const height = Math.max(document.body?.scrollHeight || 0, document.documentElement?.scrollHeight || 0);
    if (height > 0) frame.style.height = `${height}px`;
  };
  resize();
  globalThis.requestAnimationFrame?.(resize);
}

function bindControls(mount) {
  if (mount.dataset.re0v2Bound === 'true') return;
  mount.dataset.re0v2Bound = 'true';
  mount.addEventListener('click', (event) => {
    const control = event.target?.closest?.('[data-action]');
    if (!control || !mount.contains(control)) return;
    const state = mount.__re0v2State;
    if (!state) return;
    const action = control.dataset.action;
    if (action === 'toggle-settings') state.settingsOpen = !state.settingsOpen;
    if (action === 'set-theme') state.settings.theme = control.dataset.value;
    if (action === 'set-size') state.settings.size = control.dataset.value;
    state.settings = writeReadingSettings(state.settings);
    renderNarrative(mount, state.source, { ...state.options, settings: state.settings, settingsOpen: state.settingsOpen });
  });
  mount.addEventListener('change', (event) => {
    const control = event.target;
    const state = mount.__re0v2State;
    if (!state || !control?.dataset?.setting) return;
    if (control.dataset.setting === 'font') state.settings.font = control.value;
    if (control.dataset.setting === 'indent') state.settings.indent = control.checked;
    if (control.dataset.setting === 'staticMode') state.settings.staticMode = control.checked;
    state.settings = writeReadingSettings(state.settings);
    renderNarrative(mount, state.source, { ...state.options, settings: state.settings, settingsOpen: state.settingsOpen });
  });
}

export function renderNarrative(target, source, options = {}) {
  const mount = target?.matches?.('[data-re0v2-mount]') ? target : target?.closest?.('[data-re0v2-mount]') || target;
  const app = mount?.querySelector?.('#re0v2-app') || (target?.id === 're0v2-app' ? target : null);
  if (!app?.ownerDocument) throw new TypeError('renderNarrative requires a RE0 narrative mount');
  const documentRef = app.ownerDocument;
  const parsed = typeof source === 'string' ? parseSource(source) : source;
  const settings = normalizeReadingSettings(options.settings || readReadingSettings());
  const theme = resolveTheme({ preference: settings.theme, period: parsed.time?.period });
  const font = fontById(settings.font);
  const size = sizeById(settings.size);
  mount.dataset.theme = theme.id;
  mount.dataset.font = font.id;
  mount.dataset.size = size.id;
  mount.dataset.indent = String(settings.indent);
  mount.dataset.static = String(settings.staticMode);
  mount.style.setProperty('--re0v2-reading-font', font.stack);
  mount.style.setProperty('--re0v2-reading-size', `${size.px}px`);
  applyThemeVisuals(mount, theme.id);
  app.setAttribute('aria-busy', 'false');

  const state = {
    source: source,
    options,
    settings,
    settingsOpen: options.settingsOpen === true,
  };
  mount.__re0v2State = state;
  bindControls(mount);

  const article = element(documentRef, 'article', 're0v2-reader');
  article.append(renderHeader(documentRef, state));
  if (parsed.ok || parsed.streaming) {
    article.append(renderTitle(documentRef, parsed));
    const flow = element(documentRef, 'section', 're0v2-story-flow');
    flow.setAttribute('aria-label', '剧情正文');
    for (const block of mergeAdjacentDialogue(parsed.blocks)) flow.append(renderBlock(documentRef, block, parsed));
    if (parsed.streaming && parsed.progressText) {
      const progress = element(documentRef, 'p', 're0v2-streaming', parsed.progressText);
      progress.setAttribute('aria-label', '正在生成');
      flow.append(progress);
    }
    article.append(flow);
  } else {
    article.append(renderFallback(documentRef, parsed, source));
  }
  app.replaceChildren(article);
  requestFrameResize();
  return { parsed, settings, theme };
}
