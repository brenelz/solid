---
"solid-js": patch
---

A server `<Errored>` pulled more than once in a render now resets its fallback's owner before each fallback render, so the fallback keeps the hydration ids the client computes. The slot walk of a `{props.children}` array re-pulls the boundary when a later sibling suspends, and the second fallback render used to continue the first one's child-id counter (`_hk="112"` on the server, `110` on the client), so the fallback hydrated as a detached copy that never became interactive (#3920).
