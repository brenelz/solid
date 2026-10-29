---
"@solidjs/signals": patch
---

A render effect or user effect that reads `latest(s)` before `s()` computes once on a plain synchronous write, as `[s(), latest(s)]` does (#4402). The `latest()` read still seats the pass in the verdict lane, so a `<Show>` over `latest(x)` mounts its child once (#3540), but the plain read after it is the frame's read of the staging, and the seam re-derives the pass once only if the flush parks. A frame effect reading `latest()` of a held write while that lane waits a round for the re-derive is re-derived at the lane's reveal instead of keeping the committed value until the landing.
