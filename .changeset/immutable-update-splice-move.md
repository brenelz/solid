---
"@solidjs/signals": patch
---

`IMMUTABLE_UPDATE_IN_STORE` no longer reports an array index that an in-place `splice`, `unshift`, `push`, `sort` or `reverse` filled with an item the array already held, or whose previous item the array still holds at another index. The write-channel census compared the old and new objects at the index as if the new one were a fresh copy, so removing one of two similar items (`draft.items.splice(0, 1)` on two lines of the same product) warned about `store.items.0` and recommended a repair that does not apply (#4262). Items are matched by their store target rather than by raw identity, so an item whose leaf was written in the same setter still counts as moved. A fresh near-copy assigned to an index (`draft.items[0] = { ...draft.items[0], quantity }`) still reports.
