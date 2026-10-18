---
"@solidjs/web": patch
---

A server-component consumer that mounts after an upstream wait, over a frame response already streaming, no longer reports a false `ASYNC_WATERFALL`. The boundary's landing memo returned an unstamped `.then()` wrapper over the host's landing promise, so attribution read the delivery as work started at the mount. The frames handler now captures the call's start when the call is dispatched, before its fetch, records it per address as each response is handled (direct, nested and single-flight regions alike), and the landing promise is stamped with it through `OBSERVE.attribution.markFlight`. A `reset` re-ask is a new call and stays unstamped. Observe and dev tiers only; the prod artifact is unchanged.
