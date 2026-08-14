import { firstGrapheme } from './status-core.mjs';

const DATABASE_VERSION = 1;
const STORE_NAME = 'portraits';
const MAX_SOURCE_BYTES = 20 * 1024 * 1024;

export function normalizePortraitName(name) {
  const normalized = String(name ?? '')
    .normalize('NFKC')
    .replace(/\s+/gu, ' ')
    .trim();
  return normalized || '未命名';
}

function escapeIdentitySegment(value) {
  return String(value).replaceAll('%', '%25').replaceAll(':', '%3A');
}

export function portraitKeys({ namespace = 'person', name, chatId = '' }) {
  const safeNamespace = namespace === 'protagonist' ? 'protagonist' : 'person';
  const safeName = escapeIdentitySegment(normalizePortraitName(name));
  const shared = `${safeNamespace}:${safeName}`;
  return {
    shared,
    override: String(chatId).trim()
      ? `chat:${encodeURIComponent(String(chatId).trim())}:${shared}`
      : null,
  };
}

export function validatePortraitUrl(input) {
  const value = String(input ?? '').trim();
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'https:') {
      return { ok: false, error: '头像 URL 必须使用 HTTPS' };
    }
    if (!parsed.hostname || parsed.username || parsed.password) {
      return { ok: false, error: '头像 URL 不能包含账号信息' };
    }
    return { ok: true, value: parsed.href };
  } catch {
    return { ok: false, error: '请输入有效的 HTTPS 图片 URL' };
  }
}

function usablePortrait(record) {
  if (!record || typeof record !== 'object') return null;
  if (record.kind === 'url') {
    const validation = validatePortraitUrl(record.value);
    return validation.ok ? { ...record, value: validation.value } : null;
  }
  if (record.kind === 'blob' && typeof Blob !== 'undefined' && record.value instanceof Blob) {
    return record.value.type.startsWith('image/') ? record : null;
  }
  return null;
}

export function resolvePortrait({ name, shared = null, override = null }) {
  const chatPortrait = usablePortrait(override);
  if (chatPortrait) return { ...chatPortrait, source: 'override' };
  const sharedPortrait = usablePortrait(shared);
  if (sharedPortrait) return { ...sharedPortrait, source: 'shared' };
  return {
    kind: 'initial',
    initial: firstGrapheme(normalizePortraitName(name)),
    source: 'fallback',
  };
}

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('IndexedDB 请求失败'));
  });
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error('头像存储事务失败'));
    transaction.onabort = () => reject(transaction.error || new Error('头像存储事务已取消'));
  });
}

function validateStoredPortrait(record) {
  if (!record || typeof record !== 'object') throw new TypeError('头像记录无效');
  if (record.kind === 'url') {
    const validation = validatePortraitUrl(record.value);
    if (!validation.ok) throw new TypeError(validation.error);
    return { ...record, value: validation.value };
  }
  if (record.kind === 'blob' && typeof Blob !== 'undefined' && record.value instanceof Blob) {
    if (!record.value.type.startsWith('image/')) throw new TypeError('本地头像必须是图片');
    return record;
  }
  throw new TypeError('头像记录必须是 HTTPS URL 或图片 Blob');
}

export function createPortraitRepository({
  indexedDB = globalThis.indexedDB,
  databaseName = 're0-statusbar',
} = {}) {
  if (!indexedDB || typeof indexedDB.open !== 'function') {
    throw new Error('当前环境不支持 IndexedDB，无法保存头像');
  }

  const database = new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'key' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('无法打开头像库'));
    request.onblocked = () => reject(new Error('头像库正在被另一页面升级'));
  });

  return Object.freeze({
    async get(key) {
      if (!key) return null;
      const db = await database;
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const result = await requestResult(transaction.objectStore(STORE_NAME).get(key));
      return result || null;
    },

    async put(key, record) {
      if (!key) throw new TypeError('头像键不能为空');
      const validated = validateStoredPortrait(record);
      const db = await database;
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      transaction.objectStore(STORE_NAME).put({
        ...validated,
        key,
        updatedAt: new Date().toISOString(),
      });
      await transactionDone(transaction);
      return this.get(key);
    },

    async remove(key) {
      if (!key) return;
      const db = await database;
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      transaction.objectStore(STORE_NAME).delete(key);
      await transactionDone(transaction);
    },

    async close() {
      const db = await database;
      db.close();
    },
  });
}

function boundedNumber(value, minimum, maximum, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(maximum, Math.max(minimum, number)) : fallback;
}

async function decodeBlob(blob, { createImageBitmap, document, URL: UrlApi }) {
  if (!(blob instanceof Blob) || !blob.type.startsWith('image/')) {
    throw new TypeError('请选择有效的图片文件');
  }
  if (blob.size > MAX_SOURCE_BYTES) throw new RangeError('图片不能超过 20 MB');

  if (typeof createImageBitmap === 'function') {
    return createImageBitmap(blob);
  }
  if (!document?.createElement || !UrlApi?.createObjectURL) {
    throw new Error('当前环境无法解码图片');
  }

  const image = document.createElement('img');
  const objectUrl = UrlApi.createObjectURL(blob);
  try {
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(new Error('无法解码所选图片'));
      image.src = objectUrl;
    });
    return image;
  } finally {
    UrlApi.revokeObjectURL(objectUrl);
  }
}

function canvasToWebp(canvas, quality = 0.88) {
  if (typeof canvas.convertToBlob === 'function') {
    return canvas.convertToBlob({ type: 'image/webp', quality });
  }
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error('浏览器无法生成 WebP 头像')),
      'image/webp',
      quality,
    );
  });
}

export async function cropPortrait({
  source,
  zoom = 1,
  offsetX = 0,
  offsetY = 0,
  size = 512,
  document = globalThis.document,
  createImageBitmap = globalThis.createImageBitmap,
  URL: UrlApi = globalThis.URL,
} = {}) {
  if (!document?.createElement) throw new Error('当前环境不支持头像裁切');
  const outputSize = Math.round(boundedNumber(size, 128, 1024, 512));
  const bitmap = await decodeBlob(source, { createImageBitmap, document, URL: UrlApi });
  const width = Number(bitmap.width || bitmap.naturalWidth);
  const height = Number(bitmap.height || bitmap.naturalHeight);
  if (!(width > 0 && height > 0)) {
    bitmap.close?.();
    throw new Error('图片尺寸无效');
  }

  const canvas = document.createElement('canvas');
  canvas.width = outputSize;
  canvas.height = outputSize;
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) {
    bitmap.close?.();
    throw new Error('当前环境无法创建头像画布');
  }

  const scale = Math.max(outputSize / width, outputSize / height)
    * boundedNumber(zoom, 1, 4, 1);
  const drawnWidth = width * scale;
  const drawnHeight = height * scale;
  const overflowX = Math.max(0, drawnWidth - outputSize);
  const overflowY = Math.max(0, drawnHeight - outputSize);
  const x = -overflowX / 2 + boundedNumber(offsetX, -1, 1, 0) * overflowX / 2;
  const y = -overflowY / 2 + boundedNumber(offsetY, -1, 1, 0) * overflowY / 2;

  context.fillStyle = '#101421';
  context.fillRect(0, 0, outputSize, outputSize);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(bitmap, x, y, drawnWidth, drawnHeight);

  try {
    const blob = await canvasToWebp(canvas);
    if (!(blob instanceof Blob) || blob.size === 0) throw new Error('生成的头像为空');
    return blob;
  } finally {
    bitmap.close?.();
  }
}
