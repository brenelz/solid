/**
 * @jsxImportSource @solidjs/web
 */
// #4030: the shell-end marker lands inside the document, before `</body>`,
// so a fully assembled document still ends with `</html>`. A shell without a
// `</body>` keeps the marker appended.
import { describe, expect, test } from "vitest";
import { getHydrationWriter, HydrationScript, renderToStream, renderToString } from "@solidjs/web";
import { createMemo, Loading } from "solid-js";

function collect(code: () => any, options?: any): Promise<{ chunks: string[]; html: string }> {
  return new Promise(resolve => {
    const chunks: string[] = [];
    renderToStream(code, options).pipe({
      write: (c: string) => chunks.push(c),
      end: () => resolve({ chunks, html: chunks.join("") })
    });
  });
}

const MARKER = `<script>_$HY.s[""]=1,_$HY.sw&&_$HY.sw("")</script>`;

const Doc = (props: { children: any }) => (
  <html>
    <head>
      <HydrationScript />
    </head>
    <body>
      <main>{props.children}</main>
    </body>
  </html>
);

describe("shell-end marker placement (#4030)", () => {
  test("renderToString splices the marker before </body> and ends with </html>", () => {
    const html = renderToString(() => (
      <Doc>
        <p>x</p>
      </Doc>
    ));
    expect(html.endsWith(`</main>${MARKER}</body></html>`)).toBe(true);
    expect(html.split(MARKER).length - 1).toBe(1);
    expect(html.indexOf("<!--xs-->")).toBeLessThan(html.indexOf(MARKER));
  });

  test("a stream shell with nothing pending ends with </html>", async () => {
    const { chunks } = await collect(() => (
      <Doc>
        <p>x</p>
      </Doc>
    ));
    expect(chunks[0].endsWith(`</main>${MARKER}</body></html>`)).toBe(true);
  });

  test("a stream shell with pending content keeps the marker after every shell node", async () => {
    const Late = () => {
      const v = createMemo(() => new Promise<string>(r => setTimeout(() => r("late"), 10)));
      return <span>{v()}</span>;
    };
    const { chunks, html } = await collect(() => (
      <Doc>
        <Loading fallback="...">
          <Late />
        </Loading>
      </Doc>
    ));
    expect(chunks[0].endsWith(`</main>${MARKER}</body></html>`)).toBe(true);
    expect(html.split(MARKER).length - 1).toBe(1);
    expect(html.indexOf(MARKER)).toBeLessThan(html.indexOf(">late<"));
  });

  test("a <HydrationScript /> after the body keeps the marker after the bootstrap and the records", () => {
    const Rec = () => {
      getHydrationWriter()!.write("k", 1);
      return <p>x</p>;
    };
    const html = renderToString(() => (
      <html>
        <head></head>
        <body>
          <Rec />
        </body>
        <HydrationScript />
      </html>
    ));
    expect(html.endsWith(`</html>${MARKER}`)).toBe(true);
    expect(html.split(MARKER).length - 1).toBe(1);
    const records = html.indexOf(`_$HY.r["k"]=1;</script><!--xs-->`);
    expect(records).toBeGreaterThan(-1);
    expect(records).toBeLessThan(html.indexOf(MARKER));
  });

  test("a shell without </body> keeps the marker appended", () => {
    const html = renderToString(() => (
      <>
        <HydrationScript />
        <p>x</p>
      </>
    ));
    expect(html.endsWith(`x</p>${MARKER}`)).toBe(true);
  });
});
