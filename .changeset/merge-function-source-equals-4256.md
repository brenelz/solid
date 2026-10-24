---
"@solidjs/signals": patch
---

The memo `merge()` creates for a function source (what a component spread such as `<Child {...(on() ? { tone: "info" } : {})} />` compiles to) now treats two plain objects with the same own keys and the same data values as equal, so a source that returns a fresh but identical object no longer re-runs every reader of the merged props and no longer trips `UNSTABLE_MEMO_OUTPUT` on a memo the user cannot configure (#4256). Objects with accessor properties, class instances, stores and other proxies still compare by identity.
