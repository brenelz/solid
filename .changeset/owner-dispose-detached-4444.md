---
"@solidjs/signals": patch
---

`createOwner()`'s `dispose` no longer depends on being called as a method: passed detached (`queueMicrotask(owner.dispose)`, `onCleanup(owner.dispose)`, `promise.then(owner.dispose)`) it disposes the owner instead of throwing `Cannot read properties of undefined (reading '_flags')`. Only an explicit `dispose(false)` keeps the owner itself alive, so a callback host that passes `null` or `0` still disposes it (#4444).
