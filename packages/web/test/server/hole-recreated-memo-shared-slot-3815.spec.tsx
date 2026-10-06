/**
 * @jsxImportSource @solidjs/web
 */
// #3815: a function hole whose component suspends during setup is the retry
// unit, so a retry while a slow memo's slot is still pending sets the
// component up again under the same owner ids. The re-created memo joins the
// slot's pending deferred; a cascading memo reading it must not retry forever
// once that deferred has settled.
import { describe, expect, test } from "vitest";
import { renderToStream } from "@solidjs/web";
import { createMemo } from "solid-js";

const delay = <T,>(value: T, ms: number) => new Promise<T>(r => setTimeout(() => r(value), ms));

function render(code: () => any) {
  return Promise.race([
    new Promise<string>((resolve, reject) => {
      let html = "";
      renderToStream(code, { onError: reject }).pipe({
        write: (c: unknown) => void (html += String(c)),
        end: () => resolve(html)
      } as any);
    }),
    delay("TIMEOUT", 2000)
  ]);
}

describe("#3815 a hole retry re-creates a component with cascading async memos", () => {
  test("the re-created memo settles with the shared slot and the stream ends", async () => {
    let setups = 0;
    let infoRuns = 0;
    function Page() {
      setups++;
      const user = createMemo(() => delay({ name: "Jon" }, 50));
      const info = createMemo(() => {
        if (++infoRuns > 1000) throw new Error(`info memo ran ${infoRuns} times`);
        user();
        return delay(["a", "b"], 50);
      });
      const ready = createMemo(() => delay(true, 10));
      ready();
      return (
        <h1>
          {user().name} {info().length}
        </h1>
      );
    }
    const html = await render(() => <main>{(() => <Page />) as any}</main>);
    expect(html).toMatch(
      /<main[^>]*><h1[^>]*><!--\$-->Jon<!--\/--> <!--\$-->2<!--\/--><\/h1><\/main>/
    );
    expect(html).toContain('"a","b"');
    expect(setups).toBe(2);
    expect(infoRuns).toBeLessThan(10);
  });
});
