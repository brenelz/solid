---
"@solidjs/signals": patch
---

A direct write to a writable memo replaces its error. The setter of a
`createSignal(fn)` whose derivation threw staged its value, but the commit
left the node's error status in place, so accessor reads, `createEffect` and
`<Errored>` kept the old error, and writing the last good value back was
dropped by the equality gate. A write over an error now counts as a change,
the readers a staging reaches are served the written value while an
untracked read keeps the error until the flush commits the write, and the
commit clears the error without re-running the derivation. An error found
after the write, in the flush that carries it or later, still outranks it.
