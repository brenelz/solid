---
"@solidjs/signals": patch
---

A first load re-asked by a write that a frame on screen still holds now lands into that hold, so a `<Loading>` that has not shown content keeps its fallback until the write commits and reveals with it, instead of showing the answer to the new question beside the frame still showing the old one (#4593: `b=21` beside `s=0` while `a:1` held `setS(1)`). A hold only an action keeps open, with nothing on screen waiting on it, still lets the first load land on its own (#2937).
