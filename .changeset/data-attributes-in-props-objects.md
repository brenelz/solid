---
"@solidjs/web": patch
"@solidjs/h": patch
---

`data-*` attributes are accepted in props objects typed with `ComponentProps<"div">` or `JSX.HTMLAttributes<T>`, so a function that returns props to spread onto an element can set `"data-state"` without a cast (previously TS2353). `JSX.ElementAttributes<T>` now declares them with a `` `data-${string}` `` index signature whose values are `string | number | boolean | undefined`. Unknown non-data keys are still rejected.
