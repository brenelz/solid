---
"@solidjs/signals": patch
---

An optimistic store over a derived store that retains rows from its own draft now shows the optimistic writes on a retained row and reverts them when the action settles. The optimistic setter's draft carried the projection draft wrapper the derive left in the backing, and the chained read served it as a fresh row of the optimistic family instead of resolving it to the inner store's row, so the guesses landed on a row no reader looked at.
