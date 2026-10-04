---
"@solidjs/babel-plugin": patch
"@solidjs/compiler": patch
---

Compiled SSR omits a nullish dynamic `class` / `style` on an element without a spread (#3773). Both compilers wrote ` style="` / ` class="` and the closing quote as template bytes around `ssrStyle(x)` / `ssrClassName(x)`, so `<div style={p.style} class={p.class} />` rendered `style="" class=""` for `undefined` or `null` while `title` with the same value was omitted (and Chromium reports the empty `style` as a `style-src-attr` CSP violation). A dynamic `class` / `style` now compiles to the whole-attribute `ssrElementAttribute("class", x)` hole that the spread path and `serverComponents` already use, which writes nothing for a nullish value and the same bytes otherwise. A spread-free object literal keeps its inlined `ssrStyleProperty` / class-name serialization, and `false`, `""` and an all-nullish object still render an empty attribute, as the runtime rule has only nullish meaning unset.
