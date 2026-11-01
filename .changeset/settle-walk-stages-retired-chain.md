---
"@solidjs/signals": patch
---

A memo's error staged with a hold now reaches a dependent that the settle walk retires from the superseded flight it was pending on (#4562). The walk marked a derivation as carrying the staging only on its early-return path, which a diamond's join took on its second arrival and a chain's nodes never took, so a chain's `isPending()` read `false` while the hold was still open and the view re-showed the committed value before the error's frame. Both shapes now keep the verdict `true` until the commit (F-9, D-41).
