---
"@solidjs/signals": patch
---

A derived store that returns one of its own draft rows no longer recurses on
read (#3767). The derive's draft wraps each row in a forwarding proxy; the
reconcile adopted that wrapper as the row's backing, so the wrapper and the
row's store proxy answered each other's `ownKeys` until the stack overflowed.
A wrapper is now swapped for the proxy it forwards to before anything is
stored: in the value a derive returns, at any depth of a fresh container, and
in a value written through the draft. A retained row keeps its proxy, so a
subscriber of that slot does not re-run when an unrelated source refreshes;
markRaw'd and frozen rows keep their identity; a derive returning a nested
draft object chains the root to that object's proxy; `deep()` of a draft
object inside the derive returns the plain view.
