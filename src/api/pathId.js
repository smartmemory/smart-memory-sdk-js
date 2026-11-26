/**
 * Guard for a caller-supplied decision id placed in a request path
 * (DECISION-RESTORE-ONE-ACTION-1 review fix M3). The same rule as the Python client's
 * `smartmemory_client/path_guard.py` and the MCP server's `path_id`.
 *
 * The service unquotes the raw path before routing, so percent-encoding alone does not keep
 * an id inside its own route, and an id equal to a static sibling route needs no special
 * character at all. `pathId` throws, before any request is sent, for every id that could
 * leave its route: `/` or `\`, empty, `.`, `..`, control characters, and an id equal to a
 * static path segment at that position. Everything else is percent-encoded as one segment
 * (`?`, `#`, `%`, spaces), so a normal id is unchanged.
 */

/** Static path segments the service has directly under each decision prefix an id follows. */
export const RESERVED_SEGMENTS = Object.freeze({
  '/memory/decisions/': new Set(['create', 'pending', 'search', 'auto-changes', 'effects']),
  '/memory/decisions/{id}/depends-on/': new Set(),
  '/memory/decisions/pending/': new Set(['create']),
});

// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/;

/**
 * @param {*} value - the id
 * @param {string} under - the literal path text before the id
 * @returns {string} the id as one encoded path segment
 * @throws {Error} when the id could reach another route
 */
export function pathId(value, under) {
  const reserved = RESERVED_SEGMENTS[under];
  if (!reserved) throw new Error(`No reserved-segment list for prefix ${under}`);
  const text = value === null || value === undefined ? '' : String(value);
  if (text === '' || text === '.' || text === '..') {
    throw new Error(`Invalid id ${JSON.stringify(text)}: it must name one item, not a path`);
  }
  if (text.includes('/') || text.includes('\\')) {
    throw new Error(`Invalid id ${JSON.stringify(text)}: an id cannot contain '/' or '\\'`);
  }
  if (CONTROL.test(text)) {
    throw new Error(`Invalid id ${JSON.stringify(text)}: an id cannot contain control characters`);
  }
  if (reserved.has(text)) {
    throw new Error(`Invalid id ${JSON.stringify(text)}: it is the name of another route under ${under}`);
  }
  return encodeURIComponent(text);
}
