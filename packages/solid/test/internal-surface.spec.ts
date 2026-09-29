import { readFileSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
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
// Read from "solid-js" at runtime by @solidjs/web's render(); never declared.
const ENTRY_INTERNAL = ["ROOT_ERROR_HOOK"];

const typesDir = resolve(import.meta.dirname, "../types");
const read = (file: string) => readFileSync(resolve(typesDir, file), "utf8");

test.each([
  ["client", "index.d.ts"],
  ["server", "server/index.d.ts"]
])("no internal name reaches the %s entry's declarations", (_tier, file) => {
  const declarations = read(file);
  const leaked = [...INTERNAL, ...ENTRY_INTERNAL].filter(name =>
    new RegExp(`\\b${name}\\b`).test(declarations)
  );
  expect(leaked).toEqual([]);
});

test("solid-js/internal's declarations carry the protocol and the seams", () => {
  const declarations = read("internal.d.ts");
  const missing = INTERNAL.filter(name => !new RegExp(`\\b${name}\\b`).test(declarations));
  expect(missing).toEqual([]);
});

test("every entry's declarations resolve what they re-export", () => {
  const pkg = JSON.parse(readFileSync(resolve(typesDir, "../package.json"), "utf8"));
  const typesOf = (exports: unknown): string[] =>
    typeof exports === "object" && exports !== null
      ? Object.entries(exports).flatMap(([condition, target]) =>
          condition === "types" && typeof target === "string" ? [target] : typesOf(target)
        )
      : [];
  const entries = [...new Set([...typesOf(pkg.exports), "./types/server/index.d.ts"])];
  expect(entries).toContain("./types/index.d.ts");
  const program = ts.createProgram(
    entries.map(file => resolve(typesDir, "..", file)),
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
  const inTypes = (file: string) => {
    const path = relative(typesDir, file);
    return !isAbsolute(path) && !path.startsWith("..");
  };
  const errors = ts
    .getPreEmitDiagnostics(program)
    .filter(d => d.file === undefined || inTypes(d.file.fileName))
    .map(
      d =>
        `${d.file ? relative(typesDir, d.file.fileName) : "global"}: ${ts.flattenDiagnosticMessageText(d.messageText, " ")}`
    );
  expect(errors).toEqual([]);
}, 30_000);
