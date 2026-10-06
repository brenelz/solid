const path = require("path");
const { createRequire } = require("module");
const esbuild = require("esbuild");
const { transform } = require("../index");
const { normalize } = require("./parity/harness");

const babelPackageDir = path.resolve(__dirname, "../../babel-plugin");
const requireBabel = createRequire(path.join(babelPackageDir, "package.json"));
const babel = requireBabel("@babel/core");
const babelPlugin = requireBabel(babelPackageDir);

const options = {
  moduleName: "r-server",
  generate: "ssr",
  requireImportSource: false
};

function ssr(source) {
  return transform(source, { filename: "generic.tsx", ...options }).code;
}

function babelSsr(source) {
  return babel.transformSync(source, {
    babelrc: false,
    configFile: false,
    filename: "generic.tsx",
    plugins: [[babelPlugin, options]],
    parserOpts: { plugins: ["jsx", "typescript"] }
  }).code;
}

function stripped(source) {
  return esbuild.transformSync(ssr(source), { loader: "ts" }).code;
}

const runtime = {
  ssr: (t, ...v) => ({ t, v }),
  escape: v => v,
  memo: fn => fn,
  createComponent: (Comp, props) => Comp(props)
};

function load(source) {
  const code = stripped(source)
    .replace(/import \{([^}]*)\} from "r-server";/g, (_, specifiers) =>
      specifiers
        .split(",")
        .map(s => s.trim().split(/\s+as\s+/))
        .map(([name, local]) => `const ${local ?? name} = __rt.${name};`)
        .join("\n")
    )
    .replace(/^export /gm, "");
  return new Function("__rt", `${code}\nreturn C;`)(runtime);
}

const prelude = `
  const List = p => p.children;
  const Item = p => p;
  const id = v => v;
`;

const typeParameterCases = [
  ["a parameter annotation", "f={(r: Row) => r}"],
  ["an as cast", "value={props.v as Row}"],
  ["a satisfies check", "value={props.v satisfies Row}"],
  ["a type argument", "value={id<Row>(props.v)}"]
];

const runtimeBindingCases = [
  [
    "a const read through typeof",
    "const fallback = props.fallback;",
    "value={props.v as typeof fallback}",
    /new _P\$\d*\(props, fallback\)/
  ],
  ["a class in a parameter annotation", "class Row {}", "f={(r: Row) => r}", /new _P\$\d*\(Row\)/],
  [
    "a value binding read inside the props",
    "const Row = props.row;",
    "f={(r: unknown) => Row(r)}",
    /new _P\$\d*\(Row\)/
  ]
];

describe("SSR hoisted props and type positions", () => {
  it.each(typeParameterCases)("does not capture a type parameter used in %s", (_, attribute) => {
    const code = stripped(`${prelude}
      export const C = <Row,>(props: any) => <List><Item ${attribute} /></List>;
    `);
    expect(code).toMatch(/new _P\$/);
    expect(code).not.toMatch(/\bRow\b/);
  });

  it("does not capture the type parameter of a generic function component", () => {
    const code = stripped(`${prelude}
      export function C<Row>(props: any) {
        return <List><Item f={(r: Row) => r} /></List>;
      }
    `);
    expect(code).toMatch(/new _P\$/);
    expect(code).not.toMatch(/\bRow\b/);
  });

  it.each([
    ["an interface", "interface Row { a: 1 }"],
    ["a type alias", "type Row = { a: 1 };"]
  ])("does not capture %s used in a parameter annotation", (_, declaration) => {
    const code = stripped(`${prelude}
      export function C(props: any) {
        ${declaration}
        return <List><Item f={(r: Row) => r} /></List>;
      }
    `);
    expect(code).toMatch(/new _P\$\d*\(\)/);
  });

  it.each(runtimeBindingCases)("still captures %s", (_, declaration, attribute, expected) => {
    const code = stripped(`${prelude}
      export function C(props: any) {
        ${declaration}
        return <List><Item ${attribute} /></List>;
      }
    `);
    expect(code).toMatch(expected);
  });

  it("keeps the literal when typeof names a reassigned binding", () => {
    const code = stripped(`${prelude}
      export function C(props: any) {
        let fallback = props.fallback;
        fallback = 2;
        return <List><Item value={props.v as typeof fallback} /></List>;
      }
    `);
    expect(code).not.toMatch(/new _P\$/);
    expect(code).toMatch(/get value\(\)/);
  });

  it("renders a generic component on the server", () => {
    const C = load(`${prelude}
      export const C = <Row,>(props: any) => (
        <List><Item each={props.rows} keyed={(row: Row) => props.key(row)} /></List>
      );
    `);
    const props = C({ rows: [1], key: row => row });
    expect(props.each).toEqual([1]);
    expect(props.keyed(2)).toBe(2);
  });
});

describe("SSR hoisted props type positions match babel-plugin", () => {
  it.each(typeParameterCases)("a type parameter used in %s", (_, attribute) => {
    const source = `${prelude}
      export const C = <Row,>(props: any) => <List><Item ${attribute} /></List>;
    `;
    expect(normalize(ssr(source))).toBe(normalize(babelSsr(source)));
  });

  it.each(runtimeBindingCases)("%s", (_, declaration, attribute) => {
    const source = `${prelude}
      export function C(props: any) {
        ${declaration}
        return <List><Item ${attribute} /></List>;
      }
    `;
    expect(normalize(ssr(source))).toBe(normalize(babelSsr(source)));
  });

  it("a reassigned binding read through typeof", () => {
    const source = `${prelude}
      export function C(props: any) {
        let fallback = props.fallback;
        fallback = 2;
        return <List><Item value={props.v as typeof fallback} /></List>;
      }
    `;
    expect(normalize(ssr(source))).toBe(normalize(babelSsr(source)));
  });
});
