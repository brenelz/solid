---
"@solidjs/signals": patch
---

An error boundary that caught an error thrown by another boundary's fallback recovers when that fallback goes away (#4270). The fallback computed is the source of the error, so the outer boundary waits on it; the inner boundary disposes it only in the render phase, after the seam that drops dead readers has run, and nothing scheduled another seam. The outer stayed on its fallback until something else re-derived it. The disposal now schedules one more round when any boundary is still waiting, so the seam drops the dead reader and the outer reveals its content in the same flush.
