---
"@solidjs/signals": patch
---

The memo `merge()` creates for a function source (what a component spread such as `<Child {...(on() ? { tone: "info" } : {})} />` compiles to) now treats two plain objects of the same prototype whose own data properties have the same keys, values and enumerability as equal, so a source that returns a fresh but identical object no longer re-runs every reader of the merged props and no longer trips `UNSTABLE_MEMO_OUTPUT` on a memo the user cannot configure (#4256). Objects with accessor properties, class instances, stores and other proxies still compare by identity.
