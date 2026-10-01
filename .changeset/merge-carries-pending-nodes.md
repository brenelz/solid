---
"@solidjs/signals": patch
---

A transaction merged from under `runInTransition` now carries its staged nodes into the surviving transaction (#3738). `initTransition` re-stamped pending nodes only through the ambient batch, so when an effect stamped by one hold re-ran under another's landing (a `refresh()` waiter adopted into an unrelated async write's transaction, then recomputed as the refreshed memo landed) the merge left the outgoing hold's nodes stamped with a dead transaction: the effect re-entered its pass forever (`RangeError: Maximum call stack size exceeded` through `recompute` and `runInTransition` in the dev build) and the write's signal stayed staged with no commit, so the graph stopped updating.
