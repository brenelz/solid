---
"solid-js": patch
---

Fix `renderToStream` reporting an `unhandledRejection` for an async read that `<Errored>` already contained (#3973). The server boundary builds a fresh `Promise.all` over its pending holes on every pull, and a pull whose result is discarded — a `{props.children}` slot the boundary shares with an async sibling resolves its children twice — left the first aggregate with no subscriber, so its rejection took the process down even though the fallback rendered. The aggregate is now observed when it is built; whoever awaits it still sees the rejection.
