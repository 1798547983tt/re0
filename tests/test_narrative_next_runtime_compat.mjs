import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  buildArtifacts,
  buildPackedPreview,
} from '../tools/package_narrative_next_regex.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const read = (path) => readFileSync(resolve(ROOT, path), 'utf8');

function toRegExp(serialized) {
  const lastSlash = serialized.lastIndexOf('/');
  return new RegExp(serialized.slice(1, lastSlash), serialized.slice(lastSlash + 1));
}

test('packed frontend follows the reference staged-script and inert-carrier structure', () => {
  const html = buildArtifacts().main.replaceString;
  const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
  const executable = scripts.filter((match) => !/type=["'](?:text\/plain|application\/json)["']/i.test(match[1]));
  assert.equal(executable.length, 3);
  assert.doesNotMatch(html, /<script[^>]+type="text\/plain"/i);
  assert.match(html, /<textarea\b[^>]*data-re0v2-source[^>]*hidden[^>]*>\$1<\/textarea>/i);
  assert.match(executable[0][2], /Re0NarrativeCore/);
  assert.match(executable[1][2], /Re0NarrativeRenderer/);
  assert.match(executable[2][2], /startRe0NarrativeReader/);
  assert.match(executable[2][2], /SillyTavern/);
  assert.match(executable[2][2], /name1/);
  assert.match(executable[2][2], /parsed\.player/);
  assert.doesNotMatch(html, /narrative-next\/src\/protocol\.mjs/);
});

test('packed core survives Tavern Helper code-fence brace unescaping', () => {
  const html = buildArtifacts().main.replaceString;
  const core = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)][0][2];
  const tavernHelperSource = core.replaceAll('\\{', '{').replaceAll('\\}', '}');

  assert.doesNotMatch(core, /\\[{}]/u);
  assert.match(core, /\/\[\{\]\(\[\^\{\}\x5cr\x5cn\]\{1,80\}\)\[\}\]「/u);
  assert.doesNotThrow(() => new Function(tavernHelperSource));
});

test('packed boot locates stable data attributes and exposes a visible failure path', () => {
  const source = read('tools/package_narrative_next_regex.mjs');
  assert.match(source, /data-re0v2-app/);
  assert.match(source, /data-re0v2-source/);
  assert.match(source, /正文启动失败/);
  assert.doesNotMatch(source, /querySelector\('#re0v2-source'\)/);
});

test('replacement has no loading placeholder or literal content envelope to rematch', () => {
  const html = buildArtifacts().main.replaceString.replace('$1', '');
  assert.doesNotMatch(html, /正在展开露格尼卡档案/);
  assert.doesNotMatch(html, /<content>/i);
  assert.doesNotMatch(html, /<\/content>/i);
  assert.match(html, /narrative-next\/src\/packed-parser\.mjs/);
});

test('renderer preserves a pre-parsed source object across settings rerenders', () => {
  const source = read('narrative-next/src/renderer.mjs');
  assert.match(source, /const state\s*=\s*\{[\s\S]*?source:\s*source,/);
  assert.doesNotMatch(source, /source:\s*typeof source === 'string' \? source : ''/);
});

test('iframe page background stays transparent for every host theme', () => {
  const css = read('narrative-next/styles.css');
  const pageRule = css.match(/\.re0v2-preview-page\s*\{([^}]*)\}/s)?.[1] || '';
  assert.match(pageRule, /background:\s*transparent\s*!important/);
  assert.doesNotMatch(pageRule, /radial-gradient|linear-gradient/);
});

test('avatar frame has no white inner outline', () => {
  const css = read('narrative-next/styles.css');
  const avatarRule = css.match(/(?:^|\n)\.re0v2-avatar\s*\{([^}]*)\}/s)?.[1] || '';
  assert.doesNotMatch(css, /\.re0v2-avatar::after/);
  assert.doesNotMatch(avatarRule, /inset\s+0\s+0\s+0/);
  assert.match(avatarRule, /border:\s*0/);
});

test('avatar grows to 90px desktop and 60px narrow layout', () => {
  const css = read('narrative-next/styles.css');
  const avatarRule = css.match(/(?:^|\n)\.re0v2-avatar\s*\{([^}]*)\}/s)?.[1] || '';
  assert.match(avatarRule, /width:\s*90px/);
  assert.match(css, /@container\s*\(max-width:\s*420px\)[\s\S]*?\.re0v2-avatar\s*\{[^}]*width:\s*60px/s);
});

test('top-left title logo is substantially larger on desktop and narrow layouts', () => {
  const css = read('narrative-next/styles.css');
  const logoRule = css.match(/\.re0v2-logo\s*\{([^}]*)\}/s)?.[1] || '';
  assert.match(logoRule, /width:\s*clamp\(240px,\s*34vw,\s*340px\)/);
  assert.match(logoRule, /min-height:\s*118px/);
  assert.match(css, /@container\s*\(max-width:\s*420px\)[\s\S]*?\.re0v2-logo\s*\{[^}]*width:\s*180px/s);
});

test('model output guide follows customize_format and excludes UpdateVariable tags', () => {
  const format = read('narrative-next/rules/正文输出格式.md').trim();
  assert.equal(format.startsWith('<customize_format>'), true);
  assert.equal(format.endsWith('</customize_format>'), true);
  assert.match(format, /output_structure:/);
  assert.match(format, /root_tags:/);
  assert.match(format, /content_contains:/);
  assert.match(format, /template:\s*\|/);
  assert.match(format, /^\s*<content>\s*$/m);
  assert.doesNotMatch(format, /<content\s+player=/i);
  assert.match(format, /\{角色名\}「对白内容」/);
  assert.doesNotMatch(format, /<\/?UpdateVariable>/i);
});

test('display regex preserves an unclosed external UpdateVariable suffix byte-for-byte', () => {
  const artifact = buildArtifacts().main;
  const content = '<content><story volume="01"></story><time period="下午" layer="主线" basis="编辑演算">魔女历1000年01月01日</time><now_plot>正文。</now_plot></content>';
  const suffix = '\n<UpdateVariable>\n[{"op":"replace","path":"/x","value":1}]';
  const output = `${content}${suffix}`.replace(toRegExp(artifact.findRegex), artifact.replaceString);
  assert.match(output, /data-re0v2-mount/);
  assert.equal(output.endsWith(suffix), true);
});

test('packed preview rejects a textarea boundary that could escape the inert carrier', () => {
  const hostile = '<content><story volume="01"></story><time period="下午" layer="主线" basis="编辑演算">魔女历1000年01月01日</time><now_plot></textarea><img src=x></now_plot></content>';
  assert.throws(() => buildPackedPreview(hostile), /textarea boundary/i);
});
