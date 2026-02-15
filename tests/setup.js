// Ensure localStorage and sessionStorage have .clear() in jsdom
// Some jsdom versions provide a storage object without .clear()
for (const storage of [globalThis.localStorage, globalThis.sessionStorage]) {
  if (storage && typeof storage.clear !== 'function') {
    storage.clear = function () {
      for (const key of Object.keys(this)) {
        if (typeof this[key] !== 'function') {
          this.removeItem(key);
        }
      }
    };
  }
}
