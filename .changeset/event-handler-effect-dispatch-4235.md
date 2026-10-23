---
"@solidjs/web": patch
"solid-js": patch
"@solidjs/signals": patch
---

An event handler that a native call dispatches synchronously from an effect callback (`el.focus()`, `dialog.showModal()`, `dialog.close()`) runs in a scope of its own (#4235). The delegated dispatch and the listeners `addEvent` attaches ran the handler inside whatever dev scope was on the stack, so a handler that read a prop logged `[STRICT_READ_UNTRACKED]` as if the read were in the effect body, and one that created a root or memo threw `[PRIMITIVE_IN_EFFECT_CALLBACK]`. Both now end at the dispatch, as they do for a user's own event; the `untrack(() => el.focus())` workaround is no longer needed. Production builds are unchanged. A literal handler on a non-delegated event (`onFocus={() => ...}`) is attached by the compiler with a bare `addEventListener` and is not covered.

`@solidjs/signals` exposes the seam as the internal `runEventHandler`, re-exported through `solid-js/internal`.
