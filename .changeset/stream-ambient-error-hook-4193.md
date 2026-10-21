---
"@solidjs/web": patch
---

A `renderToStream` call with no local `onError` now reports two failures to the hook installed with `configureServerErrors` instead of leaving them as unhandled rejections (#4193). A hydration value the serializer cannot handle is heard as `handling: "serialize"` and the render settles instead of staying pending, whether the value fails synchronously (it no longer throws out of `renderToStream`), resolves from a promise, or arrives through `deferStream`; `renderToFrameStream`'s keyed codec releases such a write the same way. An `onCleanup` that throws during the render's final dispose after a normal completion is heard as `handling: "failed"`, as it already was when `signal` aborted the render. With no hook anywhere, a custom serializer whose `close()` throws during the teardown reaches `console.error` like the render's other failures.
