---
"solid-js": patch
---

`<Repeat>` with a plain JSX child builds each row once. The row mapper read `props.children` twice, once for the function check and once for the value, and a compiled JSX child is a getter that creates its element on every read, so every row created two elements and ran the first one's `ref` before discarding it (#4296). The server `Repeat` had the same double read.
