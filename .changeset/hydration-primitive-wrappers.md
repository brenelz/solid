---
"solid-js": patch
---

Add hydration-aware wrappers for createErrorBoundary, createOptimistic, createProjection, createStore(fn), and createOptimisticStore(fn). Server-side createProjection now creates owner for ID alignment and handles async Promise returns. Bump @solidjs/signals to 0.10.4 for peekNextChildId support.
