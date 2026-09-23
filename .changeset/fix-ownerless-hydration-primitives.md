---
"solid-js": patch
---

Fix `hydrate()` halting with `TypeError: Cannot read properties of null (reading '_config')` when `createMemo`, function-form `createSignal`, `createOptimistic`, function-form `createStore`, `createOptimisticStore` or `createProjection` is called without an owner (`runWithOwner(null, ...)`, or any detached creation) while hydrating (#3609). The hydrating wrappers peeked the next hydration id off the current owner, which has no child counter when it is null or carries no id (a memo under such an owner threw `Cannot get child id from owner without an id`). A node created there has nothing to hydrate positionally, so the wrappers now hand it to the core primitive, as `transparent: true` already did for `createMemo`; it consumes no hydration id and never adopts a serialized value. Function-form `createSignal` now honours `transparent: true` the same way instead of ignoring it.
