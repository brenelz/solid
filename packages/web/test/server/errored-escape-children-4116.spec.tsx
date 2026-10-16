/**
 * @jsxImportSource @solidjs/web
 */
import { describe, expect, test } from "vitest";
import { Errored, Loading, Show, renderToStream, renderToString } from "@solidjs/web";
import { createMemo } from "solid-js";

const XSS = `x <script>alert(1)</script> y & A > B "q"`;
const ESCAPED = `x &lt;script>alert(1)&lt;/script> y &amp; A > B "q"`;

function stripKeys(html: string): string {
  return html
    .replace(/ _hk=[^\s>]+/g, "")
    .replace(/<!--\$-->|<!--\/-->/g, "")
    .replace(/<script>\(self\.\$R=[\s\S]*<\/script>$/, "");
}

function asyncValue<T>(value: T, ms = 5): Promise<T> {
  return new Promise(r => setTimeout(() => r(value), ms));
}

describe("#4116: <Errored> escapes its children on the server", () => {
  test("string child", () => {
    expect(renderToString(() => <Errored fallback="">{XSS}</Errored>)).toBe(ESCAPED);
    expect(renderToString(() => <Loading fallback="">{XSS}</Loading>)).toBe(ESCAPED);
  });

  test("array of strings", () => {
    const html = renderToString(() => <Errored fallback="">{[XSS, XSS]}</Errored>);
    expect(html).toBe(`${ESCAPED}<!--!$-->${ESCAPED}`);
  });

  test("function returning a string", () => {
    const html = renderToString(() => <Errored fallback="">{(() => XSS) as any}</Errored>);
    expect(html).toBe(ESCAPED);
  });

  test("flow-control child", () => {
    expect(
      renderToString(() => (
        <Errored fallback="">
          <Show when={true}>{XSS}</Show>
        </Errored>
      ))
    ).toBe(ESCAPED);
  });

  test("async memo child resolves escaped on retry", async () => {
    function Content() {
      const data = createMemo(async () => asyncValue(XSS));
      return <Errored fallback="">{(() => data()) as any}</Errored>;
    }
    const html = await renderToStream(() => (
      <div>
        <Loading fallback="loading">
          <Content />
        </Loading>
      </div>
    ));
    expect(stripKeys(html)).toBe(`<div><!--!$-->${ESCAPED}</div>`);
    expect(html).not.toContain("<script>alert(1)</script>");
  });

  test("inside an element", () => {
    const errored = stripKeys(
      renderToString(() => (
        <div>
          <Errored fallback="">{XSS}</Errored>
        </div>
      ))
    );
    const loading = stripKeys(
      renderToString(() => (
        <div>
          <Loading fallback="">{XSS}</Loading>
        </div>
      ))
    );
    expect(errored).toBe(`<div>${ESCAPED}</div>`);
    expect(errored).toBe(loading);
  });

  test("element children and the fallback escape exactly once", () => {
    const Throws = (): never => {
      throw new Error("boom");
    };
    expect(
      stripKeys(
        renderToString(() => (
          <Errored fallback="">
            <p>{XSS}</p>
          </Errored>
        ))
      )
    ).toBe(`<p>${ESCAPED}</p>`);
    expect(
      stripKeys(
        renderToString(() => (
          <Errored fallback={XSS}>
            <Throws />
          </Errored>
        ))
      )
    ).toBe(ESCAPED);
  });
});
