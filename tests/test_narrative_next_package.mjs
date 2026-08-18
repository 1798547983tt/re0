import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

import {
  OUTPUTS,
  PACKED_PREVIEW_OUTPUT,
  buildArtifacts,
  buildPackedPreview,
  buildSerializedArtifacts,
} from '../tools/package_narrative_next_regex.mjs';

function toRegExp(serialized) {
  const lastSlash = serialized.lastIndexOf('/');
  return new RegExp(serialized.slice(1, lastSlash), serialized.slice(lastSlash + 1));
}

function applyRegex(source, artifact) {
  return source.replace(toRegExp(artifact.findRegex), artifact.replaceString);
}

test('build emits one simple import plus an explicit streaming/completed pair', () => {
  const artifacts = buildArtifacts();
  assert.equal(artifacts.main.scriptName, 'Re:0·正文美化 V2');
  assert.equal(artifacts.streaming.scriptName, 'Re:0·正文美化 V2｜流式');
  assert.equal(artifacts.completed.scriptName, 'Re:0·正文美化 V2｜完成');
  assert.deepEqual(artifacts.suite.map((item) => item.scriptName), [
    'Re:0·正文美化 V2｜流式',
    'Re:0·正文美化 V2｜完成',
  ]);
  for (const artifact of [artifacts.main, ...artifacts.suite]) {
    assert.deepEqual(artifact.placement, [2]);
    assert.equal(artifact.markdownOnly, true);
    assert.equal(artifact.promptOnly, false);
    assert.equal(artifact.runOnEdit, true);
    assert.equal(artifact.substituteRegex, 0);
  }
});

test('main import renders both unfinished streaming and completed content', () => {
  const { main } = buildArtifacts();
  const streaming = '<content player="菜月昴"><story volume="01"></story><time>魔女历1000年01月01日</time><now_plot>{蕾姆}「还在生成';
  const completed = '<content player="菜月昴"><story volume="01"></story><time>魔女历1000年01月01日</time><now_plot>{蕾姆}「完成。」</now_plot></content>\n<UpdateVariable>{"x":1}</UpdateVariable>';
  assert.match(applyRegex(streaming, main), /data-re0v2-mount/);
  const replaced = applyRegex(completed, main);
  assert.match(replaced, /data-re0v2-mount/);
  assert.ok(replaced.endsWith('\n<UpdateVariable>{"x":1}</UpdateVariable>'));
});

test('paired rules are mutually exclusive for their intended states', () => {
  const { streaming, completed } = buildArtifacts();
  const open = '<content><story volume="01"></story><time>魔女历1000年01月01日</time><now_plot>生成中';
  const closed = '<content><story volume="01"></story><time>魔女历1000年01月01日</time><now_plot>完成。</now_plot></content>';
  assert.equal(toRegExp(streaming.findRegex).test(open), true);
  assert.equal(toRegExp(streaming.findRegex).test(closed), false);
  assert.equal(toRegExp(completed.findRegex).test(open), false);
  assert.equal(toRegExp(completed.findRegex).test(closed), true);
});

test('replacement embeds the full visual system and only one capture token', () => {
  const html = buildArtifacts().main.replaceString;
  assert.match(html, /data-re0v2-mount/);
  assert.match(html, /--re0v2-character-primary/);
  assert.match(html, /data-effect="arcane-orbit"/);
  assert.match(html, /function renderNarrative/);
  assert.match(html, /natsuki-subaru/);
  assert.match(html, /新的旅程/);
  assert.match(html, /<textarea[^>]*id="re0v2-source"[^>]*data-re0v2-source[^>]*hidden[^>]*>\$1<\/textarea>/);
  assert.doesNotMatch(html, /<script[^>]+type="text\/plain"/i);
  assert.equal((html.match(/\$1/g) || []).length, 1);
  assert.doesNotMatch(html, /<script[^>]+src=/i);
});

test('hostile textarea source and already-rendered mounts are not replaced', () => {
  const { main } = buildArtifacts();
  const hostile = '<content><story volume="01"></story><time>魔女历1000年01月01日</time><now_plot></textarea><script>bad()</script></now_plot></content>';
  const hostileScriptClose = '<content><story volume="01"></story><time>魔女历1000年01月01日</time><now_plot></script><img src=x></now_plot></content>';
  const rendered = '<div data-re0v2-mount><content><story volume="01"></story></content></div>';
  assert.equal(applyRegex(hostile, main), hostile);
  assert.equal(applyRegex(hostileScriptClose, main), hostileScriptClose);
  assert.equal(applyRegex(rendered, main), rendered);
});

test('single packaged runtime script parses and artifact serialization is deterministic', () => {
  const html = buildArtifacts().main.replaceString;
  const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
    .filter((match) => !/type="text\/plain"/i.test(match[1]))
    .map((match) => match[2]);
  assert.equal(scripts.length, 1);
  for (const script of scripts) assert.doesNotThrow(() => new Function(script));
  assert.deepEqual(buildSerializedArtifacts(), buildSerializedArtifacts());
});

test('packager produces a normal local HTML preview from the exact generated replacement', () => {
  const preview = buildPackedPreview('<content><story volume="39"></story><time>魔女历1000年01月01日</time><now_plot>新的旅程。</now_plot></content>');
  assert.match(preview, /^<!doctype html>/i);
  assert.match(preview, /data-re0v2-mount/);
  assert.match(preview, /<textarea[^>]*data-re0v2-source[^>]*><content>/);
  assert.doesNotMatch(preview, /```html/);
});

test('checked distribution files are current', () => {
  const serialized = buildSerializedArtifacts();
  for (const [key, path] of Object.entries(OUTPUTS)) {
    assert.equal(existsSync(path), true, `${key} output is missing`);
    assert.equal(readFileSync(path, 'utf8'), serialized[key]);
  }
  assert.equal(existsSync(PACKED_PREVIEW_OUTPUT), true, 'packed preview is missing');
  assert.equal(readFileSync(PACKED_PREVIEW_OUTPUT, 'utf8'), buildPackedPreview());
});
