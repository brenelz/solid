---
"@solidjs/signals": patch
---

An effect created with `defer: true` under a held update (a component mounted by an async memo that resolves later, under `<Loading>`) or as a lane's work (a component an optimistic write mounts) no longer runs with its initial value when the hold commits or the lane reveals (#4543). The skip is one-shot and covers only the run for the creation value: a source change made before the commit still runs the effect once, with the changed value, at the commit, and a `createReaction` armed under a hold whose tracked source changes before the commit fires there as well.
