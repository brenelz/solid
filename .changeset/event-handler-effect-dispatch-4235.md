---
"@solidjs/web": patch
"solid-js": patch
"@solidjs/signals": patch
---

An event handler that a native call dispatches synchronously from an effect callback (`el.focus()`, `dialog.showModal()`, `dialog.close()`) no longer inherits the dev strict-read window or the effect-callback flag of that callback (#4235). The delegated dispatch and the function listeners `addEvent` attaches ran the handler inside both, so a handler that read a prop logged `[STRICT_READ_UNTRACKED]` as if the read were in the effect body, and one that created a root or memo threw `[PRIMITIVE_IN_EFFECT_CALLBACK]`. Both are now cleared for the handler and restored after it, as they are for a user's own event, so the `untrack(() => el.focus())` workaround is no longer needed. Only those two dev flags are reset: the owner and tracking context stay whatever they were at the dispatch. Production builds are unchanged. Two attachments are not covered: a literal handler on a non-delegated event (`onFocus={() => ...}`), which the compiler attaches with a bare `addEventListener`, and a listener object (`{ handleEvent }`) passed to `addEvent` for a non-delegated event.

`@solidjs/signals` exposes the seam as the internal `runEventHandler`, re-exported through `solid-js/internal`.
