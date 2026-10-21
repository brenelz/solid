---
"@solidjs/signals": patch
---

A `<Loading>` that a verdict reader (`<Show when={latest(x) ?? x()}>`) mounts no longer stays on its fallback for a pending memo nothing reads: a memo its content creates that reads a signal written during the mount and never settles held the boundary since #4171, although no render effect reaches it (#4203).
