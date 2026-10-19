---
"@solidjs/signals": patch
---

A held node that recovers before its staged error commits now stages the recovery in the error's place (#4145). `stageError` parks the proposed error in `_pendingValue` under `CONFIG_STAGED_ERROR`, and a successful re-pass or a flight's landing replaced the value but left the flag set, so the next tracked read in `serve` threw the recovered value as an error and halted the reactive system when the frame revealed. Staging a value now clears the flag, in `recompute` and in `setSignal`: readers in the hold see the recovery, `latest` returns it, and the frame reveals it with its siblings. A recovery equal to the committed value is dropped as no proposal, as the same re-pass is without the error. The node's `equals` is never asked to compare against the staged error: a recovery over it is a change, as a write over a shown error is, `isPending` reports the staged error as pending without asking, and a setter's updater composes on the committed value.
