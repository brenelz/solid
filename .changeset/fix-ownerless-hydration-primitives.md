---
"solid-js": patch
---

`hydrate()` no longer throws `TypeError: Cannot read properties of null (reading '_config')` when `createMemo`, function-form `createSignal`, `createOptimistic`, `createErrorBoundary`, function-form `createStore`, `createOptimisticStore` or `createProjection` is called without an owner (`runWithOwner(null, ...)`) or under an owner that carries no id while hydrating (#3609). The hydrating wrappers peeked the next hydration id off the current owner, which has no child counter in either case. Such a node has no position in the serialized tree, so the wrappers now hand it to the core primitive: it consumes no hydration id and never adopts a serialized value, as `transparent: true` already did for `createMemo`. Function-form `createSignal` now honours `transparent: true` the same way.
