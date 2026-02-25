---
"solid-js": patch
---

Add dev-mode warning for untracked reactive reads in component bodies and control flow callbacks. Signals, memos, and store properties read outside a reactive scope now emit a console warning with the component or flow control name. Integrated into devComponent, Show, Match, For, and Repeat. Zero production overhead.
