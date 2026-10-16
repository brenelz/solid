/**
 * @jsxImportSource @solidjs/web
 * @vitest-environment jsdom
 */
import { describe, expect, test } from "vitest";
import { createSignal, Errored, flush } from "solid-js";
import { render } from "../src/index.js";

describe("#4110: a direct write replaces a writable memo's error under Errored", () => {
  test("the boundary leaves its fallback for the written value", () => {
    const div = document.createElement("div");
    let setValue!: (v: number) => void;
    let runs = 0;

    const dispose = render(() => {
      const [value, write] = createSignal<number>(() => {
        runs++;
        throw new Error("boom");
      });
      setValue = write;
      return (
        <Errored fallback={e => <div>error:{String((e() as Error).message)}</div>}>
          <div>value:{value()}</div>
        </Errored>
      );
    }, div);
    flush();
    expect(div.textContent).toBe("error:boom");

    setValue(2);
    flush();
    expect(div.textContent).toBe("value:2");
    expect(runs).toBe(1);
    dispose();
  });
});
