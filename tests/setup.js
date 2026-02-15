// jsdom 25+ provides localStorage as a Proxy without .clear()
// Replace with a simple in-memory implementation that supports all Storage methods
function createStorage() {
  const store = new Map();
  return {
    getItem: (key) => store.has(key) ? store.get(key) : null,
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
    clear: () => store.clear(),
    get length() { return store.size; },
    key: (index) => [...store.keys()][index] ?? null,
  };
}

Object.defineProperty(globalThis, 'localStorage', { value: createStorage(), writable: true });
Object.defineProperty(globalThis, 'sessionStorage', { value: createStorage(), writable: true });
