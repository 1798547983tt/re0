import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const artifactPath = resolve(ROOT, 'dist/script-Re0·星屑碎片状态栏.json');

test('artifact is an importable Tavern Helper script, not a regex package', () => {
  const artifact = JSON.parse(readFileSync(artifactPath, 'utf8'));
  assert.equal(artifact.type, 'script');
  assert.equal(artifact.enabled, true);
  assert.match(artifact.name, /^Re:0·星屑碎片状态栏$/);
  assert.match(artifact.id, /^[a-f0-9-]{36}$/);
  assert.equal(typeof artifact.content, 'string');
  assert.equal('findRegex' in artifact, false);
  assert.equal('replaceString' in artifact, false);
  assert.match(artifact.content, /re0-shard-statusbar-root/);
  assert.match(artifact.content, /raw\.githubusercontent\.com\/1798547983tt\/re0\/[a-f0-9]{40}/);
  assert.doesNotMatch(artifact.content, /replaceVariables|updateVariablesWith|insertOrAssignVariables|replaceMvuData/);
  assert.doesNotMatch(artifact.content, /^\s*(?:import|export)\s/m);
});
