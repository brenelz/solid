/**
 * @jsxImportSource @solidjs/web
 */
import { describe, expect, test } from "vitest";
import { Loading, renderToStream } from "@solidjs/web";
import { createMemo } from "solid-js";
import { renderServerComponent } from "../../frames/src/frame-sink.js";

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

  test("a re-created memo joining a flattening stream settles with its first yield", async () => {
    let setups = 0;
    let infoRuns = 0;
    let shared: Promise<any> | undefined;
    const source = () =>
      (shared ||= Promise.resolve(
        (async function* () {
          yield await delay({ name: "Jon" }, 50);
        })()
      ));
    function Page() {
      setups++;
      const user = createMemo(() => source());
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
    expect(html).toMatch(/<h1[^>]*><!--\$-->Jon<!--\/--> <!--\$-->2<!--\/--><\/h1>/);
    expect(setups).toBe(2);
    expect(infoRuns).toBeLessThan(10);
  });

  test("a re-created loading-value memo in a frame render advances when the slot settles", async () => {
    let setups = 0;
    let fetches = 0;
    const names: string[] = [];
    let midway: string[] = [];
    const ServerComp = (props: any) => {
      function Page() {
        if (++setups === 1) setTimeout(() => (midway = names.slice()), 85);
        const user = createMemo(
          () => (++fetches === 1 ? delay("Jon", 50) : new Promise<string>(() => {})),
          { loadingValue: "loading" }
        );
        const ready = createMemo(() => delay(true, 10));
        ready();
        return <props.row name={user()} />;
      }
      const hold = createMemo(() => delay("done", 120));
      return (
        <main>
          {(() => <Page />) as any}
          <Loading fallback={<span>…</span>}>
            <p>{hold()}</p>
          </Loading>
        </main>
      );
    };
    await new Promise<void>(resolve =>
      renderServerComponent(ServerComp, { frame: { id: "f" } }).pipe({
        write: (c: any) => {
          if (c.type === "slot" && c.key === "row#0") names.push(c.args.name);
        },
        end: resolve
      })
    );
    expect(setups).toBe(2);
    expect(names[0]).toBe("loading");
    expect(midway).toEqual(["loading", "Jon"]);
    expect(names[names.length - 1]).toBe("Jon");
  });
});
