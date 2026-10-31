/**
 * @jsxImportSource @solidjs/web
 * @vitest-environment jsdom
 */
import { describe, expect, it } from "vitest";
import { Loading, Show, createEffect, createMemo, createSignal, flush } from "solid-js";
import { render } from "../src/index.js";

const wait = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

async function mountChild(held: boolean) {
  const runs: unknown[] = [];
  const [path, setPath] = createSignal("a");
  let setLocal!: (v: number) => void;

  function Child() {
    const [local, set] = createSignal(1);
    setLocal = set;
    const keys = createMemo(() => [local()]);
    createEffect(
      () => keys(),
      k => {
        runs.push(k);
      },
      { defer: true }
    );
    return <p>B</p>;
  }

  const el = document.createElement("div");
  const dispose = render(() => {
    const matched = createMemo(() => {
      const p = path();
      return p === "a" || !held ? p : wait(10).then(() => p);
    });
    return (
      <Loading fallback="root">
        <Show when={matched() === "b"} fallback={<p>A</p>}>
          <Child />
        </Show>
      </Loading>
    );
  }, el);
  flush();
  expect(el.textContent).toBe("A");

  setPath("b");
  flush();
  await wait(80);
  flush();
  expect(el.textContent).toBe("B");
  const atMount = [...runs];

  setLocal(2);
  flush();
  dispose();
  return { atMount, runs };
}

describe("#4543: a deferred effect in a child mounted by a held update", () => {
  it("skips its first run when the mount is not held", async () => {
    expect(await mountChild(false)).toEqual({ atMount: [], runs: [[2]] });
  });

  it("skips its first run when the mount is held by an async memo", async () => {
    expect(await mountChild(true)).toEqual({ atMount: [], runs: [[2]] });
  });
});
