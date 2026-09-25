---
"solid-js": patch
---

The hydration trace no longer pulls a live-branded iterable. `subFetch` ran the adopted compute under mocked `fetch`/`Promise` and pulled the first value of any async-iterable result to capture the dependencies an async generator reads before its first suspension. A `live()` source constructs its iterable synchronously, so the pull captured nothing and instead opened the connection under the mock: a router-level live query keyed its channel on that dead connection and the post-hydration takeover reused it, so a server-rendered `liveQuery` never connected and its status stayed `"connecting"` until the user navigated away and back (#3647). The brand is read from the iterable itself, so the takeover still arms; the first real pull now happens after hydration.
