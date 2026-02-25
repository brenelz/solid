---
"solid-js": minor
---

feat(ssr): implement ssrSource, async iterable streaming, and client hydration (Goal 2d)

Adds the ssrSource option (4 modes: "server", "hybrid", "initial", "client") controlling how computations serialize and hydrate. Server-side async iterable streaming via processResult tap wrapper with patch-based projection serialization. Client-side async iterable hydration with synchronous first-value consumption from seroval and scheduleIteratorConsumption for remaining values. Includes isHydrating/onHydrationEnd lifecycle APIs, deferHydration option, and subFetch updates for generator dependency capture.
