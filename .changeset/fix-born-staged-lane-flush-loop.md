---
"@solidjs/signals": patch
---

Fix an infinite flush loop ("Potential Infinite Loop Detected") when a `Show` fallback mounts a component that reads `isPending()` while a refetch holds the frame: a pass that read a node born staged is no longer re-derived on the committed world at the lane seam, whichever order its reads came in.
