---
"@solidjs/signals": patch
---

`await refresh(x)` inside an action delivers the re-asked source value again
when `x` is the optimistic accessor the action itself overrode, instead of the
action's own guess. The waiter lost its authoritative read in the L2 core
rebuild (it kept only the fresh-read bit), so a read of the overridden node was
served the lane's guess like any plain reader. It now reads like `until()`'s
predicate: the truth staged beneath the guess, or the committed value.
