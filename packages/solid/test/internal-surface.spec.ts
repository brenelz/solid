import { readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import ts from "typescript";
import { expect, test } from "vitest";

// The merge()/omit() view protocol and the server-scope seams are consumed by
// `@solidjs/web` / `@solidjs/universal` through `solid-js/internal`. They are
// exported from the main entries at runtime (so that subpath shares this
// module's state) but marked `@internal`, and `stripInternal` keeps them out
// of the DECLARATIONS — that is what makes them not-public for TypeScript.
//
// This pins the boundary: a name added back to a main entry without an
// `@internal` tag fails here, which is how #3454 leaked eleven of these onto
// the `solid-js` surface without anyone noticing.
const INTERNAL = [
  // view protocol (pure @solidjs/signals, re-exported by src/internal.ts)
  "mergeSources",
  "mergeView",
  "omitView",
  "viewOf",
  "OmitView",
  "MergeView",
  "sourceKeys",
  "sourceHas",
  "sourceGet",
  "hasStaticKeys",
  "resolvedTable",
  "SOURCE_PLAIN",
  "SOURCE_OMIT",
  "SOURCE_PROXY",
  "SOURCE_MEMO",
  "SourceKind",
  // server-scope seams (real on the server entry, stubs on the client)
  "ssrHandleError",
  "ssrScope",
  "runInServerComponentScope",
  "inServerComponentScope",
  "creationStamp",
  "getProjectionTrace",
  "materializeContainerTrace"
];

const typesDir = resolve(import.meta.dirname, "../types");
const read = (file: string) => readFileSync(resolve(typesDir, file), "utf8");

test.each([
  ["client", "index.d.ts"],
  ["server", "server/index.d.ts"]
])("no internal name reaches the %s entry's declarations", (_tier, file) => {
  const declarations = read(file);
  const leaked = INTERNAL.filter(name => new RegExp(`\\b${name}\\b`).test(declarations));
  expect(leaked).toEqual([]);
});

test("solid-js/internal's declarations carry the protocol and the seams", () => {
  const declarations = read("internal.d.ts");
  const missing = INTERNAL.filter(name => !new RegExp(`\\b${name}\\b`).test(declarations));
  expect(missing).toEqual([]);
});

// A name an entry re-exports from a module that `stripInternal` dropped it
// from is `any` for a consumer with `skipLibCheck` on, and TS2305 with it off.
test("every entry's declarations resolve what they re-export", () => {
  const entries = [
    "index.d.ts",
    "server/index.d.ts",
    "internal.d.ts",
    "attribution.d.ts",
    "refresh/index.d.ts"
  ];
  const program = ts.createProgram(
    entries.map(file => resolve(typesDir, file)),
    {
      module: ts.ModuleKind.NodeNext,
      moduleResolution: ts.ModuleResolutionKind.NodeNext,
      target: ts.ScriptTarget.ESNext,
      lib: ["lib.dom.d.ts", "lib.esnext.d.ts", "lib.dom.iterable.d.ts"],
      types: [],
      strict: true,
      skipLibCheck: false,
      noEmit: true
    }
  );
  const errors = ts
    .getPreEmitDiagnostics(program)
    .filter(d => d.file !== undefined && d.file.fileName.startsWith(typesDir + "/"))
    .map(
      d =>
        `${relative(typesDir, d.file!.fileName)}: ${ts.flattenDiagnosticMessageText(d.messageText, " ")}`
    );
  expect(errors).toEqual([]);
}, 30_000);
