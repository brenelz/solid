---
"@solidjs/signals": patch
"solid-js": patch
---

Nested nodes of a derived store type-check as `refresh()` targets. The projection form of `createStore`, `createProjection` and `createOptimisticStore` now return `RefreshableStore<T>`, which carries the `Refreshable` brand on every wrapped record and array instead of the root alone, so `refresh(store.row)` compiles as the runtime and the docs already allow (previously TS2345). The brand is a class accessor, which object spread and rest leave behind, so `{ ...row }` stays a plain record.
