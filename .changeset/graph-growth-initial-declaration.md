---
"@solidjs/signals": patch
---

`GRAPH_GROWTH` no longer counts the initial route declaration (`NavigationEvent.initial`) as a visit. The declaration settles while the router builds its context, before the route's content mounts, so its census was the first of the `visits` samples compared for that route, and a bounded change in page content on the following visits read as the climb to `ratio`. The declaration's `graph` record is still emitted and the route is still named in `data.routes`; only the comparison history skips it, so a root or subscription that a visit leaves behind is reported as before (#3735).
