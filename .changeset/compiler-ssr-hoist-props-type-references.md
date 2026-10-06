---
"@solidjs/compiler": patch
---

SSR hoisted props no longer capture identifiers referenced only in TypeScript type positions. Inside a generic component, a type parameter used in a nested component's props (a parameter annotation, an `as` or `satisfies` target, a type argument) was passed to the hoisted constructor as a value, `new _P$(props, Row)`, and the server render threw `ReferenceError: Row is not defined` once the types were stripped.
