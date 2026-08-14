import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAiPrompt,
  fetchAllModels,
  modelIds,
  nextModelsEndpoint,
  parseAiResponse,
  requestOpenAiCompatible,
  requestTavernHelper,
  resolveChatCompletionsEndpoint,
  resolveModelsEndpoint,
} from '../frontend/src/ai-provider.mjs';

test('AI prompt asks for a JSON patch and keeps the creator draft authoritative', () => {
  const prompt = buildAiPrompt({ protagonist: { name: '星见澪' } }, 'heart', '更克制一点');

  assert.match(prompt, /JSON/);
  assert.match(prompt, /不得覆盖用户已有内容/);
  assert.match(prompt, /更克制一点/);
  assert.match(prompt, /1阶到7阶/);
  assert.match(prompt, /上位或下位/);
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

test('API endpoint resolver accepts a root, v1 base, chat endpoint, or models endpoint', () => {
  assert.equal(resolveChatCompletionsEndpoint('https://example.test'), 'https://example.test/v1/chat/completions');
  assert.equal(resolveChatCompletionsEndpoint('https://example.test/v1'), 'https://example.test/v1/chat/completions');
  assert.equal(resolveChatCompletionsEndpoint('https://example.test/v1/chat/completions'), 'https://example.test/v1/chat/completions');
  assert.equal(resolveModelsEndpoint('https://example.test'), 'https://example.test/v1/models');
  assert.equal(resolveModelsEndpoint('https://example.test/v1'), 'https://example.test/v1/models');
  assert.equal(resolveModelsEndpoint('https://example.test/v1/chat/completions'), 'https://example.test/v1/models');
  assert.equal(resolveModelsEndpoint('https://example.test/v1/models'), 'https://example.test/v1/models');
});

test('model catalog accepts common payload shapes and follows every pagination page', async () => {
  assert.deepEqual(modelIds({ data: [{ id: 'model-b' }, { name: 'model-a' }] }), ['model-a', 'model-b']);
  assert.deepEqual(modelIds({ models: ['model-c', { model: 'model-b' }] }), ['model-b', 'model-c']);
  assert.equal(
    nextModelsEndpoint({ has_more: true, next_cursor: 'cursor 2' }, 'https://example.test/v1/models'),
    'https://example.test/v1/models?after=cursor+2',
  );

  const requests = [];
  const pages = [
    { data: [{ id: 'model-z' }, { id: 'model-a' }], next_url: '/v1/models?page=2' },
    { models: [{ name: 'model-b' }, 'model-a'], has_more: true, next_cursor: 'last-b' },
    { result: [{ key: 'model-c' }] },
  ];
  const fetchImpl = async (url, options) => {
    requests.push({ url, options });
    return new Response(JSON.stringify(pages[requests.length - 1]), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };

  const result = await fetchAllModels({
    apiUrl: 'https://example.test',
    apiKey: 'secret',
    fetchImpl,
  });

  assert.deepEqual(result.models, ['model-a', 'model-b', 'model-c', 'model-z']);
  assert.equal(result.pages, 3);
  assert.equal(requests[0].url, 'https://example.test/v1/models');
  assert.equal(requests[1].url, 'https://example.test/v1/models?page=2');
  assert.equal(requests[2].url, 'https://example.test/v1/models?after=last-b');
  assert.ok(requests.every(({ options }) => options.headers.Authorization === 'Bearer secret'));
});

test('OpenAI-compatible request sends without a key for local providers and reports timeouts', async () => {
  let sentHeaders;
  const result = await requestOpenAiCompatible({
    apiUrl: 'http://127.0.0.1:1234/v1',
    apiKey: '',
    model: 'local-model',
    prompt: 'prompt',
    fetchImpl: async (_url, options) => {
      sentHeaders = options.headers;
      return new Response('{"choices":[{"message":{"content":"{\\"world\\":{\\"currentLocation\\":\\"王都\\"}}"}}]}', { status: 200 });
    },
  });
  assert.equal('Authorization' in sentHeaders, false);
  assert.deepEqual(result, { world: { currentLocation: '王都' } });

  const neverReturns = (_url, options) => new Promise((_resolve, reject) => {
    options.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })), { once: true });
  });
  await assert.rejects(
    requestOpenAiCompatible({
      apiUrl: 'https://example.test/v1',
      model: 'slow-model',
      prompt: 'prompt',
      fetchImpl: neverReturns,
      timeoutMs: 5,
    }),
    /超时/,
  );
});

test('Tavern Helper generation uses the current connected model and parses its reply', async () => {
  let options;
  const root = {
    TavernHelper: {
      async generateRaw(value) {
        options = value;
        return '{"personality":{"wish":"守住重要的人"}}';
      },
    },
  };

  const result = await requestTavernHelper({ root, prompt: 'creator prompt' });

  assert.equal(options.should_silence, true);
  assert.equal(options.max_chat_history, 0);
  assert.deepEqual(options.ordered_prompts, [{ role: 'user', content: 'creator prompt' }]);
  assert.deepEqual(result, { personality: { wish: '守住重要的人' } });
});
