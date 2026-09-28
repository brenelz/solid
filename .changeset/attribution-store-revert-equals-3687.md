---
"@solidjs/signals": patch
---

The attribution engine's `OPTIMISTIC_REVERTED` check now calls a node's equality with the node as `this`. A `createOptimisticStore` row uses the shared slot-node equality, which reads the node's host through `this`; the unbound call threw `Cannot read properties of undefined (reading '_host')` from inside `resolveOptimisticNodes`, so with attribution on (`captureArtifact`, or the dev performance tracks) a store write made in a failed action never dropped at settle, and a row whose truth landed with a different value while the guess was showing threw the same way. The lane landing in `handleAsync` was the one other comparator call made without the node as `this`; it now makes the same method call, although only a computed node reaches it. Regressed in rc.10 (#3687).
