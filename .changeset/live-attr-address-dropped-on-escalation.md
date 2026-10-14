---
"@solidjs/web": patch
---

A live frame render that escalates mid-tag (an attribute reads a pending value) no longer leaves its minted `data-lha` address in the template segment (#4032). The `<Loading>` resume re-ran `ssr()` on that segment and minted a second address, so the element rendered as `<ul data-lha="1" data-lha="0">` and every later attr op carried the stale `data-lha="0"`, which moved the element off its bound address on the client after the first update. The address now leaves with the dropped capture, so the resume mints once and attr ops carry only the tag's own attributes.
