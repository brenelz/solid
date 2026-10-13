---
"solid-js": patch
"@solidjs/web": patch
---

A live markup hole whose expression has a conditional on a property (`{m.usage && <b/>}`, `{m.usage ? … : …}`) keeps re-emitting. The compiler wraps such a condition in a sync memo, and on the server that memo allocated an owner that moved the creation stamp, so the live-hole engine latched the hole as render-once after its first render. The compiler's condition memos no longer count toward `creationStamp()`, and each sweep runs under a throwaway scope that releases the memos it creates. Async memos, `lazy()`, boundaries and slot records still latch the hole as before.
