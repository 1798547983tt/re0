function asRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function asErrorMessage(error) {
  return error instanceof Error ? error.message : String(error || '未知运行时错误');
}

function api(scope, name) {
  if (typeof scope?.[name] === 'function') return scope[name].bind(scope);
  if (typeof scope?.TavernHelper?.[name] === 'function') return scope.TavernHelper[name].bind(scope.TavernHelper);
  return null;
}

function unwrapStatData(value) {
  const root = asRecord(value);
  if (root.stat_data && typeof root.stat_data === 'object') return root.stat_data;
  if (root.data && asRecord(root.data).stat_data && typeof root.data.stat_data === 'object') {
    return root.data.stat_data;
  }
  return null;
}

function eventNames(scope) {
  const names = new Set();
  const mvuEvents = asRecord(scope?.Mvu?.events);
  for (const key of ['VARIABLE_INITIALIZED', 'VARIABLE_UPDATE_ENDED']) {
    if (typeof mvuEvents[key] === 'string') names.add(mvuEvents[key]);
  }
  const tavernEvents = asRecord(scope?.tavern_events);
  for (const key of [
    'CHAT_CHANGED',
    'MESSAGE_UPDATED',
    'MESSAGE_RECEIVED',
    'MESSAGE_SWIPED',
    'CHARACTER_MESSAGE_RENDERED',
    'USER_MESSAGE_RENDERED',
  ]) {
    if (typeof tavernEvents[key] === 'string') names.add(tavernEvents[key]);
  }
  return [...names];
}

function makeDisposer(handle) {
  if (typeof handle === 'function') return handle;
  if (typeof handle?.stop === 'function') return () => handle.stop();
  if (typeof handle?.dispose === 'function') return () => handle.dispose();
  return () => {};
}

export function createShardRuntime(scope = globalThis) {
  const readVariables = api(scope, 'getVariables');
  const readMvu = typeof scope?.Mvu?.getMvuData === 'function'
    ? scope.Mvu.getMvuData.bind(scope.Mvu)
    : null;
  const listen = api(scope, 'eventOn');
  let lastGood = null;

  async function read(previous = lastGood) {
    const errors = [];
    if (readVariables) {
      try {
        const result = unwrapStatData(await readVariables({ type: 'message', message_id: 'latest' }));
        if (result) {
          lastGood = result;
          return { status: 'ready', source: 'getVariables', statData: result, message: '' };
        }
        errors.push('getVariables 未返回 stat_data');
      } catch (error) {
        errors.push(`getVariables: ${asErrorMessage(error)}`);
      }
    }
    if (readMvu) {
      try {
        const result = unwrapStatData(await readMvu({ type: 'message', message_id: 'latest' }));
        if (result) {
          lastGood = result;
          return { status: 'ready', source: 'Mvu.getMvuData', statData: result, message: '' };
        }
        errors.push('Mvu.getMvuData 未返回 stat_data');
      } catch (error) {
        errors.push(`Mvu.getMvuData: ${asErrorMessage(error)}`);
      }
    }
    if (previous && typeof previous === 'object') {
      lastGood = previous;
      return {
        status: 'stale',
        source: 'last-good',
        statData: previous,
        message: errors.join('；') || '暂时无法读取最新状态，保留上次成功数据。',
      };
    }
    return {
      status: 'unavailable',
      source: '',
      statData: {},
      message: errors.join('；') || '未检测到 Tavern Helper/MVU 只读接口。',
    };
  }

  function subscribe(listener) {
    if (typeof listener !== 'function' || !listen) return () => {};
    const disposers = [];
    for (const event of eventNames(scope)) {
      try {
        disposers.push(makeDisposer(listen(event, listener)));
      } catch {
        // An optional event can be unavailable in older Tavern Helper builds.
      }
    }
    return () => disposers.splice(0).forEach((dispose) => {
      try { dispose(); } catch {}
    });
  }

  function probe() {
    return Object.freeze({
      tavern: typeof scope?.getTavernVersion === 'function' ? scope.getTavernVersion() : '',
      helper: typeof scope?.getTavernHelperVersion === 'function' ? scope.getTavernHelperVersion() : '',
      hasGetVariables: Boolean(readVariables),
      hasMvu: Boolean(readMvu),
      eventCount: eventNames(scope).length,
    });
  }

  return Object.freeze({
    read,
    subscribe,
    probe,
    ready: async () => {},
    getLastGood: () => lastGood,
  });
}

export function discoverShardRuntimeScope(start = globalThis) {
  const candidates = [start];
  try {
    if (start?.parent && start.parent !== start) candidates.push(start.parent);
  } catch {}
  return candidates.find((candidate) => (
    typeof candidate?.getVariables === 'function'
    || typeof candidate?.TavernHelper?.getVariables === 'function'
    || typeof candidate?.Mvu?.getMvuData === 'function'
  )) || start;
}
