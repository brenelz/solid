---
"@solidjs/web": patch
---

`await renderToStream(...)` and `renderToStream(...).pipeTo(writable)` settle when the render's `signal` aborts. The abort tore the render down, but those promises only completed through `onCompleteAll`, the sink's end or the render-failure path, and a disconnect runs none of them, so a caller awaiting the HTML stayed pending forever, holding the request and whatever it owned. The thenable now resolves with whatever HTML the render produced (nothing, before the shell), the way a render failure completes it, and `pipeTo`'s promise resolves; a `then` registered after the abort and a signal already aborted when the render starts settle too. The sinks are left alone, as a disconnect always left them.
