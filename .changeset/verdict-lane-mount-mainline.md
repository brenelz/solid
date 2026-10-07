---
"@solidjs/signals": patch
---

A `Loading` a verdict lane mounts (`<Show when={latest(x) > 0}>` inside an action) showed its content beside the committed value: its first pass took its creator's lane and read the proposal. The mount now stays mainline, and it and the derivations created under it are born held when they read the frame's staging, so the boundary shows its fallback until the hold commits (#3851). Verdict-lane work that read a staging before its lane read is repaired at the park like any lane work, and the park's repair runs only when the frame parks.
