---
"@solidjs/signals": patch
---

A lazy memo (`createMemo(fn, { lazy: true })`) whose last subscriber leaves during a flush is released by that flush's end-of-flush dormancy sweep instead of on the spot, and only if nothing has read it again by then; its `unobserved` callback fires at that release, not at the drop. A pass that re-runs disposes the previous pass's children before it reads again, so a lazy memo read only through a child — the inline condition memo the compiler emits for `lazy().a ? lazy().b : x` — lost its subscriber mid-pass, was torn down, and recomputed from scratch on the very next read; with an async compute that re-pass came at every landing, so the memo re-executed forever and the branch never rendered (#4142). A drop outside a flush, such as disposing a root directly, still releases the memo synchronously.
