---
"solid-js": patch
---

fix(ssr): lock server-side comp.value to first async iterable value

During SSR, async-iterable-backed computations (createMemo, createProjection) now lock their readable value to the first yield. Subsequent iterations still stream to the client via seroval, but SSR reads always return V1. This prevents hydration mismatches when Loading boundaries retry after the iterator has advanced.

For projections, the SSR-visible store state is deep-cloned at first value resolution, isolating it from subsequent generator mutations (including nested object changes).
