---
"@solidjs/web": patch
---

Fix streamed fragment stylesheets never releasing their fragment under a nonce-based CSP (#3747). `renderToStream` wrote each fragment `<link rel="stylesheet">` with inline `onload`/`onerror` handlers, and an inline handler attribute cannot carry a nonce, so `script-src 'nonce-…'` blocked them and the fragment stayed in its fallback. The link now carries `data-dfc="<key>"`, and the `$dfs` gate in the nonce-carrying runtime script installs, the first time it runs, one capture-phase `load`/`error` listener on `document` that releases the gate for it.
