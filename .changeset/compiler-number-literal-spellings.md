---
"@solidjs/compiler": patch
---

Static numbers in templates are spelled as JS `String(number)` spells them, at parity with the Babel plugin: `k={1e21}` is `k=1e+21` and `k={1e-7}` is `k=1e-7` (exponent form at 1e21 and above and below 1e-6), and integers at or above 2^63 such as `k={1e19}` keep their digits instead of saturating to `9223372036854775807`. Child holes that evaluate through `-`, `*` or `/` (`{1/0}`, `{3-1}`) are folded into the template like attributes already were, so `<div>{1/0}</div>` renders `Infinity` statically instead of an `insert` call (#4322).
