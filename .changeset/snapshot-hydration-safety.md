---
"solid-js": minor
---

feat: snapshot-based boundary-local hydration safety (Goal 4)

Signal writes during hydration are now safe by construction. Each Loading boundary gets its own snapshot scope — computations created during hydration read snapshot values (matching server DOM) while writes update only the current value. After a boundary's sync hydration walk completes, its snapshot scope is released and stale computations rerun with current values.

Key changes:
- Add markTopLevelSnapshotScope/releaseSnapshotScope plumbing to all hydrated primitives
- Extract createBoundaryTrigger() helper for internal trigger signals excluded from snapshot capture
- Add resumeBoundaryHydration() with isDisposed guard, per-boundary scope management, and flush
- Add onCleanup for cleanupFragment to handle orphaned streaming content on navigation
- Remove deferHydration option (no longer needed with snapshots)
- Remove isHydrating/onHydrationEnd from public API (snapshots make hydration timing transparent)
- Update @solidjs/signals to ^0.10.7, dom-expressions to 0.41.0-next.6
