---
"@solidjs/signals": patch
---

An `<Errored>` whose retried source answers shows the recovered content at that landing even when the reveal mounts a nested `<Loading>` around a pending read, such as a `<Show when={detail()}>` child that fetches more (#4425). The nested boundary shows its own fallback; the error no longer stays on screen until that read lands.
