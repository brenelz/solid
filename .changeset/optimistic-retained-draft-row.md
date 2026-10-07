---
"@solidjs/signals": patch
---

An optimistic store over a derived store that retains rows from its own draft now shows the optimistic writes on a retained row and reverts them when the action settles. The optimistic setter's draft carried the projection draft wrapper the derive left in the backing, and the chained read served it as a fresh row of the optimistic family instead of resolving it to the inner store's row, so the guesses landed on a row no reader looked at. `deep()` resolves such a wrapper the same way, and `snapshot()` (which `deep()` returns through) now composes the optimistic guesses on the rows of a chained store whose inner store is a derive: the walk switched to the derive's family at the chained root and no longer found the optimistic family's row targets. A shallow derived optimistic store over another store resolves a chained row before serving it, so its draft writes the row its readers see instead of the inner store's raw row.
