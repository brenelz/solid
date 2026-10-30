---
"@solidjs/signals": patch
---

`createOwner()`'s `dispose` is a free callable, as `createRoot`'s already was: passed detached (`queueMicrotask(owner.dispose)`, `onCleanup(owner.dispose)`) it disposes the owner instead of throwing `Cannot read properties of undefined (reading '_flags')` (#4444).
