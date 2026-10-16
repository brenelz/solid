import { createEffect, createMemo, createRoot, createSignal, flush } from "../src/index.js";

describe("a direct write replaces a writable memo's error (#4110)", () => {
  it("the accessor serves the written value instead of the old error", () => {
    let runs = 0;
    const [value, setValue] = createSignal<number>(() => {
      runs++;
      throw new Error("boom");
    });
    flush();
    expect(() => value()).toThrow("boom");

    setValue(2);
    expect(() => value()).toThrow("boom");
    flush();
    expect(value()).toBe(2);
    expect(runs).toBe(1);
  });

  it("an effect sees the written value after its error callback", () => {
    const seen: unknown[] = [];
    let setValue!: (v: number) => void;
    const dispose = createRoot(stop => {
      const [value, write] = createSignal<number>(() => {
        throw new Error("boom");
      });
      setValue = write;
      createEffect(value, {
        effect: v => {
          seen.push(v);
        },
        error: e => {
          seen.push((e as Error).message);
        }
      });
      return stop;
    });
    flush();
    expect(seen).toEqual(["boom"]);

    setValue(2);
    flush();
    expect(seen).toEqual(["boom", 2]);
    dispose();
  });

  it("writing the last good value back recovers a memo that failed since", () => {
    const [fail, setFail] = createSignal(false);
    const [value, setValue] = createSignal<number>(() => {
      if (fail()) throw new Error("boom");
      return 1;
    });
    const doubled = createMemo(() => value() * 2);
    flush();
    expect(doubled()).toBe(2);

    setFail(true);
    flush();
    expect(() => value()).toThrow("boom");
    expect(() => doubled()).toThrow("boom");

    setValue(1);
    flush();
    expect(value()).toBe(1);
    expect(doubled()).toBe(2);
  });

  it("a source change after the write re-derives with the written value as prev", () => {
    const [fail, setFail] = createSignal(true);
    const previous: (number | undefined)[] = [];
    const [value, setValue] = createSignal<number>(prev => {
      previous.push(prev);
      if (fail()) throw new Error("boom");
      return (prev ?? 0) + 1;
    });
    flush();
    setValue(5);
    flush();
    expect(value()).toBe(5);

    setFail(false);
    flush();
    expect(previous.at(-1)).toBe(5);
    expect(value()).toBe(6);
  });

  it("an error found in the flush that carries the write outranks it", () => {
    const [fail, setFail] = createSignal(false);
    const previous: (number | undefined)[] = [];
    const [value, setValue] = createSignal<number>(prev => {
      previous.push(prev);
      if (fail()) throw new Error("boom");
      return 1;
    });
    const doubled = createMemo(() => value() * 2);
    flush();
    expect(doubled()).toBe(2);

    setValue(5);
    setFail(true);
    flush();
    expect(previous.at(-1)).toBe(5);
    expect(() => value()).toThrow("boom");
    expect(() => doubled()).toThrow("boom");
  });

  it("an effect gets the error found in the flush that carries the write", () => {
    const seen: unknown[] = [];
    let setValue!: (v: number) => void;
    let setFail!: (v: boolean) => void;
    const dispose = createRoot(stop => {
      const [fail, writeFail] = createSignal(false);
      setFail = writeFail;
      const [value, write] = createSignal<number>(() => {
        if (fail()) throw new Error("boom");
        return 1;
      });
      setValue = write;
      createEffect(value, {
        effect: v => {
          seen.push(v);
        },
        error: e => {
          seen.push((e as Error).message);
        }
      });
      return stop;
    });
    flush();
    expect(seen).toEqual([1]);

    setValue(5);
    setFail(true);
    flush();
    expect(seen).toEqual([1, "boom"]);
    dispose();
  });

  it("the write's commit keeps the dependencies of the pass that threw", () => {
    const [a, setA] = createSignal(1);
    const [b, setB] = createSignal(10);
    let runs = 0;
    const [value, setValue] = createSignal<number>(() => {
      runs++;
      const x = a();
      if (x < 0) throw new Error("neg");
      return x + b();
    });
    flush();
    expect(value()).toBe(11);

    setA(-1);
    flush();
    expect(() => value()).toThrow("neg");

    setValue(5);
    flush();
    expect(value()).toBe(5);

    const before = runs;
    setB(20);
    flush();
    expect(runs).toBe(before + 1);
    expect(() => value()).toThrow("neg");
  });
});
