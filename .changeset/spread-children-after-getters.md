---
"@solidjs/web": patch
---

`spread()` and `ssrElement()` read a spread's `children` getter after every other getter, on both sides. The client inserted children before its attribute effect read the attributes, while the server read `children` wherever it fell in key order, so a prop getter that mints a hydration id (the compiler memoizes a ternary's condition: ``aria-label={n() ? `a ${n()}` : `b ${n()}`}``) on a `dynamic()` tag or a `<Tag {...props}>` with an element child was numbered before the child on one side and after it on the other, and the child hydrated against a key the server never wrote (#3741).
