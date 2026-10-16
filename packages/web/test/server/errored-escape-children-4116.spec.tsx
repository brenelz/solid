/**
 * @jsxImportSource @solidjs/web
 */
import { describe, expect, test } from "vitest";
import { Errored, Loading, renderToString } from "@solidjs/web";

const XSS = `x <script>alert(1)</script> y & A > B "q"`;
const ESCAPED = `x &lt;script>alert(1)&lt;/script> y &amp; A > B "q"`;

function stripKeys(html: string): string {
  return html
    .replace(/ _hk=[^\s>]+/g, "")
    .replace(/<!--\$-->|<!--\/-->/g, "")
    .replace(/<script>[\s\S]*<\/script>$/, "");
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
