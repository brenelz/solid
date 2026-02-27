---
"solid-js": patch
---

Make `children` helper lazy to prevent hydration mismatches when resolved children are never inserted into the DOM. Export `storePath` and related types (`StorePathRange`, `ArrayFilterFn`, `CustomPartial`, `Part`, `PathSetter`) from both client and server builds. Bump `@solidjs/signals` to 0.11.1.
