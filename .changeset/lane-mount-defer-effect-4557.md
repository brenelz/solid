---
"@solidjs/signals": patch
---

`defer: true` skips an effect's first run when an optimistic update mounts it, as it does under a plain or held mount (#4557). An effect born in a lane now stages its first run for the lane's reveal, so dropping the staging skips it. A write to a memo the lane mounted no longer runs its effects twice: the seam wakes the readers of a node whose pass left the lane only when that pass notified nobody.
