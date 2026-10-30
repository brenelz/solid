---
"@solidjs/signals": patch
---

A derived `createOptimisticStore(fn)` over a memo now follows the memo as `createStore(fn)` does: when the memo goes pending again, `isPending` on the store's keys reports it, and when the memo later rejects or throws, the error reaches the readers' error handler instead of the store silently keeping its last value. (#4437)
