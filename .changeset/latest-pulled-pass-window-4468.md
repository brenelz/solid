---
"@solidjs/signals": patch
---

A memo pulled inside `latest()` now computes as its own pass (A31): the window no longer leaks into it, so an `isPending()` it calls of a held write answers `true` whoever woke the memo, where a pull from inside `latest()` answered `false` (#4468).
