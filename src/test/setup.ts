import '@testing-library/jest-dom/vitest'

// Node 22+ ships an experimental global `localStorage` that shadows jsdom's
// per-window implementation; without --localstorage-file it resolves to
// `undefined`, so any component reading `localStorage.getItem(...)` throws
// under jsdom in tests. Provide a tiny in-memory shim so localStorage behaves
// as it does in a real browser.
if (typeof localStorage === 'undefined') {
  const store = new Map<string, string>()
  const memoryStorage: Storage = {
    get length() { return store.size },
    clear: () => store.clear(),
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    removeItem: (key: string) => { store.delete(key) },
    setItem: (key: string, value: string) => { store.set(key, String(value)) },
  }
  Object.defineProperty(globalThis, 'localStorage', {
    value: memoryStorage,
    configurable: true,
    writable: true,
  })
}
