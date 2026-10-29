---
"@solidjs/signals": patch
---

An `<Errored>` whose source answered after a retry shows the recovered content at that landing even when the content mounts a nested `<Loading>` around a pending read: the nested boundary shows its own fallback instead of the error staying on screen until that read lands (#4425). The error boundary still waits on a loading fallback hidden behind its error while it has a reader to wait on (D-39).
