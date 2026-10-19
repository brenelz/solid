---
"@solidjs/signals": patch
---

A lazy memo (`createMemo(fn, { lazy: true })`) whose last subscriber leaves is released by the flush's dormancy sweep — at the end of the flush that dropped it, or at the next flush when the drop happened outside one — the same deferral an untracked read already gets, instead of being torn down on the spot. A pass that re-runs disposes the previous pass's children before it reads again, so a lazy memo read only through a child — the inline condition memo the compiler emits for `lazy().a ? lazy().b : x` — lost its subscriber mid-pass, was torn down, and recomputed from scratch on the very next read; with an async compute that re-pass came at every landing, so the memo re-executed forever and the branch never rendered (#4142). The sweep re-checks the subscriber count, so a memo nothing reads again is still released by the end of the flush.
