---
"@solidjs/web": patch
---

The in-flight invocation map is process state, keyed on `globalThis` like the dispatch registries (#3641). The frames server bundle carries its own copy of the server-functions module, so `frameTransformFlightResult` read a map the handler never wrote: a POST single-flight call to a server component answered with an empty `X-Frame-Stream` and the client rendered nothing. The header now carries the function id.
