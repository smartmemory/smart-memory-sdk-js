import posthog from 'posthog-js';
import {
  PRODUCT_EVENT_ENUM_VALUES,
  PRODUCT_EVENT_PROPERTIES,
} from './productEvents.generated.js';

const FORBIDDEN_KEYS = new Set([
  'body',
  'content',
  'context',
  'error',
  'message',
  'query',
  'response',
  'result',
  'tag_values',
  'tags',
  'url',
]);

const SAFE_ERROR_NAMES = new Set([
  'AggregateError',
  'Error',
  'EvalError',
  'RangeError',
  'ReferenceError',
  'SyntaxError',
  'TypeError',
  'URIError',
]);

const STRING_CONTEXT_KEYS = ['source', 'component', 'operation', 'method'];

function activeClient() {
  if (!posthog || posthog.__loaded !== true) {
    return null;
  }
  return posthog;
}

function isForbiddenPropertyKey(key) {
  if (FORBIDDEN_KEYS.has(key)) {
    return true;
  }
  return /(^|_)(id|ids|name|names|tag|tags)$/.test(key);
}

function isAllowedEnumValue(eventName, key, value) {
  const values = PRODUCT_EVENT_ENUM_VALUES[eventName]?.[key];
  return !values || values.includes(value);
}

function sanitizedErrorName(error) {
  try {
    return SAFE_ERROR_NAMES.has(error?.name) ? error.name : 'Error';
  } catch {
    return 'Error';
  }
}

function createSanitizedError(error) {
  const sanitized = new Error();
  delete sanitized.message;
  delete sanitized.stack;
  Object.defineProperty(sanitized, 'name', {
    configurable: true,
    enumerable: true,
    value: sanitizedErrorName(error),
  });
  return sanitized;
}

function sanitizeExceptionContext(context) {
  const sanitized = {};
  if (!context || typeof context !== 'object') {
    return sanitized;
  }

  for (const key of STRING_CONTEXT_KEYS) {
    if (typeof context[key] === 'string') {
      sanitized[key] = context[key];
    }
  }
  if (typeof context.status === 'number' && Number.isFinite(context.status)) {
    sanitized.status = context.status;
  }
  return sanitized;
}

export function captureProductEvent(eventName, properties = {}) {
  const allowedKeys = PRODUCT_EVENT_PROPERTIES[eventName];
  const client = activeClient();
  if (!allowedKeys || !client || typeof client.capture !== 'function') {
    return false;
  }

  try {
    const sanitized = {};
    for (const key of allowedKeys) {
      if (isForbiddenPropertyKey(key)) {
        continue;
      }
      const value = properties?.[key];
      if (value === undefined || !isAllowedEnumValue(eventName, key, value)) {
        continue;
      }
      sanitized[key] = value;
    }
    client.capture(eventName, sanitized);
    return true;
  } catch {
    return false;
  }
}

export function captureException(error, context = {}) {
  const client = activeClient();
  if (!client || typeof client.captureException !== 'function') {
    return false;
  }

  try {
    client.captureException(
      createSanitizedError(error),
      sanitizeExceptionContext(context),
    );
    return true;
  } catch {
    return false;
  }
}

export function resetAnalytics() {
  const client = activeClient();
  if (!client || typeof client.reset !== 'function') {
    return false;
  }

  try {
    client.reset();
    return true;
  } catch {
    return false;
  }
}
