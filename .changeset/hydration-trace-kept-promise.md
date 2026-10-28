---
"solid-js": patch
---

A promise that user code creates while hydration traces an adopted async compute, and keeps, now settles when it is consumed after the trace (#4332). The trace still swaps the global `Promise` and `fetch` for stubs so the traced run stays inert: a `.then()` attached under the trace, including an `await`'s continuation, never runs on its own. A stub consumed later, such as a module-level cache of an `import()` built through Vite's `__vitePreload`, or a cached `fetch()`, now does its real work at that point instead of staying pending forever.
