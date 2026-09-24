---
"@solidjs/web": patch
---

Single-flight with server components (#3638). `frameTransformFlightResult` now reads the envelope `foldFlightData` hands it, which is keyed by source (`{ [source]: slice }`, the unnamed collector's slice under `"true"`): a component-valued entry one level down frames as a region, where before the transform found nothing at the top level, declined, and the plain codec threw on the function (`Server function result could not be encoded`). The source keys stay in the serialized `data`, and the frame response's `X-Single-Flight` header names the folded sources instead of a bare `"true"`. On the client, the frame transport delivers each source's slice of the keyed envelope to its own consumer, as the data-only path does, instead of handing the whole envelope to the unnamed one.
