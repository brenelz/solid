---
"@solidjs/signals": patch
---

`GRAPH_GROWTH` no longer counts the route being left when a navigation settles through a held transition. The graph walk for a navigation settled in a landing now runs at the end of that drain, after the commits have disposed the previous route, so its `graph` record counts only the settled graph, as a navigation that commits in one drain already did.
