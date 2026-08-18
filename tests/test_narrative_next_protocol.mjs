import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import * as entitiesModule from '../narrative-next/src/entities.mjs';
import { tokenizeInlineText } from '../narrative-next/src/inline-format.mjs';
import * as protocolModule from '../narrative-next/src/protocol.mjs';
import { formatStoryHeading } from '../narrative-next/src/titles.mjs';

const {
  parseNarrative,
  parseStreamingNarrative,
  splitUpdateVariable,
} = protocolModule;

const LIMITS = Object.freeze({
  SOURCE: 256 * 1024,
  ATTRIBUTE: 512,
  BLOCK_TEXT: 32 * 1024,
  BLOCKS: 512,
});

const fixtureDirectory = new URL('../narrative-next/fixtures/', import.meta.url);

function fixture(name) {
  return readFileSync(new URL(name, fixtureDirectory), 'utf8');
}

function currentResponse(body, options = {}) {
  const player = options.player === undefined ? ' player="菜月昴"' : options.player ? ` player="${options.player}"` : '';
  const volume = options.volume ?? '01';
  const heading = options.heading ?? formatStoryHeading(volume);
  const timeText = options.timeText ?? '魔女历1000年01月01日';
  return `<content${player}><story volume="${volume}">${heading}</story><time period="下午" layer="主线" basis="编辑演算">${timeText}</time><now_plot>${body}</now_plot></content>`;
}

function ability(attributes = '', children = '<effect>发动。</effect><description>说明。</description>') {
  return `<ability user="贝亚特丽丝" name="阴魔法" kind="魔法"${attributes}>${children}</ability>`;
}

function errorCodes(result) {
  return result.errors.map((error) => (typeof error === 'string' ? error : error.code));
}

test('parses an unversioned current response into stable metadata and ordered blocks', () => {
  const source = fixture('complete.xml');
  const result = parseNarrative(source);

  assert.equal(result.ok, true);
  assert.equal(result.protocol, 'current');
  assert.equal(result.player, '菜月昴');
  assert.deepEqual(result.story, { volume: '01', heading: '第01卷｜开始的余温' });
  assert.deepEqual(result.time, {
    period: '下午',
    layer: '主线',
    basis: '编辑演算',
    text: '魔女历1000年01月01日',
  });
  assert.deepEqual(result.blocks.map((block) => block.type), [
    'narration',
    'dialogue',
    'player-dialogue',
    'scene',
    'ability',
    'check',
    'restart',
  ]);
  assert.deepEqual(result.blocks[0], { type: 'narration', text: '风穿过王都的街巷。' });
  assert.deepEqual(result.blocks[1], { type: 'dialogue', speaker: '艾米莉亚', text: '我们走吧。' });
  assert.deepEqual(result.blocks[2], { type: 'player-dialogue', speaker: '#', text: '好。' });
  assert.deepEqual(result.blocks[3], {
    type: 'scene',
    location: '王都',
    time: '下午',
    mood: '不安',
    text: '人群忽然安静下来。',
  });
  assert.deepEqual(result.blocks[4], {
    type: 'ability',
    user: '贝亚特丽丝',
    name: '阴魔法',
    kind: '魔法',
    affinities: ['火', '风', '阴'],
    effect: '紫色光幕挡住飞刃。',
    description: '以阴属性构筑屏障。',
    protocol: 'current',
  });
  assert.deepEqual(result.blocks[5], {
    type: 'check',
    checkType: '闪避',
    actor: '菜月昴',
    target: '艾尔莎',
    text: '1d20=14｜情境+2｜DC15｜成功｜擦身避开',
  });
  assert.deepEqual(result.blocks[6], {
    type: 'restart',
    deathId: 'loop-001',
    checkpoint: '赃物库前',
    text: '世界在白光中重启。',
  });
  assert.deepEqual(result.errors, []);
});

test('requires the current canonical volume heading in story content', () => {
  const result = parseNarrative(currentResponse('正文。'));

  assert.equal(result.ok, true);
  assert.deepEqual(result.story, { volume: '01', heading: '第01卷｜开始的余温' });
});

test('rejects an empty story heading', () => {
  const result = parseNarrative(currentResponse('正文。', { heading: '' }));

  assert.equal(result.ok, false);
  assert.ok(errorCodes(result).includes('invalid-story-content'));
});

test('rejects a story heading whose title belongs to another volume', () => {
  const result = parseNarrative(currentResponse('正文。', { heading: '第02卷｜救赎的开始' }));

  assert.equal(result.ok, false);
  assert.ok(errorCodes(result).includes('invalid-story-content'));
});

test('rejects an unknown story heading', () => {
  const result = parseNarrative(currentResponse('正文。', { heading: '第01卷｜不存在的篇章' }));

  assert.equal(result.ok, false);
  assert.ok(errorCodes(result).includes('invalid-story-content'));
});

test('accepts visible Witch-calendar boundary dates', () => {
  for (const timeText of ['魔女历0000年01月01日', '魔女历9999年12月30日']) {
    const result = parseNarrative(currentResponse('正文。', { timeText }));

    assert.equal(result.ok, true, timeText);
    assert.equal(result.time.text, timeText, timeText);
  }
});

test('rejects malformed or out-of-range visible Witch-calendar dates', () => {
  const invalidDates = [
    '魔女历999年01月01日',
    '魔女历１０００年01月01日',
    '魔女历1000年00月01日',
    '魔女历1000年13月01日',
    '魔女历1000年01月00日',
    '魔女历1000年01月31日',
  ];

  for (const timeText of invalidDates) {
    const result = parseNarrative(currentResponse('正文。', { timeText }));

    assert.equal(result.ok, false, timeText);
    assert.ok(errorCodes(result).includes('invalid-time-content'), timeText);
  }
});

test('accepts every declared time metadata vocabulary value', () => {
  const vocabularies = {
    period: ['黎明', '清晨', '上午', '正午', '下午', '傍晚', '夜间', '深夜', '凌晨', '时段未详'],
    layer: ['主线', '轮回分支', '历史回溯', '试炼幻境'],
    basis: ['编辑演算', '历史估算'],
  };

  for (const [name, values] of Object.entries(vocabularies)) {
    for (const value of values) {
      const source = currentResponse('正文。').replace(`${name}="${name === 'period' ? '下午' : name === 'layer' ? '主线' : '编辑演算'}"`, `${name}=" ${value} "`);
      const result = parseNarrative(source);

      assert.equal(result.ok, true, `${name}=${value}`);
      assert.equal(result.time[name], value, `${name}=${value}`);
    }
  }
});

test('rejects undeclared time metadata vocabulary values without coercion', () => {
  const invalidValues = {
    period: ['夜晚', '下午时分'],
    layer: ['支线', '主线路线'],
    basis: ['历史资料', '原作明示'],
  };

  for (const [name, values] of Object.entries(invalidValues)) {
    for (const value of values) {
      const source = currentResponse('正文。').replace(`${name}="${name === 'period' ? '下午' : name === 'layer' ? '主线' : '编辑演算'}"`, `${name}="${value}"`);
      const result = parseNarrative(source);

      assert.equal(result.ok, false, `${name}=${value}`);
      assert.ok(errorCodes(result).includes('invalid-time-attributes'), `${name}=${value}`);
    }
  }
});

test('recognizes dialogue only when the entire paragraph has a brace speaker slot', () => {
  const source = currentResponse('他写下{艾米莉亚}「这不是独立对白」。\n\n {艾&amp;米}「&lt;出发&gt;」 ');
  const result = parseNarrative(source);

  assert.deepEqual(result.blocks, [
    { type: 'narration', text: '他写下{艾米莉亚}「这不是独立对白」。' },
    { type: 'dialogue', speaker: '艾&米', text: '<出发>' },
  ]);
});

test('normalizes the hash speaker slot as player dialogue without player metadata', () => {
  const result = parseNarrative(currentResponse('{#}「由我决定。」', { player: null }));

  assert.equal(result.player, null);
  assert.deepEqual(result.blocks, [{ type: 'player-dialogue', speaker: '#', text: '由我决定。' }]);
});

test('requires literal raw hash evidence for player dialogue', () => {
  const literal = parseNarrative(currentResponse('{#}「玩家。」'));
  const encoded = parseNarrative(currentResponse('{&#35;}「伪装玩家。」'));

  assert.deepEqual(literal.blocks, [{ type: 'player-dialogue', speaker: '#', text: '玩家。' }]);
  assert.deepEqual(encoded.blocks, [{ type: 'narration', text: '{#}「伪装玩家。」' }]);
});

test('keeps structurally impossible entity-decoded speakers inert', () => {
  const cases = [
    ['{甲&#10;乙}「伪装。」', '{甲\n乙}「伪装。」'],
    ['{甲&#13;乙}「伪装。」', '{甲\r乙}「伪装。」'],
    ['{甲&#123;乙}「伪装。」', '{甲{乙}「伪装。」'],
    ['{甲&#125;乙}「伪装。」', '{甲}乙}「伪装。」'],
  ];

  for (const [body, text] of cases) {
    const result = parseNarrative(currentResponse(body));

    assert.deepEqual(result.blocks, [{ type: 'narration', text }], body);
  }
});

test('decodes safe ordinary entities in a legitimate character speaker', () => {
  const result = parseNarrative(currentResponse('{艾&amp;米}「出发。」'));

  assert.deepEqual(result.blocks, [{ type: 'dialogue', speaker: '艾&米', text: '出发。' }]);
});

test('accepts an omitted ability affinity as an empty list', () => {
  const result = parseNarrative(currentResponse(ability()));

  assert.deepEqual(result.blocks[0].affinities, []);
  assert.equal(result.blocks[0].type, 'ability');
});

test('accepts a nonduplicated affinity subset in canonical order', () => {
  const result = parseNarrative(currentResponse(ability(' affinity="火,风,阴"')));

  assert.deepEqual(result.blocks[0].affinities, ['火', '风', '阴']);
  assert.equal(result.blocks[0].type, 'ability');
});

test('rejects an unknown ability affinity as an invalid block', () => {
  const result = parseNarrative(currentResponse(ability(' affinity="冰"')));

  assert.equal(result.ok, true);
  assert.equal(result.blocks[0].type, 'invalid');
  assert.equal(result.blocks[0].status, 'invalid');
});

test('rejects a duplicate ability affinity as an invalid block', () => {
  const result = parseNarrative(currentResponse(ability(' affinity="火,火"')));

  assert.equal(result.blocks[0].type, 'invalid');
  assert.equal(result.blocks[0].status, 'invalid');
});

test('rejects an out-of-order ability affinity as an invalid block', () => {
  const result = parseNarrative(currentResponse(ability(' affinity="阴,火"')));

  assert.equal(result.blocks[0].type, 'invalid');
  assert.equal(result.blocks[0].status, 'invalid');
});

test('rejects empty affinity entries as an invalid block', () => {
  const result = parseNarrative(currentResponse(ability(' affinity="火,,阴"')));

  assert.equal(result.blocks[0].type, 'invalid');
  assert.equal(result.blocks[0].status, 'invalid');
});

test('accepts each declared current ability kind', () => {
  const kinds = ['一般技能', '权能', '加护', '魔法', '精灵术', '种族能力', '武技'];

  for (const kind of kinds) {
    const source = currentResponse(`<ability user="测试者" name="测试" kind="${kind}"><effect>发动。</effect><description>说明。</description></ability>`);
    const result = parseNarrative(source);
    assert.equal(result.blocks[0].type, 'ability', kind);
    assert.equal(result.blocks[0].kind, kind);
  }
});

test('rejects an undeclared ability kind without coercion', () => {
  const source = currentResponse('<ability user="测试者" name="测试" kind="超能力"><effect>发动。</effect><description>说明。</description></ability>');
  const result = parseNarrative(source);

  assert.equal(result.blocks[0].type, 'invalid');
  assert.equal(result.blocks[0].status, 'invalid');
  assert.equal('kind' in result.blocks[0], false);
});

test('keeps valid siblings around a malformed local block', () => {
  const source = currentResponse('前段。\n\n<scene location="王都" time="下午">缺少氛围。</scene>\n\n{尤里乌斯}「退后。」\n\n后段。');
  const result = parseNarrative(source);

  assert.equal(result.ok, true);
  assert.deepEqual(result.blocks.map((block) => block.type), ['narration', 'invalid', 'dialogue', 'narration']);
  assert.deepEqual(result.blocks[0], { type: 'narration', text: '前段。' });
  assert.equal(result.blocks[1].status, 'invalid');
  assert.match(result.blocks[1].rawText, /^<scene/);
  assert.deepEqual(result.blocks[2], { type: 'dialogue', speaker: '尤里乌斯', text: '退后。' });
  assert.deepEqual(result.blocks[3], { type: 'narration', text: '后段。' });
});

test('recovers a later standalone dialogue after an unclosed local tag', () => {
  const source = currentResponse('前段。\n\n<scene location="王都" time="下午" mood="不安">未闭合。\n\n{尤里乌斯}「仍然保留。」');
  const result = parseNarrative(source);

  assert.equal(result.ok, true);
  assert.deepEqual(result.blocks.map((block) => block.type), ['narration', 'invalid', 'dialogue']);
  assert.match(result.blocks[1].rawText, /未闭合/);
  assert.deepEqual(result.blocks.at(-1), { type: 'dialogue', speaker: '尤里乌斯', text: '仍然保留。' });
});

test('recovers dialogue after an unclosed local tag across a lone-CR blank boundary', () => {
  const source = currentResponse('<scene location="王都" time="下午" mood="不安">未闭合。\r\r{甲}「好。」');
  const result = parseNarrative(source);

  assert.equal(result.ok, true);
  assert.deepEqual(result.blocks.map((block) => block.type), ['invalid', 'dialogue']);
  assert.doesNotMatch(result.blocks[0].rawText, /\{甲\}/u);
  assert.deepEqual(result.blocks[1], { type: 'dialogue', speaker: '甲', text: '好。' });
});

test('bounds an unterminated quoted opener and recovers dialogue after a blank line', () => {
  const source = currentResponse('<scene location="王都\n\n{尤里乌斯}「仍然保留。」');
  const result = parseNarrative(source);

  assert.equal(result.ok, true);
  assert.deepEqual(result.blocks.map((block) => block.type), ['invalid', 'dialogue']);
  assert.doesNotMatch(result.blocks[0].rawText, /尤里乌斯/);
  assert.deepEqual(result.blocks[1], { type: 'dialogue', speaker: '尤里乌斯', text: '仍然保留。' });
});

test('does not promote a completed nested check from an unclosed same-paragraph scene', () => {
  const body = '<scene location="王都" time="下午" mood="不安">未闭合。<check type="观察" actor="甲" target="乙">成功。</check>';
  const result = parseNarrative(currentResponse(body));

  assert.equal(result.ok, true);
  assert.equal(result.blocks.length, 1);
  assert.equal(result.blocks[0].type, 'invalid');
  assert.match(result.blocks[0].rawText, /<check/);
});

test('keeps repeated unclosed unknown tags without a boundary in one invalid remainder', () => {
  const body = '<x>一<x>二<x>三';
  const result = parseNarrative(currentResponse(body));

  assert.equal(result.ok, true);
  assert.equal(result.blocks.length, 1);
  assert.equal(result.blocks[0].type, 'invalid');
  assert.equal(result.blocks[0].rawText, body);
});

test('normalizes a legacy desc ability through the read-only adapter', () => {
  const result = parseNarrative(fixture('legacy.xml'));

  assert.equal(result.ok, true);
  assert.equal(result.protocol, 'legacy-readonly');
  assert.deepEqual(result.blocks[1], {
    type: 'ability',
    user: '贝亚特丽丝',
    name: '旧式阴魔法',
    kind: '魔法',
    affinities: ['阴'],
    effect: '影子吞没了飞来的箭。',
    description: '旧说明。',
    protocol: 'legacy-readonly',
  });
  assert.equal('desc' in result.blocks[1], false);
});

test('rejects an ambiguous ability containing both desc and nested description', () => {
  const source = currentResponse('<ability user="测试者" name="测试" kind="魔法" desc="旧说明"><effect>发动。</effect><description>新说明。</description></ability>');
  const result = parseNarrative(source);

  assert.equal(result.blocks[0].type, 'invalid');
  assert.equal(result.blocks[0].status, 'invalid');
});

test('tokenizes the required strong, emphasis, and inert HTML-like fixture exactly', () => {
  assert.deepEqual(tokenizeInlineText('**重点**与*低语*<img>'), [
    { type: 'strong', text: '重点' },
    { type: 'text', text: '与' },
    { type: 'em', text: '低语' },
    { type: 'text', text: '<img>' },
  ]);
});

test('keeps an unpaired inline marker as ordinary text', () => {
  assert.deepEqual(tokenizeInlineText('未闭合**重点'), [{ type: 'text', text: '未闭合**重点' }]);
});

test('does not emit formatting tokens for empty marker pairs', () => {
  assert.deepEqual(tokenizeInlineText('空****标记'), [{ type: 'text', text: '空****标记' }]);
});

test('keeps HTML-like source inert in inline text', () => {
  assert.deepEqual(tokenizeInlineText('<script>alert(1)</script>'), [
    { type: 'text', text: '<script>alert(1)</script>' },
  ]);
});

test('follow-up: keeps a lexically paired HTML-like element and its marked content inert', () => {
  const paired = '<script\ndata-note="x > **属性**">**重点**\n*低语*</script>';
  assert.deepEqual(tokenizeInlineText(paired), [{ type: 'text', text: paired }]);

  assert.deepEqual(tokenizeInlineText('<script>**重点**</style>'), [
    { type: 'text', text: '<script>' },
    { type: 'strong', text: '重点' },
    { type: 'text', text: '</style>' },
  ]);

  const unterminated = '<script data-note="**属性** >';
  assert.deepEqual(tokenizeInlineText(unterminated), [{ type: 'text', text: unterminated }]);
  assert.deepEqual(tokenizeInlineText('1 < 2 **重点** > 0'), [
    { type: 'text', text: '1 < 2 ' },
    { type: 'strong', text: '重点' },
    { type: 'text', text: ' > 0' },
  ]);
});

test('pairs HTML-like tag names ASCII case-insensitively without consuming later formatting', () => {
  assert.deepEqual(tokenizeInlineText('<DIV>**x**</div>'), [
    { type: 'text', text: '<DIV>**x**</div>' },
  ]);

  const nested = '<DiV data-note="x > **属性**"><SpAn>**重点**</sPaN></dIv>与*好*';
  assert.deepEqual(tokenizeInlineText(nested), [
    { type: 'text', text: '<DiV data-note="x > **属性**"><SpAn>**重点**</sPaN></dIv>与' },
    { type: 'em', text: '好' },
  ]);
});

test('keeps nested inline marker attempts entirely as ordinary text', () => {
  assert.deepEqual(tokenizeInlineText('*轻**重**轻*'), [{ type: 'text', text: '*轻**重**轻*' }]);
});

test('keeps markers inside a complete same-line HTML-like span inert', () => {
  assert.deepEqual(tokenizeInlineText('**外部**<img alt="**重点**">*尾部*'), [
    { type: 'strong', text: '外部' },
    { type: 'text', text: '<img alt="**重点**">' },
    { type: 'em', text: '尾部' },
  ]);
});

test('keeps quoted greater-than signs inside one HTML-like inert range', () => {
  for (const source of ['<img alt="x > **重点**">', "<img alt='x > **重点**'>"]) {
    assert.deepEqual(tokenizeInlineText(source), [{ type: 'text', text: source }], source);
  }
});

test('keeps an unterminated quoted HTML-like opener inert through the input boundary', () => {
  for (const source of ['<img alt="**重点**"', "<img alt='**重点**'"]) {
    assert.deepEqual(tokenizeInlineText(source), [{ type: 'text', text: source }], source);
  }
});

for (const [label, newline] of [
  ['LF', '\n'],
  ['CRLF', '\r\n'],
  ['lone CR', '\r'],
]) {
  test(`keeps a multiline HTML-like opener inert across ${label} protocol whitespace`, () => {
    const source = `<img${newline}alt="**重点** > 保留">`;

    assert.deepEqual(tokenizeInlineText(source), [{ type: 'text', text: source }]);
  });
}

test('does not treat angle-bracket comparisons as inert HTML-like ranges', () => {
  assert.deepEqual(tokenizeInlineText('1 < 2 **重点** > 0'), [
    { type: 'text', text: '1 < 2 ' },
    { type: 'strong', text: '重点' },
    { type: 'text', text: ' > 0' },
  ]);
});

test('invalid tag-name boundaries do not hide later inline formatting', () => {
  assert.deepEqual(tokenizeInlineText('a<b+c 与**好** > 0'), [
    { type: 'text', text: 'a<b+c 与' },
    { type: 'strong', text: '好' },
    { type: 'text', text: ' > 0' },
  ]);

  for (const boundary of ['+', '!', '=', ':']) {
    for (const source of [
      `a<b${boundary}c 与**好** > 0`,
      `a<b>前</b${boundary}c 与**好** > 0`,
    ]) {
      assert.deepEqual(tokenizeInlineText(source), [
        { type: 'text', text: source.slice(0, -9) },
        { type: 'strong', text: '好' },
        { type: 'text', text: ' > 0' },
      ], source);
    }
  }

  assert.deepEqual(tokenizeInlineText('<b**好**'), [
    { type: 'text', text: '<b' },
    { type: 'strong', text: '好' },
  ]);
});

test('valid tag-name boundaries preserve HTML-like inert ranges', () => {
  for (const source of [
    '<b>**好**</b>',
    '<b/**好**>',
    '<b **好**>',
    '<b\t**好**>',
    '<b\n**好**>',
    '<b\r**好**>',
    '<b',
    '<b **好**',
    '<b title="x > **好**">',
    '<DiV>**好**</dIv>',
  ]) {
    assert.deepEqual(tokenizeInlineText(source), [{ type: 'text', text: source }], source);
  }
});

test('special markup introducers require an immediate ASCII target or name lead', () => {
  assert.deepEqual(tokenizeInlineText('1 <! 2 与*好*'), [
    { type: 'text', text: '1 <! 2 与' },
    { type: 'em', text: '好' },
  ]);

  assert.deepEqual(tokenizeInlineText('x <? y 与*好*'), [
    { type: 'text', text: 'x <? y 与' },
    { type: 'em', text: '好' },
  ]);
});

test('keeps an exact tag-like span with inline markers inert', () => {
  assert.deepEqual(tokenizeInlineText('<img alt="**重点**">'), [
    { type: 'text', text: '<img alt="**重点**">' },
  ]);
});

test('keeps long and mixed malformed star runs as ordinary text', () => {
  for (const source of ['***重点***', '****重点****', '***重点**', '**重点***', '*重点***']) {
    assert.deepEqual(tokenizeInlineText(source), [{ type: 'text', text: source }], source);
  }
});

test('recognizes a later exact marker pair after an inert long-star attempt', () => {
  assert.deepEqual(tokenizeInlineText('***坏***与**好**'), [
    { type: 'text', text: '***坏***与' },
    { type: 'strong', text: '好' },
  ]);
});

test('consumes a rejected marker closer before recognizing a later independent pair', () => {
  assert.deepEqual(tokenizeInlineText('*前<img>后*与*好*'), [
    { type: 'text', text: '*前<img>后*与' },
    { type: 'em', text: '好' },
  ]);
  assert.deepEqual(tokenizeInlineText('**前<img>后**与**好**'), [
    { type: 'text', text: '**前<img>后**与' },
    { type: 'strong', text: '好' },
  ]);
});

test('ignores inert internal markers while consuming a rejected crossing closer', () => {
  assert.deepEqual(tokenizeInlineText('*前<img alt="*">后*与*好*'), [
    { type: 'text', text: '*前<img alt="*">后*与' },
    { type: 'em', text: '好' },
  ]);
  assert.deepEqual(tokenizeInlineText('**前<img alt="**">后**与**好**'), [
    { type: 'text', text: '**前<img alt="**">后**与' },
    { type: 'strong', text: '好' },
  ]);
});

test('keeps a complete multiline HTML comment inert before later independent formatting', () => {
  const comment = '<!-- 第一行\n**重点** -->';

  assert.deepEqual(tokenizeInlineText(`${comment}与*好*`), [
    { type: 'text', text: `${comment}与` },
    { type: 'em', text: '好' },
  ]);
});

test('keeps an unterminated multiline HTML comment inert through input end', () => {
  const source = '<!-- 第一行\r\n**重点**\n*低语*';

  assert.deepEqual(tokenizeInlineText(source), [{ type: 'text', text: source }]);
});

test('inline lexical inert ranges do not poison later independent marker pairs', () => {
  assert.deepEqual(tokenizeInlineText('<img alt="*">**粗**与*好*'), [
    { type: 'text', text: '<img alt="*">' },
    { type: 'strong', text: '粗' },
    { type: 'text', text: '与' },
    { type: 'em', text: '好' },
  ]);
  assert.deepEqual(tokenizeInlineText('<!-- * -->**粗**与*好*'), [
    { type: 'text', text: '<!-- * -->' },
    { type: 'strong', text: '粗' },
    { type: 'text', text: '与' },
    { type: 'em', text: '好' },
  ]);
});

test('inline lexical inert ranges keep complete special markup as text', () => {
  for (const [source, expected] of [
    ['<!DOCTYPE html **x**>与*好*', [
      { type: 'text', text: '<!DOCTYPE html **x**>与' },
      { type: 'em', text: '好' },
    ]],
    ['<![CDATA[**x**]]>', [{ type: 'text', text: '<![CDATA[**x**]]>' }]],
    ['<?xml **x**?>', [{ type: 'text', text: '<?xml **x**?>' }]],
    ['<![CDATA[**x**]]>与*好*', [
      { type: 'text', text: '<![CDATA[**x**]]>与' },
      { type: 'em', text: '好' },
    ]],
    ['<?xml **x**?>与**粗**', [
      { type: 'text', text: '<?xml **x**?>与' },
      { type: 'strong', text: '粗' },
    ]],
  ]) {
    assert.deepEqual(tokenizeInlineText(source), expected, source);
  }
});

test('inline lexical inert ranges honor declaration quotes and unterminated special markup', () => {
  assert.deepEqual(tokenizeInlineText('<!DOCTYPE html ">" **x**>与*好*'), [
    { type: 'text', text: '<!DOCTYPE html ">" **x**>与' },
    { type: 'em', text: '好' },
  ]);

  for (const source of [
    '<!DOCTYPE html "**x** >',
    '<![CDATA[**x**',
    '<?xml **x**',
  ]) {
    assert.deepEqual(tokenizeInlineText(source), [{ type: 'text', text: source }], source);
  }
});

test('DOCTYPE internal subsets keep inline markers inert through the outer declaration close', () => {
  assert.deepEqual(tokenizeInlineText(
    '<!DOCTYPE root [ <!ELEMENT root (#PCDATA)> **inside** ]>**after**',
  ), [
    { type: 'text', text: '<!DOCTYPE root [ <!ELEMENT root (#PCDATA)> **inside** ]>' },
    { type: 'strong', text: 'after' },
  ]);
});

test('DOCTYPE internal-subset inline scanning honors quotes and nested square brackets', () => {
  const declarations = [
    '<!DOCTYPE root>',
    '<!DOCTYPE root "[ > ]" \'[ > ]\'>',
    '<!DOCTYPE root [[ <!ELEMENT root (#PCDATA)> ]]>',
    '<!DOCTYPE root [ <!-- [ > ] **comment** --> <!ELEMENT root (#PCDATA)> **inside** ]>',
  ];

  for (const declaration of declarations) {
    assert.deepEqual(tokenizeInlineText(`${declaration}**after**`), [
      { type: 'text', text: declaration },
      { type: 'strong', text: 'after' },
    ], declaration);
  }

  for (const unclosed of [
    '<!DOCTYPE root [ <!ELEMENT root (#PCDATA)> **inside**',
    '<!DOCTYPE root [[ <!ELEMENT root (#PCDATA)> ] **inside**',
  ]) {
    assert.deepEqual(tokenizeInlineText(unclosed), [{ type: 'text', text: unclosed }], unclosed);
  }
});

test('DOCTYPE nested comments and processing instructions own hostile inline bytes', () => {
  const declarations = [
    '<!DOCTYPE root [ <!-- ] > </now_plot></content> **inside** --> <!ELEMENT root (#PCDATA)> ]>',
    '<!DOCTYPE root [ <?owned ] > </now_plot></content> **inside**?> <!ELEMENT root (#PCDATA)> ]>',
    '<!DOCTYPE root [[ <!-- [ ] > "\' </now_plot></content> **comment-a** <!ELEMENT fake ANY> --> <?first ] > </now_plot></content> **pi-a**?> ] <!-- ] [ > **comment-b** --> <?second ] > **pi-b**?> ]>',
    '<!DOCTYPE root [ "<!-- ] > </now_plot></content> **quoted-comment**" \'<?pi ] > </now_plot></content> **quoted-pi**\' <!ELEMENT root (#PCDATA)> ]>',
  ];

  for (const declaration of declarations) {
    assert.deepEqual(tokenizeInlineText(`${declaration}**after**`), [
      { type: 'text', text: declaration },
      { type: 'strong', text: 'after' },
    ], declaration);
  }
});

test('unterminated nested DOCTYPE comments and processing instructions keep inline text inert', () => {
  for (const source of [
    '<!DOCTYPE root [ <!-- ] > </now_plot></content> **inside** <!ELEMENT fake ANY> ]>**after**',
    '<!DOCTYPE root [ <?owned ] > </now_plot></content> **inside** <!ELEMENT fake ANY> ]>**after**',
  ]) {
    assert.deepEqual(tokenizeInlineText(source), [{ type: 'text', text: source }], source);
  }
});

test('nested DOCTYPE lexical states do not change ordinary inline markup behavior', () => {
  for (const [source, expected] of [
    ['<!DOCTYPE root>**after**', [
      { type: 'text', text: '<!DOCTYPE root>' },
      { type: 'strong', text: 'after' },
    ]],
    ['<x>**inside**</x>**after**', [
      { type: 'text', text: '<x>**inside**</x>' },
      { type: 'strong', text: 'after' },
    ]],
    ['<!-- ] > **inside** -->**after**', [
      { type: 'text', text: '<!-- ] > **inside** -->' },
      { type: 'strong', text: 'after' },
    ]],
    ['<?owned ] > **inside**?>**after**', [
      { type: 'text', text: '<?owned ] > **inside**?>' },
      { type: 'strong', text: 'after' },
    ]],
  ]) {
    assert.deepEqual(tokenizeInlineText(source), expected, source);
  }
});

test('ordinary inline tags remain quote-aware but not square-bracket-aware', () => {
  assert.deepEqual(tokenizeInlineText('<x [>**after**'), [
    { type: 'text', text: '<x [>' },
    { type: 'strong', text: 'after' },
  ]);
});

test('inline lexical ownership keeps nested introducers inside the earliest outer range', () => {
  assert.deepEqual(tokenizeInlineText('<img alt="<!--">与**好**'), [
    { type: 'text', text: '<img alt="<!--">与' },
    { type: 'strong', text: '好' },
  ]);
  assert.deepEqual(tokenizeInlineText('<!-- <?xml -->与**好**'), [
    { type: 'text', text: '<!-- <?xml -->与' },
    { type: 'strong', text: '好' },
  ]);
});

test('inline lexical ownership matrix preserves outer constructs and later formatting', () => {
  for (const source of [
    '<img alt="<!--">与**好**',
    '<img alt="<![CDATA[">与**好**',
    '<img alt="<?xml">与**好**',
    '<img alt="<!DOCTYPE x">与**好**',
    '<!-- <img><!-- <?xml -->与**好**',
    '<![CDATA[<img><!-- <?xml]]>与**好**',
    '<?xml <img><!-- <?inner ?>与**好**',
    '<!DOCTYPE x "<img><!-- <?xml">与**好**',
  ]) {
    assert.deepEqual(tokenizeInlineText(source), [
      { type: 'text', text: source.slice(0, -5) },
      { type: 'strong', text: '好' },
    ], source);
  }

  for (const source of [
    '<img alt="<!-- 与**坏**',
    '<!-- <?xml 与**坏**',
    '<![CDATA[<!-- 与**坏**',
    '<?xml <!-- 与**坏**',
    '<!DOCTYPE x "<img> <?xml 与**坏**',
  ]) {
    assert.deepEqual(tokenizeInlineText(source), [{ type: 'text', text: source }], source);
  }

  assert.deepEqual(tokenizeInlineText('<DIV>**内**</div>与**好**'), [
    { type: 'text', text: '<DIV>**内**</div>与' },
    { type: 'strong', text: '好' },
  ]);
  assert.deepEqual(tokenizeInlineText('1 < 2 **好** > 0 与<! 3 与<? 4'), [
    { type: 'text', text: '1 < 2 ' },
    { type: 'strong', text: '好' },
    { type: 'text', text: ' > 0 与<! 3 与<? 4' },
  ]);
});

test('rejects duplicate root attributes', () => {
  const source = '<content player="甲" player="乙"><story volume="01">第01卷｜开始的余温</story><time period="下午" layer="主线" basis="编辑演算">魔女历1000年01月01日</time><now_plot>正文。</now_plot></content>';
  const result = parseNarrative(source);

  assert.equal(result.ok, false);
  assert.ok(errorCodes(result).includes('invalid-content-attributes'));
});

test('rejects case-smuggled attribute names', () => {
  const source = currentResponse('<scene location="王都" time="下午" Mood="不安">文本。</scene>');
  const result = parseNarrative(source);

  assert.equal(result.blocks[0].type, 'invalid');
  assert.equal(result.blocks[0].status, 'invalid');
});

test('rejects unknown attributes', () => {
  const source = currentResponse('<check type="闪避" actor="甲" target="乙" href="https://example.invalid">结果。</check>');
  const result = parseNarrative(source);

  assert.equal(result.blocks[0].type, 'invalid');
  assert.equal(result.blocks[0].status, 'invalid');
});

test('rejects malformed unquoted attributes', () => {
  const source = '<content player=甲><story volume="01">第01卷｜开始的余温</story><time period="下午" layer="主线" basis="编辑演算">魔女历1000年01月01日</time><now_plot>正文。</now_plot></content>';
  const result = parseNarrative(source);

  assert.equal(result.ok, false);
  assert.ok(errorCodes(result).includes('invalid-content-attributes'));
});

test('rejects control characters in attributes', () => {
  const source = currentResponse('<restart deathId="loop-\u0001" checkpoint="起点">重启。</restart>');
  const result = parseNarrative(source);

  assert.equal(result.blocks[0].type, 'invalid');
  assert.equal(result.blocks[0].status, 'invalid');
});

test('rejects a version attribute on the current root', () => {
  const source = '<content version="2"><story volume="01">第01卷｜开始的余温</story><time period="下午" layer="主线" basis="编辑演算">魔女历1000年01月01日</time><now_plot>正文。</now_plot></content>';
  const result = parseNarrative(source);

  assert.equal(result.ok, false);
  assert.ok(errorCodes(result).includes('invalid-content-attributes'));
});

test('rejects root children in the wrong order', () => {
  const source = '<content><time period="下午" layer="主线" basis="编辑演算">魔女历1000年01月01日</time><story volume="01">第01卷｜开始的余温</story><now_plot>正文。</now_plot></content>';
  const result = parseNarrative(source);

  assert.equal(result.ok, false);
  assert.ok(errorCodes(result).includes('invalid-root-structure'));
});

test('rejects duplicate required root children', () => {
  const source = '<content><story volume="01">第01卷｜开始的余温</story><story volume="02">第02卷｜救赎的开始</story><time period="下午" layer="主线" basis="编辑演算">魔女历1000年01月01日</time><now_plot>正文。</now_plot></content>';
  const result = parseNarrative(source);

  assert.equal(result.ok, false);
  assert.ok(errorCodes(result).includes('invalid-root-structure'));
});

test('rejects unknown direct root children', () => {
  const source = '<content><story volume="01">第01卷｜开始的余温</story><time period="下午" layer="主线" basis="编辑演算">魔女历1000年01月01日</time><extra></extra><now_plot>正文。</now_plot></content>';
  const result = parseNarrative(source);

  assert.equal(result.ok, false);
  assert.ok(errorCodes(result).includes('invalid-root-structure'));
});

test('rejects a self-closing story header', () => {
  const source = '<content><story volume="01"/><time period="下午" layer="主线" basis="编辑演算">魔女历1000年01月01日</time><now_plot>正文。</now_plot></content>';
  const result = parseNarrative(source);

  assert.equal(result.ok, false);
  assert.ok(errorCodes(result).includes('invalid-root-structure'));
});

test('rejects multiple content roots', () => {
  const one = currentResponse('第一段。');
  const result = parseNarrative(one + one);

  assert.equal(result.ok, false);
  assert.ok(errorCodes(result).includes('invalid-trailing-content'));
});

test('turns an unsupported now_plot child into an invalid local block', () => {
  const source = currentResponse('前。<video src="x">不支持。</video>后。');
  const result = parseNarrative(source);

  assert.equal(result.ok, true);
  assert.deepEqual(result.blocks.map((block) => block.type), ['narration', 'invalid', 'narration']);
  assert.equal(result.blocks[1].status, 'invalid');
});

test('keeps a protocol tag inside attempted brace dialogue inert as one local block', () => {
  const attempted = '{甲}「前<scene location="王都" time="下午" mood="不安">场景。</scene>后」';
  const body = `${attempted}\n\n{乙}「后来仍然保留。」\n\n`;
  const source = currentResponse(body);

  for (const result of [
    parseNarrative(source),
    parseStreamingNarrative(source.replace('</now_plot></content>', '')),
  ]) {
    assert.equal(result.ok, true);
    assert.deepEqual(result.blocks.map((block) => block.type), ['invalid', 'dialogue']);
    assert.equal(result.blocks[0].rawText, attempted);
    assert.equal(result.blocks.some((block) => block.type === 'scene'), false);
    assert.deepEqual(result.blocks[1], { type: 'dialogue', speaker: '乙', text: '后来仍然保留。' });
  }
});

test('keeps a root-looking opener inside a complete local block owned by now_plot', () => {
  const local = '<UpdateVariable>{"literal":"<now_plot>"}</UpdateVariable>';
  const body = `前。\n\n${local}\n\n{甲}「后。」\n\n`;
  const source = currentResponse(body);

  for (const result of [
    parseNarrative(source),
    parseStreamingNarrative(source.replace('</now_plot></content>', '')),
  ]) {
    assert.equal(result.ok, true);
    assert.equal(result.player, '菜月昴');
    assert.deepEqual(result.story, { volume: '01', heading: '第01卷｜开始的余温' });
    assert.equal(result.time.text, '魔女历1000年01月01日');
    assert.deepEqual(result.blocks.map((block) => block.type), ['narration', 'invalid', 'dialogue']);
    assert.equal(result.blocks[1].rawText, local);
    assert.deepEqual(result.blocks[2], { type: 'dialogue', speaker: '甲', text: '后。' });
  }
});

test('keeps a same-name close inside an incomplete local UpdateVariable payload opaque through source end', () => {
  const local = '<x><UpdateVariable>{"literal":"</x>"}';
  const source = currentResponse(local);
  const complete = parseNarrative(source);
  const streaming = parseStreamingNarrative(source);

  assert.equal(complete.ok, false);
  assert.ok(errorCodes(complete).includes('invalid-root-structure'));
  assert.equal(streaming.ok, true);
  assert.equal(streaming.streaming, true);
  assert.equal(streaming.complete, false);
  assert.deepEqual(streaming.blocks, []);
  assert.equal(streaming.progressText, `${local}</now_plot></content>`);
});

test('keeps a root-looking close inside attempted dialogue owned by now_plot', () => {
  const attempted = '{甲}「前</now_plot>后」';
  const body = `${attempted}\n\n{乙}「保留。」\n\n`;
  const source = currentResponse(body);

  for (const result of [
    parseNarrative(source),
    parseStreamingNarrative(source.replace('</now_plot></content>', '')),
  ]) {
    assert.equal(result.ok, true);
    assert.equal(result.player, '菜月昴');
    assert.deepEqual(result.story, { volume: '01', heading: '第01卷｜开始的余温' });
    assert.equal(result.time.text, '魔女历1000年01月01日');
    assert.deepEqual(result.blocks.map((block) => block.type), ['invalid', 'dialogue']);
    assert.equal(result.blocks[0].rawText, attempted);
    assert.deepEqual(result.blocks[1], { type: 'dialogue', speaker: '乙', text: '保留。' });
  }
});

test('uses the enclosing plot close as the boundary of a terminal attempted dialogue', () => {
  for (const rootLikeToken of ['<now_plot>', '</now_plot>']) {
    const attempted = `{甲}「前${rootLikeToken}后」`;
    const result = parseNarrative(currentResponse(attempted));

    assert.equal(result.ok, true, rootLikeToken);
    assert.equal(result.player, '菜月昴', rootLikeToken);
    assert.deepEqual(result.blocks, [{
      type: 'invalid',
      status: 'invalid',
      reason: 'invalid-local-block',
      rawText: attempted,
    }], rootLikeToken);
  }
});

test('recovers an unsupported local now_plot opener without consuming the enclosing close', () => {
  const body = '前。\n\n<now_plot>坏。\n\n{甲}「后。」\n\n';
  const source = currentResponse(body);

  for (const result of [
    parseNarrative(source),
    parseStreamingNarrative(source.replace('</now_plot></content>', '')),
  ]) {
    assert.equal(result.ok, true);
    assert.equal(result.player, '菜月昴');
    assert.deepEqual(result.blocks.map((block) => block.type), ['narration', 'invalid', 'dialogue']);
    assert.equal(result.blocks[1].rawText, '<now_plot>坏。\n\n');
    assert.deepEqual(result.blocks[2], { type: 'dialogue', speaker: '甲', text: '后。' });
  }
});

test('keeps a closed local now_plot pair owned by an open outer stream', () => {
  const local = '<now_plot>坏。</now_plot>';
  const body = `前。\n\n${local}\n\n{甲}「后。」\n\n`;
  const source = currentResponse(body);
  const complete = parseNarrative(source);
  const streaming = parseStreamingNarrative(source.replace('</now_plot></content>', ''));

  assert.deepEqual(streaming.blocks, complete.blocks);
  assert.deepEqual(streaming.blocks.map((block) => block.type), ['narration', 'invalid', 'dialogue']);
  assert.equal(streaming.blocks[1].rawText, local);
  assert.deepEqual(streaming.blocks[2], { type: 'dialogue', speaker: '甲', text: '后。' });
  assert.equal(streaming.progressText, '');
});

test('keeps a closed local now_plot pair owned when any later completed sibling proves the outer stream continues', () => {
  const local = '<now_plot>坏。</now_plot>';
  const siblingCases = [
    ['narration', '后。\n\n', 'narration'],
    ['scene', '<scene location="王都" time="下午" mood="静">后。</scene>', 'scene'],
    ['ability', ability(), 'ability'],
    ['check', '<check type="观察" actor="甲" target="乙">成功。</check>', 'check'],
    ['restart', '<restart deathId="loop-1" checkpoint="起点">重启。</restart>', 'restart'],
    ['dialogue', '{甲}「后。」', 'dialogue'],
    ['player dialogue', '{#}「后。」', 'player-dialogue'],
  ];

  for (const [label, sibling, siblingType] of siblingCases) {
    const source = currentResponse(`前。\n\n${local}\n\n${sibling}\n\n`);
    const complete = parseNarrative(source);
    const streaming = parseStreamingNarrative(source.replace('</now_plot></content>', ''));

    assert.deepEqual(streaming.blocks, complete.blocks, label);
    assert.deepEqual(streaming.blocks.map((block) => block.type), ['narration', 'invalid', siblingType], label);
    assert.equal(streaming.blocks[1].rawText, local, label);
    assert.equal(streaming.progressText, '', label);
  }
});

test('follow-up: a closed local now_plot pair cannot substitute for the missing established outer close', () => {
  const local = '<now_plot>坏。</now_plot>';
  const source = '<content><story volume="01">第01卷｜开始的余温</story><time period="下午" layer="主线" basis="编辑演算">魔女历1000年01月01日</time><now_plot>'
    + `前。\n\n${local}</content>`;
  const complete = parseNarrative(source);
  const streaming = parseStreamingNarrative(source);

  for (const result of [complete, streaming]) {
    assert.equal(result.ok, false);
    assert.deepEqual(result.blocks.map((block) => block.type), ['narration', 'invalid']);
    assert.equal(result.blocks[1].rawText, local);
  }
  assert.equal(streaming.streaming, false);
  assert.equal(streaming.complete, true);
  assert.equal(streaming.progressText, '');
});

test('keeps the sole close with a complete unsupported now_plot pair instead of promoting its dialogue', () => {
  const local = '<now_plot>坏一。\n\n{甲}「坏二。」</now_plot>';
  const source = '<content><story volume="01">第01卷｜开始的余温</story><time period="下午" layer="主线" basis="编辑演算">魔女历1000年01月01日</time><now_plot>'
    + `${local}</content>`;
  const complete = parseNarrative(source);
  const streaming = parseStreamingNarrative(source);

  for (const result of [complete, streaming]) {
    assert.equal(result.ok, false);
    assert.ok(errorCodes(result).includes('invalid-root-structure'));
    assert.deepEqual(result.blocks.map((block) => block.type), ['invalid']);
    assert.equal(result.blocks[0].rawText, local);
    assert.equal(result.blocks.some((block) => block.type === 'dialogue'), false);
  }
  assert.equal(streaming.streaming, false);
  assert.equal(streaming.complete, true);
  assert.equal(streaming.progressText, '');
});

test('keeps a complete unsupported now_plot pair atomic after preceding outer narration while awaiting the true outer close', () => {
  const local = '<now_plot>坏一。\n\n{甲}「坏二。」</now_plot>';
  const openSource = '<content><story volume="01">第01卷｜开始的余温</story><time period="下午" layer="主线" basis="编辑演算">魔女历1000年01月01日</time><now_plot>'
    + `前。\n\n${local}`;
  const closedSource = `${openSource}</now_plot></content>`;
  const openStreaming = parseStreamingNarrative(openSource);
  const closedStreaming = parseStreamingNarrative(closedSource);

  assert.equal(openStreaming.streaming, true);
  assert.equal(openStreaming.complete, false);
  assert.deepEqual(openStreaming.blocks, closedStreaming.blocks);
  assert.deepEqual(openStreaming.blocks, [
    { type: 'narration', text: '前。' },
    {
      type: 'invalid',
      status: 'invalid',
      reason: 'unsupported-child',
      rawText: local,
    },
  ]);
  assert.equal(openStreaming.blocks.some((block) => block.type === 'dialogue'), false);
  assert.equal(openStreaming.progressText, '');
  assert.equal(closedStreaming.streaming, false);
  assert.equal(closedStreaming.complete, true);
});

test('abandons an unsupported now_plot opener at recovery while preserving the established close', () => {
  const local = '<now_plot>坏。\n\n';
  const source = '<content><story volume="01">第01卷｜开始的余温</story><time period="下午" layer="主线" basis="编辑演算">魔女历1000年01月01日</time><now_plot>'
    + `${local}后续旁白。</now_plot></content>`;
  const complete = parseNarrative(source);
  const streaming = parseStreamingNarrative(source);

  for (const result of [complete, streaming]) {
    assert.equal(result.ok, true);
    assert.equal(errorCodes(result).includes('invalid-root-structure'), false);
    assert.deepEqual(result.blocks.map((block) => block.type), ['invalid', 'narration']);
    assert.equal(result.blocks[0].rawText, local);
    assert.deepEqual(result.blocks[1], { type: 'narration', text: '后续旁白。' });
  }
  assert.equal(streaming.streaming, false);
  assert.equal(streaming.complete, true);
  assert.equal(streaming.progressText, '');
});

test('entity-decoded braces cannot supply closed now_plot dialogue ownership evidence', () => {
  const terminal = '</now_plot></content>';
  const header = currentResponse('').slice(0, -terminal.length);

  for (const lineEnding of ['\n', '\r\n', '\r']) {
    const local = `<now_plot>坏。${lineEnding}${lineEnding}`;
    const source = `${header}${local}&#123;甲&#125;「实体伪装。」${terminal}`;

    for (const result of [parseNarrative(source), parseStreamingNarrative(source)]) {
      assert.equal(result.ok, true, JSON.stringify(lineEnding));
      assert.equal(errorCodes(result).includes('invalid-root-structure'), false, JSON.stringify(lineEnding));
      assert.deepEqual(result.blocks.map((block) => block.type), ['invalid', 'narration'], JSON.stringify(lineEnding));
      assert.equal(result.blocks[0].rawText, local, JSON.stringify(lineEnding));
      assert.deepEqual(
        result.blocks[1],
        { type: 'narration', text: '{甲}「实体伪装。」' },
        JSON.stringify(lineEnding),
      );
    }
  }
});

test('rejects standalone brace-dialogue paragraphs inside structured text while preserving a later sibling', () => {
  const structuredCases = [
    ['scene', '<scene location="王都" time="下午" mood="静">场景。\n\n{甲}「被嵌套」</scene>'],
    [
      'ability effect',
      '<ability user="甲" name="技" kind="魔法"><effect>发动。\n\n{甲}「被嵌套」</effect><description>说明。</description></ability>',
    ],
    [
      'ability description',
      '<ability user="甲" name="技" kind="魔法"><effect>发动。</effect><description>说明。\n\n{#}「被嵌套」</description></ability>',
    ],
    ['check', '<check type="观察" actor="甲" target="乙">结果。\n\n{#}「被嵌套」</check>'],
    ['restart', '<restart deathId="loop-1" checkpoint="起点">重启。\n\n{甲}「被嵌套」</restart>'],
  ];

  for (const [label, structured] of structuredCases) {
    const source = currentResponse(`${structured}\n\n{乙}「合法同级」\n\n`);
    const complete = parseNarrative(source);
    const streaming = parseStreamingNarrative(source.replace('</now_plot></content>', ''));

    assert.deepEqual(streaming.blocks, complete.blocks, label);
    assert.deepEqual(complete.blocks.map((block) => block.type), ['invalid', 'dialogue'], label);
    assert.equal(complete.blocks[0].rawText, structured, label);
    assert.deepEqual(complete.blocks[1], { type: 'dialogue', speaker: '乙', text: '合法同级' }, label);
    assert.equal(streaming.progressText, '', label);
  }
});

test('follow-up: rejects entity-decoded standalone dialogue in every shared structured-text owner', () => {
  const encodedDialogue = '&#123;甲&#125;「被嵌套」';
  const structuredCases = [
    ['scene', `<scene location="王都" time="下午" mood="静">场景。\n\n${encodedDialogue}</scene>`],
    [
      'ability effect',
      `<ability user="甲" name="技" kind="魔法"><effect>发动。\n\n${encodedDialogue}</effect><description>说明。</description></ability>`,
    ],
    [
      'ability description',
      `<ability user="甲" name="技" kind="魔法"><effect>发动。</effect><description>说明。\n\n${encodedDialogue}</description></ability>`,
    ],
    ['check', `<check type="观察" actor="甲" target="乙">结果。\n\n${encodedDialogue}</check>`],
    ['restart', `<restart deathId="loop-1" checkpoint="起点">重启。\n\n${encodedDialogue}</restart>`],
  ];

  for (const [label, structured] of structuredCases) {
    const source = currentResponse(`${structured}\n\n{乙}「合法同级」\n\n`);
    const complete = parseNarrative(source);
    const streaming = parseStreamingNarrative(source.replace('</now_plot></content>', ''));

    assert.deepEqual(streaming.blocks, complete.blocks, label);
    assert.deepEqual(complete.blocks.map((block) => block.type), ['invalid', 'dialogue'], label);
    assert.equal(complete.blocks[0].rawText, structured, label);
    assert.deepEqual(complete.blocks[1], { type: 'dialogue', speaker: '乙', text: '合法同级' }, label);
    assert.equal(streaming.progressText, '', label);
  }
});

test('rejects nested special protocol blocks locally', () => {
  const source = currentResponse('<scene location="王都" time="下午" mood="不安"><check type="观察" actor="甲" target="乙">成功。</check></scene>');
  const result = parseNarrative(source);

  assert.equal(result.ok, true);
  assert.equal(result.blocks[0].type, 'invalid');
  assert.equal(result.blocks[0].status, 'invalid');
});

test('requires current ability children in effect then description order', () => {
  const children = '<description>说明。</description><effect>发动。</effect>';
  const result = parseNarrative(currentResponse(ability('', children)));

  assert.equal(result.blocks[0].type, 'invalid');
  assert.equal(result.blocks[0].status, 'invalid');
});

test('accepts current ability descriptions containing one through three nonempty sentences', () => {
  for (const description of ['没有终止符的一句', '一。二！？三?']) {
    const children = `<effect>发动。</effect><description>${description}</description>`;
    const result = parseNarrative(currentResponse(ability('', children)));

    assert.equal(result.blocks[0].type, 'ability', description);
    assert.equal(result.blocks[0].description, description, description);
  }
});

test('rejects a current ability description containing four sentences', () => {
  const children = '<effect>发动。</effect><description>一。二。三。四。</description>';
  const result = parseNarrative(currentResponse(ability('', children)));

  assert.equal(result.blocks[0].type, 'invalid');
  assert.equal(result.blocks[0].status, 'invalid');
});

test('counts ASCII full stops followed by protocol whitespace or description end', () => {
  const children = '<effect>发动。</effect><description>One. Two. Three. Four.</description>';
  const result = parseNarrative(currentResponse(ability('', children)));

  assert.equal(result.blocks[0].type, 'invalid');
  assert.equal(result.blocks[0].status, 'invalid');
});

test('keeps dotted abbreviations inside an ASCII sentence', () => {
  const description = 'Use e.g. fire. Then wait. Finally move.';
  const children = `<effect>发动。</effect><description>${description}</description>`;
  const result = parseNarrative(currentResponse(ability('', children)));

  assert.equal(result.blocks[0].type, 'ability');
  assert.equal(result.blocks[0].description, description);
});

test('keeps a common title abbreviation inside an ASCII sentence', () => {
  const description = 'Dr. Smith acts. Then waits. Finally leaves.';
  const children = `<effect>发动。</effect><description>${description}</description>`;
  const result = parseNarrative(currentResponse(ability('', children)));

  assert.equal(result.blocks[0].type, 'ability');
  assert.equal(result.blocks[0].description, description);
});

test('counts terminators followed by quote closers as sentence boundaries', () => {
  const children = '<effect>发动。</effect><description>“One.” “Two.” “Three.” “Four.”</description>';
  const result = parseNarrative(currentResponse(ability('', children)));

  assert.equal(result.blocks[0].type, 'invalid');
  assert.equal(result.blocks[0].status, 'invalid');
});

test('counts quote-closed one-letter ASCII sentences as separate sentences', () => {
  const children = '<effect>发动。</effect><description>“A.” “B.” “C.” “D.”</description>';
  const result = parseNarrative(currentResponse(ability('', children)));

  assert.equal(result.blocks[0].type, 'invalid');
  assert.equal(result.blocks[0].status, 'invalid');
});

test('keeps dots embedded in description tokens and ellipsis runs within one sentence', () => {
  for (const description of [
    'Lv.2 的效果。',
    '倍率为 1.5。',
    '参照 example.com/path。',
    'e.g.效果。',
    'i.e.效果。',
    '等待...然后行动。',
  ]) {
    const children = `<effect>发动。</effect><description>${description}</description>`;
    const result = parseNarrative(currentResponse(ability('', children)));

    assert.equal(result.blocks[0].type, 'ability', description);
    assert.equal(result.blocks[0].description, description, description);
  }
});

test('counts near-limit dotted ability descriptions in linear time', () => {
  const description = `${'A.'.repeat(16_380)}终。`;
  const abilities = Array.from({ length: 7 }, (_, index) => (
    `<ability user="测试者" name="技能${index}" kind="魔法">`
    + `<effect>发动。</effect><description>${description}</description></ability>`
  ));
  const source = currentResponse(abilities.join(''));
  assert.ok(description.length > LIMITS.BLOCK_TEXT - 16);
  assert.ok(source.length < LIMITS.SOURCE);

  const started = performance.now();
  const result = parseNarrative(source);
  const elapsedMs = performance.now() - started;

  assert.ok(elapsedMs < 2_000, `parse took ${elapsedMs.toFixed(1)}ms`);
  assert.equal(result.blocks.length, 7);
  assert.equal(result.blocks.every((block) => block.type === 'ability'), true);
  assert.deepEqual(result.blocks.map((block) => block.name), abilities.map((_, index) => `技能${index}`));
});

test('does not apply the current description sentence limit to a legacy desc attribute', () => {
  const result = parseNarrative(currentResponse(ability(' desc="一。二。三。四。"', '发动。')));

  assert.equal(result.blocks[0].type, 'ability');
  assert.equal(result.blocks[0].protocol, 'legacy-readonly');
  assert.equal(result.blocks[0].description, '一。二。三。四。');
});

for (const [label, boundary] of [
  ['LF', '\n\n'],
  ['CRLF', '\r\n\r\n'],
  ['lone CR', '\r\r'],
]) {
  test(`keeps a completed ability atomic across ${label} protocol whitespace`, () => {
    const children = `<effect>发动。</effect>${boundary}<description>说明。</description>`;
    const source = currentResponse(ability('', children));
    const complete = parseNarrative(source);
    const streaming = parseStreamingNarrative(source.replace('</now_plot></content>', ''));

    for (const result of [complete, streaming]) {
      assert.deepEqual(result.blocks.map((block) => block.type), ['ability'], label);
      assert.equal(result.blocks[0].effect, '发动。', label);
      assert.equal(result.blocks[0].description, '说明。', label);
    }
    assert.equal(streaming.streaming, true, label);
    assert.equal(streaming.complete, false, label);
    assert.equal(streaming.progressText, '', label);
  });
}

test('splits a response with no UpdateVariable block without rewriting content', () => {
  const content = currentResponse('正文。');

  assert.deepEqual(splitUpdateVariable(content), {
    ok: true,
    content,
    separator: '',
    updateVariable: null,
    errors: [],
  });
});

test('preserves one trailing UpdateVariable block and its separator exactly', () => {
  const content = currentResponse('正文。');
  const separator = '\r\n  ';
  const updateVariable = '<UpdateVariable>\n {"原样":"<&>"}\r\n</UpdateVariable>';
  const source = content + separator + updateVariable;

  assert.deepEqual(splitUpdateVariable(source), {
    ok: true,
    content,
    separator,
    updateVariable,
    errors: [],
  });
  assert.equal(parseNarrative(source).updateVariable, updateVariable);
});

test('partitions the public complete fixture byte-for-byte', () => {
  const source = fixture('complete.xml');
  const split = splitUpdateVariable(source);

  assert.equal(split.ok, true);
  assert.equal(split.content + split.separator + split.updateVariable, source);
  assert.equal(parseNarrative(source).updateVariable, split.updateVariable);
});

test('retains legal trailing protocol whitespace in the UpdateVariable partition', () => {
  const content = currentResponse('正文。');
  const updateVariable = '<UpdateVariable>{"计数":1}</UpdateVariable>';

  for (const suffix of ['', '\n', '\r\n', '\r']) {
    const source = `${content}\n${updateVariable}${suffix}`;
    const split = splitUpdateVariable(source);

    assert.equal(split.ok, true, JSON.stringify(suffix));
    assert.equal(split.content + split.separator + split.updateVariable, source, JSON.stringify(suffix));
    assert.equal(split.updateVariable, updateVariable + suffix, JSON.stringify(suffix));
    assert.equal(parseNarrative(source).updateVariable, updateVariable + suffix, JSON.stringify(suffix));
  }
});

test('splits only an UpdateVariable suffix outside the structurally closed content root', () => {
  const body = '前段。\n\n<UpdateVariable>{}</UpdateVariable>\n\n{甲}「后段。」';
  const content = currentResponse(body);
  const separator = '\r\n  ';
  const external = '<UpdateVariable>{"计数":1}</UpdateVariable>';

  assert.deepEqual(splitUpdateVariable(content), {
    ok: true,
    content,
    separator: '',
    updateVariable: null,
    errors: [],
  });
  assert.deepEqual(splitUpdateVariable(content + separator + external), {
    ok: true,
    content,
    separator,
    updateVariable: external,
    errors: [],
  });

  const result = parseNarrative(content + separator + external);
  assert.equal(result.ok, true);
  assert.deepEqual(result.blocks.map((block) => block.type), ['narration', 'invalid', 'dialogue']);
  assert.deepEqual(result.blocks[0], { type: 'narration', text: '前段。' });
  assert.equal(result.blocks[1].rawText, '<UpdateVariable>{}</UpdateVariable>');
  assert.deepEqual(result.blocks[2], { type: 'dialogue', speaker: '甲', text: '后段。' });
  assert.equal(result.updateVariable, external);
});

test('keeps opening-tag text inside an opaque UpdateVariable payload', () => {
  const content = currentResponse('正文。');
  const updateVariable = '<UpdateVariable>{"literal":"<UpdateVariable>"}</UpdateVariable>';

  assert.deepEqual(splitUpdateVariable(content + updateVariable), {
    ok: true,
    content,
    separator: '',
    updateVariable,
    errors: [],
  });
});

test('preserves a normal opaque JSON UpdateVariable payload exactly', () => {
  const content = currentResponse('正文。');
  const updateVariable = '<UpdateVariable>{"nested":{"tag":"<x>","values":[1,2]}}</UpdateVariable>';

  assert.deepEqual(splitUpdateVariable(content + '\n' + updateVariable), {
    ok: true,
    content,
    separator: '\n',
    updateVariable,
    errors: [],
  });
});

test('uses the first UpdateVariable close even when matching text appears in opaque payload', () => {
  const content = currentResponse('正文。');
  const source = `${content}<UpdateVariable>{"literal":"</UpdateVariable>"}</UpdateVariable>`;
  const result = splitUpdateVariable(source);

  assert.equal(result.ok, false);
  assert.ok(errorCodes(result).includes('invalid-update-variable-trailing-content'));
});

test('classifies a later UpdateVariable block after garbage as multiple', () => {
  const content = currentResponse('正文。');
  const block = '<UpdateVariable>{}</UpdateVariable>';
  const result = splitUpdateVariable(`${content}${block}garbage${block}`);

  assert.equal(result.ok, false);
  assert.ok(errorCodes(result).includes('multiple-update-variable'));
});

test('classifies a partial second UpdateVariable opener as trailing content', () => {
  const content = currentResponse('正文。');
  const block = '<UpdateVariable>{}</UpdateVariable>';
  const result = splitUpdateVariable(`${content}${block}\n<UpdateVariable`);

  assert.equal(result.ok, false);
  assert.ok(errorCodes(result).includes('invalid-update-variable-trailing-content'));
});

test('rejects duplicate trailing UpdateVariable blocks', () => {
  const content = currentResponse('正文。');
  const block = '<UpdateVariable>{}</UpdateVariable>';
  const result = splitUpdateVariable(`${content}${block}${block}`);

  assert.equal(result.ok, false);
  assert.ok(errorCodes(result).includes('multiple-update-variable'));
});

test('rejects a partial trailing UpdateVariable block', () => {
  const result = splitUpdateVariable(currentResponse('正文。') + '<UpdateVariable>{');

  assert.equal(result.ok, false);
  assert.ok(errorCodes(result).includes('incomplete-update-variable'));
});

test('rejects non-whitespace after a completed UpdateVariable block', () => {
  const result = splitUpdateVariable(currentResponse('正文。') + '<UpdateVariable>{}</UpdateVariable>garbage');

  assert.equal(result.ok, false);
  assert.ok(errorCodes(result).includes('invalid-update-variable-trailing-content'));
});

test('splits UpdateVariable after a structurally closed but schema-invalid root', () => {
  const content = '<content><story volume="01">第01卷｜开始的余温</story><story volume="02">第02卷｜救赎的开始</story><time period="下午" layer="主线" basis="编辑演算">魔女历1000年01月01日</time><now_plot>正文。</now_plot></content>';
  const separator = '\n';
  const updateVariable = '<UpdateVariable>{"x":1}</UpdateVariable>';
  const source = content + separator + updateVariable;

  assert.deepEqual(splitUpdateVariable(source), {
    ok: true,
    content,
    separator,
    updateVariable,
    errors: [],
  });

  const result = parseStreamingNarrative(source);
  assert.equal(result.ok, false);
  assert.equal(result.streaming, false);
  assert.equal(result.complete, true);
  assert.equal(result.updateVariable, updateVariable);
  assert.equal(result.progressText, '');
  assert.ok(errorCodes(result).includes('invalid-root-structure'));
});

test('splits UpdateVariable after a closed root with an invalid child after now_plot', () => {
  const content = '<content><story volume="01">第01卷｜开始的余温</story><time period="下午" layer="主线" basis="编辑演算">魔女历1000年01月01日</time><now_plot>正文。</now_plot><extra></extra></content>';
  const separator = '\n';
  const updateVariable = '<UpdateVariable>{"x":1}</UpdateVariable>';
  const source = content + separator + updateVariable;

  assert.deepEqual(splitUpdateVariable(source), {
    ok: true,
    content,
    separator,
    updateVariable,
    errors: [],
  });

  const result = parseStreamingNarrative(source);
  assert.equal(result.ok, false);
  assert.equal(result.streaming, false);
  assert.equal(result.complete, true);
  assert.equal(result.updateVariable, updateVariable);
  assert.equal(result.progressText, '');
  assert.ok(errorCodes(result).includes('invalid-root-structure'));
});

test('splits UpdateVariable when root schema deviations surround now_plot', () => {
  const content = '<content><story volume="01">第01卷｜开始的余温</story><story volume="02">第02卷｜救赎的开始</story><time period="下午" layer="主线" basis="编辑演算">魔女历1000年01月01日</time><now_plot>正文。</now_plot><extra></extra></content>';
  const updateVariable = '<UpdateVariable>{"x":1}</UpdateVariable>';
  const source = `${content}\n${updateVariable}`;

  assert.equal(splitUpdateVariable(source).updateVariable, updateVariable);

  const result = parseStreamingNarrative(source);
  assert.equal(result.ok, false);
  assert.equal(result.streaming, false);
  assert.equal(result.complete, true);
  assert.equal(result.updateVariable, updateVariable);
  assert.ok(errorCodes(result).includes('invalid-root-structure'));
});

test('follow-up: recovers a real closed root after illegal leading text for exact suffix splitting only', () => {
  const content = currentResponse('正文。');
  const updateVariable = '<UpdateVariable>{"x":1}</UpdateVariable>';
  const prefixes = [
    'x',
    'x<junk note="<content></content>"><content></content></junk>',
  ];

  for (const prefix of prefixes) {
    const displayContent = prefix + content;
    const source = `${displayContent}\n${updateVariable}`;

    assert.deepEqual(splitUpdateVariable(source), {
      ok: true,
      content: displayContent,
      separator: '\n',
      updateVariable,
      errors: [],
    }, prefix);

    const result = parseStreamingNarrative(source);
    assert.equal(result.ok, false, prefix);
    assert.equal(result.streaming, false, prefix);
    assert.equal(result.complete, true, prefix);
    assert.equal(result.updateVariable, updateVariable, prefix);
    assert.equal(result.progressText, '', prefix);
  }
});

test('streaming parsing returns only completed safe blocks and leaves an unfinished ability inert', () => {
  const result = parseStreamingNarrative(fixture('streaming.xml'));

  assert.equal(result.ok, true);
  assert.equal(result.streaming, true);
  assert.equal(result.complete, false);
  assert.deepEqual(result.blocks.map((block) => block.type), ['narration', 'dialogue', 'scene']);
  assert.equal(result.blocks.some((block) => block.type === 'ability'), false);
  assert.match(result.progressText, /尾部正在生成/);
  assert.match(result.progressText, /<ability/);
  assert.equal(result.updateVariable, null);
});

test('streaming parsing completes a plain paragraph before a lone-CR blank boundary', () => {
  const source = currentResponse('已完成。\r\r仍在生成').replace('</now_plot></content>', '');
  const result = parseStreamingNarrative(source);

  assert.deepEqual(result.blocks, [{ type: 'narration', text: '已完成。' }]);
  assert.equal(result.progressText, '仍在生成');
});

for (const [label, boundary] of [
  ['LF', '\n\n'],
  ['CRLF', '\r\n\r\n'],
  ['lone CR', '\r\r'],
]) {
  test(`streaming parsing recovers completed siblings after an abandoned block across ${label}`, () => {
    const check = '<check type="观察" actor="甲" target="乙">成功。</check>';
    const body = `<scene location="王都" time="下午" mood="不安">未闭合。${boundary}{甲}「好。」${boundary}${check}`;
    const source = currentResponse(body).replace('</now_plot></content>', '');
    const result = parseStreamingNarrative(source);

    assert.deepEqual(result.blocks.map((block) => block.type), ['invalid', 'dialogue', 'check']);
    assert.equal(result.blocks.filter((block) => block.reason === 'invalid-local-block').length, 1);
    assert.doesNotMatch(result.blocks[0].rawText, /\{甲\}/u);
    assert.deepEqual(result.blocks[1], { type: 'dialogue', speaker: '甲', text: '好。' });
    assert.equal(result.blocks[2].text, '成功。');
    assert.equal(result.progressText, '');
    assert.ok(errorCodes(result).includes('invalid-local-block'));
    assert.equal(errorCodes(result).includes('stream-incomplete-special'), false);
  });
}

test('streaming parsing recovers after a malformed opener reaches a blank boundary', () => {
  const body = '<scene location="王都\n\n{乙}「仍在。」\n\n';
  const source = currentResponse(body).replace('</now_plot></content>', '');
  const result = parseStreamingNarrative(source);

  assert.deepEqual(result.blocks.map((block) => block.type), ['invalid', 'dialogue']);
  assert.equal(result.blocks[0].reason, 'invalid-local-block');
  assert.doesNotMatch(result.blocks[0].rawText, /\{乙\}/u);
  assert.deepEqual(result.blocks[1], { type: 'dialogue', speaker: '乙', text: '仍在。' });
  assert.equal(result.progressText, '');
});

test('streaming parsing keeps an unmatched block without a recovery boundary entirely in progress', () => {
  const body = '<scene location="王都" time="下午" mood="不安">未闭合。<check type="观察" actor="甲" target="乙">成功。</check>';
  const source = currentResponse(body).replace('</now_plot></content>', '');
  const result = parseStreamingNarrative(source);

  assert.deepEqual(result.blocks, []);
  assert.equal(result.progressText, body);
  assert.ok(errorCodes(result).includes('stream-incomplete-special'));
  assert.equal(errorCodes(result).includes('invalid-local-block'), false);
});

test('streaming parsing keeps dialogue-looking tails atomic inside unfinished structured owners', () => {
  const cases = [
    {
      label: 'scene',
      prefix: '<scene location="王都" time="下午" mood="静">场景。\n\n{甲}「被嵌套」',
      suffix: '尾</scene>',
      type: 'scene',
    },
    {
      label: 'check',
      prefix: '<check type="观察" actor="甲" target="乙">判定。\n\n{甲}「被嵌套」',
      suffix: '尾</check>',
      type: 'check',
    },
    {
      label: 'restart',
      prefix: '<restart deathId="loop-1" checkpoint="起点">重启。\n\n{甲}「被嵌套」',
      suffix: '尾</restart>',
      type: 'restart',
    },
    {
      label: 'ability effect',
      prefix: '<ability user="甲" name="技" kind="魔法"><effect>发动。\n\n{甲}「被嵌套」',
      suffix: '尾</effect><description>说明。</description></ability>',
      type: 'ability',
    },
    {
      label: 'ability description',
      prefix: '<ability user="甲" name="技" kind="魔法"><effect>发动。</effect><description>说明。\n\n{#}「被嵌套」',
      suffix: '尾</description></ability>',
      type: 'ability',
    },
  ];

  for (const { label, prefix, suffix, type } of cases) {
    const streamingSource = currentResponse(prefix).replace('</now_plot></content>', '');
    const streaming = parseStreamingNarrative(streamingSource);
    const completed = parseNarrative(currentResponse(prefix + suffix));

    assert.deepEqual(streaming.blocks, [], label);
    assert.equal(streaming.progressText, prefix, label);
    assert.ok(errorCodes(streaming).includes('stream-incomplete-special'), label);
    assert.equal(errorCodes(streaming).includes('invalid-local-block'), false, label);
    assert.equal(completed.ok, true, label);
    assert.deepEqual(completed.blocks.map((block) => block.type), [type], label);
    assert.deepEqual(errorCodes(completed), [], label);
  }
});

test('streaming parsing keeps entity-decoded dialogue-looking tails inert inside unfinished structured owners', () => {
  const encodedDialogue = '&#123;甲&#125;「被嵌套」';
  const cases = [
    {
      label: 'scene',
      prefix: `<scene location="王都" time="下午" mood="静">场景。\n\n${encodedDialogue}`,
      suffix: '尾</scene>',
      type: 'scene',
    },
    {
      label: 'check',
      prefix: `<check type="观察" actor="甲" target="乙">判定。\n\n${encodedDialogue}`,
      suffix: '尾</check>',
      type: 'check',
    },
    {
      label: 'restart',
      prefix: `<restart deathId="loop-1" checkpoint="起点">重启。\n\n${encodedDialogue}`,
      suffix: '尾</restart>',
      type: 'restart',
    },
    {
      label: 'ability effect',
      prefix: `<ability user="甲" name="技" kind="魔法"><effect>发动。\n\n${encodedDialogue}`,
      suffix: '尾</effect><description>说明。</description></ability>',
      type: 'ability',
    },
    {
      label: 'ability description',
      prefix: `<ability user="甲" name="技" kind="魔法"><effect>发动。</effect><description>说明。\n\n${encodedDialogue}`,
      suffix: '尾</description></ability>',
      type: 'ability',
    },
  ];

  for (const { label, prefix, suffix, type } of cases) {
    const streamingSource = currentResponse(prefix).replace('</now_plot></content>', '');
    const streaming = parseStreamingNarrative(streamingSource);
    const completed = parseNarrative(currentResponse(prefix + suffix));

    assert.deepEqual(streaming.blocks, [], label);
    assert.equal(streaming.progressText, prefix, label);
    assert.ok(errorCodes(streaming).includes('stream-incomplete-special'), label);
    assert.equal(errorCodes(streaming).includes('invalid-local-block'), false, label);
    assert.equal(completed.ok, true, label);
    assert.deepEqual(completed.blocks.map((block) => block.type), [type], label);
    assert.deepEqual(errorCodes(completed), [], label);
  }
});

test('streaming parsing keeps a trailing partial ability inert across a blank boundary', () => {
  const body = '<ability user="甲" name="技" kind="魔法"><effect>发动。</effect>\n\n';
  const source = currentResponse(body).replace('</now_plot></content>', '');
  const result = parseStreamingNarrative(source);

  assert.equal(result.ok, true);
  assert.deepEqual(result.blocks, []);
  assert.equal(result.progressText, body.trim());
  assert.ok(errorCodes(result).includes('stream-incomplete-special'));
  assert.equal(errorCodes(result).includes('invalid-local-block'), false);
});

test('streaming parsing skips protocol whitespace before the first child of an unfinished ability', () => {
  const body = '<ability user="甲" name="技" kind="魔法">\n  <effect>发动。</effect>\n\n';
  const source = currentResponse(body).replace('</now_plot></content>', '');
  const result = parseStreamingNarrative(source);

  assert.deepEqual(result.blocks, []);
  assert.equal(result.progressText, body.trim());
  assert.ok(errorCodes(result).includes('stream-incomplete-special'));
  assert.equal(errorCodes(result).includes('invalid-local-block'), false);
});

test('streaming parsing keeps a still-completable ability child prefix wholly inert', () => {
  const body = '<ability user="甲" name="技" kind="魔法"><effect>发动。</effect>\n\n<description>说明。';
  const source = currentResponse(body).replace('</now_plot></content>', '');
  const result = parseStreamingNarrative(source);

  assert.deepEqual(result.blocks, []);
  assert.equal(result.progressText, body);
  assert.ok(errorCodes(result).includes('stream-incomplete-special'));
  assert.equal(errorCodes(result).includes('invalid-local-block'), false);
});

test('streaming parsing keeps a partial ability child opener wholly inert', () => {
  const body = '<ability user="甲" name="技" kind="魔法"><effect>发动。</effect>\n\n<descr';
  const source = currentResponse(body).replace('</now_plot></content>', '');
  const result = parseStreamingNarrative(source);

  assert.deepEqual(result.blocks, []);
  assert.equal(result.progressText, body);
  assert.ok(errorCodes(result).includes('stream-incomplete-special'));
  assert.equal(errorCodes(result).includes('invalid-local-block'), false);
});

test('streaming parsing keeps a still-completable multi-paragraph scene wholly inert', () => {
  const body = '<scene location="王都" time="下午" mood="不安">第一段。\n\n第二段仍在生成。';
  const source = currentResponse(body).replace('</now_plot></content>', '');
  const result = parseStreamingNarrative(source);

  assert.deepEqual(result.blocks, []);
  assert.equal(result.progressText, body);
  assert.ok(errorCodes(result).includes('stream-incomplete-special'));
  assert.equal(errorCodes(result).includes('invalid-local-block'), false);
});

test('streaming parsing keeps a multi-paragraph scene with a partial closer wholly inert', () => {
  const body = '<scene location="王都" time="下午" mood="不安">第一段。\n\n第二段。</sc';
  const source = currentResponse(body).replace('</now_plot></content>', '');
  const result = parseStreamingNarrative(source);

  assert.deepEqual(result.blocks, []);
  assert.equal(result.progressText, body);
  assert.ok(errorCodes(result).includes('stream-incomplete-special'));
  assert.equal(errorCodes(result).includes('invalid-local-block'), false);
});

test('streaming parsing does not label a closed full response as streaming', () => {
  const result = parseStreamingNarrative(fixture('complete.xml'));

  assert.equal(result.ok, true);
  assert.equal(result.streaming, false);
  assert.equal(result.complete, true);
  assert.equal(result.progressText, '');
  assert.equal(result.blocks.at(-1).type, 'restart');
});

test('streaming parsing retains a closed now_plot while content is still open', () => {
  const source = currentResponse('已完成。').replace('</content>', '');
  const result = parseStreamingNarrative(source);

  assert.equal(result.ok, true);
  assert.equal(result.streaming, true);
  assert.equal(result.complete, false);
  assert.equal(result.player, '菜月昴');
  assert.deepEqual(result.story, { volume: '01', heading: '第01卷｜开始的余温' });
  assert.equal(result.time.text, '魔女历1000年01月01日');
  assert.deepEqual(result.blocks, [{ type: 'narration', text: '已完成。' }]);
  assert.equal(result.progressText, '');
});

test('streaming parsing exposes only an unfinished content-close suffix after closed now_plot', () => {
  const suffix = '\r\n  </content';
  const source = currentResponse('已完成。').replace('</content>', suffix);
  const result = parseStreamingNarrative(source);

  assert.equal(result.ok, true);
  assert.equal(result.streaming, true);
  assert.equal(result.complete, false);
  assert.deepEqual(result.blocks, [{ type: 'narration', text: '已完成。' }]);
  assert.equal(result.progressText, '</content');
  assert.doesNotMatch(result.progressText, /<\/now_plot>/u);
});

test('root scanning ignores closing delimiters inside quoted local attributes', () => {
  for (const quote of ['"', "'"]) {
    const scene = `<scene location="王都" time="下午" mood=${quote}</now_plot>${quote}>场景。</scene>`;
    const body = `前段。\n\n${scene}\n\n{甲}「后段。」\n\n`;
    const source = currentResponse(body);
    const complete = parseNarrative(source);
    const closedStreaming = parseStreamingNarrative(source);
    const openStreaming = parseStreamingNarrative(source.replace('</now_plot></content>', ''));

    for (const result of [complete, closedStreaming, openStreaming]) {
      assert.equal(result.ok, true, quote);
      assert.deepEqual(result.blocks.map((block) => block.type), ['narration', 'invalid', 'dialogue'], quote);
      assert.deepEqual(result.blocks.at(-1), { type: 'dialogue', speaker: '甲', text: '后段。' }, quote);
    }
    assert.equal(closedStreaming.complete, true, quote);
    assert.equal(closedStreaming.streaming, false, quote);
    assert.equal(openStreaming.complete, false, quote);
    assert.equal(openStreaming.streaming, true, quote);
  }
});

test('root scanning keeps complete inert markup ranges from owning root closes', async (t) => {
  const variants = [
    ['HTML comment', '<!-- </now_plot> -->'],
    ['CDATA section', '<![CDATA[ </now_plot> ]]>'],
    ['processing instruction', '<?x </now_plot> ?>'],
    ['quoted declaration', '<!DOCTYPE x "</now_plot>">'],
  ];

  for (const [label, inert] of variants) {
    await t.test(label, () => {
      const paragraph = `前。${inert}后。`;
      const body = `${paragraph}\n\n{甲}「续。」\n\n`;
      const closedSource = currentResponse(body);
      const updateVariable = '<UpdateVariable>{"x":1}</UpdateVariable>';
      const fullSource = `${closedSource}\n${updateVariable}`;
      const complete = parseNarrative(fullSource);
      const closedStreaming = parseStreamingNarrative(fullSource);
      const openStreaming = parseStreamingNarrative(
        closedSource.replace('</now_plot></content>', ''),
      );

      for (const result of [complete, closedStreaming, openStreaming]) {
        assert.equal(result.ok, true);
        assert.deepEqual(result.blocks, [
          { type: 'narration', text: paragraph },
          { type: 'dialogue', speaker: '甲', text: '续。' },
        ]);
      }
      assert.equal(complete.updateVariable, updateVariable);
      assert.equal(closedStreaming.updateVariable, updateVariable);
      assert.equal(closedStreaming.streaming, false);
      assert.equal(closedStreaming.complete, true);
      assert.equal(openStreaming.streaming, true);
      assert.equal(openStreaming.complete, false);
      assert.equal(openStreaming.progressText, '');
    });
  }
});

test('DOCTYPE internal subsets cannot own protocol structure before the true outer close', () => {
  const terminal = '</now_plot></content>';
  const header = currentResponse('').slice(0, -terminal.length);
  const declaration = '<!DOCTYPE root [ <!ELEMENT root (#PCDATA)> </now_plot></content> ]>';
  const updateVariable = '<UpdateVariable>{"x":1}</UpdateVariable>';

  for (const lineEnding of ['\n', '\r\n', '\r']) {
    const content = `${header}${declaration}${lineEnding}${lineEnding}{甲}「后。」${terminal}`;
    const source = `${content}${lineEnding}${updateVariable}`;
    const expectedBlocks = [
      { type: 'narration', text: declaration },
      { type: 'dialogue', speaker: '甲', text: '后。' },
    ];

    const complete = parseNarrative(source);
    const streaming = parseStreamingNarrative(source);
    for (const result of [complete, streaming]) {
      assert.equal(result.ok, true, JSON.stringify(lineEnding));
      assert.deepEqual(result.blocks, expectedBlocks, JSON.stringify(lineEnding));
      assert.equal(result.updateVariable, updateVariable, JSON.stringify(lineEnding));
    }
    assert.equal(streaming.streaming, false, JSON.stringify(lineEnding));
    assert.equal(streaming.complete, true, JSON.stringify(lineEnding));
    assert.equal(streaming.progressText, '', JSON.stringify(lineEnding));

    const split = splitUpdateVariable(source);
    assert.equal(split.ok, true, JSON.stringify(lineEnding));
    assert.equal(split.content, content, JSON.stringify(lineEnding));
    assert.equal(split.separator, lineEnding, JSON.stringify(lineEnding));
    assert.equal(split.updateVariable, updateVariable, JSON.stringify(lineEnding));
    assert.equal(split.content + split.separator + split.updateVariable, source, JSON.stringify(lineEnding));
  }
});

test('DOCTYPE internal-subset protocol scanning honors quotes, nesting, and owned markup bytes', () => {
  const terminal = '</now_plot></content>';
  const header = currentResponse('').slice(0, -terminal.length);
  const declarations = [
    '<!DOCTYPE root>',
    '<!DOCTYPE root "[ > ]" \'[ > ]\'>',
    '<!DOCTYPE root [[ <!ELEMENT root (#PCDATA)> ]]>',
    '<!DOCTYPE root [ <!-- [ > ] </now_plot></content> --> <!ELEMENT root (#PCDATA)> ]>',
  ];

  for (const declaration of declarations) {
    const source = `${header}${declaration}\n\n{甲}「后。」${terminal}`;
    for (const result of [parseNarrative(source), parseStreamingNarrative(source)]) {
      assert.equal(result.ok, true, declaration);
      assert.deepEqual(result.blocks, [
        { type: 'narration', text: declaration },
        { type: 'dialogue', speaker: '甲', text: '后。' },
      ], declaration);
    }
  }
});

test('DOCTYPE nested comments preserve the exact declaration, true root closes, and terminal U', () => {
  const terminal = '</now_plot></content>';
  const header = currentResponse('').slice(0, -terminal.length);
  const declaration = '<!DOCTYPE root [ <!-- ] > </now_plot></content> **inside** --> <!ELEMENT root (#PCDATA)> ]>';
  const updateVariable = '<UpdateVariable>{"x":1}</UpdateVariable>';

  for (const lineEnding of ['\n', '\r\n', '\r']) {
    const content = `${header}${declaration}${lineEnding}${lineEnding}{甲}「后。」${terminal}`;
    const source = `${content}${lineEnding}${updateVariable}`;
    const expectedBlocks = [
      { type: 'narration', text: declaration },
      { type: 'dialogue', speaker: '甲', text: '后。' },
    ];

    for (const result of [parseNarrative(source), parseStreamingNarrative(source)]) {
      assert.equal(result.ok, true, JSON.stringify(lineEnding));
      assert.deepEqual(result.blocks, expectedBlocks, JSON.stringify(lineEnding));
      assert.equal(result.updateVariable, updateVariable, JSON.stringify(lineEnding));
    }

    const split = splitUpdateVariable(source);
    assert.equal(split.ok, true, JSON.stringify(lineEnding));
    assert.equal(split.content, content, JSON.stringify(lineEnding));
    assert.equal(split.separator, lineEnding, JSON.stringify(lineEnding));
    assert.equal(split.updateVariable, updateVariable, JSON.stringify(lineEnding));
    assert.equal(split.content + split.separator + split.updateVariable, source, JSON.stringify(lineEnding));
  }
});

test('invalid embedded DTD PI signatures preserve declaration ownership and terminal U', () => {
  const terminal = '</now_plot></content>';
  const header = currentResponse('').slice(0, -terminal.length);
  const declaration = '<!DOCTYPE root [ <? ]>';
  const updateVariable = '<UpdateVariable>{"u":"exact"}</UpdateVariable>';

  for (const lineEnding of ['\n', '\r\n', '\r']) {
    const content = `${header}${declaration}${lineEnding}${lineEnding}{甲}「后。」${terminal}`;
    const source = `${content}${lineEnding}${updateVariable}`;
    const expectedBlocks = [
      { type: 'narration', text: declaration },
      { type: 'dialogue', speaker: '甲', text: '后。' },
    ];

    for (const result of [parseNarrative(source), parseStreamingNarrative(source)]) {
      assert.equal(result.ok, true, JSON.stringify(lineEnding));
      assert.deepEqual(result.blocks, expectedBlocks, JSON.stringify(lineEnding));
      assert.equal(result.updateVariable, updateVariable, JSON.stringify(lineEnding));
    }

    const streaming = parseStreamingNarrative(source);
    assert.equal(streaming.streaming, false, JSON.stringify(lineEnding));
    assert.equal(streaming.complete, true, JSON.stringify(lineEnding));
    assert.equal(streaming.progressText, '', JSON.stringify(lineEnding));

    const split = splitUpdateVariable(source);
    assert.equal(split.ok, true, JSON.stringify(lineEnding));
    assert.equal(split.content, content, JSON.stringify(lineEnding));
    assert.equal(split.separator, lineEnding, JSON.stringify(lineEnding));
    assert.equal(split.updateVariable, updateVariable, JSON.stringify(lineEnding));
    assert.equal(split.content + split.separator + split.updateVariable, source, JSON.stringify(lineEnding));
  }
});

test('embedded DTD PIs require an immediate ASCII target lead', () => {
  const invalidDeclarations = [
    ['whitespace', '<!DOCTYPE root [ <? ]>'],
    ['question mark', '<!DOCTYPE root [ <?? ]>'],
    ['exclamation mark', '<!DOCTYPE root [ <?! ]>'],
    ['opening bracket', '<!DOCTYPE root [ <?[ ] ]>'],
    ['digit', '<!DOCTYPE root [ <?1 ]>'],
    ['non-ASCII', '<!DOCTYPE root [ <?名 ]>'],
  ];

  for (const [label, declaration] of invalidDeclarations) {
    assert.deepEqual(tokenizeInlineText(`${declaration}**after**`), [
      { type: 'text', text: declaration },
      { type: 'strong', text: 'after' },
    ], label);
  }

  const sourceEnd = '<!DOCTYPE root [ <?';
  assert.deepEqual(tokenizeInlineText(sourceEnd), [{ type: 'text', text: sourceEnd }]);

  const valid = '<!DOCTYPE root [ <?name ] > **inside**?> <!ELEMENT root (#PCDATA)> ]>';
  assert.deepEqual(tokenizeInlineText(`${valid}**after**`), [
    { type: 'text', text: valid },
    { type: 'strong', text: 'after' },
  ]);

  const quoted = '<!DOCTYPE root [ "<? ]> **quoted**" <!ELEMENT root (#PCDATA)> ]>';
  assert.deepEqual(tokenizeInlineText(`${quoted}**after**`), [
    { type: 'text', text: quoted },
    { type: 'strong', text: 'after' },
  ]);

  assert.deepEqual(tokenizeInlineText('<?name **inside**?>**after**'), [
    { type: 'text', text: '<?name **inside**?>' },
    { type: 'strong', text: 'after' },
  ]);
  assert.deepEqual(tokenizeInlineText('x <? y **after**'), [
    { type: 'text', text: 'x <? y ' },
    { type: 'strong', text: 'after' },
  ]);
});

test('near-limit invalid embedded DTD PI introducers scan within the linear budget', () => {
  const terminal = '</now_plot></content>';
  const header = currentResponse('').slice(0, -terminal.length);
  const declaration = `<!DOCTYPE root [ ${'<? '.repeat(62_000)}]>`;
  const content = `${header}${declaration}${terminal}`;
  const updateVariable = '<UpdateVariable>{"x":1}</UpdateVariable>';
  const source = `${content}\n${updateVariable}`;
  assert.ok(source.length > LIMITS.SOURCE * 0.7);
  assert.ok(source.length < LIMITS.SOURCE);

  const startedProtocol = performance.now();
  const split = splitUpdateVariable(source);
  const protocolElapsedMs = performance.now() - startedProtocol;
  const startedInline = performance.now();
  const inline = tokenizeInlineText(`${declaration}**after**`);
  const inlineElapsedMs = performance.now() - startedInline;

  assert.ok(protocolElapsedMs < 2_000, `protocol scan took ${protocolElapsedMs.toFixed(1)}ms`);
  assert.ok(inlineElapsedMs < 2_000, `inline scan took ${inlineElapsedMs.toFixed(1)}ms`);
  assert.equal(split.content, content);
  assert.equal(split.updateVariable, updateVariable);
  assert.equal(split.content + split.separator + split.updateVariable, source);
  assert.deepEqual(inline, [
    { type: 'text', text: declaration },
    { type: 'strong', text: 'after' },
  ]);
});

test('DOCTYPE nested lexical ownership covers PIs, repeats, depth, and quoted openers', () => {
  const terminal = '</now_plot></content>';
  const header = currentResponse('').slice(0, -terminal.length);
  const declarations = [
    '<!DOCTYPE root [ <?owned ] > </now_plot></content> **inside**?> <!ELEMENT root (#PCDATA)> ]>',
    '<!DOCTYPE root [[ <!-- [ ] > "\' </now_plot></content> **comment-a** <!ELEMENT fake ANY> --> <?first ] > </now_plot></content> **pi-a**?> ] <!-- ] [ > **comment-b** --> <?second ] > **pi-b**?> ]>',
    '<!DOCTYPE root [ "<!-- ] > </now_plot></content> **quoted-comment**" \'<?pi ] > </now_plot></content> **quoted-pi**\' <!ELEMENT root (#PCDATA)> ]>',
  ];

  for (const declaration of declarations) {
    const source = `${header}${declaration}\n\n{甲}「后。」${terminal}`;
    for (const result of [parseNarrative(source), parseStreamingNarrative(source)]) {
      assert.equal(result.ok, true, declaration);
      assert.deepEqual(result.blocks, [
        { type: 'narration', text: declaration },
        { type: 'dialogue', speaker: '甲', text: '后。' },
      ], declaration);
    }
  }
});

test('unterminated nested DOCTYPE comments and PIs use existing protocol blank recovery', () => {
  const terminal = '</now_plot></content>';
  const header = currentResponse('').slice(0, -terminal.length);
  const declarations = [
    '<!DOCTYPE root [ <!-- ] > </now_plot></content> **inside** <!ELEMENT fake ANY> ]>',
    '<!DOCTYPE root [ <?owned ] > </now_plot></content> **inside** <!ELEMENT fake ANY> ]>',
  ];

  for (const lineEnding of ['\n', '\r\n', '\r']) {
    for (const declaration of declarations) {
      const body = `前。${declaration}${lineEnding}${lineEnding}{甲}「后。」${lineEnding}${lineEnding}`;
      const closedSource = `${header}${body}${terminal}`;
      const results = [
        parseNarrative(closedSource),
        parseStreamingNarrative(closedSource),
        parseStreamingNarrative(closedSource.slice(0, -terminal.length)),
      ];

      for (const result of results) {
        assert.equal(result.ok, true, `${JSON.stringify(lineEnding)} ${declaration}`);
        assert.deepEqual(result.blocks.map((block) => block.type), [
          'narration',
          'invalid',
          'dialogue',
        ], `${JSON.stringify(lineEnding)} ${declaration}`);
        assert.equal(result.blocks[1].reason, 'invalid-local-block');
        assert.match(result.blocks[1].rawText, /<\/now_plot><\/content>/u);
        assert.doesNotMatch(result.blocks[1].rawText, /\{甲\}/u);
        assert.deepEqual(result.blocks[2], { type: 'dialogue', speaker: '甲', text: '后。' });
      }
    }
  }
});

test('nested DOCTYPE lexical states do not change ordinary protocol markup behavior', () => {
  const variants = [
    ['<!DOCTYPE root>', { type: 'narration', text: '<!DOCTYPE root>' }],
    ['<x></x>', {
      type: 'invalid',
      status: 'invalid',
      reason: 'unsupported-child',
      rawText: '<x></x>',
    }],
    ['<!-- ] > </now_plot> **inside** -->', {
      type: 'narration',
      text: '<!-- ] > </now_plot> **inside** -->',
    }],
    ['<?owned ] > </now_plot> **inside**?>', {
      type: 'narration',
      text: '<?owned ] > </now_plot> **inside**?>',
    }],
  ];

  for (const [inert, expectedFirstBlock] of variants) {
    const source = currentResponse(`${inert}\n\n{甲}「后。」`);
    for (const result of [parseNarrative(source), parseStreamingNarrative(source)]) {
      assert.equal(result.ok, true, inert);
      assert.deepEqual(result.blocks, [
        expectedFirstBlock,
        { type: 'dialogue', speaker: '甲', text: '后。' },
      ], inert);
    }
  }
});

test('unclosed DOCTYPE internal subsets recover at existing inert blank-line boundaries', () => {
  const terminal = '</now_plot></content>';
  const header = currentResponse('').slice(0, -terminal.length);
  const declaration = '<!DOCTYPE root [ <!ELEMENT root (#PCDATA)> </now_plot></content>';

  for (const lineEnding of ['\n', '\r\n', '\r']) {
    const body = `前。${declaration}${lineEnding}${lineEnding}{甲}「后。」${lineEnding}${lineEnding}`;
    const closedSource = `${header}${body}${terminal}`;
    const results = [
      parseNarrative(closedSource),
      parseStreamingNarrative(closedSource),
      parseStreamingNarrative(closedSource.slice(0, -terminal.length)),
    ];

    for (const result of results) {
      assert.equal(result.ok, true, JSON.stringify(lineEnding));
      assert.deepEqual(result.blocks.map((block) => block.type), [
        'narration',
        'invalid',
        'dialogue',
      ], JSON.stringify(lineEnding));
      assert.equal(result.blocks[1].reason, 'invalid-local-block', JSON.stringify(lineEnding));
      assert.match(result.blocks[1].rawText, /<\/now_plot><\/content>/u, JSON.stringify(lineEnding));
      assert.doesNotMatch(result.blocks[1].rawText, /\{甲\}/u, JSON.stringify(lineEnding));
      assert.deepEqual(result.blocks[2], { type: 'dialogue', speaker: '甲', text: '后。' });
    }
    assert.equal(results[1].streaming, false, JSON.stringify(lineEnding));
    assert.equal(results[1].complete, true, JSON.stringify(lineEnding));
    assert.equal(results[2].streaming, true, JSON.stringify(lineEnding));
    assert.equal(results[2].complete, false, JSON.stringify(lineEnding));
  }
});

test('near-limit nested DOCTYPE declarations remain within the linear scanning budget', () => {
  const terminal = '</now_plot></content>';
  const header = currentResponse('').slice(0, -terminal.length);
  const brackets = 120_000;
  const declaration = '<!DOCTYPE root '
    + '['.repeat(brackets)
    + '<!ELEMENT root (#PCDATA)>'
    + ']'.repeat(brackets)
    + '>';
  const content = `${header}${declaration}${terminal}`;
  const updateVariable = '<UpdateVariable>{"x":1}</UpdateVariable>';
  const source = `${content}\n${updateVariable}`;
  assert.ok(source.length < LIMITS.SOURCE);

  const startedProtocol = performance.now();
  const split = splitUpdateVariable(source);
  const protocolElapsedMs = performance.now() - startedProtocol;
  const startedInline = performance.now();
  const inline = tokenizeInlineText(`${declaration}**after**`);
  const inlineElapsedMs = performance.now() - startedInline;

  assert.ok(protocolElapsedMs < 2_000, `protocol scan took ${protocolElapsedMs.toFixed(1)}ms`);
  assert.ok(inlineElapsedMs < 2_000, `inline scan took ${inlineElapsedMs.toFixed(1)}ms`);
  assert.equal(split.content, content);
  assert.equal(split.updateVariable, updateVariable);
  assert.equal(split.content + split.separator + split.updateVariable, source);
  assert.deepEqual(inline, [
    { type: 'text', text: declaration },
    { type: 'strong', text: 'after' },
  ]);
});

test('near-limit repeated nested DOCTYPE comments and PIs scan within the linear budget', () => {
  const terminal = '</now_plot></content>';
  const header = currentResponse('').slice(0, -terminal.length);
  const owned = '<!-- ] > "\' </now_plot></content> **comment** <!ELEMENT fake ANY> -->'
    + '<?owned ] > </now_plot></content> **pi**?>';
  const declaration = `<!DOCTYPE root [ ${owned.repeat(2_000)} ]>`;
  const content = `${header}${declaration}${terminal}`;
  const updateVariable = '<UpdateVariable>{"x":1}</UpdateVariable>';
  const source = `${content}\n${updateVariable}`;
  assert.ok(source.length > LIMITS.SOURCE * 0.7);
  assert.ok(source.length < LIMITS.SOURCE);

  const startedProtocol = performance.now();
  const split = splitUpdateVariable(source);
  const protocolElapsedMs = performance.now() - startedProtocol;
  const startedInline = performance.now();
  const inline = tokenizeInlineText(`${declaration}**after**`);
  const inlineElapsedMs = performance.now() - startedInline;

  assert.ok(protocolElapsedMs < 2_000, `protocol scan took ${protocolElapsedMs.toFixed(1)}ms`);
  assert.ok(inlineElapsedMs < 2_000, `inline scan took ${inlineElapsedMs.toFixed(1)}ms`);
  assert.equal(split.content, content);
  assert.equal(split.updateVariable, updateVariable);
  assert.equal(split.content + split.separator + split.updateVariable, source);
  assert.deepEqual(inline, [
    { type: 'text', text: declaration },
    { type: 'strong', text: 'after' },
  ]);
});

test('comparisons using special-markup introducers do not own protocol closes', () => {
  const source = currentResponse('x <? y 与 **好**');
  const complete = parseNarrative(source);
  const streaming = parseStreamingNarrative(source);

  assert.equal(complete.ok, true);
  assert.deepEqual(complete.blocks, [{ type: 'narration', text: 'x <? y 与 **好**' }]);
  assert.equal(streaming.streaming, false);
  assert.equal(streaming.complete, true);
  assert.equal(parseNarrative(currentResponse('1 <! 2')).ok, true);
});

test('scanner C1 recovers unterminated inert ranges at a blank boundary', () => {
  const variants = [
    ['HTML comment', '<!-- 假关闭 </now_plot></content>'],
    ['CDATA section', '<![CDATA[ 假关闭 </now_plot></content>'],
    ['processing instruction', '<?x 假关闭 </now_plot></content>'],
    ['quoted declaration', '<!DOCTYPE x "</now_plot></content>'],
  ];
  const terminal = '</now_plot></content>';
  const updateVariable = '<UpdateVariable>{"x":1}</UpdateVariable>';

  for (const [label, inert] of variants) {
    const body = `前。${inert}\n\n{甲}「后。」\n\n`;
    const closedSource = currentResponse(body);
    const fullSource = `${closedSource}\n${updateVariable}`;
    const results = [
      parseNarrative(fullSource),
      parseStreamingNarrative(fullSource),
      parseStreamingNarrative(closedSource.slice(0, -terminal.length)),
    ];

    for (const result of results) {
      assert.equal(result.ok, true, label);
      assert.deepEqual(result.blocks.map((block) => block.type), ['narration', 'invalid', 'dialogue'], label);
      assert.equal(result.blocks[1].reason, 'invalid-local-block', label);
      assert.match(result.blocks[1].rawText, /<\/now_plot><\/content>/u, label);
      assert.doesNotMatch(result.blocks[1].rawText, /\{甲\}/u, label);
      assert.deepEqual(result.blocks[2], { type: 'dialogue', speaker: '甲', text: '后。' }, label);
    }
    assert.equal(results[0].updateVariable, updateVariable, label);
    assert.equal(results[1].updateVariable, updateVariable, label);
    assert.equal(results[1].streaming, false, label);
    assert.equal(results[1].complete, true, label);
    assert.equal(results[2].streaming, true, label);
    assert.equal(results[2].complete, false, label);
    assert.equal(results[2].progressText, '', label);
  }
});

test('scanner C1 resumes at a sibling after a new unquoted opener boundary', () => {
  const malformed = '<scene location="王都" time="下午" mood="不安" ';
  const check = '<check type="判定" actor="甲" target="乙">成功。</check>';
  const closedSource = currentResponse(malformed + check);
  const terminal = '</now_plot></content>';

  for (const result of [
    parseNarrative(closedSource),
    parseStreamingNarrative(closedSource.slice(0, -terminal.length)),
  ]) {
    assert.equal(result.ok, true);
    assert.deepEqual(result.blocks.map((block) => block.type), ['invalid', 'check']);
    assert.equal(result.blocks[0].reason, 'invalid-local-block');
    assert.equal(result.blocks[0].rawText, malformed);
    assert.deepEqual(result.blocks[1], {
      type: 'check',
      checkType: '判定',
      actor: '甲',
      target: '乙',
      text: '成功。',
    });
  }
});

test('scanner C1 keeps repeated unterminated inert prefixes sub-quadratic', () => {
  const source = (count) => currentResponse(`${'<!--'.repeat(count)}\n\n{甲}「后。」`);
  const measure = (parser, input) => {
    const samples = Array.from({ length: 7 }, () => {
      const started = performance.now();
      let result;
      for (let batch = 0; batch < 4; batch += 1) {
        result = parser(input);
      }
      return { elapsedMs: (performance.now() - started) / 4, result };
    }).sort((left, right) => left.elapsedMs - right.elapsedMs);
    return samples[Math.floor(samples.length / 2)];
  };

  const warmup = source(1_000);
  const small = source(8_000);
  const large = source(16_000);
  for (let iteration = 0; iteration < 4; iteration += 1) {
    parseNarrative(warmup);
    parseStreamingNarrative(warmup);
  }
  const completeSmall = measure(parseNarrative, small);
  const completeLarge = measure(parseNarrative, large);
  const streamingSmall = measure(parseStreamingNarrative, small);
  const streamingLarge = measure(parseStreamingNarrative, large);
  const completeRatio = completeLarge.elapsedMs / completeSmall.elapsedMs;
  const streamingRatio = streamingLarge.elapsedMs / streamingSmall.elapsedMs;

  assert.equal(completeLarge.result.ok, true);
  assert.equal(streamingLarge.result.streaming, false);
  assert.equal(streamingLarge.result.complete, true);
  assert.ok(
    completeRatio < 3 && streamingRatio < 3,
    'doubling inert prefixes must remain sub-quadratic: '
      + `complete ${completeSmall.elapsedMs.toFixed(1)}/${completeLarge.elapsedMs.toFixed(1)}ms `
      + `(${completeRatio.toFixed(2)}x), streaming `
      + `${streamingSmall.elapsedMs.toFixed(1)}/${streamingLarge.elapsedMs.toFixed(1)}ms `
      + `(${streamingRatio.toFixed(2)}x)`,
  );
});

test('scanner C2 keeps a local content opener from owning the established root close', () => {
  const local = '<content>坏。\n\n';
  const closedSource = currentResponse(`${local}{甲}「后。」`);
  const updateVariable = '<UpdateVariable>{"x":1}</UpdateVariable>';
  const source = `${closedSource}\n${updateVariable}`;
  const split = splitUpdateVariable(source);
  const complete = parseNarrative(source);
  const streaming = parseStreamingNarrative(source);

  assert.equal(split.ok, true);
  assert.equal(split.content, closedSource);
  assert.equal(split.separator, '\n');
  assert.equal(split.updateVariable, updateVariable);
  for (const result of [complete, streaming]) {
    assert.equal(result.ok, true);
    assert.deepEqual(result.blocks.map((block) => block.type), ['invalid', 'dialogue']);
    assert.equal(result.blocks[0].reason, 'invalid-local-block');
    assert.equal(result.blocks[0].rawText, local);
    assert.deepEqual(result.blocks[1], { type: 'dialogue', speaker: '甲', text: '后。' });
    assert.equal(result.updateVariable, updateVariable);
    assert.equal(errorCodes(result).includes('invalid-root-structure'), false);
  }
  assert.equal(streaming.streaming, false);
  assert.equal(streaming.complete, true);
  assert.equal(streaming.progressText, '');
});

test('scanner C2 proves only the terminal root pair after structural overflow', () => {
  const body = '<x>' + '<y></y>'.repeat(2_120)
    + '</now_plot></x>'
    + '<check type="判" actor="甲" target="乙">后。</check>';
  const closedSource = currentResponse(body);
  const updateVariable = '<UpdateVariable>{"x":1}</UpdateVariable>';
  const source = `${closedSource}\n${updateVariable}`;
  const split = splitUpdateVariable(source);
  const complete = parseNarrative(source);
  const streaming = parseStreamingNarrative(source);

  assert.ok(source.length < LIMITS.SOURCE);
  assert.equal(split.ok, true);
  assert.equal(split.content, closedSource);
  assert.equal(split.separator, '\n');
  assert.equal(split.updateVariable, updateVariable);
  for (const result of [complete, streaming]) {
    assert.equal(result.ok, true);
    assert.ok(result.blocks.length > 0);
    assert.equal(result.blocks.at(-1).type, 'invalid');
    assert.equal(result.blocks.at(-1).reason, 'block-count-exceeded');
    assert.ok(errorCodes(result).includes('block-count-exceeded'));
    assert.equal(errorCodes(result).includes('invalid-root-structure'), false);
    assert.equal(result.updateVariable, updateVariable);
  }
  assert.equal(streaming.streaming, false);
  assert.equal(streaming.complete, true);
  assert.equal(streaming.progressText, '');
});

test('scanner C2 keeps a premature bare plot close local when later evidence completes the plot', () => {
  const local = '前。</now_plot>假。';
  const closedSource = currentResponse(`${local}\n\n{甲}「后。」`);
  const updateVariable = '<UpdateVariable>{"x":1}</UpdateVariable>';
  const source = `${closedSource}\n${updateVariable}`;
  const split = splitUpdateVariable(source);
  const complete = parseNarrative(source);
  const streaming = parseStreamingNarrative(source);

  assert.equal(split.ok, true);
  assert.equal(split.content, closedSource);
  assert.equal(split.separator, '\n');
  assert.equal(split.updateVariable, updateVariable);
  for (const result of [complete, streaming]) {
    assert.equal(result.ok, true);
    assert.deepEqual(result.blocks, [
      { type: 'narration', text: '前。' },
      {
        type: 'invalid',
        status: 'invalid',
        reason: 'invalid-local-block',
        rawText: '</now_plot>',
      },
      { type: 'narration', text: '假。' },
      { type: 'dialogue', speaker: '甲', text: '后。' },
    ]);
    assert.equal(result.updateVariable, updateVariable);
    assert.equal(errorCodes(result).includes('invalid-root-structure'), false);
  }
  assert.equal(streaming.streaming, false);
  assert.equal(streaming.complete, true);
  assert.equal(streaming.progressText, '');
});

test('scanner C3 keeps a terminal local content owner inside the established open root', () => {
  const terminal = '</now_plot></content>';
  const header = currentResponse('').slice(0, -terminal.length);
  const updateVariable = '<UpdateVariable>{"x":1}</UpdateVariable>';
  const local = '<content><story volume="02">第02卷｜救赎的开始</story><time period="夜间" layer="主线" basis="编辑演算">魔女历1000年01月02日</time><now_plot>内一。\n\n内二。</now_plot></content>';
  const openSource = `${header}${local}\n${updateVariable}`;
  const closedSource = `${openSource}${terminal}`;
  const split = splitUpdateVariable(openSource);
  const completeOpen = parseNarrative(openSource);
  const streamingOpen = parseStreamingNarrative(openSource);
  const streamingClosed = parseStreamingNarrative(closedSource);

  assert.deepEqual(split, {
    ok: true,
    content: openSource,
    separator: '',
    updateVariable: null,
    errors: [],
  });
  assert.equal(completeOpen.ok, false);
  assert.equal(completeOpen.updateVariable, null);
  assert.ok(errorCodes(completeOpen).includes('invalid-root-structure'));
  assert.equal(streamingOpen.streaming, true);
  assert.equal(streamingOpen.complete, false);
  assert.equal(streamingOpen.updateVariable, null);
  assert.equal(streamingClosed.ok, true);
  assert.equal(streamingClosed.streaming, false);
  assert.equal(streamingClosed.complete, true);
  assert.equal(streamingClosed.updateVariable, null);
  assert.deepEqual(streamingOpen.blocks, streamingClosed.blocks);
  assert.deepEqual(streamingOpen.blocks.map((block) => block.type), ['invalid', 'invalid']);
  assert.equal(streamingOpen.blocks[0].reason, 'unsupported-child');
  assert.equal(streamingOpen.blocks[0].rawText, local);
  assert.equal(streamingOpen.blocks.some((block) => block.text === '内一。' || block.text === '内二。'), false);
});

test('scanner C3 keeps a terminal structured local now_plot owner wholly pending', () => {
  const terminal = '</now_plot></content>';
  const header = currentResponse('').slice(0, -terminal.length);
  const local = '<now_plot>内一。\n\n<scene location="王都" time="下午" mood="静">内二。</scene></now_plot>';
  const open = parseStreamingNarrative(header + local);
  const closedSource = header + local + terminal;

  assert.equal(open.streaming, true);
  assert.equal(open.complete, false);
  assert.deepEqual(open.blocks, []);
  assert.equal(open.progressText, local);
  assert.ok(errorCodes(open).includes('stream-incomplete-special'));
  assert.equal(errorCodes(open).includes('invalid-local-block'), false);
  for (const closed of [parseNarrative(closedSource), parseStreamingNarrative(closedSource)]) {
    assert.equal(closed.ok, true);
    assert.deepEqual(closed.blocks, [{
      type: 'invalid',
      status: 'invalid',
      reason: 'unsupported-child',
      rawText: local,
    }]);
  }
});

test('scanner C4 anchors UpdateVariable recognition to the established root boundary', () => {
  const terminal = '</now_plot></content>';
  const header = currentResponse('').slice(0, -terminal.length);
  const root = (body) => header + body + terminal;
  const updateVariable = '<UpdateVariable>{"x":1}</UpdateVariable>';

  for (const count of [2_072, 2_073, 2_074]) {
    const content = root('一。') + '<x></x>'.repeat(count) + root('二。');
    for (const suffix of [`\n${updateVariable}`, '\n<UpdateVari']) {
      const source = content + suffix;
      const split = splitUpdateVariable(source);

      assert.equal(split.content, source, `${count}:${suffix}`);
      assert.equal(split.updateVariable, null, `${count}:${suffix}`);
      for (const result of [parseNarrative(source), parseStreamingNarrative(source)]) {
        assert.equal(result.ok, false, `${count}:${suffix}`);
        assert.equal(result.updateVariable, null, `${count}:${suffix}`);
        assert.ok(errorCodes(result).includes('invalid-trailing-content'), `${count}:${suffix}`);
        assert.equal(errorCodes(result).includes('incomplete-update-variable'), false, `${count}:${suffix}`);
      }
      const streaming = parseStreamingNarrative(source);
      assert.equal(streaming.streaming, false, `${count}:${suffix}`);
      assert.equal(streaming.complete, true, `${count}:${suffix}`);
      assert.equal(streaming.progressText, '', `${count}:${suffix}`);
    }
  }
});

test('scanner C3 does not publish an overflow close without a terminal root pair', () => {
  const terminal = '</now_plot></content>';
  const header = currentResponse('').slice(0, -terminal.length);
  const updateVariable = '<UpdateVariable>{"x":1}</UpdateVariable>';
  const owner = (count) => '<x>' + '<y></y>'.repeat(count)
    + '</now_plot></x><check type="判" actor="甲" target="乙">后。</check>';
  const beforeOverflow = parseStreamingNarrative(header + owner(2_106));

  assert.deepEqual(beforeOverflow.blocks.map((block) => block.type), ['invalid', 'check']);
  assert.equal(beforeOverflow.progressText, '');
  for (const count of [2_107, 2_108]) {
    const open = parseStreamingNarrative(header + owner(count));

    assert.equal(open.streaming, true, `${count}`);
    assert.equal(open.complete, false, `${count}`);
    assert.equal(open.blocks.some((block) => block.type === 'check'), false, `${count}`);
    assert.ok(open.blocks.every((block) => block.reason === 'block-count-exceeded'), `${count}`);
    assert.ok(open.progressText === owner(count) || open.blocks.length === 1, `${count}`);
  }

  for (const count of [2_106, 2_107, 2_108]) {
    const content = header + owner(count) + terminal;
    const source = `${content}\n${updateVariable}`;
    const split = splitUpdateVariable(source);
    const complete = parseNarrative(source);
    const streaming = parseStreamingNarrative(source);

    assert.equal(split.content, content, `${count}`);
    assert.equal(split.updateVariable, updateVariable, `${count}`);
    for (const result of [complete, streaming]) {
      assert.equal(result.ok, true, `${count}`);
      assert.equal(result.updateVariable, updateVariable, `${count}`);
      assert.equal(errorCodes(result).includes('invalid-root-structure'), false, `${count}`);
    }
    if (count >= 2_107) {
      assert.equal(complete.blocks.at(-1).reason, 'block-count-exceeded', `${count}`);
      assert.ok(errorCodes(complete).includes('block-count-exceeded'), `${count}`);
    }
    assert.equal(streaming.streaming, false, `${count}`);
    assert.equal(streaming.complete, true, `${count}`);
    assert.equal(streaming.progressText, '', `${count}`);
  }
});

test('scanner C4 rejects a retained local root pair as overflow terminal proof', () => {
  const terminal = '</now_plot></content>';
  const header = currentResponse('').slice(0, -terminal.length);
  const updateVariable = '<UpdateVariable>{"x":1}</UpdateVariable>';
  const local = '<content><story volume="02">第02卷｜救赎的开始</story>'
    + '<time period="夜间" layer="主线" basis="编辑演算">魔女历1000年01月02日</time>'
    + '<now_plot>内。</now_plot></content>';

  for (const count of [2_072, 2_073, 2_074]) {
    const filler = `<x>${'<y></y>'.repeat(count)}</x>`;
    for (const lineEnding of ['\n', '\r\n', '\r']) {
      const openContent = header + filler + lineEnding + local;
      const source = openContent + lineEnding + updateVariable;
      const label = `${count}:${JSON.stringify(lineEnding)}`;

      const split = splitUpdateVariable(source);
      assert.equal(split.content, source, label);
      assert.equal(split.updateVariable, null, label);
      const complete = parseNarrative(source);
      assert.equal(complete.ok, false, label);
      assert.equal(complete.updateVariable, null, label);
      assert.ok(errorCodes(complete).includes('invalid-root-structure'), label);
      const streaming = parseStreamingNarrative(source);
      assert.equal(streaming.streaming, true, label);
      assert.equal(streaming.complete, false, label);
      assert.equal(streaming.updateVariable, null, label);

      for (const closed of [parseNarrative(source + terminal), parseStreamingNarrative(source + terminal)]) {
        assert.equal(closed.ok, true, label);
        assert.equal(closed.updateVariable, null, label);
        assert.equal(errorCodes(closed).includes('invalid-root-structure'), false, label);
      }
    }
  }
});

test('scanner C5 carries local root ownership across omitted retained partitions', () => {
  const header = '<content><story volume="01">第01卷｜开始的余温</story>'
    + '<time period="下午" layer="主线" basis="编辑演算">魔女历1000年01月01日</time><now_plot>';
  const local = '<content><story volume="02">第02卷｜救赎的开始</story>'
    + '<time period="夜间" layer="主线" basis="编辑演算">魔女历1000年01月02日</time><now_plot>'
    + '<z></z>'.repeat(40)
    + '</now_plot></content>';
  const updateVariable = '<UpdateVariable>{"x":1}</UpdateVariable>';
  const terminal = '</now_plot></content>';

  for (const count of [2_065, 2_066]) {
    const openContent = header + '<y></y>'.repeat(count) + local;
    const open = parseStreamingNarrative(openContent);
    assert.equal(open.streaming, true, `${count}:no UpdateVariable`);
    assert.equal(open.complete, false, `${count}:no UpdateVariable`);
    assert.equal(open.updateVariable, null, `${count}:no UpdateVariable`);
    const completeOpen = parseNarrative(openContent);
    assert.equal(completeOpen.ok, false, `${count}:no UpdateVariable`);
    assert.ok(errorCodes(completeOpen).includes('invalid-root-structure'), `${count}:no UpdateVariable`);

    for (const lineEnding of ['\n', '\r\n', '\r']) {
      const source = openContent + lineEnding + updateVariable;
      const label = `${count}:${JSON.stringify(lineEnding)}`;
      assert.deepEqual(splitUpdateVariable(source), {
        ok: true,
        content: source,
        separator: '',
        updateVariable: null,
        errors: [],
      }, label);
      const complete = parseNarrative(source);
      assert.equal(complete.ok, false, label);
      assert.equal(complete.updateVariable, null, label);
      assert.ok(errorCodes(complete).includes('invalid-root-structure'), label);
      const streaming = parseStreamingNarrative(source);
      assert.equal(streaming.streaming, true, label);
      assert.equal(streaming.complete, false, label);
      assert.equal(streaming.updateVariable, null, label);

      for (const closed of [parseNarrative(source + terminal), parseStreamingNarrative(source + terminal)]) {
        assert.equal(closed.ok, true, label);
        assert.equal(closed.updateVariable, null, label);
        assert.equal(errorCodes(closed).includes('invalid-root-structure'), false, label);
      }
    }
  }
});

test('scanner C6 keeps unterminated UpdateVariable attempts inside the closed content root', () => {
  const opening = '<UpdateVariable>';
  const expectedTime = {
    period: '下午',
    layer: '主线',
    basis: '编辑演算',
    text: '魔女历1000年01月01日',
  };

  for (const lineEnding of ['\n', '\r\n', '\r']) {
    const attempted = `<UpdateVariable>坏。${lineEnding}${lineEnding}`;
    const body = `前。${lineEnding}${lineEnding}${attempted}{甲}「后。」`;
    const source = currentResponse(body);
    const complete = parseNarrative(source);
    const streaming = parseStreamingNarrative(source);
    const label = JSON.stringify(lineEnding);

    for (const result of [complete, streaming]) {
      assert.equal(result.ok, true, label);
      assert.equal(result.player, '菜月昴', label);
      assert.deepEqual(result.story, { volume: '01', heading: '第01卷｜开始的余温' }, label);
      assert.deepEqual(result.time, expectedTime, label);
      assert.deepEqual(result.blocks.map((block) => block.type), ['narration', 'invalid', 'dialogue'], label);
      assert.deepEqual(result.blocks[0], { type: 'narration', text: '前。' }, label);
      assert.equal(result.blocks[1].reason, 'invalid-local-block', label);
      assert.equal(result.blocks[1].rawText, attempted, label);
      assert.deepEqual(result.blocks[2], { type: 'dialogue', speaker: '甲', text: '后。' }, label);
      assert.equal(result.updateVariable, null, label);
    }
    assert.equal(streaming.streaming, false, label);
    assert.equal(streaming.complete, true, label);
    assert.equal(streaming.progressText, '', label);
    assert.deepEqual(splitUpdateVariable(source), {
      ok: true,
      content: source,
      separator: '',
      updateVariable: null,
      errors: [],
    }, label);
  }

  const content = currentResponse('正文。');
  const completeUpdate = '<UpdateVariable>{"字面":"<x>"}</UpdateVariable>';
  const external = `${content}\r\n${completeUpdate}`;
  assert.deepEqual(splitUpdateVariable(external), {
    ok: true,
    content,
    separator: '\r\n',
    updateVariable: completeUpdate,
    errors: [],
  });
  assert.equal(parseNarrative(external).updateVariable, completeUpdate);

  for (let length = 1; length < opening.length; length += 1) {
    const partial = opening.slice(0, length);
    const pending = parseStreamingNarrative(`${content}\n${partial}`);
    assert.equal(pending.streaming, true, partial);
    assert.equal(pending.complete, false, partial);
    assert.equal(pending.progressText, partial, partial);
    assert.ok(errorCodes(pending).includes('incomplete-update-variable'), partial);
  }

  const localComplete = '<UpdateVariable>{}</UpdateVariable>';
  const localSource = currentResponse(`前。\n\n${localComplete}\n\n{甲}「后。」`);
  const local = parseNarrative(localSource);
  assert.equal(local.ok, true);
  assert.deepEqual(local.blocks.map((block) => block.type), ['narration', 'invalid', 'dialogue']);
  assert.equal(local.blocks[1].rawText, localComplete);
  assert.equal(local.updateVariable, null);
  assert.equal(splitUpdateVariable(localSource).content, localSource);

  const terminal = '</now_plot></content>';
  const header = currentResponse('').slice(0, -terminal.length);
  const recovered = parseNarrative(`${header}前。\n\n<UpdateVariable>坏。\n\n{甲}「后。」${terminal}`);
  assert.equal(recovered.ok, true);
  assert.deepEqual(recovered.blocks.map((block) => block.type), ['narration', 'invalid', 'dialogue']);
  assert.equal(recovered.updateVariable, null);
});

test('scanner C6 keeps unfinished local UpdateVariable root tokens opaque until their exact close', () => {
  const terminal = '</now_plot></content>';
  const header = currentResponse('').slice(0, -terminal.length);
  const fakeRootPayloads = [
    '{"fake":"</now_plot></content>"}',
    '{"fake":"<content><now_plot>"}',
    '{"fake":"<content><now_plot></now_plot></content>"}',
  ];

  for (const payload of fakeRootPayloads) {
    const attempted = `<UpdateVariable>${payload}`;
    const source = header + attempted;
    const complete = parseNarrative(source);
    const streaming = parseStreamingNarrative(source);

    assert.equal(complete.ok, false, payload);
    assert.ok(errorCodes(complete).includes('invalid-root-structure'), payload);
    assert.equal(errorCodes(complete).includes('invalid-trailing-content'), false, payload);
    assert.equal(streaming.ok, true, payload);
    assert.equal(streaming.streaming, true, payload);
    assert.equal(streaming.complete, false, payload);
    assert.equal(streaming.updateVariable, null, payload);
    assert.equal(streaming.progressText, attempted, payload);

    const locallyClosed = source + '</UpdateVariable>';
    const closedComplete = parseNarrative(locallyClosed);
    const closedStreaming = parseStreamingNarrative(locallyClosed);
    assert.equal(closedComplete.ok, false, payload);
    assert.ok(errorCodes(closedComplete).includes('invalid-root-structure'), payload);
    assert.equal(errorCodes(closedComplete).includes('invalid-trailing-content'), false, payload);
    assert.equal(closedStreaming.ok, true, payload);
    assert.equal(closedStreaming.streaming, true, payload);
    assert.equal(closedStreaming.complete, false, payload);
    assert.equal(closedStreaming.progressText, '', payload);
    assert.equal(closedStreaming.blocks.at(-1)?.rawText, attempted + '</UpdateVariable>', payload);
  }
});

test('scanner C6 recovers opaque unfinished local UpdateVariable payloads at the first blank boundary', () => {
  const terminal = '</now_plot></content>';
  const header = currentResponse('').slice(0, -terminal.length);

  for (const lineEnding of ['\n', '\r\n', '\r']) {
    const attempted = '<UpdateVariable>{"fake":"<content><now_plot></now_plot></content>"}'
      + lineEnding + lineEnding;
    const source = header + `前。${lineEnding}${lineEnding}${attempted}{甲}「后。」${terminal}`;
    const label = JSON.stringify(lineEnding);

    for (const result of [parseNarrative(source), parseStreamingNarrative(source)]) {
      assert.equal(result.ok, true, label);
      assert.deepEqual(result.blocks.map((block) => block.type), ['narration', 'invalid', 'dialogue'], label);
      assert.equal(result.blocks[1].reason, 'invalid-local-block', label);
      assert.equal(result.blocks[1].rawText, attempted, label);
      assert.deepEqual(result.blocks[2], { type: 'dialogue', speaker: '甲', text: '后。' }, label);
      assert.equal(result.updateVariable, null, label);
      assert.equal(errorCodes(result).includes('invalid-root-structure'), false, label);
      assert.equal(errorCodes(result).includes('invalid-trailing-content'), false, label);
    }

    const streaming = parseStreamingNarrative(source);
    assert.equal(streaming.streaming, false, label);
    assert.equal(streaming.complete, true, label);
    assert.equal(streaming.progressText, '', label);
  }
});

test('scanner C6 bounds repeated unfinished local UpdateVariable opacity work', () => {
  const opening = '<UpdateVariable>';
  const closing = '</UpdateVariable>';
  const terminal = '</now_plot></content>';
  const header = currentResponse('').slice(0, -terminal.length);
  const repeatedSource = (count) => (
    header
    + `${opening}{"fake":"<content><now_plot></now_plot></content>"}\n\n`.repeat(count)
    + `{甲}「终。」${terminal}`
  );
  const parsers = [parseNarrative, parseStreamingNarrative, splitUpdateVariable];
  const countProbes = (parser, source) => {
    const originalStartsWith = String.prototype.startsWith;
    const originalIndexOf = String.prototype.indexOf;
    let openingProbes = 0;
    let exactCloseSearches = 0;
    String.prototype.startsWith = function instrumentedStartsWith(searchString, position) {
      if (searchString === opening && this.length === source.length) {
        openingProbes += 1;
      }
      return originalStartsWith.call(this, searchString, position);
    };
    String.prototype.indexOf = function instrumentedIndexOf(searchString, position) {
      if (searchString === closing && this.length === source.length) {
        exactCloseSearches += 1;
      }
      return originalIndexOf.call(this, searchString, position);
    };
    try {
      const result = parser(source);
      return { openingProbes, exactCloseSearches, result };
    } finally {
      String.prototype.startsWith = originalStartsWith;
      String.prototype.indexOf = originalIndexOf;
    }
  };

  const smallSource = repeatedSource(128);
  const largeSource = repeatedSource(256);
  assert.ok(largeSource.length < LIMITS.SOURCE);
  const scans = parsers.map((parser) => ({
    name: parser.name,
    small: countProbes(parser, smallSource),
    large: countProbes(parser, largeSource),
  }));

  assert.ok(
    scans.every(({ small, large }) => small.openingProbes > 0 && large.openingProbes > 0),
    'instrumentation must observe local opening probes after parser execution',
  );
  assert.ok(
    scans.every(({ small, large }) => large.openingProbes <= small.openingProbes * 2 + 8),
    'doubling unfinished local payloads must keep opening probes linear: '
      + scans.map(({ name, small, large }) => (
        `${name} ${small.openingProbes}/${large.openingProbes} probes`
      )).join(', '),
  );
  assert.ok(
    scans.every(({ small, large }) => small.exactCloseSearches <= 2 && large.exactCloseSearches <= 2),
    'a missing exact close must not trigger repeated suffix scans: '
      + scans.map(({ name, small, large }) => (
        `${name} ${small.exactCloseSearches}/${large.exactCloseSearches} searches`
      )).join(', '),
  );
  assert.equal(scans[0].large.result.ok, true);
  assert.equal(scans[1].large.result.streaming, false);
  assert.equal(scans[1].large.result.complete, true);
  assert.equal(scans[2].large.result.content, largeSource);
});

test('scanner C6 gives a terminal partial UpdateVariable opaque precedence over payload root lookalikes', () => {
  const content = currentResponse('前。');

  for (const lineEnding of ['\n', '\r\n', '\r']) {
    const partial = '<UpdateVariable>坏。'
      + lineEnding + lineEnding
      + '{甲}「伪后续。」</now_plot></content>';
    const source = content + lineEnding + partial;
    const label = JSON.stringify(lineEnding);

    const split = splitUpdateVariable(source);
    assert.equal(split.ok, false, label);
    assert.equal(split.content, null, label);
    assert.equal(split.separator, '', label);
    assert.equal(split.updateVariable, null, label);
    assert.deepEqual(errorCodes(split), ['incomplete-update-variable'], label);

    const complete = parseNarrative(source);
    assert.equal(complete.ok, false, label);
    assert.equal(complete.updateVariable, null, label);
    assert.deepEqual(errorCodes(complete), ['incomplete-update-variable'], label);

    const streaming = parseStreamingNarrative(source);
    assert.equal(streaming.ok, true, label);
    assert.equal(streaming.streaming, true, label);
    assert.equal(streaming.complete, false, label);
    assert.deepEqual(streaming.blocks, [{ type: 'narration', text: '前。' }], label);
    assert.equal(streaming.progressText, partial, label);
    assert.equal(streaming.updateVariable, null, label);
    assert.deepEqual(errorCodes(streaming), ['incomplete-update-variable'], label);
  }
});

test('scanner C6 keeps tempting but unproven post-root UpdateVariable payloads terminal and incomplete', () => {
  const content = currentResponse('前。');

  for (const lineEnding of ['\n', '\r\n', '\r']) {
    const partials = [
      `<UpdateVariable>坏。${lineEnding}${lineEnding}{甲}「像是后续。」`,
      `<UpdateVariable>坏。${lineEnding}${lineEnding}</now_plot></content>`,
      `<UpdateVariable>坏。${lineEnding}${lineEnding}</now_plot></content>`
        + `${lineEnding}${lineEnding}{甲}「关闭对在对白之前。」`,
      `<UpdateVariable>坏。${lineEnding}${lineEnding}{甲}「只有未闭合根。」`
        + `${lineEnding}${lineEnding}<content><now_plot>`,
    ];

    for (const partial of partials) {
      const source = content + lineEnding + partial;
      const label = `${JSON.stringify(lineEnding)}:${partial}`;
      const split = splitUpdateVariable(source);
      const complete = parseNarrative(source);
      const streaming = parseStreamingNarrative(source);

      assert.equal(split.ok, false, label);
      assert.equal(split.content, null, label);
      assert.equal(split.updateVariable, null, label);
      assert.deepEqual(errorCodes(split), ['incomplete-update-variable'], label);
      assert.equal(complete.ok, false, label);
      assert.equal(complete.updateVariable, null, label);
      assert.deepEqual(errorCodes(complete), ['incomplete-update-variable'], label);
      assert.equal(streaming.ok, true, label);
      assert.equal(streaming.streaming, true, label);
      assert.equal(streaming.complete, false, label);
      assert.deepEqual(streaming.blocks, [{ type: 'narration', text: '前。' }], label);
      assert.equal(streaming.progressText, partial, label);
      assert.equal(streaming.updateVariable, null, label);
      assert.ok(errorCodes(streaming).includes('incomplete-update-variable'), label);
      assert.equal(errorCodes(streaming).includes('invalid-root-structure'), false, label);
      assert.equal(errorCodes(streaming).includes('invalid-trailing-content'), false, label);
    }
  }
});

test('scanner C7 requires the established plot close before proving the outer content close', () => {
  const terminal = '</now_plot></content>';
  const header = currentResponse('').slice(0, -terminal.length);
  const expectedTime = {
    period: '下午',
    layer: '主线',
    basis: '编辑演算',
    text: '魔女历1000年01月01日',
  };

  for (const lineEnding of ['\n', '\r\n', '\r']) {
    const attempted = `<UpdateVariable>坏。${lineEnding}${lineEnding}`;
    const premature = '前。</content>';
    const source = header
      + premature
      + lineEnding + lineEnding
      + attempted
      + '{甲}「后。」'
      + terminal;
    const label = JSON.stringify(lineEnding);

    assert.deepEqual(splitUpdateVariable(source), {
      ok: true,
      content: source,
      separator: '',
      updateVariable: null,
      errors: [],
    }, label);
    for (const result of [parseNarrative(source), parseStreamingNarrative(source)]) {
      assert.equal(result.ok, true, label);
      assert.equal(result.player, '菜月昴', label);
      assert.deepEqual(result.story, { volume: '01', heading: '第01卷｜开始的余温' }, label);
      assert.deepEqual(result.time, expectedTime, label);
      assert.deepEqual(result.blocks, [
        { type: 'narration', text: '前。' },
        {
          type: 'invalid',
          status: 'invalid',
          reason: 'invalid-local-block',
          rawText: '</content>',
        },
        {
          type: 'invalid',
          status: 'invalid',
          reason: 'invalid-local-block',
          rawText: attempted,
        },
        { type: 'dialogue', speaker: '甲', text: '后。' },
      ], label);
      assert.equal(result.updateVariable, null, label);
      assert.equal(errorCodes(result).includes('invalid-root-structure'), false, label);
    }
    const streaming = parseStreamingNarrative(source);
    assert.equal(streaming.streaming, false, label);
    assert.equal(streaming.complete, true, label);
    assert.equal(streaming.progressText, '', label);
  }
});

test('scanner C7 preserves local content ownership until the true outer closure', () => {
  const terminal = '</now_plot></content>';
  const header = currentResponse('').slice(0, -terminal.length);
  const updateVariable = '<UpdateVariable>{"x":1}</UpdateVariable>';

  for (const local of ['<content>坏。</content>', '<content/>']) {
    const content = `${header}前。\n\n${local}\n\n{甲}「后。」${terminal}`;
    const source = `${content}\n${updateVariable}`;

    assert.deepEqual(splitUpdateVariable(source), {
      ok: true,
      content,
      separator: '\n',
      updateVariable,
      errors: [],
    }, local);
    for (const result of [parseNarrative(source), parseStreamingNarrative(source)]) {
      assert.equal(result.ok, true, local);
      assert.deepEqual(result.blocks.map((block) => block.type), ['narration', 'invalid', 'dialogue'], local);
      assert.deepEqual(result.blocks[0], { type: 'narration', text: '前。' }, local);
      assert.equal(result.blocks[1].rawText, local, local);
      assert.deepEqual(result.blocks[2], { type: 'dialogue', speaker: '甲', text: '后。' }, local);
      assert.equal(result.updateVariable, updateVariable, local);
    }
    const streaming = parseStreamingNarrative(source);
    assert.equal(streaming.streaming, false, local);
    assert.equal(streaming.complete, true, local);
  }

  for (const lineEnding of ['\n', '\r\n', '\r']) {
    const localAttempt = `<now_plot><content/>${lineEnding}<UpdateVariable>{}</UpdateVariable>`;
    assert.deepEqual(splitUpdateVariable(localAttempt), {
      ok: true,
      content: localAttempt,
      separator: '',
      updateVariable: null,
      errors: [],
    }, JSON.stringify(lineEnding));
    assert.equal(parseNarrative(localAttempt).updateVariable, null, lineEnding);
    assert.equal(parseStreamingNarrative(localAttempt).updateVariable, null, lineEnding);
  }
});

test('scanner C7 keeps legal terminal UpdateVariable suffixes opaque and exact', () => {
  const content = currentResponse('正文。');
  const completeUpdate = '<UpdateVariable>{"literal":"</content>"}</UpdateVariable>';
  const partialUpdate = '<UpdateVariable>{"literal":';

  for (const lineEnding of ['\n', '\r\n', '\r']) {
    assert.deepEqual(splitUpdateVariable(content + lineEnding + completeUpdate), {
      ok: true,
      content,
      separator: lineEnding,
      updateVariable: completeUpdate,
      errors: [],
    }, JSON.stringify(lineEnding));
    assert.equal(parseNarrative(content + lineEnding + completeUpdate).updateVariable, completeUpdate, lineEnding);

    const pending = parseStreamingNarrative(content + lineEnding + partialUpdate);
    assert.equal(pending.streaming, true, lineEnding);
    assert.equal(pending.complete, false, lineEnding);
    assert.equal(pending.progressText, partialUpdate, lineEnding);
    assert.equal(pending.updateVariable, null, lineEnding);
    assert.ok(errorCodes(pending).includes('incomplete-update-variable'), lineEnding);
  }
});

test('scanner C8 keeps later sibling evidence after a premature root-close pair', () => {
  const terminal = '</now_plot></content>';
  const header = currentResponse('').slice(0, -terminal.length);
  const updateVariable = '<UpdateVariable>{"literal":"</content>"}</UpdateVariable>';
  const expectedTime = {
    period: '下午',
    layer: '主线',
    basis: '编辑演算',
    text: '魔女历1000年01月01日',
  };
  const siblings = [
    {
      name: 'dialogue',
      source: '{甲}「后。」',
      type: 'dialogue',
      expected: { type: 'dialogue', speaker: '甲', text: '后。' },
    },
    {
      name: 'check',
      source: '<check type="判" actor="甲" target="乙">后。</check>',
      type: 'check',
      expected: { type: 'check', checkType: '判', actor: '甲', target: '乙', text: '后。' },
    },
    {
      name: 'narration',
      source: '后。',
      type: 'narration',
      expected: { type: 'narration', text: '后。' },
    },
    {
      name: 'ability',
      source: ability('', '<effect>发动。</effect><description>说明。</description>'),
      type: 'ability',
      expected: {
        type: 'ability',
        user: '贝亚特丽丝',
        name: '阴魔法',
        kind: '魔法',
        affinities: [],
        effect: '发动。',
        description: '说明。',
        protocol: 'current',
      },
    },
  ];

  for (const lineEnding of ['\n', '\r\n', '\r']) {
    for (const sibling of siblings) {
      const content = header
        + '前。</now_plot></content>'
        + lineEnding + lineEnding
        + sibling.source
        + terminal;
      const source = content + lineEnding + updateVariable;
      const label = `${sibling.name}:${JSON.stringify(lineEnding)}`;
      const split = splitUpdateVariable(source);

      assert.deepEqual(split, {
        ok: true,
        content,
        separator: lineEnding,
        updateVariable,
        errors: [],
      }, label);
      assert.equal(split.content + split.separator + split.updateVariable, source, label);

      for (const result of [parseNarrative(source), parseStreamingNarrative(source)]) {
        assert.equal(result.ok, true, label);
        assert.equal(result.protocol, 'current', label);
        assert.equal(result.player, '菜月昴', label);
        assert.deepEqual(result.story, { volume: '01', heading: '第01卷｜开始的余温' }, label);
        assert.deepEqual(result.time, expectedTime, label);
        assert.deepEqual(result.blocks.slice(0, 3), [
          { type: 'narration', text: '前。' },
          {
            type: 'invalid',
            status: 'invalid',
            reason: 'invalid-local-block',
            rawText: '</now_plot>',
          },
          {
            type: 'invalid',
            status: 'invalid',
            reason: 'invalid-local-block',
            rawText: '</content>',
          },
        ], label);
        assert.deepEqual(result.blocks.at(-1), sibling.expected, label);
        assert.equal(result.updateVariable, updateVariable, label);
        assert.equal(errorCodes(result).includes('invalid-trailing-content'), false, label);
        assert.equal(errorCodes(result).includes('invalid-root-structure'), false, label);
      }

      const streaming = parseStreamingNarrative(source);
      assert.equal(streaming.streaming, false, label);
      assert.equal(streaming.complete, true, label);
      assert.equal(streaming.progressText, '', label);
    }
  }
});

test('scanner C10 selects the final root pair after a completed local now_plot pair', () => {
  const terminal = '</now_plot></content>';
  const header = currentResponse('').slice(0, -terminal.length);
  const local = '<now_plot>内。</now_plot>';
  const updateVariable = '<UpdateVariable>{"literal":"</now_plot></content><x>"}</UpdateVariable>';

  for (const lineEnding of ['\n', '\r\n', '\r']) {
    const content = header
      + '前。</now_plot></content>'
      + lineEnding + lineEnding
      + local
      + lineEnding + lineEnding
      + '{甲}「后。」'
      + terminal;
    const source = content + lineEnding + updateVariable;
    const label = JSON.stringify(lineEnding);

    assert.deepEqual(splitUpdateVariable(source), {
      ok: true,
      content,
      separator: lineEnding,
      updateVariable,
      errors: [],
    }, label);

    for (const result of [parseNarrative(source), parseStreamingNarrative(source)]) {
      assert.equal(result.ok, true, label);
      assert.equal(result.blocks.filter((block) => block.rawText === local).length, 1, label);
      assert.deepEqual(result.blocks.find((block) => block.rawText === local), {
        type: 'invalid',
        status: 'invalid',
        reason: 'unsupported-child',
        rawText: local,
      }, label);
      assert.deepEqual(result.blocks.at(-1), { type: 'dialogue', speaker: '甲', text: '后。' }, label);
      assert.equal(result.updateVariable, updateVariable, label);
      assert.equal(errorCodes(result).includes('invalid-root-structure'), false, label);
      assert.equal(errorCodes(result).includes('invalid-trailing-content'), false, label);
    }

    const streaming = parseStreamingNarrative(source);
    assert.equal(streaming.streaming, false, label);
    assert.equal(streaming.complete, true, label);
    assert.equal(streaming.progressText, '', label);
  }
});

test('scanner C10 keeps nested UpdateVariable payload root tokens opaque while selecting the final root pair', () => {
  const terminal = '</now_plot></content>';
  const header = currentResponse('').slice(0, -terminal.length);
  const updateVariable = '<UpdateVariable>{"x":1}</UpdateVariable>';

  for (const lineEnding of ['\n', '\r\n', '\r']) {
    for (const rootToken of ['<now_plot>', '</now_plot>']) {
      const local = `<now_plot><UpdateVariable>{"literal":"${rootToken}"}</UpdateVariable></now_plot>`;
      const content = header
        + '前。</now_plot></content>'
        + lineEnding + lineEnding
        + local
        + lineEnding + lineEnding
        + '{甲}「后。」'
        + terminal;
      const source = content + lineEnding + updateVariable;
      const label = `${JSON.stringify(lineEnding)}:${rootToken}`;

      assert.deepEqual(splitUpdateVariable(source), {
        ok: true,
        content,
        separator: lineEnding,
        updateVariable,
        errors: [],
      }, label);

      const complete = parseNarrative(source);
      const streaming = parseStreamingNarrative(source);
      for (const result of [complete, streaming]) {
        assert.equal(result.ok, true, label);
        assert.equal(result.blocks.filter((block) => block.rawText === local).length, 1, label);
        assert.deepEqual(result.blocks.find((block) => block.rawText === local), {
          type: 'invalid',
          status: 'invalid',
          reason: 'unsupported-child',
          rawText: local,
        }, label);
        assert.deepEqual(result.blocks.at(-1), { type: 'dialogue', speaker: '甲', text: '后。' }, label);
        assert.equal(result.updateVariable, updateVariable, label);
        assert.equal(errorCodes(result).includes('invalid-root-structure'), false, label);
        assert.equal(errorCodes(result).includes('invalid-trailing-content'), false, label);
      }

      assert.equal(streaming.streaming, false, label);
      assert.equal(streaming.complete, true, label);
      assert.equal(streaming.progressText, '', label);
    }
  }
});

test('scanner C10 keeps nested UpdateVariable payload opaque when local wrapper is complete', () => {
  const terminal = '</now_plot></content>';
  const header = currentResponse('').slice(0, -terminal.length);
  const local = '<x><UpdateVariable>{"literal":"<x>"}</UpdateVariable></x>';
  const content = header
    + `前。${terminal}\n\n${local}`
    + `\n\n{甲}「后。」${terminal}`;
  const updateVariable = '<UpdateVariable>{"x":1}</UpdateVariable>';
  const source = `${content}\n${updateVariable}`;

  assert.deepEqual(splitUpdateVariable(source), {
    ok: true,
    content,
    separator: '\n',
    updateVariable,
    errors: [],
  });
  for (const result of [parseNarrative(source), parseStreamingNarrative(source)]) {
    assert.equal(result.ok, true);
    assert.deepEqual(result.blocks.find((block) => block.rawText === local), {
      type: 'invalid',
      status: 'invalid',
      reason: 'unsupported-child',
      rawText: local,
    });
    assert.deepEqual(result.blocks.at(-1), { type: 'dialogue', speaker: '甲', text: '后。' });
    assert.equal(result.updateVariable, updateVariable);
    assert.equal(errorCodes(result).includes('invalid-root-structure'), false);
    assert.equal(errorCodes(result).includes('invalid-trailing-content'), false);
  }

  const streaming = parseStreamingNarrative(source);
  assert.equal(streaming.streaming, false);
  assert.equal(streaming.complete, true);
  assert.equal(streaming.progressText, '');
});

test('scanner C10 keeps local UpdateVariable root tokens opaque after retained-tag overflow', () => {
  const terminal = '</now_plot></content>';
  const header = currentResponse('').slice(0, -terminal.length);
  const terminalUpdate = '<UpdateVariable>{"terminal":1}</UpdateVariable>';

  for (const rootToken of ['<now_plot>', '</now_plot>', '<content>', '</content>']) {
    const local = `<x>${'<y></y>'.repeat(2_074)}`
      + `<UpdateVariable>{"literal":"${rootToken}"}</UpdateVariable></x>`;
    const content = `${header}前。${terminal}\n\n${local}\n\n{甲}「后。」${terminal}`;
    const source = `${content}\n${terminalUpdate}`;
    const label = rootToken;

    assert.ok(source.length < 15 * 1_024, label);
    assert.ok(local.length < LIMITS.BLOCK_TEXT, label);
    assert.deepEqual(splitUpdateVariable(source), {
      ok: true,
      content,
      separator: '\n',
      updateVariable: terminalUpdate,
      errors: [],
    }, label);

    const complete = parseNarrative(source);
    const streaming = parseStreamingNarrative(source);
    for (const result of [complete, streaming]) {
      assert.equal(result.ok, true, label);
      const localBlocks = result.blocks.filter((block) => block.rawText === local);
      assert.equal(localBlocks.length, 1, label);
      assert.deepEqual(localBlocks[0], {
        type: 'invalid',
        status: 'invalid',
        reason: 'unsupported-child',
        rawText: local,
      }, label);
      assert.deepEqual(result.blocks.at(-1), { type: 'dialogue', speaker: '甲', text: '后。' }, label);
      assert.equal(result.updateVariable, terminalUpdate, label);
      assert.equal(errorCodes(result).includes('invalid-root-structure'), false, label);
      assert.equal(errorCodes(result).includes('invalid-trailing-content'), false, label);
    }
    assert.equal(streaming.streaming, false, label);
    assert.equal(streaming.complete, true, label);
    assert.equal(streaming.progressText, '', label);
  }
});

test('scanner C10 keeps nested UpdateVariable payload opaque when local wrapper is incomplete', () => {
  const terminal = '</now_plot></content>';
  const header = currentResponse('').slice(0, -terminal.length);
  const source = header
    + `前。${terminal}\n\n`
    + '<x><UpdateVariable>{"literal":"</x>"}</UpdateVariable>'
    + `\n\n{甲}「后。」${terminal}`;

  for (const result of [parseNarrative(source), parseStreamingNarrative(source)]) {
    assert.equal(result.ok, false);
    assert.equal(result.updateVariable, null);
  }
});

test('scanner C10 keeps fake supported openers inside local UpdateVariable payloads opaque', () => {
  const terminal = '</now_plot></content>';
  const header = currentResponse('').slice(0, -terminal.length);
  const updateVariable = '<UpdateVariable>{"terminal":1}</UpdateVariable>';
  const cases = [
    ['scene', '<scene location="王都" time="下午" mood="静">'],
    ['ability', '<ability user="甲" name="技" kind="魔法">'],
    ['check', '<check type="观察" actor="甲" target="乙">'],
    ['restart', '<restart deathId="loop-1" checkpoint="起点">'],
  ];

  for (const [name, opening] of cases) {
    const local = `${opening}<UpdateVariable>{"literal":"<${name}>"}</UpdateVariable></${name}>`;
    const content = header
      + `前。${terminal}\n\n${local}\n\n{甲}「后。」${terminal}`;
    const source = `${content}\n${updateVariable}`;

    assert.deepEqual(splitUpdateVariable(source), {
      ok: true,
      content,
      separator: '\n',
      updateVariable,
      errors: [],
    }, name);
    for (const result of [parseNarrative(source), parseStreamingNarrative(source)]) {
      assert.equal(result.ok, true, name);
      assert.equal(result.blocks.filter((block) => block.rawText === local).length, 1, name);
      assert.equal(result.blocks.find((block) => block.rawText === local)?.type, 'invalid', name);
      assert.deepEqual(result.blocks.at(-1), { type: 'dialogue', speaker: '甲', text: '后。' }, name);
      assert.equal(result.updateVariable, updateVariable, name);
      assert.equal(errorCodes(result).includes('invalid-root-structure'), false, name);
      assert.equal(errorCodes(result).includes('invalid-trailing-content'), false, name);
    }

    const streaming = parseStreamingNarrative(source);
    assert.equal(streaming.streaming, false, name);
    assert.equal(streaming.complete, true, name);
    assert.equal(streaming.progressText, '', name);
  }
});

test('scanner C10 does not complete supported wrappers from fake closes inside local UpdateVariable payloads', () => {
  const terminal = '</now_plot></content>';
  const header = currentResponse('').slice(0, -terminal.length);
  const updateVariable = '<UpdateVariable>{"terminal":1}</UpdateVariable>';
  const cases = [
    ['scene', '<scene location="王都" time="下午" mood="静">'],
    ['ability', '<ability user="甲" name="技" kind="魔法">'],
    ['check', '<check type="观察" actor="甲" target="乙">'],
    ['restart', '<restart deathId="loop-1" checkpoint="起点">'],
  ];

  for (const [name, opening] of cases) {
    const incompleteLocal = `${opening}<UpdateVariable>{"literal":"</${name}>"}</UpdateVariable>`;
    const source = header
      + `前。${terminal}\n\n${incompleteLocal}\n\n{甲}「后。」${terminal}\n${updateVariable}`;
    const split = splitUpdateVariable(source);

    assert.deepEqual(split, {
      ok: true,
      content: source,
      separator: '',
      updateVariable: null,
      errors: [],
    }, name);
    for (const result of [parseNarrative(source), parseStreamingNarrative(source)]) {
      assert.equal(result.ok, false, name);
      assert.equal(result.updateVariable, null, name);
      assert.equal(errorCodes(result).includes('invalid-trailing-content'), true, name);
    }
  }
});

test('scanner C10 continues past an internal UpdateVariable after completed local evidence', () => {
  const terminal = '</now_plot></content>';
  const header = currentResponse('').slice(0, -terminal.length);
  const local = '<x/>';
  const internalUpdate = '<UpdateVariable>{"literal":"</now_plot><x>"}</UpdateVariable>';
  const terminalUpdate = '<UpdateVariable>{"terminal":1}</UpdateVariable>';

  for (const lineEnding of ['\n', '\r\n', '\r']) {
    const blank = lineEnding + lineEnding;
    const content = header
      + `前。${terminal}${blank}${local}${blank}${internalUpdate}${blank}`
      + `{甲}「后。」${terminal}`;
    const source = content + lineEnding + terminalUpdate;
    const label = JSON.stringify(lineEnding);

    assert.deepEqual(splitUpdateVariable(source), {
      ok: true,
      content,
      separator: lineEnding,
      updateVariable: terminalUpdate,
      errors: [],
    }, label);

    for (const result of [parseNarrative(source), parseStreamingNarrative(source)]) {
      assert.equal(result.ok, true, label);
      assert.ok(result.blocks.some((block) => block.rawText === local), label);
      assert.ok(result.blocks.some((block) => block.rawText === internalUpdate), label);
      assert.deepEqual(result.blocks.at(-1), { type: 'dialogue', speaker: '甲', text: '后。' }, label);
      assert.equal(result.updateVariable, terminalUpdate, label);
      assert.equal(errorCodes(result).includes('invalid-root-structure'), false, label);
      assert.equal(errorCodes(result).includes('invalid-trailing-content'), false, label);
    }

    const streaming = parseStreamingNarrative(source);
    assert.equal(streaming.streaming, false, label);
    assert.equal(streaming.complete, true, label);
    assert.equal(streaming.progressText, '', label);
  }
});

test('scanner C10 continues past recoverable malformed and stray siblings after completed local evidence', () => {
  const terminal = '</now_plot></content>';
  const header = currentResponse('').slice(0, -terminal.length);
  const terminalUpdate = '<UpdateVariable>{"terminal":1}</UpdateVariable>';

  for (const lineEnding of ['\n', '\r\n', '\r']) {
    const blank = lineEnding + lineEnding;
    const cases = [
      ['recoverable malformed opener', `<scene actor="${blank}`],
      ['stray close', `</scene>${blank}`],
    ];

    for (const [name, sibling] of cases) {
      const content = header
        + `前。${terminal}${blank}<x/>${blank}${sibling}`
        + `{甲}「后。」${terminal}`;
      const source = content + lineEnding + terminalUpdate;
      const label = `${name}:${JSON.stringify(lineEnding)}`;

      assert.deepEqual(splitUpdateVariable(source), {
        ok: true,
        content,
        separator: lineEnding,
        updateVariable: terminalUpdate,
        errors: [],
      }, label);
      for (const result of [parseNarrative(source), parseStreamingNarrative(source)]) {
        assert.equal(result.ok, true, label);
        assert.deepEqual(result.blocks.at(-1), { type: 'dialogue', speaker: '甲', text: '后。' }, label);
        assert.equal(result.updateVariable, terminalUpdate, label);
        assert.equal(errorCodes(result).includes('invalid-root-structure'), false, label);
        assert.equal(errorCodes(result).includes('invalid-trailing-content'), false, label);
      }
    }
  }
});

test('scanner C10 accepts completed local element evidence only before a still-later outer plot close', () => {
  const terminal = '</now_plot></content>';
  const header = currentResponse('').slice(0, -terminal.length);
  const updateVariable = '<UpdateVariable>{"x":1}</UpdateVariable>';
  const localStructuredContent = '<content><story volume="02">第02卷｜救赎的开始</story>'
    + '<time period="夜间" layer="主线" basis="编辑演算">魔女历1000年01月02日</time>'
    + '<now_plot>内。</now_plot></content>';
  const cases = [
    ['local now_plot with dialogue', '<now_plot>内。</now_plot>', '{甲}「后。」', 'invalid'],
    ['local content', '<content>内。</content>', '{甲}「后。」', 'invalid'],
    ['structured local content', localStructuredContent, '{甲}「后。」', 'invalid'],
    ['unknown local pair', '<x>内。</x>', '{甲}「后。」', 'invalid'],
    ['self-closing unknown local', '<x/>', '{甲}「后。」', 'invalid'],
    ['supported check', '<check type="判" actor="甲" target="乙">后。</check>', '', 'check'],
    ['supported ability', ability(), '', 'ability'],
  ];

  for (const [name, local, continuation, expectedType] of cases) {
    const tail = continuation ? `\n\n${continuation}` : '';
    const content = header + `前。${terminal}\n\n${local}${tail}${terminal}`;
    const source = content + '\n' + updateVariable;
    const split = splitUpdateVariable(source);

    assert.equal(split.content, content, name);
    assert.equal(split.separator, '\n', name);
    assert.equal(split.updateVariable, updateVariable, name);
    for (const result of [parseNarrative(source), parseStreamingNarrative(source)]) {
      assert.equal(result.ok, true, name);
      assert.ok(result.blocks.some((block) => (
        expectedType === 'invalid'
          ? block.type === 'invalid' && block.rawText === local
          : block.type === expectedType
      )), name);
      if (continuation) {
        assert.deepEqual(result.blocks.at(-1), { type: 'dialogue', speaker: '甲', text: '后。' }, name);
      }
      assert.equal(result.updateVariable, updateVariable, name);
      assert.equal(errorCodes(result).includes('invalid-root-structure'), false, name);
      assert.equal(errorCodes(result).includes('invalid-trailing-content'), false, name);
    }
  }

  const compoundCases = [
    '<x><now_plot>内一。</now_plot><y><now_plot>内二。</now_plot></y></x>',
    '<now_plot>内一。</now_plot>\n\n<x><now_plot>内二。</now_plot></x>',
  ];
  for (const local of compoundCases) {
    const content = header + `前。${terminal}\n\n${local}\n\n{甲}「后。」${terminal}`;
    const result = parseNarrative(content);

    assert.equal(result.ok, true, local);
    assert.deepEqual(result.blocks.at(-1), { type: 'dialogue', speaker: '甲', text: '后。' }, local);
    assert.equal(errorCodes(result).includes('invalid-root-structure'), false, local);
    assert.equal(errorCodes(result).includes('invalid-trailing-content'), false, local);
  }
});

test('scanner C10 does not use local or UpdateVariable closes as absent outer-root evidence', () => {
  const terminal = '</now_plot></content>';
  const header = currentResponse('').slice(0, -terminal.length);
  const controls = [
    ['sole local plot close', `${header}前。${terminal}\n\n<now_plot>内。</now_plot>`, 'invalid-trailing-content'],
    [
      'internal UpdateVariable pair',
      `${header}前。${terminal}\n\n<UpdateVariable>{"literal":"</now_plot>"}</UpdateVariable>${terminal}`,
      'invalid-update-variable-trailing-content',
    ],
  ];

  for (const [name, source, expectedError] of controls) {
    for (const result of [parseNarrative(source), parseStreamingNarrative(source)]) {
      assert.equal(result.ok, false, name);
      assert.deepEqual(errorCodes(result), [expectedError], name);
      assert.equal(errorCodes(result).includes('invalid-root-structure'), false, name);
      assert.equal(result.updateVariable, null, name);
    }
    const streaming = parseStreamingNarrative(source);
    assert.equal(streaming.streaming, false, name);
    assert.equal(streaming.complete, true, name);
  }
});

test('scanner C10 keeps repeated local plot continuations sub-quadratic', () => {
  const terminal = '</now_plot></content>';
  const header = currentResponse('').slice(0, -terminal.length);
  const updateVariable = '<UpdateVariable>{"x":1}</UpdateVariable>';
  const source = (count) => {
    const content = header
      + (`前。${terminal}\n\n<now_plot>内。</now_plot>\n\n`).repeat(count)
      + `{甲}「终。」${terminal}`;
    return content + '\n' + updateVariable;
  };
  const measure = (parser, input) => {
    const samples = Array.from({ length: 7 }, () => {
      const started = performance.now();
      let result;
      for (let iteration = 0; iteration < 20; iteration += 1) {
        result = parser(input);
      }
      return { elapsedMs: performance.now() - started, result };
    }).sort((left, right) => left.elapsedMs - right.elapsedMs);
    return samples[Math.floor(samples.length / 2)];
  };
  const warmup = source(50);
  const small = source(300);
  const large = source(600);
  const parsers = [parseNarrative, parseStreamingNarrative, splitUpdateVariable];

  assert.ok(large.length < LIMITS.SOURCE);
  for (let iteration = 0; iteration < 4; iteration += 1) {
    for (const parser of parsers) {
      parser(warmup);
    }
  }
  const timings = parsers.map((parser) => {
    const smallSample = measure(parser, small);
    const largeSample = measure(parser, large);
    return {
      name: parser.name,
      small: smallSample,
      large: largeSample,
      ratio: largeSample.elapsedMs / smallSample.elapsedMs,
    };
  });

  assert.ok(
    timings.every(({ large: sample }) => sample.elapsedMs < 1_000),
    'large repeated-local parses must stay within the operational budget: '
      + timings.map(({ name, large: sample }) => `${name} ${sample.elapsedMs.toFixed(1)}ms`).join(', '),
  );
  assert.ok(
    timings.every(({ ratio }) => ratio < 3),
    'doubling local plot continuations must remain sub-quadratic: '
      + timings.map(({ name, small: smallSample, large: largeSample, ratio }) => (
        `${name} ${smallSample.elapsedMs.toFixed(1)}/${largeSample.elapsedMs.toFixed(1)}ms (${ratio.toFixed(2)}x)`
      )).join(', '),
  );
  assert.equal(timings[0].large.result.ok, true);
  assert.equal(timings[0].large.result.updateVariable, updateVariable);
  assert.equal(errorCodes(timings[0].large.result).includes('invalid-root-structure'), false);
  assert.equal(errorCodes(timings[0].large.result).includes('invalid-trailing-content'), false);
  assert.equal(timings[1].large.result.streaming, false);
  assert.equal(timings[1].large.result.complete, true);
  assert.equal(timings[1].large.result.updateVariable, updateVariable);
  assert.equal(timings[2].large.result.updateVariable, updateVariable);
});

test('scanner C8 selects the final root pair through repeated premature pairs', () => {
  const terminal = '</now_plot></content>';
  const header = currentResponse('').slice(0, -terminal.length);
  const updateVariable = '<UpdateVariable>{"x":1}</UpdateVariable>';
  const content = header
    + '一。</now_plot></content>\n\n中一。\n\n'
    + '二。</now_plot></content>\n\n<check type="判" actor="甲" target="乙">中二。</check>\n\n'
    + '{甲}「终。」'
    + terminal;
  const source = content + '\n' + updateVariable;

  assert.deepEqual(splitUpdateVariable(source), {
    ok: true,
    content,
    separator: '\n',
    updateVariable,
    errors: [],
  });
  for (const result of [parseNarrative(source), parseStreamingNarrative(source)]) {
    assert.equal(result.ok, true);
    assert.deepEqual(result.blocks.at(-1), { type: 'dialogue', speaker: '甲', text: '终。' });
    assert.ok(result.blocks.some((block) => block.type === 'check' && block.text === '中二。'));
    assert.deepEqual(result.blocks.slice(0, 7), [
      { type: 'narration', text: '一。' },
      {
        type: 'invalid',
        status: 'invalid',
        reason: 'invalid-local-block',
        rawText: '</now_plot>',
      },
      {
        type: 'invalid',
        status: 'invalid',
        reason: 'invalid-local-block',
        rawText: '</content>',
      },
      { type: 'narration', text: '中一。' },
      { type: 'narration', text: '二。' },
      {
        type: 'invalid',
        status: 'invalid',
        reason: 'invalid-local-block',
        rawText: '</now_plot>',
      },
      {
        type: 'invalid',
        status: 'invalid',
        reason: 'invalid-local-block',
        rawText: '</content>',
      },
    ]);
    assert.equal(result.updateVariable, updateVariable);
    assert.equal(errorCodes(result).includes('invalid-trailing-content'), false);
    assert.equal(errorCodes(result).includes('invalid-root-structure'), false);
  }

  const bareContent = header + '前。</now_plot>假。\n\n{甲}「后。」' + terminal;
  const bare = parseNarrative(bareContent);
  assert.equal(bare.ok, true);
  assert.deepEqual(bare.blocks, [
    { type: 'narration', text: '前。' },
    {
      type: 'invalid',
      status: 'invalid',
      reason: 'invalid-local-block',
      rawText: '</now_plot>',
    },
    { type: 'narration', text: '假。' },
    { type: 'dialogue', speaker: '甲', text: '后。' },
  ]);
});

test('scanner C8 does not promote premature pairs without later sibling evidence', () => {
  const terminal = '</now_plot></content>';
  const header = currentResponse('').slice(0, -terminal.length);
  const firstClosedRoot = header + '前。' + terminal;
  const controls = [
    {
      name: 'no later plot close',
      source: firstClosedRoot + '\n\n任意垃圾',
    },
    {
      name: 'only whitespace and close tags between pairs',
      source: firstClosedRoot + '\r\n\r\n' + terminal,
    },
  ];

  for (const { name, source } of controls) {
    const complete = parseNarrative(source);
    const streaming = parseStreamingNarrative(source);

    for (const result of [complete, streaming]) {
      assert.equal(result.ok, false, name);
      assert.ok(errorCodes(result).includes('invalid-trailing-content'), name);
      assert.equal(errorCodes(result).includes('invalid-root-structure'), false, name);
    }
    assert.equal(streaming.streaming, false, name);
    assert.equal(streaming.complete, true, name);
    assert.equal(streaming.progressText, '', name);
    assert.deepEqual(splitUpdateVariable(source), {
      ok: true,
      content: source,
      separator: '',
      updateVariable: null,
      errors: [],
    }, name);
  }
});

test('scanner C8 preserves terminal UpdateVariable ownership after structural overflow', () => {
  const terminal = '</now_plot></content>';
  const header = currentResponse('').slice(0, -terminal.length);
  const updateVariable = '<UpdateVariable>{"literal":"</now_plot></content><x>"}</UpdateVariable>';
  const filler = `<x>${'<y></y>'.repeat(2_120)}</x>`;

  for (const lineEnding of ['\n', '\r\n', '\r']) {
    const content = header
      + '前。</now_plot></content>'
      + lineEnding + lineEnding
      + '{甲}「后。」'
      + lineEnding + lineEnding
      + filler
      + terminal;
    const source = content + lineEnding + updateVariable;
    const label = JSON.stringify(lineEnding);
    const split = splitUpdateVariable(source);

    assert.ok(source.length < LIMITS.SOURCE, label);
    assert.deepEqual(split, {
      ok: true,
      content,
      separator: lineEnding,
      updateVariable,
      errors: [],
    }, label);
    assert.equal(split.content + split.separator + split.updateVariable, source, label);
    for (const result of [parseNarrative(source), parseStreamingNarrative(source)]) {
      assert.equal(result.ok, true, label);
      assert.equal(result.player, '菜月昴', label);
      assert.deepEqual(result.story, { volume: '01', heading: '第01卷｜开始的余温' }, label);
      assert.ok(result.blocks.some((block) => block.type === 'dialogue' && block.text === '后。'), label);
      assert.equal(result.blocks.at(-1).reason, 'block-count-exceeded', label);
      assert.ok(errorCodes(result).includes('block-count-exceeded'), label);
      assert.equal(errorCodes(result).includes('invalid-trailing-content'), false, label);
      assert.equal(errorCodes(result).includes('invalid-root-structure'), false, label);
      assert.equal(result.updateVariable, updateVariable, label);
    }
    const streaming = parseStreamingNarrative(source);
    assert.equal(streaming.streaming, false, label);
    assert.equal(streaming.complete, true, label);
    assert.equal(streaming.progressText, '', label);
  }
});

function c9OverflowSource({
  lineEnding,
  payloadPairCount,
  partial = false,
  continuation = '{甲}「后。」',
  prematurePairCount = 1,
}) {
  const terminal = '</now_plot></content>';
  const header = currentResponse('').slice(0, -terminal.length);
  const premature = Array.from({ length: prematurePairCount }, (_, index) => (
    `${index === 0 ? '前。' : `中${index}。`}${terminal}${lineEnding}${lineEnding}`
  )).join('');
  const content = header
    + premature
    + continuation
    + lineEnding + lineEnding
    + `<x>${'<y></y>'.repeat(2_080)}</x>`
    + terminal;
  const payload = '<UpdateVariable>'
    + '<z></z>'.repeat(payloadPairCount)
    + (partial ? '{"x":' : '{"x":1}</UpdateVariable>');
  return { content, payload, source: content + lineEnding + payload };
}

test('scanner C9 keeps complete terminal UpdateVariable payload tags outside the retained tail', () => {
  for (const payloadPairCount of [30, 31, 32]) {
    for (const lineEnding of ['\n', '\r\n', '\r']) {
      const { content, payload, source } = c9OverflowSource({ lineEnding, payloadPairCount });
      const label = `${payloadPairCount}:${JSON.stringify(lineEnding)}`;
      const split = splitUpdateVariable(source);

      assert.ok(source.length < LIMITS.SOURCE, label);
      assert.deepEqual(split, {
        ok: true,
        content,
        separator: lineEnding,
        updateVariable: payload,
        errors: [],
      }, label);
      assert.equal(split.content + split.separator + split.updateVariable, source, label);
      for (const result of [parseNarrative(source), parseStreamingNarrative(source)]) {
        assert.equal(result.ok, true, label);
        assert.ok(result.blocks.some((block) => block.type === 'dialogue' && block.text === '后。'), label);
        assert.equal(result.updateVariable, payload, label);
        assert.equal(errorCodes(result).includes('invalid-root-structure'), false, label);
        assert.equal(errorCodes(result).includes('invalid-trailing-content'), false, label);
      }
      const streaming = parseStreamingNarrative(source);
      assert.equal(streaming.streaming, false, label);
      assert.equal(streaming.complete, true, label);
      assert.equal(streaming.progressText, '', label);
    }
  }
});

test('scanner C9 keeps partial terminal UpdateVariable payload tags opaque after the true root', () => {
  for (const payloadPairCount of [30, 31, 32]) {
    for (const lineEnding of ['\n', '\r\n', '\r']) {
      const { payload, source } = c9OverflowSource({ lineEnding, payloadPairCount, partial: true });
      const label = `${payloadPairCount}:${JSON.stringify(lineEnding)}`;
      const split = splitUpdateVariable(source);
      const complete = parseNarrative(source);
      const streaming = parseStreamingNarrative(source);

      assert.equal(split.ok, false, label);
      assert.equal(split.content, null, label);
      assert.equal(split.updateVariable, null, label);
      assert.deepEqual(errorCodes(split), ['incomplete-update-variable'], label);
      assert.equal(complete.ok, false, label);
      assert.deepEqual(errorCodes(complete), ['incomplete-update-variable'], label);
      assert.equal(streaming.ok, true, label);
      assert.equal(streaming.streaming, true, label);
      assert.equal(streaming.complete, false, label);
      assert.equal(streaming.progressText, payload, label);
      assert.equal(streaming.updateVariable, null, label);
      assert.ok(streaming.blocks.some((block) => block.type === 'dialogue' && block.text === '后。'), label);
      assert.ok(errorCodes(streaming).includes('incomplete-update-variable'), label);
      assert.equal(errorCodes(streaming).includes('invalid-root-structure'), false, label);
      assert.equal(errorCodes(streaming).includes('invalid-trailing-content'), false, label);
    }
  }
});

test('scanner C9 renews terminal ownership after varied and repeated premature root candidates', () => {
  const cases = [
    {
      name: 'one dialogue continuation',
      continuation: '{甲}「后。」',
      prematurePairCount: 1,
      matches: (block) => block.type === 'dialogue' && block.text === '后。',
    },
    {
      name: 'one narration continuation',
      continuation: '后。',
      prematurePairCount: 1,
      matches: (block) => block.type === 'narration' && block.text === '后。',
    },
    {
      name: 'multiple check continuation',
      continuation: '<check type="判" actor="甲" target="乙">后。</check>',
      prematurePairCount: 3,
      matches: (block) => block.type === 'check' && block.text === '后。',
    },
  ];

  for (const { name, matches, ...options } of cases) {
    const { content, payload, source } = c9OverflowSource({
      ...options,
      lineEnding: '\r\n',
      payloadPairCount: 31,
    });
    const split = splitUpdateVariable(source);

    assert.equal(split.content, content, name);
    assert.equal(split.updateVariable, payload, name);
    for (const result of [parseNarrative(source), parseStreamingNarrative(source)]) {
      assert.equal(result.ok, true, name);
      assert.ok(result.blocks.some(matches), name);
      assert.equal(result.updateVariable, payload, name);
      assert.equal(errorCodes(result).includes('invalid-root-structure'), false, name);
      assert.equal(errorCodes(result).includes('invalid-trailing-content'), false, name);
    }
  }
});

test('scanner C9 does not rescue a failed first post-root UpdateVariable attempt with a later one', () => {
  const content = currentResponse('正文。');
  const source = content
    + '\r\n<UpdateVariable>{"first":1}</UpdateVariable>垃圾'
    + '\r\n<UpdateVariable>{"second":2}</UpdateVariable>';
  const split = splitUpdateVariable(source);

  assert.equal(split.ok, false);
  assert.equal(split.content, null);
  assert.equal(split.updateVariable, null);
  assert.deepEqual(errorCodes(split), ['multiple-update-variable']);
  for (const result of [parseNarrative(source), parseStreamingNarrative(source)]) {
    assert.equal(result.ok, false);
    assert.equal(result.updateVariable, null);
    assert.deepEqual(errorCodes(result), ['multiple-update-variable']);
  }
  const streaming = parseStreamingNarrative(source);
  assert.equal(streaming.streaming, false);
  assert.equal(streaming.complete, true);
  assert.equal(streaming.progressText, '');
});

test('scanner C9 keeps genuinely closed root suffix classification stable without revocation', () => {
  const content = currentResponse('正文。');
  const garbageSource = content + '\r\n垃圾';
  const garbageSplit = splitUpdateVariable(garbageSource);
  const garbage = parseStreamingNarrative(garbageSource);

  assert.equal(garbageSplit.content, garbageSource);
  assert.equal(garbageSplit.updateVariable, null);
  assert.equal(garbage.ok, false);
  assert.ok(errorCodes(garbage).includes('invalid-trailing-content'));
  assert.equal(garbage.streaming, false);
  assert.equal(garbage.complete, true);
  assert.equal(garbage.progressText, '');

  for (const lineEnding of ['\n', '\r\n', '\r']) {
    const payload = `<UpdateVariable>${'<z></z>'.repeat(32)}{"x":1}</UpdateVariable>`;
    const source = content + lineEnding + payload;
    const split = splitUpdateVariable(source);
    const streaming = parseStreamingNarrative(source);

    assert.equal(split.content, content, JSON.stringify(lineEnding));
    assert.equal(split.separator, lineEnding, JSON.stringify(lineEnding));
    assert.equal(split.updateVariable, payload, JSON.stringify(lineEnding));
    assert.equal(streaming.ok, true, JSON.stringify(lineEnding));
    assert.equal(streaming.updateVariable, payload, JSON.stringify(lineEnding));
    assert.equal(streaming.streaming, false, JSON.stringify(lineEnding));
    assert.equal(streaming.complete, true, JSON.stringify(lineEnding));
  }
});

test('scanner C8 keeps repeated premature root-close pairs sub-quadratic', () => {
  const terminal = '</now_plot></content>';
  const header = currentResponse('').slice(0, -terminal.length);
  const updateVariable = '<UpdateVariable>{"x":1}</UpdateVariable>';
  const source = (count) => {
    const content = header
      + '前。</now_plot></content>\n\n中。\n\n'.repeat(count)
      + '{甲}「终。」'
      + terminal;
    return content + '\n' + updateVariable;
  };
  const measure = (parser, input) => {
    const samples = Array.from({ length: 7 }, () => {
      const started = performance.now();
      const result = parser(input);
      return { elapsedMs: performance.now() - started, result };
    }).sort((left, right) => left.elapsedMs - right.elapsedMs);
    return samples[Math.floor(samples.length / 2)];
  };
  const warmup = source(100);
  const small = source(800);
  const large = source(1_600);
  const parsers = [parseNarrative, parseStreamingNarrative, splitUpdateVariable];

  assert.ok(large.length < LIMITS.SOURCE);
  for (let iteration = 0; iteration < 4; iteration += 1) {
    for (const parser of parsers) {
      parser(warmup);
    }
  }
  const timings = parsers.map((parser) => {
    const smallSample = measure(parser, small);
    const largeSample = measure(parser, large);
    return {
      name: parser.name,
      small: smallSample,
      large: largeSample,
      ratio: largeSample.elapsedMs / smallSample.elapsedMs,
    };
  });

  assert.ok(
    timings.every(({ large: sample }) => sample.elapsedMs < 1_000),
    'large repeated-pair parses must stay within the operational budget: '
      + timings.map(({ name, large: sample }) => `${name} ${sample.elapsedMs.toFixed(1)}ms`).join(', '),
  );
  assert.ok(
    timings.every(({ ratio }) => ratio < 3),
    'doubling premature pairs must remain sub-quadratic: '
      + timings.map(({ name, small: smallSample, large: largeSample, ratio }) => (
        `${name} ${smallSample.elapsedMs.toFixed(1)}/${largeSample.elapsedMs.toFixed(1)}ms (${ratio.toFixed(2)}x)`
      )).join(', '),
  );
  assert.equal(timings[0].large.result.ok, true);
  assert.equal(timings[0].large.result.blocks.at(-1).reason, 'block-count-exceeded');
  assert.equal(errorCodes(timings[0].large.result).includes('invalid-trailing-content'), false);
  assert.equal(errorCodes(timings[0].large.result).includes('invalid-root-structure'), false);
  assert.equal(timings[0].large.result.updateVariable, updateVariable);
  assert.equal(timings[1].large.result.streaming, false);
  assert.equal(timings[1].large.result.complete, true);
  assert.equal(timings[1].large.result.updateVariable, updateVariable);
  assert.equal(timings[2].large.result.updateVariable, updateVariable);
  assert.equal(
    timings[2].large.result.content
      + timings[2].large.result.separator
      + timings[2].large.result.updateVariable,
    large,
  );
});

test('scanner C6 keeps repeated nonterminal UpdateVariable openers sub-quadratic', () => {
  const opening = '<UpdateVariable>';
  const closing = '</UpdateVariable>';
  const terminal = '</now_plot></content>';
  const header = currentResponse('').slice(0, -terminal.length);
  const hostileSource = (count) => (
    header + opening.repeat(count) + `${closing}x${terminal}`
  );
  const smallSource = hostileSource(4_000);
  const largeSource = hostileSource(8_000);
  const warmupSource = hostileSource(500);
  const parsers = [parseNarrative, parseStreamingNarrative, splitUpdateVariable];
  const measure = (parser, source) => {
    const samples = Array.from({ length: 7 }, () => {
      const started = performance.now();
      const result = parser(source);
      return { elapsedMs: performance.now() - started, result };
    }).sort((left, right) => left.elapsedMs - right.elapsedMs);
    return samples[Math.floor(samples.length / 2)];
  };

  assert.ok(largeSource.length < LIMITS.SOURCE);
  for (let iteration = 0; iteration < 4; iteration += 1) {
    for (const parser of parsers) {
      parser(warmupSource);
    }
  }

  const timings = parsers.map((parser) => {
    const small = measure(parser, smallSource);
    const large = measure(parser, largeSource);
    return { name: parser.name, small, large, ratio: large.elapsedMs / small.elapsedMs };
  });

  assert.ok(
    timings.every(({ large }) => large.elapsedMs < 1_000),
    'large hostile parses must stay within the operational budget: '
      + timings.map(({ name, large }) => `${name} ${large.elapsedMs.toFixed(1)}ms`).join(', '),
  );
  assert.ok(
    timings.every(({ ratio }) => ratio < 3),
    'doubling nonterminal UpdateVariable openers must remain sub-quadratic: '
      + timings.map(({ name, small, large, ratio }) => (
        `${name} ${small.elapsedMs.toFixed(1)}/${large.elapsedMs.toFixed(1)}ms (${ratio.toFixed(2)}x)`
      )).join(', '),
  );
  assert.ok(errorCodes(timings[0].large.result).includes('unsupported-child'));
  assert.equal(errorCodes(timings[0].large.result).includes('block-count-exceeded'), false);
  assert.equal(errorCodes(timings[0].large.result).includes('source-too-long'), false);
  assert.equal(timings[1].large.result.streaming, false);
  assert.equal(timings[1].large.result.complete, true);
  assert.equal(errorCodes(timings[1].large.result).includes('source-too-long'), false);
  assert.equal(timings[2].large.result.content, largeSource);
  assert.equal(timings[2].large.result.updateVariable, null);
  assert.equal(errorCodes(timings[2].large.result).includes('source-too-long'), false);
});

test('scanner keeps repeated terminal UpdateVariable probes sub-quadratic', () => {
  const terminal = '</now_plot></content>';
  const header = currentResponse('').slice(0, -terminal.length);
  const terminalUpdate = '<UpdateVariable>{"terminal":1}</UpdateVariable>';
  const hostileSource = (count) => {
    const content = header
      + (`x${terminal}<UpdateVariable>`).repeat(count)
      + `</UpdateVariable>\n\n{甲}「终。」${terminal}`;
    return `${content}\n${terminalUpdate}`;
  };
  const smallSource = hostileSource(2_500);
  const largeSource = hostileSource(5_000);
  const parsers = [parseNarrative, parseStreamingNarrative, splitUpdateVariable];
  const countCloseProbes = (parser, source) => {
    const originalIndexOf = String.prototype.indexOf;
    let closeProbes = 0;
    String.prototype.indexOf = function instrumentedIndexOf(searchString, position) {
      if (searchString === '</UpdateVariable>' && this.length === source.length) {
        closeProbes += 1;
      }
      return originalIndexOf.call(this, searchString, position);
    };
    try {
      const result = parser(source);
      return { closeProbes, result };
    } finally {
      String.prototype.indexOf = originalIndexOf;
    }
  };

  assert.ok(largeSource.length < LIMITS.SOURCE);
  const scans = parsers.map((parser) => {
    const small = countCloseProbes(parser, smallSource);
    const large = countCloseProbes(parser, largeSource);
    return { name: parser.name, small, large };
  });

  assert.ok(
    scans.every(({ small, large }) => small.closeProbes > 0 && large.closeProbes > 0),
    'terminal-probe instrumentation must observe exact-close scans',
  );
  assert.ok(
    scans.every(({ small, large }) => large.closeProbes <= small.closeProbes + 1 && large.closeProbes <= 6),
    'doubling terminal probes must keep exact-close scans bounded: '
      + scans.map(({ name, small, large }) => (
        `${name} ${small.closeProbes}/${large.closeProbes} probes`
      )).join(', '),
  );
  assert.equal(errorCodes(scans[0].large.result).includes('source-too-long'), false);
  assert.equal(scans[1].large.result.streaming, false);
  assert.equal(scans[1].large.result.complete, true);
  assert.equal(scans[1].large.result.updateVariable, terminalUpdate);
  assert.equal(errorCodes(scans[1].large.result).includes('source-too-long'), false);
  assert.equal(scans[2].large.result.updateVariable, terminalUpdate);
  assert.equal(
    scans[2].large.result.content
      + scans[2].large.result.separator
      + scans[2].large.result.updateVariable,
    largeSource,
  );
  assert.equal(errorCodes(scans[2].large.result).includes('source-too-long'), false);
});

test('scanner C4 keeps terminal UpdateVariable syntax outside the content tag budget', () => {
  const terminal = '</now_plot></content>';
  const header = currentResponse('').slice(0, -terminal.length);
  const updateVariable = '<UpdateVariable>{"x":1}</UpdateVariable>';

  for (const count of [2_104, 2_105, 2_106]) {
    const owner = `<x>${'<y></y>'.repeat(count)}</now_plot></x>`
      + '<check type="判" actor="甲" target="乙">后。</check>';
    const content = header + '前。\n\n' + owner + terminal;
    const baseline = parseNarrative(content);
    const withUpdate = parseNarrative(content + updateVariable);
    const { updateVariable: baselineUpdate, ...baselineContent } = baseline;
    const { updateVariable: completeUpdate, ...completeContent } = withUpdate;

    assert.equal(baseline.ok, true, `${count}`);
    assert.equal(baselineUpdate, null, `${count}`);
    assert.equal(completeUpdate, updateVariable, `${count}`);
    assert.deepEqual(completeContent, baselineContent, `${count}`);
    const split = splitUpdateVariable(content + updateVariable);
    assert.equal(split.content, content, `${count}`);
    assert.equal(split.updateVariable, updateVariable, `${count}`);
    const closedStreaming = parseStreamingNarrative(content + updateVariable);
    const { streaming, complete, progressText, ...closedContent } = closedStreaming;
    assert.equal(streaming, false, `${count}`);
    assert.equal(complete, true, `${count}`);
    assert.equal(progressText, '', `${count}`);
    assert.deepEqual(closedContent, withUpdate, `${count}`);
    if (count === 2_106) {
      const recoveredContent = 'x' + content;
      const recoveredSource = recoveredContent + updateVariable;
      const recoveredSplit = splitUpdateVariable(recoveredSource);
      assert.equal(recoveredSplit.content, recoveredContent);
      assert.equal(recoveredSplit.updateVariable, updateVariable);
      const recovered = parseStreamingNarrative(recoveredSource);
      assert.deepEqual([recovered.streaming, recovered.complete, recovered.updateVariable], [false, true, updateVariable]);
    }

    for (const lineEnding of ['\n', '\r\n', '\r']) {
      const partial = '<UpdateVari';
      const pending = parseStreamingNarrative(content + lineEnding + partial);
      const { streaming: pendingStreaming, complete: pendingComplete, progressText: pendingText, ...pendingContent } = pending;
      pendingContent.errors = pendingContent.errors.filter((error) => error.code !== 'incomplete-update-variable');
      assert.equal(pendingStreaming, true, `${count}:${JSON.stringify(lineEnding)}`);
      assert.equal(pendingComplete, false, `${count}:${JSON.stringify(lineEnding)}`);
      assert.equal(pendingText, partial, `${count}:${JSON.stringify(lineEnding)}`);
      assert.ok(errorCodes(pending).includes('incomplete-update-variable'), `${count}:${JSON.stringify(lineEnding)}`);
      assert.deepEqual(pendingContent, baseline, `${count}:${JSON.stringify(lineEnding)}`);
    }
  }
});

test('a malformed local opener cannot consume the established terminal root closes', () => {
  const attempted = '{甲}「前<scene 后」';
  const source = currentResponse(attempted);
  const complete = parseNarrative(source);
  const streaming = parseStreamingNarrative(source);

  for (const result of [complete, streaming]) {
    assert.equal(result.ok, true);
    assert.deepEqual(result.blocks, [
      {
        type: 'invalid',
        status: 'invalid',
        reason: 'invalid-local-block',
        rawText: attempted,
      },
    ]);
  }
  assert.equal(streaming.streaming, false);
  assert.equal(streaming.complete, true);
  assert.equal(streaming.progressText, '');
});

test('a malformed local opener stays local before a later dialogue sibling', () => {
  const attempted = '{甲}「前<scene 后」';
  const body = `${attempted}\n\n{乙}「仍在。」\n\n`;
  const source = currentResponse(body);

  for (const result of [
    parseNarrative(source),
    parseStreamingNarrative(source.replace('</now_plot></content>', '')),
  ]) {
    assert.equal(result.ok, true);
    assert.deepEqual(result.blocks.map((block) => block.type), ['invalid', 'dialogue']);
    assert.equal(result.blocks[0].rawText, attempted);
    assert.deepEqual(result.blocks[1], { type: 'dialogue', speaker: '乙', text: '仍在。' });
  }
});

test('streaming parsing does not treat a closing-tag substring in an open tail as a closed response', () => {
  const source = '<content><story volume="01">第01卷｜开始的余温</story><time period="下午" layer="主线" basis="编辑演算">魔女历1000年01月01日</time><now_plot>仍在生成 </content> 后续';
  const result = parseStreamingNarrative(source);

  assert.equal(result.ok, true);
  assert.equal(result.streaming, true);
  assert.equal(result.complete, false);
  assert.deepEqual(result.blocks, [
    { type: 'narration', text: '仍在生成' },
    {
      type: 'invalid',
      status: 'invalid',
      reason: 'invalid-local-block',
      rawText: '</content>',
    },
  ]);
  assert.equal(result.progressText, '后续');
});

test('streaming parsing marks a syntactically closed invalid response as non-streaming', () => {
  const source = '<content version="2"><story volume="01">第01卷｜开始的余温</story><time period="下午" layer="主线" basis="编辑演算">魔女历1000年01月01日</time><now_plot>正文。</now_plot></content>';
  const result = parseStreamingNarrative(source);

  assert.equal(result.ok, false);
  assert.equal(result.streaming, false);
  assert.equal(result.complete, true);
});

test('streaming parsing treats a terminated self-closing content root as complete invalid', () => {
  for (const source of ['<content/>', '<content />', '<content \t/>']) {
    const result = parseStreamingNarrative(source);

    assert.equal(result.ok, false, source);
    assert.equal(result.streaming, false, source);
    assert.equal(result.complete, true, source);
    assert.equal(result.progressText, '', source);
    assert.ok(errorCodes(result).includes('invalid-root-structure'), source);
  }
});

test('streaming parsing keeps an unterminated content opener incomplete', () => {
  const result = parseStreamingNarrative('<content');

  assert.equal(result.streaming, true);
  assert.equal(result.complete, false);
});

test('streaming parsing treats a closed content root missing now_plot as complete but invalid', () => {
  const source = '<content><story volume="01">第01卷｜开始的余温</story><time period="下午" layer="主线" basis="编辑演算">魔女历1000年01月01日</time></content>';
  const result = parseStreamingNarrative(source);

  assert.equal(result.ok, false);
  assert.equal(result.streaming, false);
  assert.equal(result.complete, true);
  assert.equal(result.progressText, '');
  assert.ok(errorCodes(result).includes('invalid-root-structure'));
});

test('streaming parsing preserves closed content for every partial legal UpdateVariable prefix', () => {
  const content = currentResponse('{甲}「已完成。」');
  const opening = '<UpdateVariable>';
  const partials = [
    ...Array.from({ length: opening.length - 1 }, (_, index) => opening.slice(0, index + 1)),
    '<UpdateVariable>{"计数":',
  ];

  for (const partial of partials) {
    const result = parseStreamingNarrative(`${content}\n${partial}`);

    assert.equal(result.ok, true, partial);
    assert.equal(result.streaming, true, partial);
    assert.equal(result.complete, false, partial);
    assert.equal(result.player, '菜月昴', partial);
    assert.deepEqual(result.story, { volume: '01', heading: '第01卷｜开始的余温' }, partial);
    assert.deepEqual(result.time, {
      period: '下午',
      layer: '主线',
      basis: '编辑演算',
      text: '魔女历1000年01月01日',
    }, partial);
    assert.deepEqual(result.blocks, [{ type: 'dialogue', speaker: '甲', text: '已完成。' }], partial);
    assert.equal(result.updateVariable, null, partial);
    assert.equal(result.progressText, partial, partial);
    assert.ok(errorCodes(result).includes('incomplete-update-variable'), partial);
  }
});

test('complete parsing classifies every proper legal UpdateVariable opener prefix as incomplete', () => {
  const content = currentResponse('正文。');
  const opening = '<UpdateVariable>';

  for (let length = 1; length < opening.length; length += 1) {
    const partial = opening.slice(0, length);
    const source = `${content}${partial}`;
    const split = splitUpdateVariable(source);
    const parsed = parseNarrative(source);

    assert.equal(split.ok, false, partial);
    assert.equal(split.content, null, partial);
    assert.ok(errorCodes(split).includes('incomplete-update-variable'), partial);
    assert.equal(parsed.ok, false, partial);
    assert.ok(errorCodes(parsed).includes('incomplete-update-variable'), partial);
  }
});

test('complete parsing keeps divergent UpdateVariable lookalikes as invalid trailing content', () => {
  const source = `${currentResponse('正文。')}<UpdateVarX`;
  const split = splitUpdateVariable(source);
  const parsed = parseNarrative(source);

  assert.equal(split.ok, true);
  assert.equal(split.updateVariable, null);
  assert.ok(errorCodes(parsed).includes('invalid-trailing-content'));
  assert.equal(parseNarrative(currentResponse('正文。')).ok, true);
});

test('a byte diverging from the exact UpdateVariable opener is terminated trailing input', () => {
  const content = currentResponse('前。');

  for (const divergent of ['<UpdateVariableX', '<UpdateVariable/', '<UpdateVariable ']) {
    const source = content + divergent;
    const split = splitUpdateVariable(source);
    const complete = parseNarrative(source);
    const streaming = parseStreamingNarrative(source);

    assert.deepEqual(split, {
      ok: true,
      content: source,
      separator: '',
      updateVariable: null,
      errors: [],
    }, divergent);
    assert.equal(errorCodes(complete).includes('incomplete-update-variable'), false, divergent);
    assert.ok(errorCodes(complete).includes('invalid-trailing-content'), divergent);
    assert.equal(streaming.streaming, false, divergent);
    assert.equal(streaming.complete, true, divergent);
    assert.equal(streaming.progressText, '', divergent);
    assert.equal(errorCodes(streaming).includes('incomplete-update-variable'), false, divergent);
    assert.ok(errorCodes(streaming).includes('invalid-trailing-content'), divergent);
  }
});

test('streaming parsing treats a divergent UpdateVariable-like suffix as complete invalid trailing content', () => {
  const result = parseStreamingNarrative(`${currentResponse('正文。')}\n<Oops`);

  assert.equal(result.ok, false);
  assert.equal(result.streaming, false);
  assert.equal(result.complete, true);
  assert.equal(result.progressText, '');
  assert.ok(errorCodes(result).includes('invalid-trailing-content'));
});

test('streaming parsing treats a fully closed optional UpdateVariable as complete', () => {
  const content = currentResponse('正文。');
  const updateVariable = '<UpdateVariable>{"计数":1}</UpdateVariable>';
  const result = parseStreamingNarrative(`${content}\n${updateVariable}`);

  assert.equal(result.ok, true);
  assert.equal(result.streaming, false);
  assert.equal(result.complete, true);
  assert.equal(result.progressText, '');
  assert.equal(result.updateVariable, updateVariable);
});

test('streaming parsing treats garbage after a closed content root as complete but invalid', () => {
  const result = parseStreamingNarrative(`${currentResponse('正文。')}garbage`);

  assert.equal(result.ok, false);
  assert.equal(result.streaming, false);
  assert.equal(result.complete, true);
  assert.equal(result.progressText, '');
  assert.ok(errorCodes(result).includes('invalid-trailing-content'));
});

test('decodes only supported named entities and valid numeric references', () => {
  const source = currentResponse('甲&amp;乙 &lt; &gt; &quot; &apos; &#65; &#x1F600;');
  const result = parseNarrative(source);

  assert.deepEqual(result.blocks, [{ type: 'narration', text: '甲&乙 < > " \' A 😀' }]);
});

test('keeps unknown, malformed, and unsafe entities as inert literal text', () => {
  const inert = '&bogus; &#xZZ; &#0; &#xD800; &#x110000; &#1;';
  const result = parseNarrative(currentResponse(inert));

  assert.deepEqual(result.blocks, [{ type: 'narration', text: inert }]);
});

test('keeps bidi controls and Unicode noncharacters as literal numeric entities', () => {
  const inert = '&#x202E; &#xFFFE; &#x1FFFF;';
  const result = parseNarrative(currentResponse(inert));

  assert.deepEqual(result.blocks, [{ type: 'narration', text: inert }]);
});

test('degrades literal unsafe Unicode scalars as one local text block', () => {
  for (const unsafe of ['\u202e', '\u{1ffff}']) {
    const result = parseNarrative(currentResponse(`前${unsafe}后。\n\n{甲}「仍然保留。」`));

    assert.deepEqual(result.blocks.map((block) => block.type), ['invalid', 'dialogue']);
    assert.equal(result.blocks[0].reason, 'invalid-text-content');
    assert.deepEqual(result.blocks[1], { type: 'dialogue', speaker: '甲', text: '仍然保留。' });
  }
});

test('rejects literal unsafe Unicode scalars in required local and root attributes', () => {
  const local = parseNarrative(currentResponse('<scene location="王\u202e都" time="下午" mood="不安">场景。</scene>'));
  const root = parseNarrative(currentResponse('正文。', { player: '菜月\u202e昴' }));

  assert.equal(local.ok, true);
  assert.equal(local.blocks[0].type, 'invalid');
  assert.equal(root.ok, false);
  assert.ok(errorCodes(root).includes('invalid-content-attributes'));
});

test('preserves legitimate ZWJ emoji and supplementary literal text', () => {
  const source = currentResponse('家人👨‍👩‍👧‍👦与精灵😀同行。\n\n{甲😀}「继续‍前进。」');
  const result = parseNarrative(source);

  assert.deepEqual(result.blocks, [
    { type: 'narration', text: '家人👨‍👩‍👧‍👦与精灵😀同行。' },
    { type: 'dialogue', speaker: '甲😀', text: '继续‍前进。' },
  ]);
});

test('decodes a safe supplementary numeric entity', () => {
  const result = parseNarrative(currentResponse('&#x1F600;'));

  assert.deepEqual(result.blocks, [{ type: 'narration', text: '😀' }]);
});

test('does not recursively expand entity text', () => {
  const result = parseNarrative(currentResponse('&amp;lt;'));

  assert.deepEqual(result.blocks, [{ type: 'narration', text: '&lt;' }]);
});

test('returns a bounded inert diagnostic when the source limit is exceeded', () => {
  const result = parseNarrative('x'.repeat(LIMITS.SOURCE + 1));

  assert.equal(result.ok, false);
  assert.ok(errorCodes(result).includes('source-too-long'));
  assert.equal(result.blocks.length <= 1, true);
});

test('bounds retained unclosed local-element extent work across every public parser seam', () => {
  const updateVariableOpening = '<UpdateVariable>';
  const parsers = [parseNarrative, parseStreamingNarrative, splitUpdateVariable];
  const sizes = [1_000, 2_000, 4_000];
  const measure = (parser, source) => {
    const originalStartsWith = String.prototype.startsWith;
    let updateVariableOpeningProbes = 0;
    String.prototype.startsWith = function instrumentedStartsWith(searchString, position) {
      if (searchString === updateVariableOpening && this.length === source.length) {
        updateVariableOpeningProbes += 1;
      }
      return originalStartsWith.call(this, searchString, position);
    };

    let result;
    try {
      result = parser(source);
    } finally {
      String.prototype.startsWith = originalStartsWith;
    }
    return { result, updateVariableOpeningProbes };
  };

  for (const parser of parsers) {
    for (const size of sizes) {
      const source = currentResponse('<x>'.repeat(size));
      const { result, updateVariableOpeningProbes } = measure(parser, source);

      assert.ok(updateVariableOpeningProbes > size, `${parser.name} ${size} did not observe parser work`);
      assert.ok(
        updateVariableOpeningProbes <= size * 6 + 128,
        `${parser.name} ${size} retained-tag probes must stay linear; observed ${updateVariableOpeningProbes}`,
      );
      if (parser === splitUpdateVariable) {
        assert.equal(result.ok, true, `${parser.name} ${size}`);
        assert.equal(result.content, source, `${parser.name} ${size}`);
      } else {
        assert.equal(result.ok, true, `${parser.name} ${size}`);
        assert.equal(result.blocks[0].type, 'invalid', `${parser.name} ${size}`);
        assert.equal(result.blocks[0].reason, 'invalid-local-block', `${parser.name} ${size}`);
      }
    }
  }
});

test('bounds near-source-limit repeated unclosed tags within the operational budget', () => {
  const source = currentResponse('<x>'.repeat(70_000));
  assert.ok(source.length < LIMITS.SOURCE);

  const started = performance.now();
  const result = parseNarrative(source);
  const elapsedMs = performance.now() - started;

  assert.ok(elapsedMs < 2_000, `parse took ${elapsedMs.toFixed(1)}ms`);
  assert.equal(result.blocks[0].type, 'invalid');
  assert.equal(result.blocks[0].reason, 'invalid-local-block');
  assert.ok(errorCodes(result).includes('invalid-local-block'));
  assert.equal(Number.isInteger(LIMITS.BLOCKS), true);
  assert.ok(result.blocks.length <= LIMITS.BLOCKS + 1);
});

test('bounds repeated attempted-dialogue close lookup for complete and closed streaming parses', () => {
  const hostileSource = (paragraphCount) => currentResponse(
    Array.from({ length: paragraphCount }, (_, index) => `{甲}「坏${index}<x></x>`).join('\n\n'),
  );
  const smallSource = hostileSource(1_000);
  const largeSource = hostileSource(2_000);
  const warmupSource = hostileSource(100);

  const measure = (parser, source) => {
    const started = performance.now();
    const result = parser(source);
    return { elapsedMs: performance.now() - started, result };
  };

  parseNarrative(warmupSource);
  parseStreamingNarrative(warmupSource);
  const completeSmall = measure(parseNarrative, smallSource);
  const completeLarge = measure(parseNarrative, largeSource);
  const streamingSmall = measure(parseStreamingNarrative, smallSource);
  const streamingLarge = measure(parseStreamingNarrative, largeSource);

  assert.equal(completeLarge.result.ok, true);
  assert.equal(streamingLarge.result.streaming, false);
  assert.equal(streamingLarge.result.complete, true);
  const completeRatio = completeLarge.elapsedMs / completeSmall.elapsedMs;
  const streamingRatio = streamingLarge.elapsedMs / streamingSmall.elapsedMs;
  assert.ok(
    completeRatio < 3.25 && streamingRatio < 3.25,
    'doubling paragraphs must remain sub-quadratic: '
      + `complete ${completeSmall.elapsedMs.toFixed(1)}/${completeLarge.elapsedMs.toFixed(1)}ms `
      + `(${completeRatio.toFixed(2)}x), streaming `
      + `${streamingSmall.elapsedMs.toFixed(1)}/${streamingLarge.elapsedMs.toFixed(1)}ms `
      + `(${streamingRatio.toFixed(2)}x)`,
  );
});

test('stops at the configured block limit with one inert remainder diagnostic', () => {
  const configuredLimit = LIMITS.BLOCKS ?? 512;
  const source = currentResponse('<x></x>'.repeat(configuredLimit + 10));
  const result = parseNarrative(source);

  assert.equal(Number.isInteger(LIMITS.BLOCKS), true);
  assert.ok(result.blocks.length <= configuredLimit + 1);
  assert.equal(result.blocks.at(-1).type, 'invalid');
  assert.equal(result.blocks.at(-1).reason, 'block-count-exceeded');
  assert.equal(result.blocks.filter((block) => block.reason === 'block-count-exceeded').length, 1);
  assert.ok(errorCodes(result).includes('block-count-exceeded'));
});

test('preserves ordered valid structured blocks through the configured limit', () => {
  const blocks = Array.from({ length: LIMITS.BLOCKS }, (_, index) => (
    `<ability user="测试者" name="技能${index}" kind="魔法">`
    + `<effect>效果${index}。</effect><description>说明${index}。</description></ability>`
  ));
  const source = currentResponse(blocks.join(''));
  const result = parseNarrative(source);

  assert.ok(source.length < LIMITS.SOURCE);
  assert.equal(result.blocks.length, LIMITS.BLOCKS);
  assert.equal(result.blocks.every((block) => block.type === 'ability'), true);
  assert.equal(result.blocks[0].name, '技能0');
  assert.equal(result.blocks.at(-1).name, `技能${LIMITS.BLOCKS - 1}`);
  assert.equal(errorCodes(result).includes('block-count-exceeded'), false);
});

test('applies the configured block limit to a completed streaming prefix', () => {
  const prefix = '<content><story volume="01">第01卷｜开始的余温</story><time period="下午" layer="主线" basis="编辑演算">魔女历1000年01月01日</time><now_plot>';
  const source = prefix + '<x></x>'.repeat(LIMITS.BLOCKS + 10);
  const result = parseStreamingNarrative(source);

  assert.equal(result.streaming, true);
  assert.equal(result.complete, false);
  assert.ok(result.blocks.length <= LIMITS.BLOCKS + 1);
  assert.equal(result.blocks.at(-1).type, 'invalid');
  assert.equal(result.blocks.at(-1).reason, 'block-count-exceeded');
  assert.ok(errorCodes(result).includes('block-count-exceeded'));
});

test('rejects an attribute value beyond the attribute limit', () => {
  const source = currentResponse('正文。', { player: '甲'.repeat(LIMITS.ATTRIBUTE + 1) });
  const result = parseNarrative(source);

  assert.equal(result.ok, false);
  assert.ok(errorCodes(result).includes('attribute-too-long'));
});

test('degrades an oversized local text block without dropping later siblings', () => {
  const source = currentResponse(`${'长'.repeat(LIMITS.BLOCK_TEXT + 1)}\n\n{甲}「仍然可见。」`);
  const result = parseNarrative(source);

  assert.equal(result.ok, true);
  assert.equal(result.blocks[0].type, 'invalid');
  assert.equal(result.blocks[0].status, 'invalid');
  assert.deepEqual(result.blocks[1], { type: 'dialogue', speaker: '甲', text: '仍然可见。' });
});

test('round M memoizes one attempted-dialogue paragraph scan across stray closing tags', () => {
  const parsers = [parseNarrative, parseStreamingNarrative, splitUpdateVariable];
  for (const size of [1_000, 2_000, 4_000]) {
    const body = `{甲}「${'</x>'.repeat(size)}尾`;
    const source = currentResponse(body);
    const paragraphStart = source.indexOf(body);
    const plotCloseStart = source.lastIndexOf('</now_plot>');

    const measureFixedRangeScans = (parser) => {
      const originalSlice = String.prototype.slice;
      let fixedRangeScans = 0;
      String.prototype.slice = function instrumentedSlice(start, end) {
        if (
          this.length === source.length
          && start === paragraphStart
          && (end === plotCloseStart || end === source.length)
        ) {
          fixedRangeScans += 1;
        }
        return originalSlice.call(this, start, end);
      };

      let result;
      try {
        result = parser(source);
      } finally {
        String.prototype.slice = originalSlice;
      }
      return { fixedRangeScans, result };
    };

    for (const parser of parsers) {
      const sample = measureFixedRangeScans(parser);
      const label = `${parser.name}:${size}`;

      assert.ok(sample.fixedRangeScans > 0, `${label} did not observe attempted-dialogue work`);
      assert.ok(
        sample.fixedRangeScans <= 4,
        `${label} revisited a fixed paragraph ${sample.fixedRangeScans} times`,
      );
      if (parser === splitUpdateVariable) {
        assert.equal(sample.result.content, source, label);
      } else {
        assert.equal(sample.result.ok, true, label);
      }
    }
  }
});

test('round M caches attempted-dialogue leading-content discovery per paragraph', () => {
  const parsers = [parseNarrative, parseStreamingNarrative, splitUpdateVariable];

  for (const size of [100, 200, 400]) {
    const leadingWhitespace = ' '.repeat(size * 4);
    const body = `${leadingWhitespace}{甲}「${'</x>'.repeat(size)}尾`;
    const source = currentResponse(body);

    for (const parser of parsers) {
      const originalTrim = String.prototype.trim;
      let whitespaceProbes = 0;
      String.prototype.trim = function instrumentedTrim() {
        const trimmed = originalTrim.call(this);
        if (this.length === 1 && trimmed === '') {
          whitespaceProbes += 1;
        }
        return trimmed;
      };

      let result;
      try {
        result = parser(source);
      } finally {
        String.prototype.trim = originalTrim;
      }
      const label = `${parser.name}:${size}`;
      assert.ok(whitespaceProbes > 0, `${label} did not observe leading-content work`);
      assert.ok(
        whitespaceProbes <= leadingWhitespace.length + 16,
        `${label} repeated ${whitespaceProbes} leading-whitespace probes`,
      );
      assert.equal(typeof result.ok, 'boolean', label);
    }
  }
});

test('round M resolves repeated same-name closes with bounded candidate-prefix work', () => {
  const parsers = [parseNarrative, parseStreamingNarrative, splitUpdateVariable];

  for (const size of [100, 200, 400]) {
    const body = `{甲}「${'</now_plot>'.repeat(size)}尾」`;
    const source = currentResponse(body);
    const paragraphStart = source.indexOf(body);
    const plotCloseStart = source.lastIndexOf('</now_plot>');

    for (const parser of parsers) {
      const originalSlice = String.prototype.slice;
      let candidatePrefixUnits = 0;
      String.prototype.slice = function instrumentedSlice(start, end) {
        if (
          this.length === source.length
          && start === paragraphStart
          && Number.isInteger(end)
          && end > start
          && end <= plotCloseStart
        ) {
          candidatePrefixUnits += end - start;
        }
        return originalSlice.call(this, start, end);
      };

      let result;
      try {
        result = parser(source);
      } finally {
        String.prototype.slice = originalSlice;
      }
      const label = `${parser.name}:${size}`;
      assert.ok(candidatePrefixUnits > 0, `${label} did not observe candidate-prefix work`);
      assert.ok(
        candidatePrefixUnits <= source.length * 8,
        `${label} scanned ${candidatePrefixUnits} candidate-prefix units for ${source.length} input units`,
      );
      assert.equal(typeof result.ok, 'boolean', label);
    }
  }
});

test('round M selects the later root after a recoverable malformed scene and literal dialogue', () => {
  const terminal = '</now_plot></content>';
  const header = currentResponse('').slice(0, -terminal.length);
  const updateVariable = '<UpdateVariable>{}</UpdateVariable>';

  for (const lineEnding of ['\n', '\r\n', '\r']) {
    const blank = lineEnding + lineEnding;
    const malformed = `<scene location="王都"${blank}`;
    const content = header
      + `前。${terminal}${blank}`
      + malformed
      + `{甲}「后。」${terminal}`;
    const source = content + lineEnding + updateVariable;
    const label = JSON.stringify(lineEnding);

    assert.deepEqual(splitUpdateVariable(source), {
      ok: true,
      content,
      separator: lineEnding,
      updateVariable,
      errors: [],
    }, label);
    for (const result of [parseNarrative(source), parseStreamingNarrative(source)]) {
      assert.equal(result.ok, true, label);
      assert.ok(result.blocks.some((block) => block.type === 'narration'), label);
      assert.deepEqual(
        result.blocks.find((block) => block.rawText === malformed),
        {
          type: 'invalid',
          status: 'invalid',
          reason: 'invalid-local-block',
          rawText: malformed,
        },
        label,
      );
      assert.deepEqual(result.blocks.at(-1), { type: 'dialogue', speaker: '甲', text: '后。' }, label);
      assert.equal(result.updateVariable, updateVariable, label);
      assert.equal(errorCodes(result).includes('invalid-root-structure'), false, label);
      assert.equal(errorCodes(result).includes('invalid-trailing-content'), false, label);
    }
    const streaming = parseStreamingNarrative(source);
    assert.equal(streaming.streaming, false, label);
    assert.equal(streaming.complete, true, label);
    assert.equal(streaming.progressText, '', label);
  }
});

test('round M malformed continuation needs later literal completed evidence', () => {
  const terminal = '</now_plot></content>';
  const header = currentResponse('').slice(0, -terminal.length);

  for (const lineEnding of ['\n', '\r\n', '\r']) {
    const blank = lineEnding + lineEnding;
    const closed = header + `前。${terminal}`;
    const malformed = `<scene location="王都"${blank}`;
    const controls = [
      ['malformed only before a later pair', closed + blank + malformed + terminal],
      ['incomplete literal dialogue before a later pair', closed + blank + malformed + `{甲}「未完${terminal}`],
      [
        'entity brace lookalike before a later pair',
        closed + blank + malformed + `&#123;甲&#125;「伪装。」${terminal}`,
      ],
    ];

    for (const [name, source] of controls) {
      const label = `${name}:${JSON.stringify(lineEnding)}`;
      const complete = parseNarrative(source);
      const streaming = parseStreamingNarrative(source);

      assert.equal(complete.ok, false, label);
      assert.equal(streaming.ok, false, label);
      assert.ok(errorCodes(complete).includes('invalid-trailing-content'), label);
      assert.ok(errorCodes(streaming).includes('invalid-trailing-content'), label);
      assert.equal(errorCodes(complete).includes('invalid-root-structure'), false, label);
      assert.equal(errorCodes(streaming).includes('invalid-root-structure'), false, label);
      assert.equal(streaming.streaming, false, label);
      assert.equal(streaming.complete, true, label);
    }
  }
});

test('round M skips a bounded invalid paragraph before later literal dialogue evidence', () => {
  const terminal = '</now_plot></content>';
  const header = currentResponse('').slice(0, -terminal.length);
  const updateVariable = '<UpdateVariable>{}</UpdateVariable>';

  for (const lineEnding of ['\n', '\r\n', '\r']) {
    const blank = lineEnding + lineEnding;
    const malformed = `<scene location="王都"${blank}`;
    const content = header
      + `前。${terminal}${blank}`
      + malformed
      + `{坏}${blank}`
      + `{甲}「后。」${terminal}`;
    const source = content + lineEnding + updateVariable;
    const label = JSON.stringify(lineEnding);

    assert.deepEqual(splitUpdateVariable(source), {
      ok: true,
      content,
      separator: lineEnding,
      updateVariable,
      errors: [],
    }, label);
    for (const result of [parseNarrative(source), parseStreamingNarrative(source)]) {
      assert.equal(result.ok, true, label);
      assert.deepEqual(result.blocks.at(-1), { type: 'dialogue', speaker: '甲', text: '后。' }, label);
      assert.equal(result.updateVariable, updateVariable, label);
      assert.equal(errorCodes(result).includes('invalid-root-structure'), false, label);
      assert.equal(errorCodes(result).includes('invalid-trailing-content'), false, label);
    }
  }
});

test('round M skips a bounded embedded-tag attempted dialogue before later proof', () => {
  const terminal = '</now_plot></content>';
  const header = currentResponse('').slice(0, -terminal.length);
  const updateVariable = '<UpdateVariable>{}</UpdateVariable>';

  for (const lineEnding of ['\n', '\r\n', '\r']) {
    const blank = lineEnding + lineEnding;
    const malformed = `<scene location="王都"${blank}`;
    const attempted = '{乙}「前<x></x>后」';
    const content = header
      + `前。${terminal}${blank}`
      + malformed
      + attempted
      + blank
      + `{甲}「后。」${terminal}`;
    const source = content + lineEnding + updateVariable;
    const label = JSON.stringify(lineEnding);

    assert.deepEqual(splitUpdateVariable(source), {
      ok: true,
      content,
      separator: lineEnding,
      updateVariable,
      errors: [],
    }, label);
    for (const result of [parseNarrative(source), parseStreamingNarrative(source)]) {
      assert.equal(result.ok, true, label);
      assert.ok(result.blocks.some((block) => block.rawText === attempted), label);
      assert.deepEqual(result.blocks.at(-1), { type: 'dialogue', speaker: '甲', text: '后。' }, label);
      assert.equal(result.updateVariable, updateVariable, label);
      assert.equal(errorCodes(result).includes('invalid-root-structure'), false, label);
      assert.equal(errorCodes(result).includes('invalid-trailing-content'), false, label);
    }
  }
});

test('round M keeps unsupported completed siblings inert as continuation evidence', () => {
  const terminal = '</now_plot></content>';
  const header = currentResponse('').slice(0, -terminal.length);
  const updateVariable = '<UpdateVariable>{}</UpdateVariable>';

  for (const lineEnding of ['\n', '\r\n', '\r']) {
    const blank = lineEnding + lineEnding;
    const closed = header + `前。${terminal}`;
    const malformed = `<scene location="王都"${blank}`;
    const unsupported = '<x></x>';
    const noProof = closed + blank + malformed + unsupported + terminal + lineEnding + updateVariable;
    const noProofLabel = `no-proof:${JSON.stringify(lineEnding)}`;

    const splitWithoutProof = splitUpdateVariable(noProof);
    assert.equal(splitWithoutProof.content, noProof, noProofLabel);
    assert.equal(splitWithoutProof.separator, '', noProofLabel);
    assert.equal(splitWithoutProof.updateVariable, null, noProofLabel);
    for (const result of [parseNarrative(noProof), parseStreamingNarrative(noProof)]) {
      assert.equal(result.ok, false, noProofLabel);
      assert.ok(errorCodes(result).includes('invalid-trailing-content'), noProofLabel);
      assert.equal(result.updateVariable, null, noProofLabel);
    }

    const content = closed
      + blank
      + malformed
      + unsupported
      + blank
      + `{甲}「后。」${terminal}`;
    const source = content + lineEnding + updateVariable;
    const proofLabel = `later-proof:${JSON.stringify(lineEnding)}`;
    assert.deepEqual(splitUpdateVariable(source), {
      ok: true,
      content,
      separator: lineEnding,
      updateVariable,
      errors: [],
    }, proofLabel);
    for (const result of [parseNarrative(source), parseStreamingNarrative(source)]) {
      assert.equal(result.ok, true, proofLabel);
      assert.deepEqual(result.blocks.at(-1), { type: 'dialogue', speaker: '甲', text: '后。' }, proofLabel);
      assert.equal(result.updateVariable, updateVariable, proofLabel);
    }
  }
});

test('round M keeps an unbounded streaming tail inert until a real boundary', () => {
  const terminal = '</now_plot></content>';
  const header = currentResponse('').slice(0, -terminal.length);
  const tails = [
    ['character dialogue', '{甲}「好。」'],
    ['player dialogue', '{#}「好。」'],
    ['entity speaker dialogue', '{艾&amp;米}「好。」'],
    ['entity brace lookalike', '&#123;甲&#125;「好。」'],
    ['unsafe speaker', '{甲\u202e}「好。」'],
    ['malformed dialogue', '{甲}「好。'],
  ];

  for (const [name, tail] of tails) {
    const result = parseStreamingNarrative(header + tail);

    assert.equal(result.ok, true, name);
    assert.equal(result.streaming, true, name);
    assert.equal(result.complete, false, name);
    assert.deepEqual(result.blocks, [], name);
    assert.equal(result.progressText, tail, name);
  }

  const prefix = '前。\n\n';
  const dialogue = '{甲}「好。」';
  const beforeAppend = parseStreamingNarrative(header + prefix + dialogue);
  const afterAppend = parseStreamingNarrative(header + prefix + dialogue + '尾');
  assert.deepEqual(beforeAppend.blocks, [{ type: 'narration', text: '前。' }]);
  assert.deepEqual(afterAppend.blocks, beforeAppend.blocks);
  assert.equal(beforeAppend.progressText, dialogue);
  assert.equal(afterAppend.progressText, dialogue + '尾');

  const bounded = parseStreamingNarrative(header + prefix + dialogue + '\n\n');
  assert.deepEqual(bounded.blocks, [
    { type: 'narration', text: '前。' },
    { type: 'dialogue', speaker: '甲', text: '好。' },
  ]);
  assert.equal(bounded.progressText, '');

  const completed = parseNarrative(header + prefix + dialogue + terminal);
  assert.equal(completed.ok, true);
  assert.deepEqual(completed.blocks, bounded.blocks);
});

test('round M truncates invalid raw text only at Unicode scalar boundaries', () => {
  const retainedEmoji = 'a'.repeat(LIMITS.BLOCK_TEXT - 2) + '😀';
  const exact = parseNarrative(currentResponse(retainedEmoji));
  assert.deepEqual(exact.blocks, [{ type: 'narration', text: retainedEmoji }]);

  const cases = [
    {
      name: 'high surrogate would cross the limit',
      body: 'a'.repeat(LIMITS.BLOCK_TEXT - 1) + '😀',
      expected: 'a'.repeat(LIMITS.BLOCK_TEXT - 1),
    },
    {
      name: 'supplementary scalar ends exactly at the limit',
      body: retainedEmoji + '尾',
      expected: retainedEmoji,
    },
    {
      name: 'supplementary scalar starts after a full BMP prefix',
      body: 'a'.repeat(LIMITS.BLOCK_TEXT) + '😀',
      expected: 'a'.repeat(LIMITS.BLOCK_TEXT),
    },
  ];

  for (const { name, body, expected } of cases) {
    const result = parseNarrative(currentResponse(body));
    const rawText = result.blocks[0].rawText;

    assert.equal(result.blocks[0].type, 'invalid', name);
    assert.equal(result.blocks[0].reason, 'block-too-long', name);
    assert.equal(rawText, expected, name);
    assert.ok(rawText.length <= LIMITS.BLOCK_TEXT, name);
    assert.equal(
      Array.from(rawText).some((character) => {
        const codePoint = character.codePointAt(0);
        return codePoint >= 0xd800 && codePoint <= 0xdfff;
      }),
      false,
      name,
    );
  }
});

test('production parser sources contain no execution-capable parser surfaces', () => {
  const moduleUrls = [
    new URL('../narrative-next/src/entities.mjs', import.meta.url),
    new URL('../narrative-next/src/inline-format.mjs', import.meta.url),
    new URL('../narrative-next/src/protocol.mjs', import.meta.url),
  ];
  const forbidden = [/\bDOMParser\b/u, /\binnerHTML\b/u, /\beval\s*\(/u, /\bFunction\s*\(/u];

  for (const moduleUrl of moduleUrls) {
    const source = readFileSync(moduleUrl, 'utf8');
    for (const pattern of forbidden) {
      assert.doesNotMatch(source, pattern, `${fileURLToPath(moduleUrl)} contains ${pattern}`);
    }
  }
});

test('exports only the specified public parser seams', () => {
  assert.deepEqual(Object.keys(protocolModule).sort(), [
    'parseNarrative',
    'parseStreamingNarrative',
    'splitUpdateVariable',
  ]);
  assert.deepEqual(Object.keys(entitiesModule), []);
});

test('round O requires semantically valid supported blocks for continuation evidence', () => {
  const terminal = '</now_plot></content>';
  const header = currentResponse('').slice(0, -terminal.length);
  const malformed = '<scene location="王都"\n\n';
  const updateVariable = '<UpdateVariable>{}</UpdateVariable>';
  const invalidBlocks = [
    ['scene', '<scene location="王都" time="下午">后。</scene>'],
    ['ability', '<ability user="甲" name="未知" kind="未知">后。</ability>'],
    ['check', '<check type="观察" actor="甲">后。</check>'],
    ['restart', '<restart deathId="loop-1">后。</restart>'],
  ];

  for (const [name, invalidBlock] of invalidBlocks) {
    const content = header + '前。' + terminal + '\n\n' + malformed + invalidBlock + terminal;
    const source = content + '\n' + updateVariable;

    assert.deepEqual(splitUpdateVariable(source), {
      ok: true,
      content: source,
      separator: '',
      updateVariable: null,
      errors: [],
    }, name);
    const parsed = parseNarrative(content);
    assert.equal(parsed.ok, false, name);
    assert.ok(errorCodes(parsed).includes('invalid-trailing-content'), name);
  }
});

test('round O keeps terminal dialogue pending after every completed structural family', () => {
  const terminal = '</now_plot></content>';
  const header = currentResponse('').slice(0, -terminal.length);
  const structuralBlocks = [
    ['scene', '<scene location="王都" time="下午" mood="静">景。</scene>'],
    [
      'ability',
      '<ability user="甲" name="技" kind="武技"><effect>效。</effect><description>说。</description></ability>',
    ],
    ['check', '<check type="观察" actor="甲" target="乙">成。</check>'],
    ['restart', '<restart deathId="loop-1" checkpoint="起点">回。</restart>'],
  ];

  for (const [name, structuralBlock] of structuralBlocks) {
    const base = header + '{甲}「一。」' + structuralBlock + '{乙}「二。」';
    const beforeAppend = parseStreamingNarrative(base);
    const afterAppend = parseStreamingNarrative(base + '尾');

    assert.equal(beforeAppend.blocks.length, 2, name);
    assert.deepEqual(beforeAppend.blocks.map((block) => block.type), ['dialogue', name], name);
    assert.equal(beforeAppend.progressText, '{乙}「二。」', name);
    assert.deepEqual(afterAppend.blocks, beforeAppend.blocks, name);
    assert.equal(afterAppend.progressText, '{乙}「二。」尾', name);

    const blankBounded = parseStreamingNarrative(base + '\n\n');
    assert.deepEqual(blankBounded.blocks.at(-1), { type: 'dialogue', speaker: '乙', text: '二。' }, name);
    assert.equal(blankBounded.progressText, '', name);

    const structurallyBounded = parseStreamingNarrative(
      base + '<scene location="后" time="下午" mood="静">续。</scene>',
    );
    assert.deepEqual(
      structurallyBounded.blocks.at(-2),
      { type: 'dialogue', speaker: '乙', text: '二。' },
      name,
    );

    const completed = parseNarrative(base + terminal);
    assert.deepEqual(completed.blocks.at(-1), { type: 'dialogue', speaker: '乙', text: '二。' }, name);
  }
});

test('round O freezes malformed-block recovery at the first complete blank line', () => {
  const terminal = '</now_plot></content>';
  const header = currentResponse('').slice(0, -terminal.length);

  for (const lineEnding of ['\n', '\r\n', '\r']) {
    const blank = lineEnding + lineEnding;
    const malformed = '<scene x="' + blank;
    const initial = parseStreamingNarrative(header + malformed);
    const appendedBlank = parseStreamingNarrative(header + malformed + lineEnding);
    const continued = parseStreamingNarrative(
      header + malformed + lineEnding + '{甲}「后。」' + blank,
    );
    const label = JSON.stringify(lineEnding);

    assert.equal(initial.blocks[0].rawText, malformed, label);
    assert.equal(appendedBlank.blocks[0].rawText, malformed, label);
    assert.equal(continued.blocks[0].rawText, malformed, label);
    assert.deepEqual(continued.blocks.at(-1), { type: 'dialogue', speaker: '甲', text: '后。' }, label);
  }
});

test('round O gives the first over-limit sentinel fixed streaming ownership', () => {
  const terminal = '</now_plot></content>';
  const header = currentResponse('').slice(0, -terminal.length);
  const unknown = '<x></x>';
  const atFirstOverflow = parseStreamingNarrative(header + unknown.repeat(LIMITS.BLOCKS + 1));
  const afterAppend = parseStreamingNarrative(header + unknown.repeat(LIMITS.BLOCKS + 2));

  assert.equal(atFirstOverflow.blocks.length, LIMITS.BLOCKS + 1);
  assert.deepEqual(atFirstOverflow.blocks.at(-1), {
    type: 'invalid',
    status: 'invalid',
    reason: 'block-count-exceeded',
    rawText: '[block-count-exceeded]',
  });
  assert.deepEqual(afterAppend.blocks.slice(0, atFirstOverflow.blocks.length), atFirstOverflow.blocks);
});

test('round O preserves terminal partial UpdateVariable progress byte-for-byte', () => {
  const content = currentResponse('正文。');
  const partials = [
    '<UpdateVariable>\n  ',
    '<UpdateVariable> \r\n\t前\r尾\n  ',
  ];

  for (const partial of partials) {
    const result = parseStreamingNarrative(content + '\n' + partial);

    assert.equal(result.progressText, partial, JSON.stringify(partial));
    assert.deepEqual(result.blocks, [{ type: 'narration', text: '正文。' }]);
    assert.ok(errorCodes(result).includes('incomplete-update-variable'));
  }
});

test('round R keeps the first overflow sentinel append-invariant and Unicode-scalar-safe', () => {
  const terminal = '</now_plot></content>';
  const header = currentResponse('').slice(0, -terminal.length);
  const unit = '<x></x>';
  const cases = [
    ['unsupported partial tag', '<x', '<x></x>'],
    [
      'supported partial tag',
      '<scene',
      '<scene location="王都" time="下午" mood="静">景。</scene>',
    ],
    ['leading whitespace', ' \t<x', ' \t<x></x>'],
    ['dangling high surrogate', '\ud83d', '😀'],
    ['normal complete element', unit, unit + unit],
  ];

  for (const [name, beforeTail, afterTail] of cases) {
    const before = parseStreamingNarrative(header + unit.repeat(LIMITS.BLOCKS) + beforeTail);
    const after = parseStreamingNarrative(header + unit.repeat(LIMITS.BLOCKS) + afterTail);
    const sentinel = before.blocks.at(-1);

    assert.equal(before.blocks.length, LIMITS.BLOCKS + 1, name);
    assert.equal(sentinel.reason, 'block-count-exceeded', name);
    assert.deepEqual(after.blocks.slice(0, before.blocks.length), before.blocks, name);
    assert.doesNotMatch(sentinel.rawText, /[\uD800-\uDFFF]/u, name);
    assert.ok(sentinel.rawText.length <= LIMITS.BLOCK_TEXT, name);
  }
});

test('round R resolves blank-line delimiters by the first line-ending style', () => {
  const terminal = '</now_plot></content>';
  const header = currentResponse('').slice(0, -terminal.length);
  const malformed = '<scene x="';

  for (const between of ['', ' \t']) {
    const loneCr = parseStreamingNarrative(header + malformed + '\r' + between + '\r');
    const loneCrAfterLf = parseStreamingNarrative(header + malformed + '\r' + between + '\r\n');
    assert.equal(loneCr.blocks[0].rawText, malformed + '\r' + between + '\r', between);
    assert.deepEqual(loneCrAfterLf.blocks[0], loneCr.blocks[0], between);

    const partialCrLf = parseStreamingNarrative(header + malformed + '\r\n' + between + '\r');
    assert.deepEqual(partialCrLf.blocks, [], between);
    assert.equal(partialCrLf.progressText, malformed, between);

    const completeCrLf = parseStreamingNarrative(header + malformed + '\r\n' + between + '\r\n');
    assert.equal(completeCrLf.blocks[0].rawText, malformed + '\r\n' + between + '\r\n', between);
  }

  for (const blank of ['\n\n', '\n \t\n', '\r\n\r\n', '\r\n \t\r\n']) {
    const before = parseStreamingNarrative(header + malformed + blank);
    const after = parseStreamingNarrative(header + malformed + blank + '尾');
    assert.equal(before.blocks[0].rawText, malformed + blank, JSON.stringify(blank));
    assert.deepEqual(after.blocks[0], before.blocks[0], JSON.stringify(blank));
  }

  const recovered = parseStreamingNarrative(
    header + malformed + '\r\r\n{甲}「后。」\r\r',
  );
  assert.equal(recovered.blocks[0].rawText, malformed + '\r\r');
  assert.deepEqual(recovered.blocks.at(-1), { type: 'dialogue', speaker: '甲', text: '后。' });
});

test('round R keeps stray closing tags local without promoting illegal dialogue markup', () => {
  const terminal = '</now_plot></content>';
  const header = currentResponse('').slice(0, -terminal.length);
  const closingTags = ['</scene>', '</ability>', '</check>', '</restart>', '</foo>'];

  for (const closingTag of closingTags) {
    const body = '{甲}「一。」' + closingTag + '{乙}「二。」';
    const complete = parseNarrative(header + body + terminal);
    assert.deepEqual(complete.blocks, [
      { type: 'dialogue', speaker: '甲', text: '一。' },
      {
        type: 'invalid',
        status: 'invalid',
        reason: 'invalid-local-block',
        rawText: closingTag,
      },
      { type: 'dialogue', speaker: '乙', text: '二。' },
    ], closingTag);

    const before = parseStreamingNarrative(header + body);
    const after = parseStreamingNarrative(header + body + '尾');
    assert.deepEqual(before.blocks, complete.blocks.slice(0, 2), closingTag);
    assert.equal(before.progressText, '{乙}「二。」', closingTag);
    assert.deepEqual(after.blocks, before.blocks, closingTag);
    assert.equal(after.progressText, '{乙}「二。」尾', closingTag);
    assert.deepEqual(
      parseStreamingNarrative(header + body + '\n\n').blocks,
      complete.blocks,
      closingTag,
    );
  }

  const spaced = parseNarrative(header + '{甲}「一。」 \t</scene>\t {乙}「二。」' + terminal);
  assert.deepEqual(spaced.blocks.map((block) => block.type), ['dialogue', 'invalid', 'dialogue']);
  assert.equal(spaced.blocks[1].rawText, '</scene>');

  const attempted = '{甲}「前</scene>后';
  const attemptedResult = parseNarrative(header + attempted + '\n\n{乙}「保留。」' + terminal);
  assert.deepEqual(attemptedResult.blocks, [
    {
      type: 'invalid',
      status: 'invalid',
      reason: 'invalid-local-block',
      rawText: attempted,
    },
    { type: 'dialogue', speaker: '乙', text: '保留。' },
  ]);
});

test('round R rejects entity-decoded markup delimiters in speaker identity only', () => {
  const smuggled = [
    '{&lt;script&gt;}「伪。」',
    '{&#60;script&#62;}「伪。」',
    '{&#x3c;script&#x3e;}「伪。」',
  ];

  for (const body of smuggled) {
    const result = parseNarrative(currentResponse(body));
    assert.equal(result.blocks.some((block) => 'speaker' in block), false, body);
    assert.deepEqual(result.blocks, [{ type: 'narration', text: '{<script>}「伪。」' }], body);
  }

  assert.deepEqual(parseNarrative(currentResponse('{艾&amp;米}「好。」')).blocks, [
    { type: 'dialogue', speaker: '艾&米', text: '好。' },
  ]);
  assert.deepEqual(
    parseNarrative(currentResponse('{&amp;lt;script&amp;gt;}「字面。」')).blocks,
    [{ type: 'dialogue', speaker: '&lt;script&gt;', text: '字面。' }],
  );
});

test('round R keeps code, links, images, and URL-like inline syntax wholly inert', () => {
  const inertSources = [
    '`**x**`',
    '`**x**',
    '```**x**```',
    '```\n*em*\n**strong**\n```',
    '```\n*unclosed*',
    '[**x**](javascript:alert(1))',
    '[*x*](https://example.invalid/a_(b))',
    '![*x*](data:image/svg+xml,**bad**)',
    'http://example.invalid/**x**',
    'https://example.invalid/*x*',
    'ftp://example.invalid/**x**',
    'www.example.invalid/*x*',
    'mailto:a**b**@example.invalid',
  ];
  for (const source of inertSources) {
    assert.deepEqual(tokenizeInlineText(source), [{ type: 'text', text: source }], source);
  }

  for (const source of [
    '*前`code`后*',
    '**前[label](https://example.invalid)后**',
    '*前https://example.invalid/path后*',
  ]) {
    assert.deepEqual(tokenizeInlineText(source), [{ type: 'text', text: source }], source);
  }

  assert.deepEqual(tokenizeInlineText('**strong** `*code*` [**link**](x) *em*'), [
    { type: 'strong', text: 'strong' },
    { type: 'text', text: ' `*code*` [**link**](x) ' },
    { type: 'em', text: 'em' },
  ]);
});

test('round R does not recover root ownership from a direct unsupported element', () => {
  const terminal = '</now_plot></content>';
  const header = currentResponse('').slice(0, -terminal.length);
  const closed = header + '前。' + terminal;
  const updateVariable = '<UpdateVariable>{}</UpdateVariable>';
  const inertElements = [
    '<x></x>',
    '<foo>伪。</foo>',
    '<x/>',
    '<scene location="王都" time="下午">缺少氛围。</scene>',
  ];

  for (const inertElement of inertElements) {
    const content = closed + '\n\n' + inertElement + terminal;
    const source = content + '\n' + updateVariable;
    assert.deepEqual(splitUpdateVariable(source), {
      ok: true,
      content: source,
      separator: '',
      updateVariable: null,
      errors: [],
    }, inertElement);
    for (const result of [parseNarrative(source), parseStreamingNarrative(source)]) {
      assert.equal(result.ok, false, inertElement);
      assert.ok(errorCodes(result).includes('invalid-trailing-content'), inertElement);
      assert.equal(result.updateVariable, null, inertElement);
    }
  }

  const genuineEvidence = [
    ['narration', '后。'],
    ['dialogue', '{甲}「真。」'],
    ['supported block', '<scene location="王都" time="下午" mood="静">后。</scene>'],
  ];
  for (const inertElement of inertElements) {
    for (const [name, evidence] of genuineEvidence) {
      const content = closed + '\n\n' + inertElement + '\n\n' + evidence + terminal;
      const source = content + '\n' + updateVariable;
      const split = splitUpdateVariable(source);
      assert.equal(split.content, content, `${inertElement}:${name}`);
      assert.equal(split.updateVariable, updateVariable, `${inertElement}:${name}`);
    }
  }
});

test('round R requires semantic text evidence for direct root recovery', () => {
  const terminal = '</now_plot></content>';
  const header = currentResponse('').slice(0, -terminal.length);
  const closed = header + '前。' + terminal;
  const updateVariable = '<UpdateVariable>{}</UpdateVariable>';
  const nonEvidence = [
    '{坏}',
    '{甲}「未完',
    '&#123;甲&#125;「伪。」',
  ];

  for (const inertText of nonEvidence) {
    const content = closed + '\n\n' + inertText + terminal;
    const source = content + '\n' + updateVariable;
    assert.deepEqual(splitUpdateVariable(source), {
      ok: true,
      content: source,
      separator: '',
      updateVariable: null,
      errors: [],
    }, inertText);
    for (const result of [parseNarrative(source), parseStreamingNarrative(source)]) {
      assert.equal(result.ok, false, inertText);
      assert.ok(errorCodes(result).includes('invalid-trailing-content'), inertText);
      assert.equal(result.updateVariable, null, inertText);
    }
  }

  const genuineEvidence = [
    ['safe narration', '后。'],
    ['raw dialogue', '{甲}「真。」'],
    ['invalid then dialogue', '{坏}\n\n{甲}「真。」'],
    ['encoded brace then narration', '&#123;甲&#125;「伪。」\n\n后。'],
  ];
  for (const [name, evidence] of genuineEvidence) {
    const content = closed + '\n\n' + evidence + terminal;
    const source = content + '\n' + updateVariable;
    assert.deepEqual(splitUpdateVariable(source), {
      ok: true,
      content,
      separator: '\n',
      updateVariable,
      errors: [],
    }, name);
  }
});

test('round R scans each accepted URL range once', () => {
  const boundaryPattern = /[\s<>"'`]/u;
  const measureBoundaryProbes = (source) => {
    const originalTest = RegExp.prototype.test;
    let boundaryProbes = 0;
    RegExp.prototype.test = function instrumentedTest(value) {
      if (this.source === boundaryPattern.source && this.flags === boundaryPattern.flags) {
        boundaryProbes += 1;
      }
      return originalTest.call(this, value);
    };
    try {
      const tokens = tokenizeInlineText(source);
      return { boundaryProbes, tokens };
    } finally {
      RegExp.prototype.test = originalTest;
    }
  };

  for (const count of [400, 800, 1_600, 3_200]) {
    const source = 'http://'.repeat(count) + '**x**';
    const { boundaryProbes, tokens } = measureBoundaryProbes(source);

    assert.deepEqual(tokens, [{ type: 'text', text: source }], `${count} schemes`);
    assert.equal(
      boundaryProbes,
      source.length - 'http://'.length,
      `${count} nested schemes rescanned an accepted URL suffix`,
    );
  }

  const separated = 'http://one.invalid/**x** https://two.invalid/*y* **later**';
  assert.deepEqual(tokenizeInlineText(separated), [
    { type: 'text', text: 'http://one.invalid/**x** https://two.invalid/*y* ' },
    { type: 'strong', text: 'later' },
  ]);
  assert.deepEqual(tokenizeInlineText('xwww.example.invalid/**ordinary** **later**'), [
    { type: 'text', text: 'xwww.example.invalid/' },
    { type: 'strong', text: 'ordinary' },
    { type: 'text', text: ' ' },
    { type: 'strong', text: 'later' },
  ]);
});

test('round R does not recover root ownership from local content or now_plot wrappers', () => {
  const terminal = '</now_plot></content>';
  const header = currentResponse('').slice(0, -terminal.length);
  const closed = header + '前。' + terminal;
  const updateVariable = '<UpdateVariable>{}</UpdateVariable>';
  const inertWrappers = [
    '<content></content>',
    '<now_plot></now_plot>',
    '<content><x></x></content>',
    '<now_plot><x></x></now_plot>',
    '<content>内。</content>',
    '<now_plot>内。</now_plot>',
  ];

  for (const inertWrapper of inertWrappers) {
    const content = closed + '\n\n' + inertWrapper + terminal;
    const source = content + '\n' + updateVariable;

    assert.deepEqual(splitUpdateVariable(source), {
      ok: true,
      content: source,
      separator: '',
      updateVariable: null,
      errors: [],
    }, inertWrapper);
    for (const result of [parseNarrative(source), parseStreamingNarrative(source)]) {
      assert.equal(result.ok, false, inertWrapper);
      assert.ok(errorCodes(result).includes('invalid-trailing-content'), inertWrapper);
      assert.equal(result.updateVariable, null, inertWrapper);
    }
  }

  const genuineEvidence = [
    ['narration', '后。'],
    ['dialogue', '{甲}「真。」'],
    ['scene', '<scene location="王都" time="下午" mood="静">后。</scene>'],
    [
      'ability',
      '<ability user="甲" name="技" kind="武技"><effect>效。</effect><description>说。</description></ability>',
    ],
    ['check', '<check type="观察" actor="甲" target="乙">成。</check>'],
    ['restart', '<restart deathId="loop-1" checkpoint="起点">回。</restart>'],
  ];
  for (const inertWrapper of inertWrappers) {
    for (const [name, evidence] of genuineEvidence) {
      const content = closed + '\n\n' + inertWrapper + '\n\n' + evidence + terminal;
      const source = content + '\n' + updateVariable;
      const label = `${inertWrapper}:${name}`;

      assert.deepEqual(splitUpdateVariable(source), {
        ok: true,
        content,
        separator: '\n',
        updateVariable,
        errors: [],
      }, label);
      for (const result of [parseNarrative(source), parseStreamingNarrative(source)]) {
        assert.equal(result.ok, true, label);
        assert.equal(result.updateVariable, updateVariable, label);
      }
    }
  }
});

test('round T treats completed inert markup as a dialogue boundary and skips it for later evidence', () => {
  const terminal = '</now_plot></content>';
  const header = currentResponse('').slice(0, -terminal.length);
  const inertRanges = [
    '<!--x-->',
    '<![CDATA[x]]>',
    '<?note x?>',
    '<!DOCTYPE note [<!ELEMENT note (#PCDATA)>]>',
  ];

  for (const inert of inertRanges) {
    const body = `{甲}「一。」${inert}{乙}「二。」`;
    const complete = parseNarrative(header + body + terminal);
    assert.deepEqual(complete.blocks, [
      { type: 'dialogue', speaker: '甲', text: '一。' },
      { type: 'narration', text: inert },
      { type: 'dialogue', speaker: '乙', text: '二。' },
    ], inert);

    const streaming = parseStreamingNarrative(header + body + terminal);
    assert.deepEqual(streaming.blocks, complete.blocks, inert);
    assert.equal(streaming.streaming, false, inert);
    assert.equal(streaming.complete, true, inert);
  }

  const fakeCloses = '<!--</now_plot></content>-->';
  assert.deepEqual(parseNarrative(header + `{甲}「一。」${fakeCloses}{乙}「二。」` + terminal).blocks, [
    { type: 'dialogue', speaker: '甲', text: '一。' },
    { type: 'narration', text: fakeCloses },
    { type: 'dialogue', speaker: '乙', text: '二。' },
  ]);

  const closed = header + '前。' + terminal;
  const updateVariable = '<UpdateVariable>{}</UpdateVariable>';
  for (const inert of inertRanges) {
    const content = closed + inert + '{甲}「后。」' + terminal;
    const source = content + '\n' + updateVariable;
    assert.deepEqual(splitUpdateVariable(source), {
      ok: true,
      content,
      separator: '\n',
      updateVariable,
      errors: [],
    }, inert);
  }
});

test('round T keeps reference, shortcut, and unfinished Markdown links and images inert', () => {
  const inertSources = [
    '[*x*][id]',
    '![**x**][id]',
    '[*x*][]',
    '[*x*]',
    '![*x*]',
    '[*x*](',
    '![*x*](url',
  ];
  for (const source of inertSources) {
    assert.deepEqual(tokenizeInlineText(source), [{ type: 'text', text: source }], source);
  }

  assert.deepEqual(tokenizeInlineText('[*x*][id]\n[id]: https://example.invalid'), [
    { type: 'text', text: '[*x*][id]\n[id]: https://example.invalid' },
  ]);
  assert.deepEqual(tokenizeInlineText('*before [x](url) after*'), [
    { type: 'text', text: '*before [x](url) after*' },
  ]);
  assert.deepEqual(tokenizeInlineText('[plain bracketed prose] **later**'), [
    { type: 'text', text: '[plain bracketed prose] ' },
    { type: 'strong', text: 'later' },
  ]);
  assert.deepEqual(tokenizeInlineText('[*x*][id] **later**'), [
    { type: 'text', text: '[*x*][id] ' },
    { type: 'strong', text: 'later' },
  ]);
});

test('round T scans rejected URL scheme-prefix runs once with bounded probes', () => {
  const oldExec = RegExp.prototype.exec;
  const oldTest = RegExp.prototype.test;
  const rejectedIntroducer = '(?:[A-Za-z][A-Za-z0-9+.-]*:\\/\\/|www\\.|mailto:|javascript:|data:)';
  let rejectedIntroducerExecutions = 0;
  let schemeCharacterProbes = 0;
  RegExp.prototype.exec = function instrumentedExec(value) {
    if (this.source === rejectedIntroducer && this.flags === 'giu') {
      rejectedIntroducerExecutions += 1;
    }
    return oldExec.call(this, value);
  };
  RegExp.prototype.test = function instrumentedTest(value) {
    if (this.source === '[A-Za-z0-9+.-]' && this.flags === 'u') {
      schemeCharacterProbes += 1;
    }
    return oldTest.call(this, value);
  };

  try {
    for (const prefix of ['a'.repeat(20_000), 'a1'.repeat(10_000)]) {
      schemeCharacterProbes = 0;
      const source = prefix + ':/ **later**';
      assert.deepEqual(tokenizeInlineText(source), [
        { type: 'text', text: prefix + ':/ ' },
        { type: 'strong', text: 'later' },
      ]);
      assert.ok(schemeCharacterProbes >= prefix.length, `${prefix.length} run was not scanned`);
      assert.ok(
        schemeCharacterProbes <= source.length + 1,
        `${prefix.length} run used ${schemeCharacterProbes} scheme probes`,
      );
    }
  } finally {
    RegExp.prototype.exec = oldExec;
    RegExp.prototype.test = oldTest;
  }

  assert.equal(rejectedIntroducerExecutions, 0, 'the unbounded scheme regexp was executed');
  assert.deepEqual(tokenizeInlineText(
    'custom://one.invalid/**x** ftp://two.invalid/*y* data:text/plain,**z** **later**',
  ), [
    {
      type: 'text',
      text: 'custom://one.invalid/**x** ftp://two.invalid/*y* data:text/plain,**z** ',
    },
    { type: 'strong', text: 'later' },
  ]);
});

test('round T rejects unsupported, unsafe, and malformed attribute entity references', () => {
  const invalidValues = [
    '王&#1;都',
    '王&#x1F;都',
    '王&#xD800;都',
    '王&#x110000;都',
    '王&#xFFFE;都',
    '王&#x202E;都',
    '王&bogus;都',
    '王&AMP;都',
    '王&amp都',
    '王&都',
    '王&#xZZ;都',
    '王&#12x;都',
  ];
  for (const location of invalidValues) {
    const badScene = `<scene location="${location}" time="下午" mood="静">景。</scene>`;
    const result = parseNarrative(currentResponse(`{甲}「前。」${badScene}{乙}「后。」`));
    assert.deepEqual(result.blocks, [
      { type: 'dialogue', speaker: '甲', text: '前。' },
      {
        type: 'invalid',
        status: 'invalid',
        reason: 'invalid-scene',
        rawText: badScene,
      },
      { type: 'dialogue', speaker: '乙', text: '后。' },
    ], location);
  }

  const headerCases = [
    currentResponse('正文。', { player: '艾&bogus;米' }),
    '<content><story volume="0&bogus;"></story><time period="下午" layer="主线" basis="编辑演算">魔女历1000年01月01日</time><now_plot>正文。</now_plot></content>',
    '<content><story volume="01">第01卷｜开始的余温</story><time period="下&bogus;午" layer="主线" basis="编辑演算">魔女历1000年01月01日</time><now_plot>正文。</now_plot></content>',
  ];
  for (const source of headerCases) {
    const result = parseNarrative(source);
    assert.equal(result.ok, false, source);
    assert.equal(result.blocks.length, 0, source);
  }

  const structuredCases = [
    '<ability user="艾&bogus;米" name="技" kind="武技"><effect>效。</effect><description>说。</description></ability>',
    '<check type="观察" actor="艾&bogus;米" target="乙">成。</check>',
    '<restart deathId="loop-1" checkpoint="起&bogus;点">回。</restart>',
  ];
  for (const structured of structuredCases) {
    assert.equal(parseNarrative(currentResponse(structured)).blocks[0].type, 'invalid', structured);
  }

  assert.deepEqual(
    parseNarrative(currentResponse('<scene location="艾&amp;米&#38;&#x1F642;" time="下午" mood="静">景。</scene>')).blocks,
    [{
      type: 'scene',
      location: '艾&米&🙂',
      time: '下午',
      mood: '静',
      text: '景。',
    }],
  );
});

test('round T keeps stray root-name closes local after later semantic evidence', () => {
  const terminal = '</now_plot></content>';
  const header = currentResponse('').slice(0, -terminal.length);

  for (const closing of ['</content>', '</now_plot>']) {
    for (const gap of ['', '\n', '\n\n']) {
      const body = `{甲}「一。」${gap}${closing}${gap}{乙}「二。」`;
      const complete = parseNarrative(header + body + terminal);
      assert.deepEqual(complete.blocks, [
        { type: 'dialogue', speaker: '甲', text: '一。' },
        {
          type: 'invalid',
          status: 'invalid',
          reason: 'invalid-local-block',
          rawText: closing,
        },
        { type: 'dialogue', speaker: '乙', text: '二。' },
      ], `${closing}:${JSON.stringify(gap)}`);

      const closedStreaming = parseStreamingNarrative(header + body + terminal);
      assert.deepEqual(closedStreaming.blocks, complete.blocks, `${closing}:${JSON.stringify(gap)}`);
      assert.equal(closedStreaming.streaming, false, closing);
      assert.equal(closedStreaming.complete, true, closing);
    }
  }

  const contentOpen = parseStreamingNarrative(header + '{甲}「一。」</content>{乙}「二。」');
  assert.deepEqual(contentOpen.blocks, [
    { type: 'dialogue', speaker: '甲', text: '一。' },
    {
      type: 'invalid',
      status: 'invalid',
      reason: 'invalid-local-block',
      rawText: '</content>',
    },
  ]);
  assert.equal(contentOpen.progressText, '{乙}「二。」');

  const plotOpen = parseStreamingNarrative(header + '{甲}「一。」</now_plot>{乙}「二。」');
  assert.deepEqual(plotOpen.blocks, [{ type: 'dialogue', speaker: '甲', text: '一。' }]);
  assert.equal(plotOpen.progressText, '{乙}「二。」');

  for (const closing of ['</content>', '</now_plot>']) {
    const attempted = `{甲}「前${closing}后`;
    const result = parseNarrative(header + attempted + '\n\n{乙}「保留。」' + terminal);
    assert.deepEqual(result.blocks, [
      {
        type: 'invalid',
        status: 'invalid',
        reason: 'invalid-local-block',
        rawText: attempted,
      },
      { type: 'dialogue', speaker: '乙', text: '保留。' },
    ], closing);
  }

  for (const nonEvidence of ['{坏}', '&#123;甲&#125;「伪。」', '<x></x>']) {
    const content = header + '{甲}「一。」</now_plot>' + nonEvidence + terminal;
    const result = parseNarrative(content);
    assert.equal(result.ok, false, nonEvidence);
    assert.ok(errorCodes(result).includes('invalid-root-structure'), nonEvidence);
    assert.equal(result.blocks.some((block) => block.speaker === '乙'), false, nonEvidence);
  }

  const supported = '<scene location="王都" time="下午" mood="静">后。</scene>';
  assert.deepEqual(
    parseNarrative(header + '{甲}「一。」</now_plot>' + supported + terminal).blocks.map((block) => block.type),
    ['dialogue', 'invalid', 'scene'],
  );
  assert.deepEqual(parseNarrative(currentResponse('{甲}「唯一。」')).blocks, [
    { type: 'dialogue', speaker: '甲', text: '唯一。' },
  ]);
});

test('round T bounds repeated completed inert dialogue-boundary work', () => {
  const measureSliceUnits = (count) => {
    const inert = '<!--x-->';
    const body = '前。' + inert.repeat(count) + '后。';
    const source = currentResponse(body);
    const oldSlice = String.prototype.slice;
    let sliceUnits = 0;
    String.prototype.slice = function instrumentedSlice(start, end) {
      const value = this.valueOf();
      if (value === source && Number.isInteger(start)) {
        const normalizedEnd = Number.isInteger(end) ? end : value.length;
        sliceUnits += Math.max(0, normalizedEnd - start);
      }
      return oldSlice.call(this, start, end);
    };
    try {
      const result = parseNarrative(source);
      assert.deepEqual(result.blocks, [{ type: 'narration', text: body }], `${count} ranges`);
      return sliceUnits;
    } finally {
      String.prototype.slice = oldSlice;
    }
  };

  const small = measureSliceUnits(400);
  const large = measureSliceUnits(800);
  assert.ok(small > 0, 'slice instrumentation did not observe parser work');
  assert.ok(large < small * 3, `doubling inert ranges used ${small}/${large} slice units`);
});

test('round T keeps unclosed inert suffixes opaque and inert-only recovery as non-evidence', () => {
  const terminal = '</now_plot></content>';
  const header = currentResponse('').slice(0, -terminal.length);
  const openers = ['<!--x', '<![CDATA[x', '<?note x', '<!DOCTYPE note ['];

  for (const opener of openers) {
    const attempted = `{甲}「前${opener}</now_plot></content>{乙}「伪。」`;
    const pending = parseStreamingNarrative(header + attempted);
    assert.deepEqual(pending.blocks, [], opener);
    assert.equal(pending.progressText, attempted, opener);

    const recovered = parseNarrative(header + attempted + '\n\n{丙}「保留。」' + terminal);
    assert.deepEqual(recovered.blocks, [
      {
        type: 'invalid',
        status: 'invalid',
        reason: 'invalid-local-block',
        rawText: attempted,
      },
      { type: 'dialogue', speaker: '丙', text: '保留。' },
    ], opener);
  }

  const closed = header + '前。' + terminal;
  const updateVariable = '<UpdateVariable>{}</UpdateVariable>';
  for (const inert of ['<!--x-->', '<![CDATA[x]]>', '<?note x?>', '<!DOCTYPE note>']) {
    const content = closed + inert + terminal;
    const source = content + '\n' + updateVariable;
    assert.deepEqual(splitUpdateVariable(source), {
      ok: true,
      content: source,
      separator: '',
      updateVariable: null,
      errors: [],
    }, inert);
  }
});

test('round T scans each completed Markdown reference range once', () => {
  const count = 2_000;
  const prefix = '[*x*][id] '.repeat(count);
  const source = prefix + '**later**';
  const oldIndexOf = String.prototype.indexOf;
  let labelSearches = 0;
  String.prototype.indexOf = function instrumentedIndexOf(search, position) {
    if (this.valueOf() === source && search === '[') {
      labelSearches += 1;
    }
    return oldIndexOf.call(this, search, position);
  };
  try {
    assert.deepEqual(tokenizeInlineText(source), [
      { type: 'text', text: prefix },
      { type: 'strong', text: 'later' },
    ]);
  } finally {
    String.prototype.indexOf = oldIndexOf;
  }
  assert.equal(labelSearches, count + 1);
});

test('round V V1 keeps completed dialogue append-invariant before partial tag-like openers', () => {
  const terminal = '</now_plot></content>';
  const header = currentResponse('').slice(0, -terminal.length);
  const stableBlocks = [
    { type: 'narration', text: '前。' },
    { type: 'dialogue', speaker: '甲', text: '一。' },
  ];
  const cases = [
    {
      name: 'scene',
      opening: '<scene location="王都" time="下午" mood="静">',
      complete: '<scene location="王都" time="下午" mood="静">景。</scene>',
      block: { type: 'scene', location: '王都', time: '下午', mood: '静', text: '景。' },
    },
    {
      name: 'ability',
      opening: '<ability user="甲" name="技" kind="武技">',
      complete: '<ability user="甲" name="技" kind="武技"><effect>效。</effect><description>说。</description></ability>',
      block: {
        type: 'ability',
        user: '甲',
        name: '技',
        kind: '武技',
        affinities: [],
        effect: '效。',
        description: '说。',
        protocol: 'current',
      },
    },
    {
      name: 'check',
      opening: '<check type="观察" actor="甲" target="乙">',
      complete: '<check type="观察" actor="甲" target="乙">成。</check>',
      block: { type: 'check', checkType: '观察', actor: '甲', target: '乙', text: '成。' },
    },
    {
      name: 'restart',
      opening: '<restart deathId="loop-1" checkpoint="起点">',
      complete: '<restart deathId="loop-1" checkpoint="起点">回。</restart>',
      block: { type: 'restart', deathId: 'loop-1', checkpoint: '起点', text: '回。' },
    },
    {
      name: 'unsupported',
      opening: '<widget mode="unknown">',
      complete: null,
      block: null,
    },
  ];

  for (const gap of ['', '\n']) {
    const completedDialogue = `前。\n\n{甲}「一。」${gap}`;
    for (const entry of cases) {
      let priorBlocks = stableBlocks;
      for (let length = 1; length <= entry.opening.length; length += 1) {
        const partial = entry.opening.slice(0, length);
        const result = parseStreamingNarrative(header + completedDialogue + partial);
        const label = `${entry.name}:${JSON.stringify(gap)}:${JSON.stringify(partial)}`;

        assert.deepEqual(result.blocks, stableBlocks, label);
        assert.deepEqual(result.blocks.slice(0, priorBlocks.length), priorBlocks, label);
        assert.equal(result.blocks.some((block) => block.type === 'invalid'), false, label);
        assert.equal(result.progressText, partial.trim(), label);
        priorBlocks = result.blocks;
      }

      if (entry.complete) {
        const completed = parseStreamingNarrative(header + completedDialogue + entry.complete);
        assert.deepEqual(completed.blocks.slice(0, stableBlocks.length), stableBlocks, entry.name);
        assert.deepEqual(completed.blocks.at(-1), entry.block, entry.name);
        assert.equal(completed.progressText, '', entry.name);
      }
    }
  }

  const unfinishedDialogue = '{甲}「未完<scene location="王都"';
  const pending = parseStreamingNarrative(header + '前。\n\n' + unfinishedDialogue);
  assert.deepEqual(pending.blocks, [
    { type: 'narration', text: '前。' },
    {
      type: 'invalid',
      status: 'invalid',
      reason: 'invalid-local-block',
      rawText: unfinishedDialogue,
    },
  ]);
  assert.equal(pending.progressText, '');
});

test('round V V1 keeps long partial attributes within linear retained-prefix work', () => {
  const terminal = '</now_plot></content>';
  const header = currentResponse('').slice(0, -terminal.length);
  const measureSliceUnits = (attributeLength) => {
    const partial = '<scene location="' + '王'.repeat(attributeLength);
    const source = header + '{甲}「一。」' + partial;
    const oldSlice = String.prototype.slice;
    let sliceUnits = 0;
    String.prototype.slice = function instrumentedSlice(start, end) {
      const value = this.valueOf();
      if (value === source && Number.isInteger(start)) {
        const normalizedEnd = Number.isInteger(end) ? end : value.length;
        sliceUnits += Math.max(0, normalizedEnd - start);
      }
      return oldSlice.call(this, start, end);
    };
    try {
      const result = parseStreamingNarrative(source);
      assert.deepEqual(result.blocks, [{ type: 'dialogue', speaker: '甲', text: '一。' }]);
      assert.equal(result.progressText, partial);
      return sliceUnits;
    } finally {
      String.prototype.slice = oldSlice;
    }
  };

  const small = measureSliceUnits(8_000);
  const large = measureSliceUnits(16_000);
  assert.ok(small > 0, 'slice instrumentation did not observe parser work');
  assert.ok(large < small * 3, `doubling a partial attribute used ${small}/${large} slice units`);
});

test('round V V2 keeps every selected-range root close as one exact local boundary', () => {
  const terminal = '</now_plot></content>';
  const header = currentResponse('').slice(0, -terminal.length);
  const scene = '<scene location="王都" time="下午" mood="静">景。</scene>';
  const sceneBlock = { type: 'scene', location: '王都', time: '下午', mood: '静', text: '景。' };
  const abilitySource = '<ability user="甲" name="技" kind="武技"><effect>效。</effect><description>说。</description></ability>';
  const abilityBlock = {
    type: 'ability',
    user: '甲',
    name: '技',
    kind: '武技',
    affinities: [],
    effect: '效。',
    description: '说。',
    protocol: 'current',
  };
  const check = '<check type="观察" actor="甲" target="乙">成。</check>';
  const checkBlock = { type: 'check', checkType: '观察', actor: '甲', target: '乙', text: '成。' };
  const restart = '<restart deathId="loop-1" checkpoint="起点">回。</restart>';
  const restartBlock = { type: 'restart', deathId: 'loop-1', checkpoint: '起点', text: '回。' };
  const families = [
    {
      name: 'narration-dialogue',
      before: '旁。',
      beforeBlocks: [{ type: 'narration', text: '旁。' }],
      after: '{乙}「二。」',
      afterBlocks: [{ type: 'dialogue', speaker: '乙', text: '二。' }],
    },
    {
      name: 'dialogue-scene',
      before: '{甲}「一。」',
      beforeBlocks: [{ type: 'dialogue', speaker: '甲', text: '一。' }],
      after: scene,
      afterBlocks: [sceneBlock],
    },
    {
      name: 'scene-ability',
      before: scene,
      beforeBlocks: [sceneBlock],
      after: abilitySource,
      afterBlocks: [abilityBlock],
    },
    {
      name: 'ability-check',
      before: abilitySource,
      beforeBlocks: [abilityBlock],
      after: check,
      afterBlocks: [checkBlock],
    },
    {
      name: 'check-restart',
      before: check,
      beforeBlocks: [checkBlock],
      after: restart,
      afterBlocks: [restartBlock],
    },
    {
      name: 'restart-inert-dialogue',
      before: restart,
      beforeBlocks: [restartBlock],
      after: '<!--x-->{乙}「二。」',
      afterBlocks: [
        { type: 'narration', text: '<!--x-->' },
        { type: 'dialogue', speaker: '乙', text: '二。' },
      ],
    },
    {
      name: 'inert-narration',
      before: '<!--x-->',
      beforeBlocks: [{ type: 'narration', text: '<!--x-->' }],
      after: '后。',
      afterBlocks: [{ type: 'narration', text: '后。' }],
    },
  ];

  for (const closing of ['</content>', '</now_plot>']) {
    const invalid = {
      type: 'invalid',
      status: 'invalid',
      reason: 'invalid-local-block',
      rawText: closing,
    };
    for (const gap of ['', '\n', '\n\n']) {
      for (const family of families) {
        const source = header + family.before + gap + closing + gap + family.after + terminal;
        const expected = [...family.beforeBlocks, invalid, ...family.afterBlocks];
        const label = `${closing}:${JSON.stringify(gap)}:${family.name}`;
        for (const result of [parseNarrative(source), parseStreamingNarrative(source)]) {
          assert.deepEqual(result.blocks, expected, label);
          assert.equal(
            result.blocks.filter((block) => block.reason === 'invalid-local-block').length,
            1,
            label,
          );
          assert.equal(
            result.blocks.some((block) => block.type === 'narration' && block.text.includes(closing)),
            false,
            label,
          );
        }
      }
    }
  }

  const reviewed = header + '<scene location="王都" time="下午" mood="静">前。</scene>'
    + '</content><check type="观察" actor="甲" target="乙">后。</check>' + terminal;
  assert.deepEqual(parseNarrative(reviewed).blocks.map((block) => block.type), [
    'scene',
    'invalid',
    'check',
  ]);
  assert.equal(parseNarrative(reviewed).blocks[1].rawText, '</content>');
});

test('round V V2 preserves append-prefix ownership and actual root delimiters', () => {
  const terminal = '</now_plot></content>';
  const header = currentResponse('').slice(0, -terminal.length);
  const check = '<check type="观察" actor="甲" target="乙">成。</check>';

  for (const closing of ['</content>', '</now_plot>']) {
    const base = header + '旁。' + closing + check;
    let published = [];
    for (let length = 0; length <= terminal.length; length += 1) {
      const result = parseStreamingNarrative(base + terminal.slice(0, length));
      assert.deepEqual(
        result.blocks.slice(0, published.length),
        published,
        `${closing}:${length}`,
      );
      published = result.blocks;
    }
    assert.deepEqual(published.map((block) => block.type), ['narration', 'invalid', 'check'], closing);
    assert.equal(published[1].rawText, closing, closing);
  }

  for (const closing of ['</content>', '</now_plot>']) {
    const attempted = `{甲}「前${closing}后`;
    const result = parseNarrative(header + attempted + '\n\n{乙}「保留。」' + terminal);
    assert.deepEqual(result.blocks, [
      {
        type: 'invalid',
        status: 'invalid',
        reason: 'invalid-local-block',
        rawText: attempted,
      },
      { type: 'dialogue', speaker: '乙', text: '保留。' },
    ], closing);
  }

  const solePlotClose = parseStreamingNarrative(header + '旁。</now_plot>');
  assert.deepEqual(solePlotClose.blocks, [{ type: 'narration', text: '旁。' }]);
  assert.equal(solePlotClose.blocks.some((block) => block.type === 'invalid'), false);
  assert.deepEqual(parseNarrative(currentResponse('旁。')).blocks, [{ type: 'narration', text: '旁。' }]);

  for (const nonEvidence of ['{坏}', '&#123;甲&#125;「伪。」', '<x></x>', '<!--x-->']) {
    const result = parseNarrative(header + '旁。</now_plot>' + nonEvidence + terminal);
    assert.equal(result.ok, false, nonEvidence);
    assert.ok(errorCodes(result).includes('invalid-root-structure'), nonEvidence);
    assert.equal(
      result.blocks.some((block) => block.rawText === '</now_plot>'),
      false,
      nonEvidence,
    );
  }
});

test('round V V3 processes inert recovery events before later semantic boundaries', () => {
  const terminal = '</now_plot></content>';
  const first = currentResponse('前。');
  const updateVariable = '<UpdateVariable>{}</UpdateVariable>';
  const inertRanges = [
    '<!--</now_plot></content>-->',
    '<![CDATA[</now_plot></content>]]>',
    '<?note </now_plot></content>?>',
    '<!DOCTYPE note [<!ENTITY x "</now_plot></content>">]>',
  ];
  const evidenceCases = [
    ['dialogue', '{甲}「后。」'],
    ['narration', '后。'],
  ];

  for (const inert of inertRanges) {
    for (const [evidenceName, evidence] of evidenceCases) {
      for (const lineEnding of ['\n', '\r\n', '\r']) {
        const content = first + inert + evidence + lineEnding + lineEnding + terminal;
        const source = content + lineEnding + updateVariable;
        const label = `${inert}:${evidenceName}:${JSON.stringify(lineEnding)}`;

        assert.deepEqual(splitUpdateVariable(source), {
          ok: true,
          content,
          separator: lineEnding,
          updateVariable,
          errors: [],
        }, label);
        for (const result of [parseNarrative(source), parseStreamingNarrative(source)]) {
          assert.equal(result.updateVariable, updateVariable, label);
          assert.equal(errorCodes(result).includes('invalid-trailing-content'), false, label);
          assert.equal(errorCodes(result).includes('invalid-root-structure'), false, label);
        }
      }
    }
  }
});

test('round V V3 keeps inert-only and unclosed inert suffixes from manufacturing ownership', () => {
  const terminal = '</now_plot></content>';
  const first = currentResponse('前。');
  const updateVariable = '<UpdateVariable>{}</UpdateVariable>';
  const inertRanges = [
    '<!--</now_plot></content>-->',
    '<![CDATA[</now_plot></content>]]>',
    '<?note </now_plot></content>?>',
    '<!DOCTYPE note [<!ENTITY x "</now_plot></content>">]>',
  ];

  for (const inert of inertRanges) {
    for (const lineEnding of ['\n', '\r\n', '\r']) {
      const source = first + inert + lineEnding + lineEnding + terminal
        + lineEnding + updateVariable;
      assert.deepEqual(splitUpdateVariable(source), {
        ok: true,
        content: source,
        separator: '',
        updateVariable: null,
        errors: [],
      }, `${inert}:${JSON.stringify(lineEnding)}`);
    }
  }

  for (const opener of ['<!--x', '<![CDATA[x', '<?note x', '<!DOCTYPE note [']) {
    const source = first + opener + '</now_plot></content>{甲}「伪。」'
      + terminal + '\n' + updateVariable;
    assert.deepEqual(splitUpdateVariable(source), {
      ok: true,
      content: source,
      separator: '',
      updateVariable: null,
      errors: [],
    }, opener);
  }
});

test('round V V3 keeps repeated completed inert recovery scanning sub-quadratic', () => {
  const terminal = '</now_plot></content>';
  const first = currentResponse('前。');
  const updateVariable = '<UpdateVariable>{}</UpdateVariable>';
  const measureSliceUnits = (count) => {
    const content = first + '<!--x-->'.repeat(count) + '{甲}「后。」\n\n' + terminal;
    const source = content + '\n' + updateVariable;
    const oldSlice = String.prototype.slice;
    let sliceUnits = 0;
    String.prototype.slice = function instrumentedSlice(start, end) {
      const value = this.valueOf();
      if (value === source && Number.isInteger(start)) {
        const normalizedEnd = Number.isInteger(end) ? end : value.length;
        sliceUnits += Math.max(0, normalizedEnd - start);
      }
      return oldSlice.call(this, start, end);
    };
    try {
      assert.equal(splitUpdateVariable(source).updateVariable, updateVariable, `${count} ranges`);
      return sliceUnits;
    } finally {
      String.prototype.slice = oldSlice;
    }
  };

  const small = measureSliceUnits(800);
  const large = measureSliceUnits(1_600);
  assert.ok(small > 0, 'slice instrumentation did not observe recovery work');
  assert.ok(large < small * 3, `doubling inert recovery ranges used ${small}/${large} slice units`);
});

test('round V V4 conservatively owns the remainder after an unmatched link or image label', () => {
  const unmatched = [
    '[*x*',
    '![*x*',
    '[**x**',
    '![**x**',
    '[outer [*inner*]',
    '![outer \\] **still inert**',
    '[outer \\[ nested *still inert*',
    '*before ![alt after*',
    '**before [alt after**',
    'prefix [unfinished **inside** and *later*',
  ];
  for (const source of unmatched) {
    assert.deepEqual(tokenizeInlineText(source), [{ type: 'text', text: source }], source);
  }

  assert.deepEqual(tokenizeInlineText('*before* [unfinished **later**'), [
    { type: 'em', text: 'before' },
    { type: 'text', text: ' [unfinished **later**' },
  ]);
});

test('round V V4 leaves completed Markdown labels and later independent emphasis active', () => {
  assert.deepEqual(tokenizeInlineText('[*x*][id] **later**'), [
    { type: 'text', text: '[*x*][id] ' },
    { type: 'strong', text: 'later' },
  ]);
  assert.deepEqual(tokenizeInlineText('![*x*](url) *later*'), [
    { type: 'text', text: '![*x*](url) ' },
    { type: 'em', text: 'later' },
  ]);
  assert.deepEqual(tokenizeInlineText('[outer [inner]] **later**'), [
    { type: 'text', text: '[outer [inner]] ' },
    { type: 'strong', text: 'later' },
  ]);
});

test('round V V4 scans near-limit and repeated labels linearly before one unmatched tail', () => {
  const measure = (length) => {
    const source = '![' + 'a'.repeat(length - 6) + '*x*';
    for (let warmup = 0; warmup < 3; warmup += 1) {
      tokenizeInlineText(source);
    }
    const start = performance.now();
    let result;
    for (let repeat = 0; repeat < 20; repeat += 1) {
      result = tokenizeInlineText(source);
    }
    const elapsedMs = performance.now() - start;
    assert.deepEqual(result, [{ type: 'text', text: source }], `${length} bytes`);
    return elapsedMs;
  };

  const small = measure(Math.floor(LIMITS.BLOCK_TEXT / 2));
  const large = measure(LIMITS.BLOCK_TEXT);
  assert.ok(large < small * 3, `doubling an unmatched label used ${small}/${large}ms`);

  const count = 2_000;
  const prefix = '[*x*][id] '.repeat(count);
  const tail = '![**unfinished**';
  const source = prefix + tail;
  const oldIndexOf = String.prototype.indexOf;
  let labelSearches = 0;
  String.prototype.indexOf = function instrumentedIndexOf(search, position) {
    if (this.valueOf() === source && search === '[') {
      labelSearches += 1;
    }
    return oldIndexOf.call(this, search, position);
  };
  try {
    assert.deepEqual(tokenizeInlineText(source), [{ type: 'text', text: source }]);
  } finally {
    String.prototype.indexOf = oldIndexOf;
  }
  assert.equal(labelSearches, count + 1);
});

test('round V V5 degrades only a four-sentence ability ending its first sentence with A', () => {
  const description = 'Choose option A. Then move. Then wait. Then stop.';
  const badAbility = ability(
    '',
    `<effect>发动。</effect><description>${description}</description>`,
  );
  const check = '<check type="观察" actor="甲" target="乙">成。</check>';
  const source = currentResponse(`{甲}「前。」${badAbility}${check}`);

  for (const result of [parseNarrative(source), parseStreamingNarrative(source)]) {
    assert.deepEqual(result.blocks.map((block) => block.type), ['dialogue', 'invalid', 'check']);
    assert.deepEqual(result.blocks[0], { type: 'dialogue', speaker: '甲', text: '前。' });
    assert.deepEqual(result.blocks[1], {
      type: 'invalid',
      status: 'invalid',
      reason: 'invalid-ability',
      rawText: badAbility,
    });
    assert.deepEqual(result.blocks[2], {
      type: 'check',
      checkType: '观察',
      actor: '甲',
      target: '乙',
      text: '成。',
    });
  }

  const closedStreaming = parseStreamingNarrative(source);
  assert.equal(closedStreaming.streaming, false);
  assert.equal(closedStreaming.complete, true);
});

test('round V V5 counts ordinary one-letter ASCII sentences with and without quotes', () => {
  for (const description of [
    'A. B. C. D.',
    '"A." "B." "C." "D."',
    '“A.” “B.” “C.” “D.”',
  ]) {
    const children = `<effect>发动。</effect><description>${description}</description>`;
    const result = parseNarrative(currentResponse(ability('', children)));
    assert.equal(result.blocks[0].type, 'invalid', description);
    assert.equal(result.blocks[0].reason, 'invalid-ability', description);
  }
});

test('round V V5 preserves compact initialisms, abbreviations, dotted tokens, and legacy desc', () => {
  const validDescriptions = [
    'Use e.g. fire. Then wait. Finally move.',
    'Use i.e. this. Dr. Smith waits. Then U.S. moves.',
    'Use 1.5 at example.com... Then wait. Finally move.',
    'A.A.A. pattern holds. Then wait. Finally stop.',
  ];
  for (const description of validDescriptions) {
    const children = `<effect>发动。</effect><description>${description}</description>`;
    const result = parseNarrative(currentResponse(ability('', children)));
    assert.equal(result.blocks[0].type, 'ability', description);
    assert.equal(result.blocks[0].description, description, description);
  }

  const legacy = parseNarrative(currentResponse(ability(' desc="A. B. C. D."', '发动。')));
  assert.equal(legacy.blocks[0].type, 'ability');
  assert.equal(legacy.blocks[0].protocol, 'legacy-readonly');
  assert.equal(legacy.blocks[0].description, 'A. B. C. D.');
});

test('round X X1 preserves completed NPC and player dialogue before every unsafe second byte', () => {
  const terminal = '</now_plot></content>';
  const header = currentResponse('').slice(0, -terminal.length);
  const speakers = [
    ['npc', '{甲}「一。」', { type: 'dialogue', speaker: '甲', text: '一。' }],
    ['player', '{#}「一。」', { type: 'player-dialogue', speaker: '#', text: '一。' }],
  ];
  const continuations = [
    ...Array.from({ length: 128 }, (_, code) => String.fromCharCode(code)),
    '界',
    'Ａ',
    '🙂',
    '\u0301',
    'x:',
    'x?',
    'scene:',
    'scene?',
    'scene/',
  ];

  for (const [speakerName, rawDialogue, dialogue] of speakers) {
    const stableBlocks = [
      { type: 'narration', text: '前。' },
      dialogue,
    ];
    for (const continuation of continuations) {
      const result = parseStreamingNarrative(
        header + '前。\n\n' + rawDialogue + '<' + continuation,
      );
      assert.deepEqual(
        result.blocks,
        stableBlocks,
        `${speakerName}:${JSON.stringify(continuation)}`,
      );
    }
  }
});

test('round X X1 keeps published blocks prefix-monotonic through every unsafe lexical family', () => {
  const terminal = '</now_plot></content>';
  const header = currentResponse('').slice(0, -terminal.length);
  const base = header + '前。\n\n{甲}「一。」';
  const suffixes = [
    ['supported opener', '<scene location="王都" time="下午" mood="静">景。</scene>'],
    ['unsupported opener', '<widget mode="unknown">坏。</widget>'],
    ['comment', '<!--x-->'],
    ['CDATA', '<![CDATA[x]]>'],
    ['PI', '<?note x?>'],
    ['declaration', '<!DOCTYPE note>'],
    ['closing tag', '</scene>'],
    ['whitespace lead', '< x'],
    ['quote lead', '<"x'],
    ['digit lead', '<1x'],
    ['punctuation lead', '<:x'],
    ['mutated unknown prefix', '<x:bad'],
    ['mutated supported prefix', '<scene:bad'],
    ['malformed recovery', '<x:bad\n\n后。\n\n'],
    ['inert recovery', '<!--x\n\n后。\n\n'],
  ];

  for (const [name, suffix] of suffixes) {
    let published = [];
    for (let length = 0; length <= suffix.length; length += 1) {
      const result = parseStreamingNarrative(base + suffix.slice(0, length));
      assert.deepEqual(
        result.blocks.slice(0, published.length),
        published,
        `${name}:${length}:${JSON.stringify(suffix.slice(0, length))}`,
      );
      published = result.blocks;
    }
  }
});

test('round X X1 converges on stable dialogue plus a separately normalized suffix', () => {
  const terminal = '</now_plot></content>';
  const header = currentResponse('').slice(0, -terminal.length);
  const stableBlocks = [
    { type: 'narration', text: '前。' },
    { type: 'dialogue', speaker: '甲', text: '一。' },
  ];
  const cases = [
    [
      'supported',
      '<scene location="王都" time="下午" mood="静">景。</scene>',
      [{ type: 'scene', location: '王都', time: '下午', mood: '静', text: '景。' }],
    ],
    [
      'unsupported',
      '<widget mode="unknown">坏。</widget>',
      [{
        type: 'invalid',
        status: 'invalid',
        reason: 'unsupported-child',
        rawText: '<widget mode="unknown">坏。</widget>',
      }],
    ],
    ['comment', '<!--x-->', [{ type: 'narration', text: '<!--x-->' }]],
    [
      'stray closing tag',
      '</scene>',
      [{
        type: 'invalid',
        status: 'invalid',
        reason: 'invalid-local-block',
        rawText: '</scene>',
      }],
    ],
    ['bare angle', '<', [{ type: 'narration', text: '<' }]],
    ['declaration prefix', '<!', [{ type: 'narration', text: '<!' }]],
    ['PI prefix', '<?', [{ type: 'narration', text: '<?' }]],
    ['digit prefix', '<1', [{ type: 'narration', text: '<1' }]],
    ['mutated name', '<x:', [{ type: 'narration', text: '<x:' }]],
    [
      'recovered comment',
      '<!--x\n\n后。\n\n',
      [
        {
          type: 'invalid',
          status: 'invalid',
          reason: 'invalid-local-block',
          rawText: '<!--x\n\n',
        },
        { type: 'narration', text: '后。' },
      ],
    ],
  ];

  for (const [name, suffix, suffixBlocks] of cases) {
    const source = header + '前。\n\n{甲}「一。」' + suffix + terminal;
    const complete = parseNarrative(source);
    const closedStreaming = parseStreamingNarrative(source);
    const expected = [...stableBlocks, ...suffixBlocks];

    assert.deepEqual(complete.blocks, expected, name);
    assert.deepEqual(closedStreaming.blocks, expected, name);
    assert.equal(closedStreaming.streaming, false, name);
    assert.equal(closedStreaming.complete, true, name);
  }
});

test('round X X1 keeps attempted dialogue ownership and bounds malformed suffix work', () => {
  const terminal = '</now_plot></content>';
  const header = currentResponse('').slice(0, -terminal.length);

  for (const suffix of [
    '<1',
    '<!',
    '<x:',
    '<!--x-->',
    '<scene location="王都" time="下午" mood="静">景。</scene>',
  ]) {
    const attempted = '{甲}「未完' + suffix;
    const result = parseStreamingNarrative(header + '前。\n\n' + attempted);
    assert.deepEqual(result.blocks[0], { type: 'narration', text: '前。' }, suffix);
    assert.equal(
      result.blocks.some((block) => block.type === 'dialogue' || block.type === 'player-dialogue'),
      false,
      suffix,
    );
    assert.equal(
      result.blocks.some((block) => block.text === '未完' || block.rawText === '{甲}「未完'),
      false,
      suffix,
    );
  }

  const measureSliceUnits = (tailLength) => {
    const source = header + '{甲}「一。」<' + ':'.repeat(tailLength);
    const oldSlice = String.prototype.slice;
    let sliceUnits = 0;
    String.prototype.slice = function instrumentedSlice(start, end) {
      const value = this.valueOf();
      if (value === source && Number.isInteger(start)) {
        const normalizedEnd = Number.isInteger(end) ? end : value.length;
        sliceUnits += Math.max(0, normalizedEnd - start);
      }
      return oldSlice.call(this, start, end);
    };
    try {
      const result = parseStreamingNarrative(source);
      assert.deepEqual(result.blocks, [{ type: 'dialogue', speaker: '甲', text: '一。' }]);
      return { sliceUnits, sourceLength: source.length };
    } finally {
      String.prototype.slice = oldSlice;
    }
  };

  for (const tailLength of [8_000, 16_000]) {
    const measured = measureSliceUnits(tailLength);
    assert.ok(
      measured.sliceUnits <= measured.sourceLength * 12,
      `${tailLength} malformed bytes used ${measured.sliceUnits} slice units`,
    );
  }

  const unitCount = 96;
  const body = Array.from({ length: unitCount }, (_, index) => (
    `${index % 2 === 0 ? '{甲}' : '{#}'}「${index}。」<:${index}\n\n`
  )).join('');
  const repeatedSource = header + body;
  const oldSlice = String.prototype.slice;
  let repeatedSliceUnits = 0;
  let repeated;
  String.prototype.slice = function instrumentedRepeatedSlice(start, end) {
    const value = this.valueOf();
    if (value === repeatedSource && Number.isInteger(start)) {
      const normalizedEnd = Number.isInteger(end) ? end : value.length;
      repeatedSliceUnits += Math.max(0, normalizedEnd - start);
    }
    return oldSlice.call(this, start, end);
  };
  try {
    repeated = parseStreamingNarrative(repeatedSource);
  } finally {
    String.prototype.slice = oldSlice;
  }
  assert.equal(
    repeated.blocks.filter((block) => (
      block.type === 'dialogue' || block.type === 'player-dialogue'
    )).length,
    unitCount,
  );
  assert.equal(repeated.blocks.length, unitCount * 2);
  assert.ok(
    repeatedSliceUnits <= repeatedSource.length * 20,
    `repeated unsafe units used ${repeatedSliceUnits} slice units`,
  );
});

test('round X X2 makes every inert recovery boundary append-irrevocable', () => {
  const terminal = '</now_plot></content>';
  const header = currentResponse('').slice(0, -terminal.length);
  const scene = '<scene location="王都" time="下午" mood="静">景。</scene>';
  const variants = [
    ['comment', '<!--x', '-->'],
    ['CDATA', '<![CDATA[x', ']]>'],
    ['PI', '<?note x', '?>'],
    ['declaration', '<!D', '>'],
  ];

  for (const [name, opener, terminator] of variants) {
    for (const lineEnding of ['\n', '\r\n', '\r']) {
      const blank = lineEnding + lineEnding;
      const source = header + '前。' + blank + opener + blank + '后。' + blank;
      const before = parseStreamingNarrative(source).blocks;
      const label = `${name}:${JSON.stringify(lineEnding)}`;
      assert.deepEqual(before, [
        { type: 'narration', text: '前。' },
        {
          type: 'invalid',
          status: 'invalid',
          reason: 'invalid-local-block',
          rawText: opener + blank,
        },
        { type: 'narration', text: '后。' },
      ], label);

      const lateTails = [
        ['terminator', terminator],
        ['scene sibling', scene],
        ['scene closer', '</scene>'],
        ['check closer', '</check>'],
        ['actual root closers', terminal],
      ];
      for (const [tailName, tail] of lateTails) {
        let published = before;
        for (let length = 1; length <= tail.length; length += 1) {
          const result = parseStreamingNarrative(source + tail.slice(0, length));
          assert.deepEqual(
            result.blocks.slice(0, published.length),
            published,
            `${label}:${tailName}:${length}`,
          );
          published = result.blocks;
        }
      }
    }
  }
});

test('round X X2 keeps late inert terminators local after the frozen cutoff', () => {
  const terminal = '</now_plot></content>';
  const header = currentResponse('').slice(0, -terminal.length);
  const variants = [
    ['comment', '<!--x', '-->'],
    ['CDATA', '<![CDATA[x', ']]>'],
    ['PI', '<?note x', '?>'],
    ['declaration', '<!D', '>'],
  ];

  for (const [name, opener, terminator] of variants) {
    for (const lineEnding of ['\n', '\r\n', '\r']) {
      const blank = lineEnding + lineEnding;
      const source = header + '前。' + blank + opener + blank
        + terminator + blank + '{乙}「保留。」' + terminal;
      const expectedInvalid = {
        type: 'invalid',
        status: 'invalid',
        reason: 'invalid-local-block',
        rawText: opener + blank,
      };
      const label = `${name}:${JSON.stringify(lineEnding)}`;

      for (const result of [parseNarrative(source), parseStreamingNarrative(source)]) {
        assert.equal(result.ok, true, label);
        assert.deepEqual(result.blocks[0], { type: 'narration', text: '前。' }, label);
        assert.deepEqual(result.blocks[1], expectedInvalid, label);
        assert.deepEqual(
          result.blocks.at(-1),
          { type: 'dialogue', speaker: '乙', text: '保留。' },
          label,
        );
        assert.equal(errorCodes(result).includes('invalid-root-structure'), false, label);
        assert.equal(errorCodes(result).includes('invalid-trailing-content'), false, label);
      }
    }
  }
});

test('round X X2 completes inert markup only when its terminator precedes recovery', () => {
  const terminal = '</now_plot></content>';
  const header = currentResponse('').slice(0, -terminal.length);
  const updateVariable = '<UpdateVariable>{"u":"exact"}</UpdateVariable>';
  const inertRanges = [
    '<!--</now_plot></content>-->',
    '<![CDATA[</now_plot></content>]]>',
    '<?note </now_plot></content>?>',
    '<!D "</now_plot></content>">',
  ];

  for (const inert of inertRanges) {
    const content = header + '{甲}「前。」' + inert + '{乙}「后。」' + terminal;
    const source = content + '\n' + updateVariable;
    assert.deepEqual(splitUpdateVariable(source), {
      ok: true,
      content,
      separator: '\n',
      updateVariable,
      errors: [],
    }, inert);
    for (const result of [parseNarrative(source), parseStreamingNarrative(source)]) {
      assert.deepEqual(result.blocks, [
        { type: 'dialogue', speaker: '甲', text: '前。' },
        { type: 'narration', text: inert },
        { type: 'dialogue', speaker: '乙', text: '后。' },
      ], inert);
      assert.equal(result.updateVariable, updateVariable, inert);
    }
  }
});

test('round X X2 preserves real roots, terminal U, legal siblings, and bounded recovery work', () => {
  const terminal = '</now_plot></content>';
  const header = currentResponse('').slice(0, -terminal.length);
  const updateVariable = '<UpdateVariable>{"u":"exact"}</UpdateVariable>';

  for (const lineEnding of ['\n', '\r\n', '\r']) {
    const blank = lineEnding + lineEnding;
    const content = header + '前。' + blank + '<!D' + blank + '{乙}「保留。」' + terminal;
    const source = content + lineEnding + updateVariable;
    const label = JSON.stringify(lineEnding);
    assert.deepEqual(splitUpdateVariable(source), {
      ok: true,
      content,
      separator: lineEnding,
      updateVariable,
      errors: [],
    }, label);
    for (const result of [parseNarrative(source), parseStreamingNarrative(source)]) {
      assert.deepEqual(result.blocks, [
        { type: 'narration', text: '前。' },
        {
          type: 'invalid',
          status: 'invalid',
          reason: 'invalid-local-block',
          rawText: '<!D' + blank,
        },
        { type: 'dialogue', speaker: '乙', text: '保留。' },
      ], label);
      assert.equal(result.updateVariable, updateVariable, label);
      assert.equal(errorCodes(result).includes('invalid-root-structure'), false, label);
      assert.equal(errorCodes(result).includes('invalid-trailing-content'), false, label);
    }
  }

  const scene = '<scene location="王都" time="下午" mood="静">景。</scene>';
  const sceneSource = header + '前。\n\n<!D\n\n' + scene + terminal;
  for (const result of [parseNarrative(sceneSource), parseStreamingNarrative(sceneSource)]) {
    assert.deepEqual(result.blocks.map((block) => block.type), ['narration', 'invalid', 'scene']);
    assert.equal(result.blocks[1].rawText, '<!D\n\n');
    assert.deepEqual(result.blocks[2], {
      type: 'scene',
      location: '王都',
      time: '下午',
      mood: '静',
      text: '景。',
    });
  }

  for (const tailLength of [32_000, 64_000]) {
    const source = header + '前。\n\n<!--' + 'x'.repeat(tailLength) + '\n\n后。\n\n-->';
    const oldStartsWith = String.prototype.startsWith;
    let lexicalProbes = 0;
    String.prototype.startsWith = function instrumentedStartsWith(search, position) {
      if (this.valueOf() === source) {
        lexicalProbes += 1;
      }
      return oldStartsWith.call(this, search, position);
    };
    try {
      const result = parseStreamingNarrative(source);
      const recovered = result.blocks.at(-2);
      assert.equal(recovered.type, 'invalid');
      assert.equal(recovered.status, 'invalid');
      assert.equal(recovered.reason, 'invalid-local-block');
      assert.ok(recovered.rawText.startsWith('<!--'));
      assert.ok(recovered.rawText.length <= LIMITS.BLOCK_TEXT);
      assert.deepEqual(result.blocks.at(-1), { type: 'narration', text: '后。' });
      assert.equal(result.progressText, '-->');
    } finally {
      String.prototype.startsWith = oldStartsWith;
    }
    assert.ok(
      lexicalProbes <= source.length * 8,
      `${tailLength} inert bytes used ${lexicalProbes} lexical probes`,
    );
  }
});

test('round X X3 walks completed inert events before later dialogue or narration evidence', () => {
  const terminal = '</now_plot></content>';
  const header = currentResponse('').slice(0, -terminal.length);
  const updateVariable = '<UpdateVariable>{"u":"exact"}</UpdateVariable>';
  const inertRanges = [
    '<!--</now_plot></content>-->',
    '<![CDATA[</now_plot></content>]]>',
    '<?note </now_plot></content>?>',
    '<!D "</now_plot></content>">',
  ];
  const nonEvidencePrefixes = [
    '{坏}',
    '&#123;甲&#125;「伪。」',
    '{甲}「未完',
  ];
  const evidenceCases = [
    ['dialogue', '{乙}「真。」'],
    ['narration', '真。'],
  ];

  for (const lineEnding of ['\n', '\r\n', '\r']) {
    const blank = lineEnding + lineEnding;
    const first = header + '前。' + blank + terminal;
    for (const inert of inertRanges) {
      for (const nonEvidence of nonEvidencePrefixes) {
        for (const [evidenceName, evidence] of evidenceCases) {
          const continuation = nonEvidence + inert + evidence;
          const content = first + continuation + terminal;
          const source = content + lineEnding + updateVariable;
          const normal = parseNarrative(header + '前。' + blank + continuation + terminal);
          const expectedTail = normal.blocks.slice(1);
          const label = [
            JSON.stringify(lineEnding),
            inert,
            nonEvidence,
            evidenceName,
          ].join(':');

          assert.equal(normal.ok, true, `normal:${label}`);
          assert.deepEqual(splitUpdateVariable(source), {
            ok: true,
            content,
            separator: lineEnding,
            updateVariable,
            errors: [],
          }, label);
          for (const result of [parseNarrative(source), parseStreamingNarrative(source)]) {
            assert.equal(result.ok, true, label);
            assert.equal(result.updateVariable, updateVariable, label);
            assert.deepEqual(result.blocks.slice(-expectedTail.length), expectedTail, label);
            assert.equal(errorCodes(result).includes('invalid-root-structure'), false, label);
            assert.equal(errorCodes(result).includes('invalid-trailing-content'), false, label);
          }
        }
      }
    }
  }
});

test('round X X3 does not manufacture root or U ownership without later semantic evidence', () => {
  const terminal = '</now_plot></content>';
  const header = currentResponse('').slice(0, -terminal.length);
  const updateVariable = '<UpdateVariable>{}</UpdateVariable>';
  const inertRanges = [
    '<!--</now_plot></content>-->',
    '<![CDATA[</now_plot></content>]]>',
    '<?note </now_plot></content>?>',
    '<!D "</now_plot></content>">',
  ];
  const nonEvidencePrefixes = ['{坏}', '&#123;甲&#125;「伪。」', '{甲}「未完'];

  for (const lineEnding of ['\n', '\r\n', '\r']) {
    const first = header + '前。' + terminal;
    for (const inert of inertRanges) {
      for (const nonEvidence of nonEvidencePrefixes) {
        const source = first + nonEvidence + inert + terminal
          + lineEnding + updateVariable;
        const label = `${JSON.stringify(lineEnding)}:${inert}:${nonEvidence}`;
        assert.deepEqual(splitUpdateVariable(source), {
          ok: true,
          content: source,
          separator: '',
          updateVariable: null,
          errors: [],
        }, label);
        for (const result of [parseNarrative(source), parseStreamingNarrative(source)]) {
          assert.equal(result.ok, false, label);
          assert.equal(result.updateVariable, null, label);
          assert.ok(errorCodes(result).includes('invalid-trailing-content'), label);
        }
      }
    }
  }
});

test('round X X3 respects recovered and end-owned unclosed inert ranges', () => {
  const terminal = '</now_plot></content>';
  const header = currentResponse('').slice(0, -terminal.length);
  const updateVariable = '<UpdateVariable>{"u":"exact"}</UpdateVariable>';
  const recoveredOpeners = ['<!--x', '<![CDATA[x', '<?note x', '<!D'];

  for (const lineEnding of ['\n', '\r\n', '\r']) {
    const blank = lineEnding + lineEnding;
    const first = header + '前。' + blank + terminal;
    for (const opener of recoveredOpeners) {
      const continuation = '真。' + opener + blank + '{乙}「真。」';
      const content = first + continuation + terminal;
      const source = content + lineEnding + updateVariable;
      const normal = parseNarrative(header + '前。' + blank + continuation + terminal);
      const expectedTail = normal.blocks.slice(1);
      const label = `${JSON.stringify(lineEnding)}:${opener}`;

      assert.deepEqual(splitUpdateVariable(source), {
        ok: true,
        content,
        separator: lineEnding,
        updateVariable,
        errors: [],
      }, label);
      for (const result of [parseNarrative(source), parseStreamingNarrative(source)]) {
        assert.equal(result.ok, true, label);
        assert.equal(result.updateVariable, updateVariable, label);
        assert.deepEqual(result.blocks.slice(-expectedTail.length), expectedTail, label);
      }
    }

    for (const opener of ['<!--x', '<![CDATA[x', '<?note x', '<!D "']) {
      const source = first + '{坏}' + opener + terminal + lineEnding + updateVariable;
      assert.deepEqual(splitUpdateVariable(source), {
        ok: true,
        content: source,
        separator: '',
        updateVariable: null,
        errors: [],
      }, `${JSON.stringify(lineEnding)}:${opener}`);
    }
  }
});

test('round X X3 preserves supported evidence and bounds repeated event walking', () => {
  const terminal = '</now_plot></content>';
  const header = currentResponse('').slice(0, -terminal.length);
  const first = currentResponse('前。');
  const updateVariable = '<UpdateVariable>{}</UpdateVariable>';
  const scene = '<scene location="王都" time="下午" mood="静">景。</scene>';
  const sceneContent = first + '{坏}<!--x-->' + scene + terminal;
  const sceneSource = sceneContent + '\n' + updateVariable;

  assert.equal(splitUpdateVariable(sceneSource).updateVariable, updateVariable);
  for (const result of [parseNarrative(sceneSource), parseStreamingNarrative(sceneSource)]) {
    assert.equal(result.ok, true);
    assert.deepEqual(result.blocks.at(-1), {
      type: 'scene',
      location: '王都',
      time: '下午',
      mood: '静',
      text: '景。',
    });
    assert.equal(result.updateVariable, updateVariable);
  }

  const measureSliceUnits = (count) => {
    const continuation = '{坏}<!--x-->'.repeat(count) + '{乙}「真。」\n\n';
    const content = first + continuation + terminal;
    const source = content + '\n' + updateVariable;
    const oldSlice = String.prototype.slice;
    let sliceUnits = 0;
    String.prototype.slice = function instrumentedSlice(start, end) {
      const value = this.valueOf();
      if (value === source && Number.isInteger(start)) {
        const normalizedEnd = Number.isInteger(end) ? end : value.length;
        sliceUnits += Math.max(0, normalizedEnd - start);
      }
      return oldSlice.call(this, start, end);
    };
    try {
      assert.equal(splitUpdateVariable(source).updateVariable, updateVariable, `${count} events`);
      return { sliceUnits, sourceLength: source.length };
    } finally {
      String.prototype.slice = oldSlice;
    }
  };

  for (const count of [600, 1_200]) {
    const measured = measureSliceUnits(count);
    assert.ok(measured.sliceUnits > 0, `${count} events observed no slice work`);
    assert.ok(
      measured.sliceUnits <= measured.sourceLength * 16,
      `${count} events used ${measured.sliceUnits} slice units`,
    );
  }
});

test('round Z keeps the later root and U just beyond the former work cutoff', () => {
  const terminal = '</now_plot></content>';
  const first = currentResponse('前。');
  const updateVariable = '<UpdateVariable>{}</UpdateVariable>';
  const content = first
    + '{坏}<!--x-->'.repeat(2_112)
    + '{乙}「真。」'
    + terminal;
  const source = content + '\n' + updateVariable;

  assert.deepEqual(splitUpdateVariable(source), {
    ok: true,
    content,
    separator: '\n',
    updateVariable,
    errors: [],
  });
  for (const result of [parseNarrative(source), parseStreamingNarrative(source)]) {
    assert.equal(result.ok, true);
    assert.deepEqual(
      result.blocks.at(-1),
      { type: 'dialogue', speaker: '乙', text: '真。' },
    );
    assert.equal(result.updateVariable, updateVariable);
    assert.equal(errorCodes(result).includes('invalid-trailing-content'), false);
  }
});

test('round Z covers every completed inert family and semantic evidence at the cutoff', () => {
  const terminal = '</now_plot></content>';
  const first = currentResponse('前。');
  const updateVariable = '<UpdateVariable>{"u":"exact"}</UpdateVariable>';
  const cases = [
    ['comment narration CRLF', '<!--x-->', '真。', '\r\n', null],
    ['CDATA dialogue CR', '<![CDATA[x]]>', '{乙}「真。」', '\r', 'dialogue'],
    ['CDATA narration LF', '<![CDATA[x]]>', '真。', '\n', null],
    ['PI dialogue CRLF', '<?note x?>', '{乙}「真。」', '\r\n', 'dialogue'],
    ['PI narration CR', '<?note x?>', '真。', '\r', null],
    ['declaration dialogue LF', '<!D>', '{乙}「真。」', '\n', 'dialogue'],
    ['declaration narration CRLF', '<!D>', '真。', '\r\n', null],
  ];

  for (const [name, inert, evidence, separator, evidenceType] of cases) {
    const repeatedPrefix = (`{坏}${inert}`).repeat(2_112);
    const content = first + repeatedPrefix + evidence + terminal;
    const source = content + separator + updateVariable;
    const split = splitUpdateVariable(source);

    assert.equal(split.ok, true, name);
    assert.equal(split.content, content, name);
    assert.equal(split.separator, separator, name);
    assert.equal(split.updateVariable, updateVariable, name);
    assert.deepEqual(split.errors, [], name);
    for (const result of [parseNarrative(source), parseStreamingNarrative(source)]) {
      assert.equal(result.ok, true, name);
      assert.equal(result.updateVariable, updateVariable, name);
      assert.deepEqual(result.blocks[0], { type: 'narration', text: '前。' }, name);
      assert.equal(errorCodes(result).includes('invalid-trailing-content'), false, name);
      if (evidenceType === 'dialogue') {
        assert.deepEqual(
          result.blocks.at(-1),
          { type: 'dialogue', speaker: '乙', text: '真。' },
          name,
        );
      }
    }

    const noEvidenceContent = first + repeatedPrefix + terminal;
    const noEvidenceSource = noEvidenceContent + separator + updateVariable;
    assert.deepEqual(splitUpdateVariable(noEvidenceSource), {
      ok: true,
      content: noEvidenceSource,
      separator: '',
      updateVariable: null,
      errors: [],
    }, `no evidence:${name}`);
    for (const result of [
      parseNarrative(noEvidenceSource),
      parseStreamingNarrative(noEvidenceSource),
    ]) {
      assert.equal(result.ok, false, `no evidence:${name}`);
      assert.deepEqual(result.blocks, [], `no evidence:${name}`);
      assert.equal(result.updateVariable, null, `no evidence:${name}`);
      assert.ok(
        errorCodes(result).includes('invalid-trailing-content'),
        `no evidence:${name}`,
      );
    }
  }
});

test('round Z derives recovery work from source progress at larger safe counts', () => {
  const terminal = '</now_plot></content>';
  const first = currentResponse('前。');
  const updateVariable = '<UpdateVariable>{"u":"exact"}</UpdateVariable>';
  const nearLimitPair = '{坏}<!--x-->';
  const nearLimitEvidence = '真。';
  const nearLimitSeparator = '\r';
  const nearLimitFixed = first + nearLimitEvidence + terminal
    + nearLimitSeparator + updateVariable;
  const nearLimitCount = Math.floor(
    (LIMITS.SOURCE - nearLimitFixed.length) / nearLimitPair.length,
  );
  const cases = [
    ['3,000 declaration pairs', '{坏}<!D>', 3_000, '{乙}「真。」', '\r\n', 'dialogue'],
    [
      'near-limit comment pairs',
      nearLimitPair,
      nearLimitCount,
      nearLimitEvidence,
      nearLimitSeparator,
      null,
    ],
  ];

  assert.ok(nearLimitCount > 3_000);
  for (const [name, pair, count, evidence, separator, evidenceType] of cases) {
    const repeatedPrefix = pair.repeat(count);
    const content = first + repeatedPrefix + evidence + terminal;
    const source = content + separator + updateVariable;
    assert.ok(source.length <= LIMITS.SOURCE, name);
    if (name.startsWith('near-limit')) {
      assert.ok(LIMITS.SOURCE - source.length < pair.length, name);
    }

    const split = splitUpdateVariable(source);
    assert.equal(split.ok, true, name);
    assert.equal(split.content, content, name);
    assert.equal(split.separator, separator, name);
    assert.equal(split.updateVariable, updateVariable, name);
    for (const result of [parseNarrative(source), parseStreamingNarrative(source)]) {
      assert.equal(result.ok, true, name);
      assert.equal(result.updateVariable, updateVariable, name);
      assert.deepEqual(result.blocks[0], { type: 'narration', text: '前。' }, name);
      assert.equal(errorCodes(result).includes('invalid-trailing-content'), false, name);
      if (evidenceType === 'dialogue') {
        assert.deepEqual(
          result.blocks.at(-1),
          { type: 'dialogue', speaker: '乙', text: '真。' },
          name,
        );
      }
    }

    const noEvidenceContent = first + repeatedPrefix + terminal;
    const noEvidenceSource = noEvidenceContent + separator + updateVariable;
    const noEvidenceSplit = splitUpdateVariable(noEvidenceSource);
    assert.equal(noEvidenceSplit.ok, true, `no evidence:${name}`);
    assert.equal(noEvidenceSplit.content, noEvidenceSource, `no evidence:${name}`);
    assert.equal(noEvidenceSplit.separator, '', `no evidence:${name}`);
    assert.equal(noEvidenceSplit.updateVariable, null, `no evidence:${name}`);
    for (const result of [
      parseNarrative(noEvidenceSource),
      parseStreamingNarrative(noEvidenceSource),
    ]) {
      assert.equal(result.ok, false, `no evidence:${name}`);
      assert.deepEqual(result.blocks, [], `no evidence:${name}`);
      assert.equal(result.updateVariable, null, `no evidence:${name}`);
      assert.ok(
        errorCodes(result).includes('invalid-trailing-content'),
        `no evidence:${name}`,
      );
    }
  }
});

test('round Z keeps total repeated range and prefix work sub-quadratic', () => {
  const terminal = '</now_plot></content>';
  const first = currentResponse('前。');
  const updateVariable = '<UpdateVariable>{}</UpdateVariable>';
  const parsers = [parseNarrative, parseStreamingNarrative, splitUpdateVariable];

  const measureWork = (parser, count) => {
    const content = first
      + '{坏}<!--x-->'.repeat(count)
      + '{乙}「真。」'
      + terminal;
    const source = content + '\n' + updateVariable;
    const oldSlice = String.prototype.slice;
    const oldStartsWith = String.prototype.startsWith;
    let rangeUnits = 0;
    let prefixUnits = 0;
    String.prototype.slice = function instrumentedSlice(start, end) {
      const value = this.valueOf();
      if (value === source && Number.isInteger(start)) {
        const normalizedEnd = Number.isInteger(end) ? end : value.length;
        rangeUnits += Math.max(0, normalizedEnd - start);
      }
      return oldSlice.call(this, start, end);
    };
    String.prototype.startsWith = function instrumentedStartsWith(search, position) {
      if (this.valueOf() === source) {
        prefixUnits += String(search).length;
      }
      return oldStartsWith.call(this, search, position);
    };
    try {
      const result = parser(source);
      assert.equal(result.ok, true, `${parser.name}:${count}`);
      assert.equal(result.updateVariable, updateVariable, `${parser.name}:${count}`);
      return {
        sourceLength: source.length,
        totalUnits: rangeUnits + prefixUnits,
      };
    } finally {
      String.prototype.slice = oldSlice;
      String.prototype.startsWith = oldStartsWith;
    }
  };

  for (const parser of parsers) {
    const small = measureWork(parser, 3_000);
    const large = measureWork(parser, 6_000);
    assert.ok(small.totalUnits > 0, `${parser.name} instrumentation observed no work`);
    assert.ok(
      large.totalUnits < small.totalUnits * 3,
      `${parser.name} doubling used ${small.totalUnits}/${large.totalUnits} total units`,
    );
    assert.ok(
      large.totalUnits <= large.sourceLength * 32,
      `${parser.name} used ${large.totalUnits} units for ${large.sourceLength} input units`,
    );
  }
});
