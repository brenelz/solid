---
"@solidjs/signals": patch
---

A render effect of `isPending(x)` beside an async memo that reads `x()` and `isPending(x)` shows `true` together with that memo's display-ahead answer (#4677). Both sit in the hold's verdict lane, which waits for the memo's flight; when the flight landed at the seam the hold also landed at, the landing's re-derivation voided the effect's run that had waited in the lane, so the badge showed `pending: true` beside `false`. A landing now keeps a stale reader's run that a lane held since an earlier round and revealed at the same seam, and voids every other run as before; the kept run shows at the reveal, and the re-derivation follows with the landed frame.
