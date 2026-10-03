---
"@solidjs/compiler": patch
---

Native TSRX: a setup statement that ends without a semicolon right before the rendered element (`const a = () => 1` on the line above `<div>{a()}</div>`) compiles again instead of failing with "Unable to load authored TSRX statement" (#3762). The parser projection inserts the ASI semicolon in front of the element; a projected span that ends at that inserted `;` now maps back to the authored text before it, so the statement loads and keeps its source mappings. The Babel frontend and `projectTsrxForTypecheck` already accepted this source.
