---
"@solidjs/signals": patch
---

A `Loading` a verdict lane mounts shows its fallback beside the committed value (#3851). Inside an action, `<Show when={latest(x) > 0}>` opens at once, but the boundary it mounted showed `content 1` beside the committed `x = 0`: its first pass took its creator's lane (ruling A, right for an optimistic lane) and read the proposal. A first pass under a verdict lane now stays mainline, and one that read the frame's staging is born held (A29), so the boundary shows its fallback until the hold commits and the content with it. Verdict-lane work that is not itself a verdict reader (the effect binding the `Show`'s children) is repaired at the park like any lane work: it re-derives on the committed world instead of showing the staging it read. That repair runs only when the frame parks; a transaction landing at the same seam re-ran its lane readers and held their runs a round for nothing.
