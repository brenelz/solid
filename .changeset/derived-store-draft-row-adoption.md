---
"@solidjs/signals": patch
---

A derived store that returns one of its own draft rows no longer recurses on
read. The derive's draft wraps each row in a forwarding proxy; the reconcile
did not recognize the wrapper as the row's store proxy and adopted it as that
row's backing, so the wrapper and the store proxy answered each other's
`ownKeys` until the stack overflowed. The wrapper now resolves to the proxy it
forwards to wherever a store proxy is recognized (`wrapNext`, `unwrapValue`),
so a retained draft row keeps its backing and identity.
