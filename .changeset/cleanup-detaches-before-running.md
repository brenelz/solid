---
"@solidjs/signals": patch
"solid-js": patch
---

An `onCleanup` callback that disposes an ancestor owner now runs once. `runDisposal` (client) and `disposeOwner` (server facade) cleared the owner's cleanup list only after invoking it, so a cleanup that called the enclosing root's disposer during a memo recomputation, an effect rerun, or a server retry re-entered the same owner while the list was still attached and ran it a second time. The list is detached before any callback runs. Fixes #3601.
