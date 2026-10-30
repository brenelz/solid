// A manifest literal may set `_base` beside its entries (solidjs/solid#4502).
// Compile-only, under `test-types`.
import type { AssetManifest, AssetManifestEntry } from "../src/server.js";
import { renderToString } from "../src/server.js";

const manifest: AssetManifest = {
  _base: "/",
  "src/entry-client.tsx": { file: "assets/entry-client.js", isEntry: true }
};

renderToString(() => null, { manifest });

const entry: AssetManifestEntry | string | undefined = manifest["src/entry-client.tsx"];
if (typeof entry === "object" && entry) entry.file satisfies string;

const assigned: string | undefined = manifest._base;
void assigned;

const noBase: AssetManifest = {
  entry: { file: "entry.js" }
};
void noBase;

const notAnEntry: AssetManifest = {
  // @ts-expect-error an entry needs a `file`
  entry: { css: ["entry.css"] }
};
void notAnEntry;

const baseIsNotAnEntry: AssetManifest = {
  // @ts-expect-error `_base` is a string, not an entry
  _base: { file: "base.js" }
};
void baseIsNotAnEntry;
