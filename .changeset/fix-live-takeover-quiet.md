---
"solid-js": patch
---

A memo or store that returns a live source outside a streamed `<Loading>` now waits for its still-streaming server answer and takes over from it, with the landed value as the stream's synchronous first step. The takeover used to supersede that answer and read pending until the first live yield, so a boundary resuming in between selected its fallback against the streamed content ("Hydration key miss" warning, a second copy of the content once the yield landed).
