---
"solid-js": patch
---

Refactor SSR stream blocking: delegate deferStream blocking to dom-expressions via serialize instead of imperative ctx.block() calls in processResult. Pass deferStream option through createSignal(fn), createMemo, and createProjection to serialize. Update dom-expressions to 0.41.0-next.3 for structural blocking support.
