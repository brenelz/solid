/**
 * @jsxImportSource @solidjs/web
 *
 * The template path of #3382 (#3773): on an intrinsic element without a
 * spread, both compilers wrote ` style="` / ` class="` and the closing quote
 * as template bytes around `ssrStyle(x)` / `ssrClassName(x)`, so a nullish
 * dynamic `style` or `class` rendered `style="" class=""` while `title` with
 * the same value was omitted. This suite's own JSX compiles with
 * `serverComponents: true`, whose whole-attribute hole never had the bug, so
 * the source under test is compiled here with the Babel plugin under plain
 * SSR options and evaluated against the runtime source.
 */
import { createRequire } from "node:module";
import { describe, expect, test } from "vitest";
import * as web from "@solidjs/web";

const require = createRequire(import.meta.url);
const babel = require("@babel/core");
const plugin = require.resolve("@solidjs/babel-plugin");

function compile(source: string): (props: Record<string, unknown>) => unknown {
  const { code } = babel.transformSync(source, {
    filename: "app.jsx",
    babelrc: false,
    configFile: false,
    plugins: [[plugin, { moduleName: "r-server", generate: "ssr", hydratable: true }]]
  });
  const body = code
    .replace(/^import \{ (\w+) as ([\w$]+) \} from "r-server";$/gm, "const $2 = web.$1;")
    .replace(/^export /gm, "");
  return new Function("web", `${body}\nreturn App;`)(web);
}

describe("compiled SSR nullish style/class (#3773)", () => {
  const App = compile(
    "export const App = p => <div style={p.style} class={p.class} title={p.title} />;"
  );
  const render = (props: Record<string, unknown>) => web.renderToString(() => App(props));

  test("undefined and null are omitted like title", () => {
    expect(render({ style: undefined, class: undefined, title: undefined })).toMatch(
      /^<div _hk=\w+><\/div>$/
    );
    expect(render({ style: null, class: null, title: null })).toMatch(/^<div _hk=\w+><\/div>$/);
  });

  test("present values still serialize in source order", () => {
    expect(render({ style: { color: "red" }, class: "a", title: "t" })).toMatch(
      /^<div _hk=\w+ style="color:red" class="a" title="t"><\/div>$/
    );
    expect(render({ style: "color: blue", class: ["a", { b: true, c: false }] })).toMatch(
      /^<div _hk=\w+ style="color: blue" class="a b"><\/div>$/
    );
  });

  test("object literals keep their inlined serialization", () => {
    const Inline = compile(
      "export const App = p => <div style={{ color: p.color }} class={{ on: p.on }} />;"
    );
    expect(web.renderToString(() => Inline({ color: "red", on: true }))).toMatch(
      /^<div _hk=\w+ style="color:red" class="on"><\/div>$/
    );
  });
});
