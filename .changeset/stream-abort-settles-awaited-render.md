---
"@solidjs/web": patch
---

`await renderToStream(...)`, `renderToStream(...).pipeTo(writable)` and a `Response` built on `renderToStream(...).readable` settle when the render's `signal` aborts. The abort tore the render down, but those consumers only completed through `onCompleteAll`, the sink's end or the render-failure path, and a disconnect runs none of them, so a caller awaiting the HTML stayed pending forever, holding the request and whatever it owned. The thenable now resolves with whatever HTML the render produced (nothing, before the shell), the way a render failure completes it; `pipeTo`'s promise resolves once its writer lock is released, leaving the writable open for the caller to close or abort; and the `readable` view closes. A `then` registered after the abort and a signal already aborted when the render starts settle too.
