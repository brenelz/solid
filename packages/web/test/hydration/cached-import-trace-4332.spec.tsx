/**
 * @jsxImportSource @solidjs/web
 * @vitest-environment jsdom
 *
 * #4332: hydration traces an adopted async memo with the global Promise
 * swapped for a stub. User code that keeps a promise made under the trace (a
 * module-level import cache built from the global Promise, as Vite's
 * __vitePreload is) must still get a promise that settles when another
 * component consumes it after hydration.
 */
import { afterEach, describe, expect, test } from "vitest";
import { createMemo, flush, isHydrating } from "solid-js";
import { hydrate, render } from "@solidjs/web";

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

describe("#4332: a promise cached under the hydration trace", () => {
  let dispose: (() => void) | undefined;
  let container: HTMLDivElement | undefined;
  afterEach(async () => {
    dispose?.();
    dispose = undefined;
    await sleep(0);
    container?.remove();
    delete (globalThis as any)._$HY;
  });

  test("settles when a later component consumes it", async () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    // renderToStream output for App below: the memo settled to "ready" on
    // the server and is serialized under its hydration id.
    container.innerHTML = "ready";
    const served: any = Promise.resolve("ready");
    served.s = 1;
    served.v = "ready";
    (globalThis as any)._$HY = {
      events: [],
      completed: new WeakSet(),
      r: { "0": served },
      fe() {}
    };

    const loads = new Map<string, Promise<{ catalog: string }>>();
    let imports = 0;
    const load = (key: string) => {
      let p = loads.get(key);
      if (!p)
        loads.set(
          key,
          (p = Promise.resolve().then(() => {
            imports++;
            return { catalog: "ok" };
          }))
        );
      return p;
    };

    function App() {
      const data = createMemo(async () => {
        await load("x");
        return "ready";
      });
      return <>{data()}</>;
    }

    dispose = hydrate(() => <App />, container);
    flush();
    expect(container.textContent).toBe("ready");
    await sleep(10);
    flush();
    expect(isHydrating()).toBe(false);
    expect(imports).toBe(0);
    dispose();
    dispose = undefined;

    function Next() {
      const data = createMemo(() => load("x").then(m => m.catalog));
      return <>{data()}</>;
    }
    const next = document.createElement("div");
    document.body.appendChild(next);
    dispose = render(() => <Next />, next);
    await sleep(10);
    flush();
    expect(next.textContent).toBe("ok");
    expect(imports).toBe(1);
    next.remove();
  });
});
