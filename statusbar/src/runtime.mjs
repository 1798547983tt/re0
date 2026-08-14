function safeCall(fn) {
  if (!fn) return null;
  try {
    return fn();
  } catch {
    return null;
  }
}

function asErrorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function scopeHasRuntime(scope) {
  if (!scope || (typeof scope !== 'object' && typeof scope !== 'function')) return false;
  try {
    return typeof scope.getVariables === 'function'
      || typeof scope.TavernHelper?.getVariables === 'function'
      || typeof scope.Mvu?.getMvuData === 'function';
  } catch {
    return false;
  }
}

export function discoverRuntimeScope(start = globalThis) {
  const candidates = [start];
  try {
    if (start.parent && start.parent !== start) candidates.push(start.parent);
  } catch {}
  try {
    if (start.top && !candidates.includes(start.top)) candidates.push(start.top);
  } catch {}
  return candidates.find(scopeHasRuntime) || start;
}

export function createRuntimeBridge(scope = globalThis) {
  const callable = (name) => {
    try {
      if (typeof scope?.[name] === 'function') return scope[name].bind(scope);
      if (typeof scope?.TavernHelper?.[name] === 'function') {
        return scope.TavernHelper[name].bind(scope.TavernHelper);
      }
    } catch {}
    return null;
  };

  const messageId = () => {
    const value = safeCall(callable('getCurrentMessageId'));
    return Number.isInteger(value) ? value : null;
  };

  const messageOptions = () => ({
    type: 'message',
    message_id: messageId() ?? 'latest',
  });

  return Object.freeze({
    probe() {
      return {
        tavern: safeCall(callable('getTavernVersion')),
        helper: safeCall(callable('getTavernHelperVersion')),
        messageId: messageId(),
        hasGetVariables: Boolean(callable('getVariables')),
        hasMvu: typeof scope?.Mvu?.getMvuData === 'function',
      };
    },

    async ready(timeoutMs = 2500) {
      if (scopeHasRuntime(scope)) return this.probe();
      const wait = callable('waitGlobalInitialized');
      if (!wait) return this.probe();
      let timer;
      try {
        await Promise.race([
          Promise.resolve(wait('Mvu')),
          new Promise((resolve) => {
            timer = setTimeout(resolve, Math.max(0, timeoutMs));
          }),
        ]);
      } catch {}
      clearTimeout(timer);
      return this.probe();
    },

    async read(lastGood = null) {
      const errors = [];
      const options = messageOptions();
      const getVariables = callable('getVariables');

      if (getVariables) {
        try {
          const data = await Promise.resolve(getVariables(options));
          if (data?.stat_data && typeof data.stat_data === 'object') {
            return { status: 'ready', statData: data.stat_data, source: 'getVariables' };
          }
          errors.push('Tavern Helper 返回的数据不含 stat_data');
        } catch (error) {
          errors.push(asErrorMessage(error));
        }
      }

      try {
        const getMvuData = typeof scope?.Mvu?.getMvuData === 'function'
          ? scope.Mvu.getMvuData.bind(scope.Mvu)
          : null;
        if (getMvuData) {
          const data = await Promise.resolve(getMvuData(options));
          if (data?.stat_data && typeof data.stat_data === 'object') {
            return { status: 'ready', statData: data.stat_data, source: 'Mvu.getMvuData' };
          }
          errors.push('MVU 返回的数据不含 stat_data');
        }
      } catch (error) {
        errors.push(asErrorMessage(error));
      }

      if (lastGood && typeof lastGood === 'object') {
        return {
          status: 'stale',
          statData: lastGood,
          message: errors.join('；') || '变量接口暂不可用，正在显示上次读取的状态',
        };
      }

      return {
        status: 'unavailable',
        statData: {},
        message: errors.join('；') || '未检测到可用的 Tavern Helper 或 MVU 消息变量接口',
      };
    },

    subscribe(refresh) {
      const on = callable('eventOn');
      let events;
      try {
        events = scope?.Mvu?.events;
      } catch {
        events = null;
      }
      if (!on || !events || typeof refresh !== 'function') return () => {};

      const handles = [...new Set([
        events.VARIABLE_INITIALIZED,
        events.VARIABLE_UPDATE_ENDED,
      ].filter(Boolean))].flatMap((event) => {
        try {
          return [on(event, refresh)];
        } catch {
          return [];
        }
      });

      return () => {
        for (const handle of handles) {
          try {
            handle?.stop?.();
          } catch {}
        }
      };
    },
  });
}
