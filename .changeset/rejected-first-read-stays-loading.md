---
"@solidjs/signals": patch
---

An async memo whose first computation rejected stays uninitialized until a value lands, so re-asking it (a retry after the error) reads as loading again: `isPending(() => m())` beside `m()` throws `NotReadyError` instead of answering `[true, undefined]`, `latest(() => m())` throws the same, and a `createDeferred` whose first flight rejected suspends on its retry instead of serving `undefined` as its last value (#4244).
