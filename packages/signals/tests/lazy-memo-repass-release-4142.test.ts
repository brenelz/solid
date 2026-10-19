import { createMemo, createRenderEffect, createRoot, createSignal, flush } from "../src/index.js";

const tick = () => new Promise(r => setTimeout(r, 5));

afterEach(() => flush());

describe("#4142: a lazy memo dropped by a re-pass that reads it again", () => {
  test("an inline condition memo over an async lazy memo lands once", async () => {
    let runs = 0;
    const results: unknown[] = [];
    const [checked, setChecked] = createSignal(false);
    createRoot(() => {
      const memo = createMemo(
        async () => {
          runs++;
          await tick();
          return { a: true, b: runs };
        },
        { lazy: true }
      ) as unknown as () => { a: boolean; b: number };
      createRenderEffect(
        () => (checked() ? (createMemo(() => !!memo().a)() ? memo().b : -1) : null),
        v => {
          results.push(v);
        }
      );
    });
    flush();
    setChecked(true);
    flush();
    for (let i = 0; i < 4; i++) {
      await tick();
      flush();
    }
    expect(runs).toBe(1);
    expect(results).toEqual([null, 1]);
  });

  test("a lazy memo the re-pass stops reading is still released by the flush", () => {
    let runs = 0;
    const results: unknown[] = [];
    const [checked, setChecked] = createSignal(true);
    const [sig, setSig] = createSignal(0);
    createRoot(() => {
      const memo = createMemo(() => (runs++, sig()), { lazy: true });
      createRenderEffect(
        () => (checked() ? createMemo(() => memo())() : -1),
        v => {
          results.push(v);
        }
      );
    });
    flush();
    expect(runs).toBe(1);

    setChecked(false);
    flush();
    setSig(1);
    flush();
    expect(runs).toBe(1);

    setChecked(true);
    flush();
    expect(runs).toBe(2);
    expect(results).toEqual([0, -1, 1]);
  });
});
