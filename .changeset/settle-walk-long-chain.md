---
"@solidjs/signals": patch
---

A long chain of memos over an async source no longer overflows the call stack when the source goes pending, lands or rejects: the settle walk, the staged-error marks it cascades and the status propagation each walk the dependent graph with an explicit stack instead of recursing once per node. A chain of 8,000 memos read under `<Errored>` with `isPending` now shows the source's own error.
