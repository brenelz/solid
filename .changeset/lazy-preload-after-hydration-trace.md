---
"solid-js": patch
---

`lazy()` and `lazyModule()` no longer cache a loader's result while a hydration trace is active, so a `preload()` or call after hydration runs the loader again and settles (#4013). The trace swaps the global `Promise` for a never-settling stub, and a loader built on it, such as Vite's `__vitePreload`, was cached as the stub for the life of the page. A loader that returns a native promise, such as a bare `import()`, was never stuck, but its first call after the trace now runs the loader again too.
