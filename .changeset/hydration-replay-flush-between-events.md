---
"@solidjs/web": patch
---

Flush after each event `runHydrationEvents()` replays, so a write made synchronously in one replayed handler is committed before the next replayed handler runs. Two clicks queued before hydration on a counter whose handler writes `setN(n() + 1)` now count 2; both handlers used to read the same committed value inside one microtask and count 1. A write made after an `await` in a replayed handler still lands after the replay loop, as before.
