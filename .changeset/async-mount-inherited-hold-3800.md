---
"@solidjs/signals": patch
---

A newly created async memo that reads a held signal is held with it (#3800). Its first pass joined the signal's transaction but went pending, and the born-held decision only covered a pass that produced a value, so the memo was treated as a loading source with no frame: its landing staged mainline, and a render effect over it reported the held update (`child 2`) while the existing frame was still held at `parent 1 1`. A pending first pass that derived from a held world now enters that transaction like a synchronous one does, and its landing is revealed with the slow derivation.
