---
"@solidjs/signals": patch
---

An effect created with `defer: true` under a held update (a component mounted by an async memo that resolves later, under `<Loading>`) no longer runs once with its initial value when the hold commits (#4543). Its first pass is born held, and the commit that landed it queued the first run as it does for every born-held effect; the node now records `defer` and that commit skips the run, as creation does. The effect runs when its source next changes.
