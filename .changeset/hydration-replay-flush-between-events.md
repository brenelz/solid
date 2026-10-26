---
"@solidjs/web": patch
---

Flush after each event `runHydrationEvents()` replays, so a click queued before hydration runs as its own tick, as it would have live. Two queued clicks on a counter whose handler writes `setN(n() + 1)` now count 2; both handlers used to read the same committed value inside one microtask and count 1.
