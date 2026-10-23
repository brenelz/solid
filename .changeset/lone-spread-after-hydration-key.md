---
"@solidjs/babel-plugin": patch
"@solidjs/compiler": patch
---

A lone dynamic spread on an intrinsic element (`<label {...props()} />`) is evaluated after the element's hydration key on the server (#4240). It compiled to `ssrElement(tag, props(), ...)`, so the spread ran in argument position before `ssrElement` allocated the key; a source that creates an owner (a memo) took the element's id and the element shifted by one on the server only, leaving it unclaimed on hydration. The spread now defers behind a thunk, `ssrElement(tag, () => props(), ...)`, as a spread next to other attributes already does and as the client, which claims the element before applying the spread.
