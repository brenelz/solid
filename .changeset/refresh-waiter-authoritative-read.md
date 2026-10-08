---
"@solidjs/signals": patch
---

`await refresh(x)` inside an action now resolves with the re-asked source value
when `x` is the optimistic accessor the action itself overrode. It used to
resolve with the action's own optimistic value. The waiter now reads past the
override, and when the re-ask is still in flight it waits for that re-ask to
land instead of returning the value committed before it.
