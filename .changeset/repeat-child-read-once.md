---
"solid-js": patch
---

`<Repeat>` with a plain JSX child builds each row once. The row mapper read `props.children` twice, once for the function check and once for the value, and a compiled JSX child is a getter that creates its element on every read, so every row created two elements and ran the first one's `ref` before discarding it (#4296). The server `Repeat` had the same double read.

`<Repeat>` now calls its child with the index only when the child takes an argument, the same check `<Show>` and `<Match>` use. A child that is itself a control flow, such as `<Show>`, `<Switch>` or `<For>`, compiles to a zero-argument accessor; the row mapper used to call it once, untracked, and keep that value, so the row never updated when its condition changed. Each row now keeps the accessor and stays reactive.
