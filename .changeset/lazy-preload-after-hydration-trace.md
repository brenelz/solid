---
"solid-js": patch
---

`lazy()` and `lazyModule()` no longer cache the promise a loader returns while a hydration trace has swapped the global `Promise` for its never-settling stub, so a `preload()` or call after hydration runs the loader again and settles (#4013). A bare `import()` was unaffected; a loader built on the global `Promise`, such as Vite's `__vitePreload`, was cached as the stub for the life of the page.
