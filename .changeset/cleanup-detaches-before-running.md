---
"@solidjs/signals": patch
"solid-js": patch
---

An `onCleanup` callback that disposes an ancestor owner now runs once, and the owner's remaining cleanups still run before the ancestor's. `runDisposal` (client) and `disposeOwner` (server facade) cleared the owner's cleanup list only after invoking it, so a cleanup that called the enclosing root's disposer during a memo recomputation, an effect rerun, or a server retry re-entered the same owner while the list was still attached and ran it a second time. Each list is now consumed one entry at a time in unwind order: the re-entrant disposal drains what is left of the owner's list, then the ancestor's, and the outer loop finds nothing more to run. A cleanup registered on an owner while that owner is tearing down runs in the same teardown, and a cleanup that throws leaves the entries registered before it attached, so the next teardown runs them. Fixes #3601.
