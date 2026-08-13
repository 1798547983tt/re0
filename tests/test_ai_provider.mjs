import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAiPrompt, parseAiResponse, requestOpenAiCompatible } from '../frontend/src/ai-provider.mjs';

test('AI prompt asks for a JSON patch and keeps the creator draft authoritative', () => {
  const prompt = buildAiPrompt({ protagonist: { name: '星见澪' } }, 'heart', '更克制一点');

  assert.match(prompt, /JSON/);
  assert.match(prompt, /不得覆盖用户已有内容/);
  assert.match(prompt, /更克制一点/);
});

test('AI response parser extracts fenced JSON and rejects non-object output', () => {
  assert.deepEqual(parseAiResponse('```json\n{"personality":{"wish":"活下去"}}\n```'), {
    personality: { wish: '活下去' },
  });
  assert.throws(() => parseAiResponse('这不是 JSON'), /JSON/);
});

test('OpenAI-compatible request normalizes endpoint, authorization and content', async () => {
  let request;
  const fetchImpl = async (url, options) => {
    request = { url, options };
    return new Response(JSON.stringify({ choices: [{ message: { content: '{"personality":{"wish":"活下去"}}' } }] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };

  const result = await requestOpenAiCompatible({
    apiUrl: 'https://example.test/v1',
    apiKey: 'secret',
    model: 'model-x',
    prompt: 'prompt',
    fetchImpl,
  });

  assert.equal(request.url, 'https://example.test/v1/chat/completions');
  assert.equal(request.options.headers.Authorization, 'Bearer secret');
  assert.equal(JSON.parse(request.options.body).model, 'model-x');
  assert.deepEqual(result, { personality: { wish: '活下去' } });
});
