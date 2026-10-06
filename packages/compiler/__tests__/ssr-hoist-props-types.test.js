const esbuild = require("esbuild");
const { transform } = require("../index");

function ssr(source) {
  return transform(source, {
    filename: "generic.tsx",
    moduleName: "r-server",
    generate: "ssr",
    requireImportSource: false
  }).code;
}

// What the server runs: the compiled TSX with its types stripped.
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

describe("SSR hoisted props and type positions", () => {
  it.each([
    ["a parameter annotation", "f={(r: Row) => r}"],
    ["an as cast", "value={props.v as Row}"],
    ["a satisfies check", "value={props.v satisfies Row}"],
    ["a type argument", "value={id<Row>(props.v)}"]
  ])("does not capture a type parameter used in %s", (_, attribute) => {
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

  it("does not capture a value read only through typeof in a type position", () => {
    const code = stripped(`${prelude}
      export function C(props: any) {
        const fallback = props.fallback;
        return <List><Item value={props.v as typeof fallback} /></List>;
      }
    `);
    expect(code).toMatch(/new _P\$/);
    expect(code).not.toMatch(/new _P\$\d*\([^)]*fallback/);
  });

  it("still captures a value binding read inside the props", () => {
    const code = stripped(`${prelude}
      export function C(props: any) {
        const Row = props.row;
        return <List><Item f={(r: unknown) => Row(r)} /></List>;
      }
    `);
    expect(code).toMatch(/new _P\$\d*\(Row\)/);
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
