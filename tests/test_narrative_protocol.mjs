import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { performance } from 'node:perf_hooks';

import {
  formatVolumeHeading,
  formatWitchCalendarDate,
  parseNarrativeResponse,
  resolveSpeaker as resolveSpeakerFromProtocol,
  splitUpdateVariable,
} from '../narrative/src/protocol.mjs';
import { resolveSpeaker } from '../narrative/src/character-registry.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const readJson = (path) => JSON.parse(readFileSync(resolve(ROOT, path), 'utf8'));

test('volume heading data contains exactly the 39 source first headings', () => {
  const headings = readJson('narrative/data/volume-headings.json');
  assert.equal(headings.length, 39);
  assert.deepEqual(headings.map((entry) => entry.volume), Array.from({ length: 39 }, (_, index) => String(index + 1).padStart(2, '0')));
  assert.deepEqual(headings.map((entry) => entry.kind).filter((kind) => !['序章', '第一章'].includes(kind)), []);
  assert.equal(headings.find((entry) => entry.volume === '01').title, '开始的余温');
  assert.equal(headings.find((entry) => entry.volume === '12').title, '爱我爱我爱我爱我爱我爱我爱我爱我爱我爱我爱我爱我爱我爱我──');
  assert.equal(headings.find((entry) => entry.volume === '25').title, '■■•■');
  assert.equal(headings.find((entry) => entry.volume === '38').title, '帕拉迪欧·曼内斯库');
  assert.equal(headings.find((entry) => entry.volume === '39').kind, '序章');
});

test('heading and witch-calendar formatters preserve exact visible text', () => {
  assert.equal(formatVolumeHeading('01'), '第01卷 | 开始的余温');
  assert.equal(formatVolumeHeading(25), '第25卷 | ■■•■');
  assert.equal(formatVolumeHeading('98'), '第00卷 | 卷外记录');
  assert.equal(formatWitchCalendarDate({ year: 1000, month: 1, day: 1 }), '魔女历1000年01月01日');
});

test('protocol module re-exports the speaker resolver as a public seam', () => {
  assert.equal(resolveSpeakerFromProtocol('菜月昴').stableId, 'natsuki-subaru');
  assert.equal(resolveSpeakerFromProtocol, resolveSpeaker);
});

test('witch-calendar validation rejects impossible dates and unsafe years', () => {
  for (const date of [
    { year: -1, month: 1, day: 1 },
    { year: 1000.5, month: 1, day: 1 },
    { year: 1000, month: 0, day: 1 },
    { year: 1000, month: 13, day: 1 },
    { year: 1000, month: 1, day: 0 },
    { year: 1000, month: 1, day: 31 },
  ]) {
    assert.throws(() => formatWitchCalendarDate(date), /魔女历|月份|日期/);
  }

  const badMonth = parseNarrativeResponse('<content><story volume="01"></story><time>魔女历1000年13月01日</time><now_plot>正文</now_plot></content>');
  assert.equal(badMonth.ok, false);
  assert.equal(badMonth.type, 'fallback');
});

test('splitUpdateVariable separates one raw suffix and rejects duplicate variable blocks', () => {
  const input = '<content><story>第01卷</story><time>魔女历1000年01月01日</time><now_plot>正文</now_plot></content><UpdateVariable>{"op":"replace"}</UpdateVariable>';
  assert.deepEqual(splitUpdateVariable(input), {
    narrative: '<content><story>第01卷</story><time>魔女历1000年01月01日</time><now_plot>正文</now_plot></content>',
    updateVariable: '<UpdateVariable>{"op":"replace"}</UpdateVariable>',
    valid: true,
  });
  assert.equal(splitUpdateVariable('<UpdateVariable>a</UpdateVariable><content></content><UpdateVariable>b</UpdateVariable>').valid, false);
});

test('parser accepts strict root order, visible heading/date, metadata, blocks and raw UpdateVariable', () => {
  const parsed = parseNarrativeResponse(`<content>
<story volume="01">不会显示的旧标题</story>
<time period="下午" layer="主线" basis="编辑演算">魔女历1000年01月01日</time>
<now_plot>
王都档案在冷光里翻开。

{菜月·昴}「这次从正文协议开始。」

<scene location="王都·露天集市" time="下午" mood="魔女残香">
银白冰晶一样的日光落在石板上。
</scene>

{碧翠丝}「贝蒂会盯着你的，昴。」

<ability user="贝亚特丽丝" name="阴魔法" kind="魔法" desc="以阴属性魔法干涉空间与行动。">
小小的手指在空气里划出黑色涟漪。
</ability>

昴压低重心，先扑向巷口。

<check type="闪避" actor="菜月昴" target="艾尔莎">
1d20=14｜情境+2｜DC15｜成功
</check>

刀锋擦着运动服袖口掠过。

<restart deathId="loop-001" checkpoint="赃物库前">
血色从视野边缘退去。
</restart>
</now_plot>
</content><UpdateVariable><replace path="/事件/当前战斗/最近一次检定">...</replace></UpdateVariable>`);

  assert.equal(parsed.ok, true);
  assert.equal(parsed.visible.heading, '第01卷 | 开始的余温');
  assert.equal(parsed.visible.date, '魔女历1000年01月01日');
  assert.deepEqual(parsed.time.metadata, { period: '下午', layer: '主线', basis: '编辑演算' });
  assert.equal(parsed.updateVariable, '<UpdateVariable><replace path="/事件/当前战斗/最近一次检定">...</replace></UpdateVariable>');
  assert.deepEqual(parsed.blocks.map((block) => block.type), [
    'narration',
    'dialogue',
    'scene',
    'dialogue',
    'ability',
    'narration',
    'check',
    'narration',
    'restart',
  ]);
  assert.equal(parsed.blocks[1].speaker.displayName, '菜月昴');
  assert.equal(parsed.blocks[1].speaker.portraitKey, 'natsuki-subaru');
  assert.equal(parsed.blocks[3].speaker.displayName, '贝亚特丽丝');
  assert.equal(parsed.blocks[4].attributes.user, '贝亚特丽丝');
  assert.equal(parsed.blocks[6].attributes.actor, '菜月昴');
});

test('consecutive dialogue from the same resolved speaker merges into one bubble', () => {
  const parsed = parseNarrativeResponse(`<content>
<story volume="01"></story>
<time>魔女历1000年01月01日</time>
<now_plot>
{菜月·昴}「第一句。」

{菜月昴}「第二句。」

{诸葛青}「第三句。」

{诸葛青}「第四句。」

{诸葛白}「第五句。」
</now_plot>
</content>`);

  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.blocks.map((block) => block.type), ['dialogue', 'dialogue', 'dialogue']);
  assert.equal(parsed.blocks[0].speaker.stableId, 'natsuki-subaru');
  assert.equal(parsed.blocks[0].text, '第一句。\n第二句。');
  assert.equal(parsed.blocks[1].speaker.kind, 'generic');
  assert.equal(parsed.blocks[1].speaker.displayName, '诸葛青');
  assert.equal(parsed.blocks[1].text, '第三句。\n第四句。');
  assert.equal(parsed.blocks[2].speaker.displayName, '诸葛白');
});

test('parser rejects unknown, duplicate, case-smuggled, or partially parsed attributes', () => {
  const cases = [
    '<content><story volume="01" onclick="x"></story><time>魔女历1000年01月01日</time><now_plot>正文</now_plot></content>',
    '<content><story volume="01"></story><time period="下午" style="x">魔女历1000年01月01日</time><now_plot>正文</now_plot></content>',
    '<content><story volume="01"></story><time>魔女历1000年01月01日</time><now_plot><scene location="王都" onclick="x">正文</scene></now_plot></content>',
    '<content><story volume="01"></story><time>魔女历1000年01月01日</time><now_plot><ability user="昴" name="权能" kind="权能" desc="说明" data-x="1">正文</ability></now_plot></content>',
    '<content><story volume="01"></story><time>魔女历1000年01月01日</time><now_plot><check type="攻击" actor="昴" Actor="艾尔莎">正文</check></now_plot></content>',
    '<content><story volume="01"></story><time>魔女历1000年01月01日</time><now_plot><restart deathId="a" checkpoint="b" checkpoint="c">正文</restart></now_plot></content>',
    '<content><story volume="01"></story><time>魔女历1000年01月01日</time><now_plot><scene location="王都" mood=坏>正文</scene></now_plot></content>',
    '<content><story volume="01"></story><time>魔女历1000年01月01日</time><now_plot><scene location="王都" STYLE="color:red">正文</scene></now_plot></content>',
  ];
  for (const source of cases) {
    const parsed = parseNarrativeResponse(source);
    assert.equal(parsed.ok, false, source);
    assert.equal(parsed.type, 'fallback');
  }
});

test('parser falls back quickly for many unclosed direct tags', () => {
  const hostile = `<content><story volume="01"></story><time>魔女历1000年01月01日</time><now_plot>${'<scene location="王都">'.repeat(8000)}</now_plot></content>`;
  const start = performance.now();
  const parsed = parseNarrativeResponse(hostile);
  const elapsed = performance.now() - start;
  assert.equal(parsed.ok, false);
  assert.equal(parsed.type, 'fallback');
  assert.ok(elapsed < 500, `unclosed tag fallback took ${elapsed}ms`);
});

test('parser decodes display entities but keeps malformed input inert and does not infer prose speakers', () => {
  const parsed = parseNarrativeResponse(`<content>
<story volume="25">■■&#8226;■</story>
<time>魔女历1001年04月26日</time>
<now_plot>
菜月昴说他见过蕾姆，但这一句只是旁白。

{雷姆}「请不要把旁白误判成对白。」
</now_plot>
</content>`);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.visible.heading, '第25卷 | ■■•■');
  assert.equal(parsed.blocks[0].type, 'narration');
  assert.equal('speaker' in parsed.blocks[0], false);
  assert.equal(parsed.blocks[1].speaker.displayName, '蕾姆');

  const bad = parseNarrativeResponse('<content><time>魔女历1000年01月01日</time><story volume="01"></story><now_plot><script>alert(1)</script></now_plot></content>');
  assert.equal(bad.ok, false);
  assert.equal(bad.type, 'fallback');
  assert.equal(bad.rawText.includes('<script>alert(1)</script>'), true);

  const nested = parseNarrativeResponse('<content><story volume="01"></story><time>魔女历1000年01月01日</time><now_plot><scene location="王都"><check type="攻击" actor="昴">1d20=1</check></scene></now_plot></content>');
  assert.equal(nested.ok, false);
});

test('invalid HTML entities never throw and remain inert display text', () => {
  assert.doesNotThrow(() => parseNarrativeResponse('<content><story volume="01"></story><time>魔女历1000年01月01日</time><now_plot>坏实体 &#x110000;、&#9999999999; 与 &#xD800; 不得炸掉解析。</now_plot></content>'));
  const parsed = parseNarrativeResponse('<content><story volume="01"></story><time>魔女历1000年01月01日</time><now_plot>坏实体 &#x110000;、&#9999999999; 与 &#xD800; 保留。</now_plot></content>');
  assert.equal(parsed.ok, true);
  assert.equal(parsed.blocks[0].text.includes('&#x110000;'), true);
  assert.equal(parsed.blocks[0].text.includes('&#9999999999;'), true);
  assert.equal(parsed.blocks[0].text.includes('&#xD800;'), true);
  assert.equal(parsed.blocks[0].text.includes('\uD800'), false);
});

test('speaker resolution is exact, alias-safe, ambiguity-aware, and first-grapheme for unknowns', () => {
  assert.equal(resolveSpeaker('菜月•昴').displayName, '菜月昴');
  assert.equal(resolveSpeaker('碧翠丝').displayName, '贝亚特丽丝');
  assert.equal(resolveSpeaker('弗雷德莉卡').displayName, '法兰德丽卡·鲍曼');
  assert.equal(resolveSpeaker('法兰黛莉卡').displayName, '法兰德丽卡·鲍曼');
  assert.equal(resolveSpeaker('蕾姆').displayName, '蕾姆');
  assert.equal(resolveSpeaker('雷姆').displayName, '蕾姆');
  assert.equal(resolveSpeaker('潘朵拉').displayName, '潘多拉');
  assert.equal(resolveSpeaker('莎提拉').displayName, '莎缇拉');
  assert.equal(resolveSpeaker('奥托·思文').displayName, '奥托·苏文');
  assert.equal(resolveSpeaker('莱因哈鲁特').displayName, '莱茵哈鲁特·范·阿斯特雷亚');
  assert.equal(resolveSpeaker('丝琵卡').kind, 'generic');
  assert.equal(resolveSpeaker('👩‍🚀旅人').initial, '👩‍🚀');

  const conflict = resolveSpeaker('短名', [
    { stableId: 'a', displayName: '甲', portraitKey: 'a', aliases: ['短名'], identityTokens: [], bubbleTokens: [] },
    { stableId: 'b', displayName: '乙', portraitKey: 'b', aliases: ['短名'], identityTokens: [], bubbleTokens: [] },
  ]);
  assert.equal(conflict.kind, 'generic');
  assert.equal(conflict.reason, 'ambiguous-alias');
});
