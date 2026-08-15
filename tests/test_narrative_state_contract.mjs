import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const zod = JSON.parse(readFileSync(resolve(root, '变量/脚本/酒馆助手脚本-ZOD.json'), 'utf8'));
const schema = zod.content;
const init = readFileSync(resolve(root, '变量/世界书/[initvar] 初始.txt'), 'utf8');
const format = readFileSync(resolve(root, '变量/世界书/[mvu_update]变量输出格式.txt'), 'utf8');
const rules = readFileSync(resolve(root, '变量/世界书/[mvu_update]变量更新规则.txt'), 'utf8');
const battleRules = readFileSync(resolve(root, 'narrative/rules/战斗规则.md'), 'utf8');
const mappingPath = resolve(root, 'narrative/rules/状态字段映射.md');
let mapping = '';
try { mapping = readFileSync(mappingPath, 'utf8'); } catch { /* RED until the mapping is added. */ }

test('ZOD keeps exactly the eight persistent state roots and preserves script identity', () => {
  assert.equal(zod.type, 'script');
  assert.equal(zod.name, 'ZOD');
  assert.equal(zod.id, 'fc83c3a3-0bc0-4170-a36a-f40f773204ab');
  assert.match(schema, /registerMvuSchema\(Schema\)/);
  assert.deepEqual(zod.export_with, { data: true, button: true });
  for (const rootName of ['世界', '主角档案', '轮回', '关系', '事件', '线索', '资产', '规则']) {
    assert.match(schema, new RegExp(`(?:^|[,{\\s])${rootName}:`));
  }
  assert.doesNotMatch(schema, /(?:骰池|完整战斗日志|战斗日志|日志历史|rollPool|dicePool)/i);
});

test('all actor shapes expose shared bounded combat fields', () => {
  for (const shape of ['protagonist', 'person', 'partner', 'contractedPartner']) assert.match(schema, new RegExp(`const ${shape} =`));
  for (const field of ['战斗状态', '战力等阶', '可战状态', '体力', '魔力', '精神稳定', '当前目标', '当前行动']) {
    assert.match(schema, new RegExp(field));
  }
  assert.match(schema, /精神稳定:[^,}]*percent\(/);
  assert.match(schema, /当前目标:[^,}]*text\(/);
  assert.match(schema, /当前行动:[^,}]*text\(/);
  assert.match(schema, /生命:[^,}]*percent\(/);
  assert.match(schema, /伤势:\s*z\.record\(z\.string\(\), injury\)/);
});

test('abilities and equipment have optional structured combat metadata', () => {
  for (const field of ['修正', '基础伤害', '距离', '消耗', '冷却', '破阶标签', '限制']) {
    assert.match(schema, new RegExp(field));
  }
  assert.match(schema, /战斗元数据/);
  for (const category of ['加护', '权能', '魔法', '精灵术', '种族能力', '武技', '一般技能']) assert.match(schema, new RegExp(category));
  assert.match(schema, /装备:[^\n]*z\.record/);
});

test('事件.当前战斗 is short-lived state with safe defaults and no persistent dice/log', () => {
  assert.match(schema, /当前战斗/);
  for (const field of ['进行中', '战斗ID', '轮数', '阶段', '参战者', '先攻顺序', '当前行动者', '行动额度', '距离', '掩体', '持续效果', '濒死计数', '最近一次检定']) {
    assert.match(schema, new RegExp(field));
  }
  assert.doesNotMatch(schema, /当前战斗[\\s\\S]{0,1800}(?:骰池|完整战斗日志|战斗日志)/);
  assert.match(schema, /战斗ID: battleId/);
  assert.match(schema, /阶段: text\(''\)/);
  assert.match(schema, /当前行动者: stableId/);
  const battleSchema = schema.slice(schema.indexOf('const checkSummary'), schema.indexOf('export const Schema'));
  assert.match(battleSchema, /superRefine/);
  assert.match(battleSchema, /battle\.进行中\s*&&\s*!battle\.战斗ID\.trim\(\)/);
  assert.match(battleSchema, /const stableId = z\.string\(\)/);
  assert.match(battleSchema, /进行中: z\.boolean\(\)/);
  for (const field of ['参战者', '先攻顺序', '当前行动者']) assert.match(battleSchema, new RegExp(`${field}: (?:z\\.array\\(stableId\\)|stableId)`));
  assert.match(battleSchema, /battle\.参战者\.every\(id => id\)/);
  assert.match(battleSchema, /new Set\(battle\.先攻顺序\)\.size === battle\.先攻顺序\.length/);
  assert.doesNotMatch(battleSchema, /\.passthrough\(\)/);
  assert.match(battleSchema, /const checkSummary = z\.object/);
  for (const field of ['检定类型', '骰面', '目标DC', '修正', '总值', '结果等级', '目标', '时间']) assert.match(battleSchema, new RegExp(field));
  assert.match(battleSchema, /checkSummary[^\n]*\.strip\(\)/);
  assert.doesNotMatch(battleSchema, /z\.unknown\(/);
  assert.doesNotMatch(battleSchema, /行动顺序/);
});

test('combat rules use only canonical initiative terminology', () => {
  assert.match(battleRules, /先攻顺序/);
  assert.doesNotMatch(battleRules, /行动顺序/);
});

test('initialization text declares empty battle and shared actor defaults', () => {
  for (const snippet of ['事件:', '当前战斗:', '进行中: false', "战斗ID: ''", '轮数: 0', "阶段: ''", '参战者: []', '先攻顺序: []', "当前行动者: ''", '行动额度: {}', '距离: {}', '掩体: {}', '持续效果: {}', '濒死计数: {}', '最近一次检定: null']) assert.match(init, new RegExp(snippet.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  for (const field of ['战斗状态', '战力等阶', '可战状态', '体力', '魔力', '精神稳定', '当前目标', '当前行动']) assert.match(init, new RegExp(field));
  assert.doesNotMatch(init, /骰池|完整战斗日志|战斗日志/);
});

test('update protocols document patch operations, battle lifecycle and final block', () => {
  for (const source of [format, rules]) {
    for (const token of ['add', 'replace', 'remove', 'move', 'JSON Pointer', 'UpdateVariable']) assert.match(source, new RegExp(token, 'i'));
    assert.match(source, /骰池/);
    assert.match(source, /完整战斗日志|战斗日志/);
  }
  assert.match(format, /战斗开始|当前战斗/);
  assert.match(format, /最近一次检定/);
  assert.match(rules, /战斗结束|清理/);
  assert.match(rules, /生命|体力|魔力|伤势/);
  assert.match(format.trim(), /<\/UpdateVariable>$/);
});

test('mapping documents eight roots, short/long boundary, and Subaru restart boundary', () => {
  for (const rootName of ['世界', '主角档案', '轮回', '关系', '事件', '线索', '资产', '规则']) assert.match(mapping, new RegExp(rootName));
  for (const phrase of ['短期', '长期', '骰子', '日志', '战斗结束', '清理', '昴', '死亡', '重启']) assert.match(mapping, new RegExp(phrase));
  assert.doesNotMatch(mapping, /持久化[^\n]*(?:骰池|完整战斗日志)/);
});
