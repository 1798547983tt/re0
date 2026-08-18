import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import * as narrativeRenderer from '../narrative-next/src/renderer.mjs';
import { resolveVolumeTitle } from '../narrative-next/src/titles.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const read = (path) => readFileSync(resolve(ROOT, path), 'utf8');
const maybeRead = (path) => existsSync(resolve(ROOT, path)) ? read(path) : '';

test('top chrome keeps the logo without the archive edition caption', () => {
  const source = read('narrative-next/src/renderer.mjs');
  assert.match(source, /renderLogo\(documentRef\)/);
  assert.doesNotMatch(source, /re0v2-edition|LUGUNICA STORY ARCHIVE|第二版/);
});

test('top chrome uses only the enlarged remote GitHub logo without fallback lettering', () => {
  const source = read('narrative-next/src/renderer.mjs');
  const css = read('narrative-next/styles.css');
  const logoRule = css.match(/\.re0v2-logo\s*\{([^}]*)\}/s)?.[1] || '';
  assert.doesNotMatch(source, /LOGO_LOCAL_URL|re0v2-logo__fallback|['"]Re:ZERO['"]/);
  assert.match(source, /https:\/\/(?:cdn\.jsdelivr\.net\/gh|raw\.githubusercontent\.com)\/1798547983tt\/re0/);
  assert.match(logoRule, /width:\s*clamp\(320px,\s*50vw,\s*540px\)/);
  assert.match(css, /@container\s*\(max-width:\s*420px\)[\s\S]*?\.re0v2-logo\s*\{[^}]*width:\s*220px/s);
  assert.doesNotMatch(css, /\.re0v2-logo__fallback/);
});

test('volume title omits duplicate volume and chapter metadata', () => {
  const source = read('narrative-next/src/renderer.mjs');
  assert.doesNotMatch(source, /re0v2-title-meta|VOLUME\s+\$\{/);
});

test('every volume title family stays on a horizontal reading axis', () => {
  const css = read('narrative-next/styles.css');
  const renderer = read('narrative-next/src/renderer.mjs');
  assert.match(css, /\.re0v2-title\s*\{[^}]*flex-wrap:\s*nowrap/s);
  assert.match(css, /font-size:\s*clamp\(8px,\s*var\(--re0v2-title-fit/);
  assert.match(renderer, /--re0v2-title-fit/);
  assert.doesNotMatch(css, /\.re0v2-title-stage\[data-family="duet"\]\s+\.re0v2-title\s*\{[^}]*display:\s*grid/s);
  assert.doesNotMatch(css, /writing-mode\s*:/);
});

test('departure title fitting reserves space for its enlarged final character', () => {
  assert.equal(typeof narrativeRenderer.titleFitCqw, 'function');
  const departureFit = narrativeRenderer.titleFitCqw(resolveVolumeTitle('28'));
  const ordinaryFit = narrativeRenderer.titleFitCqw({ ...resolveVolumeTitle('28'), family: 'single-focus' });
  assert.ok(departureFit <= 8.2);
  assert.ok(departureFit < ordinaryFit);
});

test('all character portraits use one square frame geometry', () => {
  const css = read('narrative-next/styles.css');
  const avatarRule = css.match(/(?:^|\n)\.re0v2-avatar\s*\{([^}]*)\}/s)?.[1] || '';
  assert.match(avatarRule, /aspect-ratio:\s*1/);
  assert.match(avatarRule, /border-radius:\s*(?:8|10|12)px/);
  assert.doesNotMatch(css, /\.re0v2-avatar\[data-variant=/);
});

test('only the first narration paragraph receives the colored drop cap', () => {
  const css = read('narrative-next/styles.css');
  assert.doesNotMatch(css, /(?:^|\n)\.re0v2-narration::first-letter\s*\{/);
  assert.match(
    css,
    /\.re0v2-story-flow\s*>\s*\.re0v2-narration:first-of-type::first-letter\s*\{[^}]*color:\s*var\(--re0v2-accent\)[^}]*2\.4em/s,
  );
});

test('short narration paragraphs keep a full reading measure instead of centering', () => {
  const css = read('narrative-next/styles.css');
  const narrationRule = css.match(/(?:^|\n)\.re0v2-narration\s*\{([^}]*)\}/s)?.[1] || '';
  assert.match(narrationRule, /width:\s*100%/);
  assert.match(narrationRule, /justify-self:\s*center/);
  assert.match(narrationRule, /text-align-last:\s*(?:start|left)/);
  assert.doesNotMatch(narrationRule, /margin:\s*0\s+auto/);
});

test('optional indentation applies two ideographs to every narration paragraph', () => {
  const renderer = read('narrative-next/src/renderer.mjs');
  const css = read('narrative-next/styles.css');
  assert.match(renderer, /dataset\.setting\s*=\s*'indent'/);
  assert.match(renderer, /mount\.dataset\.indent\s*=\s*String\(settings\.indent\)/);
  assert.match(css, /\[data-indent="true"\]\s+\.re0v2-narration\s*\{[^}]*text-indent:\s*2em/s);
});

test('check actors use the same character and fallback portrait resolution as dialogue', () => {
  assert.equal(typeof narrativeRenderer.resolveCheckActor, 'function');
  assert.equal(narrativeRenderer.resolveCheckActor({ actor: '雷姆' }).stableId, 'rem');
  const fallback = narrativeRenderer.resolveCheckActor({ actor: '路人骑士' });
  assert.equal(fallback.kind, 'generic');
  assert.equal(fallback.initial, '路');
});

test('check cards render the shared square avatar with character colors', () => {
  const renderer = read('narrative-next/src/renderer.mjs');
  const css = read('narrative-next/styles.css');
  const checkRenderer = renderer.match(/function renderCheck\([^]*?\n\}/u)?.[0] || '';
  assert.match(checkRenderer, /resolveCheckActor\(block\)/);
  assert.match(checkRenderer, /renderAvatar\(documentRef, character, avatarStorage\)/);
  assert.match(checkRenderer, /--re0v2-character-primary/);
  assert.match(css, /\.re0v2-check__portrait\s*\{/);
  assert.match(css, /\.re0v2-check\s+\.re0v2-avatar\s*\{/);
});

test('Emilia has a dedicated frost-crystal bubble and emphasized name style', () => {
  const css = read('narrative-next/styles.css');
  assert.match(css, /\.re0v2-dialogue\[data-skin="emilia"\]\s+\.re0v2-dialogue__body\s*\{/);
  assert.match(css, /\.re0v2-dialogue\[data-skin="emilia"\]\s+\.re0v2-speaker-name\s+\.is-emphasized/);
  const crystalRule = css.match(/\.re0v2-dialogue\[data-skin="emilia"\]\s+\.re0v2-dialogue__body::before\s*\{([^}]*)\}/s)?.[1] || '';
  assert.match(crystalRule, /radial-gradient|linear-gradient/);
  assert.match(crystalRule, /--re0v2-character-secondary/);
});

test('generated bitmap library covers three themes, scenes, seven abilities and both special panels', () => {
  const directory = 'narrative-next/assets/generated';
  const names = [
    'theme-day-stage.webp',
    'theme-night-stage.webp',
    'theme-tea-stage.webp',
    'scene-day.webp',
    'scene-night.webp',
    'scene-tea.webp',
    'ability-skill.webp',
    'ability-authority.webp',
    'ability-blessing.webp',
    'ability-magic.webp',
    'ability-spirit.webp',
    'ability-racial.webp',
    'ability-martial.webp',
    'special-check.webp',
    'special-restart.webp',
  ];
  for (const name of names) {
    const path = resolve(ROOT, directory, name);
    assert.equal(existsSync(path), true, `${name} is missing`);
    const bytes = readFileSync(path);
    assert.equal(bytes.subarray(0, 4).toString('ascii'), 'RIFF', `${name} is not WebP`);
    assert.equal(bytes.subarray(8, 12).toString('ascii'), 'WEBP', `${name} is not WebP`);
  }
});

test('generated image directory is protected from Git text normalization', () => {
  const attributes = read('.gitattributes');
  assert.match(attributes, /\/narrative-next\/assets\/\*\*\/\*\.webp\s+binary/);
});

test('visual asset registry uses an immutable GitHub commit and distinct theme pictures', () => {
  const source = maybeRead('narrative-next/src/visual-assets.mjs');
  assert.match(source, /VISUAL_ASSET_COMMIT\s*=\s*['"][0-9a-f]{40}['"]/);
  assert.match(source, /raw\.githubusercontent\.com\/1798547983tt\/re0\/\$\{VISUAL_ASSET_COMMIT\}/);
  for (const theme of ['day', 'night', 'tea']) {
    assert.match(source, new RegExp(`theme-${theme}-stage\\.webp`));
    assert.match(source, new RegExp(`scene-${theme}\\.webp`));
  }
  for (const kind of ['skill', 'authority', 'blessing', 'magic', 'spirit', 'racial', 'martial']) {
    assert.match(source, new RegExp(`ability-${kind}\\.webp`));
  }
  assert.match(source, /special-check\.webp/);
  assert.match(source, /special-restart\.webp/);
});

test('reader applies generated theme and panel art instead of color-only theming', () => {
  const renderer = read('narrative-next/src/renderer.mjs');
  const css = read('narrative-next/styles.css');
  assert.match(renderer, /applyThemeVisuals/);
  assert.match(renderer, /resolveAbilityVisual/);
  for (const variable of ['theme-stage', 'scene-art', 'check-art', 'restart-art', 'ability-art']) {
    assert.match(css, new RegExp(`--re0v2-${variable}`));
  }
  for (const theme of ['day', 'night', 'tea']) {
    assert.match(css, new RegExp(`data-theme="${theme}"[^}]*\\}[^]*?re0v2-(?:title-stage|scene|ability|check|restart)`, 's'));
  }
});
