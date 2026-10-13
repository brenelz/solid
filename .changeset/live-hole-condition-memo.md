---
"solid-js": patch
"@solidjs/web": patch
---

A live markup hole whose expression has a conditional on a property (`{m.usage && <b/>}`, `{m.usage ? … : …}`) keeps re-emitting (#4023). The compiler wraps such a condition in a sync memo for hydration-id parity, and on the server that memo allocated an owner that moved the creation stamp, so the live-hole engine latched the hole as render-once after its first render, silently. A sync memo's owner no longer counts toward `creationStamp()`: its compute never subscribes to an async source, so re-creating it per sweep is safe. Sweeps now run under a throwaway transparent scope, so the memo a re-evaluation creates is released with it instead of accumulating under the hole's owner for the response's life; ids still come from the hole's own scope. Async memos, boundaries and slot records still latch the hole as before.
