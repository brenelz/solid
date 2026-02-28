---
"solid-js": patch
---

Rename `pending` API to `latest`. `isPending(() => latest(value))` reads more naturally than the redundant `isPending(() => pending(value))`. Also renames internal `pendingReadActive`, `_pendingValueComputed`, and `getPendingValueComputed` in @solidjs/signals to align with the new name.
