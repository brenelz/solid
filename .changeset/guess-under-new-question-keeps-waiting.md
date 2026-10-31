---
"@solidjs/signals": patch
---

A render effect already waiting on an optimistic store's new question (an input changed, not a `refresh()`) keeps waiting when a guess is written on the store (#4536). Before, the guess stood in for that flight, so one text binding reading both the input and a keyed list settled on the guess and stopped observing the flight: the input change's hold committed, or the `<Loading on>` region revealed, with the new input beside the old answer's rows minus the guess (`closed: [#3][#4]`). Now the frame keeps the held view (`open: [#3][#4]`) or the fallback until the answer lands, then shows `closed: [#2]`, as it already did with the reads in separate bindings.
