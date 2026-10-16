---
"solid-js": patch
---

A string child of a server `<Errored>` is escaped (#4116). The boundary resolved its children before any `escape` saw them, so a string, an array of strings or a function returning a string reached the markup raw while the same value under `<Loading>` or at a plain hole was escaped. The error boundary now escapes its content the way `<Loading>` does; element children and the fallback are escaped once as before.
