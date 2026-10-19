import {
  createMemo,
  createRenderEffect,
  createRoot,
  createSignal,
  flush,
  resetErrorHalt
} from "../src/index.js";

const tick = () => new Promise(r => setTimeout(r, 5));

afterEach(() => {
  resetErrorHalt();
  flush();
});

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
        { lazy: true, unobserved: () => results.push("unobserved") }
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
      const memo = createMemo(() => (runs++, sig()), {
        lazy: true,
        unobserved: () => results.push("unobserved")
      });
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
    expect(results).toEqual([0, -1, "unobserved", 1]);
  });

  test("a reader disposed outside a flush releases the memo on the spot", () => {
    const log: string[] = [];
    const [sig] = createSignal(0, { unobserved: () => log.push("sig") });
    const memo = createRoot(() =>
      createMemo(() => sig(), { lazy: true, unobserved: () => log.push("memo") })
    );
    const dispose = createRoot(d => {
      createRenderEffect(memo, () => {});
      return d;
    });
    flush();
    expect(log).toEqual([]);
    dispose();
    expect(log).toEqual(["memo", "sig"]);
  });

  test("a reader disposed after a halt releases the memo without a halted-update report", () => {
    const log: string[] = [];
    const [sig] = createSignal(0, { unobserved: () => log.push("sig") });
    const memo = createRoot(() => createMemo(() => sig(), { lazy: true }));
    const dispose = createRoot(d => {
      createRenderEffect(memo, () => {});
      return d;
    });
    const [boom, setBoom] = createSignal(false);
    createRoot(() => {
      createRenderEffect(boom, v => {
        if (v) throw new Error("boom");
      });
    });
    flush();
    setBoom(true);
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(() => flush()).toThrow("boom");
      errors.mockClear();
      dispose();
      expect(log).toEqual(["sig"]);
      expect(errors).not.toHaveBeenCalled();
    } finally {
      errors.mockRestore();
    }
  });
});
