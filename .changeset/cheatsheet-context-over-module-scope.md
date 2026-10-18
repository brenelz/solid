---
"solid-js": patch
---

The cheatsheet no longer recommends a module-scope signal or store for app-wide state. It now matches the `createContext` JSDoc: Context covers app-wide state in an app that renders on the server, because a value created inside a component is created once per request and the Provider owns and disposes it, while module scope is shared by every request in the same process and is reserved for constants (#4141).
