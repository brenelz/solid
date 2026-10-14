---
"@solidjs/web": patch
---

`respond(value, init)` now accepts every value a plain return accepts. The envelope carries its passthrough JSON body only when JSON can encode the value, so a value JSON cannot carry (a `bigint`, for example from a protobuf message) no longer throws inside the server function. For such a value the envelope carries the status and headers bodiless, and the server-function handler encodes the value the way it encodes a plain return, through the codec, for scripted and unscripted callers alike. A JSON-safe value still reaches callers without the client runtime as the JSON body, and `respond(undefined, init)` still carries the metadata without a body.
