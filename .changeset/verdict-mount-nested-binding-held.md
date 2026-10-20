---
"@solidjs/signals": patch
---

A mount made by a verdict reader stays mainline through its content's own mounts (#4166). Inside an action, `<Show when={latest(x) > 0}>` opens at once and mounts a `<Loading>`; its content showed the held `x = 1` beside the committed `x = 0` when a binding the content created read `x`, rather than the content itself: the binding's creator was the mainline content pass, so the #3851 rule (a verdict lane's mount that read a staging is born held) did not see it and it published at once. A creation pass now carries the lane its mount was made by through the mounts it makes, so the binding is born held like a direct read in the content: the boundary shows its fallback and the content appears at the action's landing.
