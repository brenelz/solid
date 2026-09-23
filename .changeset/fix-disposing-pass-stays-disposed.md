---
"@solidjs/signals": patch
"solid-js": patch
---

A memo or effect that disposes its own owner during its run now stays disposed (#3621). The end of the pass rewrote `_flags` wholesale, clearing the `REACTIVE_DISPOSED` mark the disposal walk had just set, and the reads after the `dispose()` call had re-linked the node to its sources, so `isDisposed()` answered false, a later `refresh()` reran it, and every later write to those sources ran it again inside the torn-down tree. The pass now keeps the mark and drops the links it made after the disposal.
