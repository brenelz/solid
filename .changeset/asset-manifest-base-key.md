---
"@solidjs/web": patch
---

`AssetManifest` accepts an object literal that sets `_base` (solidjs/solid#4502). The type was `Record<string, Entry> & { _base?: string }`, so `_base: "/"` fell under the index signature and failed with TS2322 unless the manifest came from `JSON.parse` or a cast. The index signature now admits `AssetManifestEntry | string | undefined`, with `_base?: string` declared beside it, and the entry shape is exported as `AssetManifestEntry`. A lookup by key therefore narrows with `typeof` before reading entry fields. The runtime already passed over `_base` when scanning for the entry; it now also passes over a key whose value is `undefined` or a string, which the type admits, instead of throwing, both when scanning for the entry and when walking `imports`.
