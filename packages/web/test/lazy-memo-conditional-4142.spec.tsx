/**
 * @jsxImportSource @solidjs/web
 * @vitest-environment jsdom
 */

import { expect, test } from "vitest";
import { createMemo, createSignal, flush } from "solid-js";
import { render } from "@solidjs/web";

const delay = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

test("#4142: a lazy memo read on both sides of a conditional computes once", async () => {
  let runs = 0;
  let setChecked!: (v: boolean) => void;

  function App() {
    const [checked, _setChecked] = createSignal(false);
    setChecked = _setChecked;
    const data = createMemo(
      async () => {
        runs++;
        await delay(10);
        return { a: true, b: "loaded" };
      },
      { lazy: true }
    );
    return <p>{checked() ? (data().a ? data().b : "no a") : "off"}</p>;
  }

  const div = document.createElement("div");
  document.body.appendChild(div);
  const dispose = render(() => <App />, div);
  flush();
  expect(div.textContent).toBe("off");

  setChecked(true);
  flush();
  for (let i = 0; i < 5; i++) {
    await delay(15);
    flush();
  }
  expect(runs).toBe(1);
  expect(div.textContent).toBe("loaded");

  dispose();
  div.remove();
});
