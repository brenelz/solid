---
"solid-js": patch
---

An async source that rejects after `renderToString` has returned no longer escapes as an unhandled rejection (#3570). `renderToString` is synchronous, so a memo, store or projection created during the render is still in flight when the HTML comes back; its settle promise was only observed when the render serialized it, which a sync render never does, so a later rejection had no handler and ended a Node server under the default `--unhandled-rejections=throw`. The settle machinery now attaches a noop rejection handler to every deferred it can reject, the same way an abandoned duplicate flight already was. The hydration serializer and the boundary retry subscriber still observe the rejection unchanged, so `renderToStream` behaves as before.
