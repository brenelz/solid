---
"@solidjs/signals": patch
---

The attribution engine's `OPTIMISTIC_REVERTED` check now calls a node's equality with the node as `this`, as every runtime compare site does. A `createOptimisticStore` row uses the shared slot-node equality, which reads the node's host through `this`; the unbound call threw `Cannot read properties of undefined (reading '_host')` from inside `resolveOptimisticNodes`, so with attribution on (`captureArtifact`, or the dev performance tracks) a store write made in a failed action never dropped at settle. Regressed in rc.10 (#3687).
