---
"solid-js": patch
---

A `<Loading>` boundary whose scope an ancestor re-run disposed stops its resume loop instead of re-pulling the disposed subtree (#3750). A root hole settling re-pulls a provider's children, so an `<Errored>` beside it re-renders and creates the boundary again at the same id; the first instance woke on the same stable promise, read its disposed derived memos (a `<Show>` condition over the async read), got the stale pending answer back on every pass and failed the boundary with "discovery did not converge after 10001 passes". The re-created instance owns the fragment from the re-run on; the stale one records nothing and does not release its reveal-group slot.
