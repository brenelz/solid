---
"@solidjs/web": patch
---

`spread()` and `ssrElement()` read a spread's `children` getter after every other getter. The client inserted children before its attribute effect read the attributes, while the server read `children` wherever it fell in key order, so a getter that mints a hydration id (the memo the compiler emits for a ternary's condition, as in ``aria-label={n() ? `a ${n()}` : `b ${n()}`}`` on a `dynamic()` tag) spread beside an element child was numbered before the child on one side and after it on the other, and the child hydrated against a key the server never wrote (#3741). The client now creates the attribute effect before the children insert. The server reads `children` after its key walk and after the element's trailing attribute thunk, where the client reads that trailing source. A textarea's `value`/`defaultValue` still wins over `children`, and once `children` is seen a later `innerHTML`/`textContent`/`innerText` getter is still left unread.
