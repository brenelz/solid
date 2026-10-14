---
"@solidjs/web": patch
---

`respond(value, init)` now accepts every value a plain return accepts. The envelope's passthrough JSON body is encoded when it is read instead of when the envelope is built, so a value JSON cannot carry (a `bigint`, for example from a protobuf message) no longer throws inside the server function. Previously the eager `JSON.stringify` failed the direct SSR leg and the scripted HTTP leg, neither of which reads that body: the direct leg unwraps the value and the scripted leg encodes it through the same negotiation as a plain return (JSON when safe, otherwise the codec). Callers without the client runtime still receive the JSON body.
