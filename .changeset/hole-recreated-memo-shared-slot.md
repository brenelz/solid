---
"solid-js": patch
---

A server async memo re-created at a still pending serialization slot (a function hole retried after `lazy()` loaded re-runs the component that created it) now settles when the slot's shared deferred settles. Before, it kept throwing a `NotReadyError` on that already resolved promise, so a memo reading it retried every microtask, no timer fired, and `renderToStream` never ended (#3815).
