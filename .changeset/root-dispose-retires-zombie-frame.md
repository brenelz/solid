---
"@solidjs/signals": patch
---

Disposing an owner now retires the frame a pending action parked on it. A memo that recomputes while an action is pending keeps its previous children and `onCleanup` callbacks as zombies until the action commits; disposing the root before then marked the memo disposed but walked only its current frame, and the commit-time walk that would have retired the parked one bailed on the disposed flag. The parked frame's `onCleanup` callbacks and its child effects' returned cleanups never ran — not at disposal, and not when the action settled. They now run once, at disposal.
