---
"@solidjs/signals": patch
---

Fix an infinite flush loop ("Potential Infinite Loop Detected") when a `Show` fallback mounts a component that reads `isPending()` while a refetch holds the frame: a pass that read a node born staged is no longer listed for re-derivation on the committed world by a later lane read of the same pass.
