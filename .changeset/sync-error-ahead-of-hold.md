---
"@solidjs/signals": patch
---

A synchronous memo's throw now waits for its frame when an async sibling later in the same flush holds it (D-41, #4109). Before, the memo's pass ran before the sibling went pending, found no hold, and published the error at once: an untracked read in a click handler threw while the screen still showed the button, and `isPending` read `false`. The error is now staged like a value whenever the pass derived from a staging of this flush, and the seam decides: a parked flush shows it with the frame, a committing flush publishes it at its commit. A first pass with no committed value still publishes now.
