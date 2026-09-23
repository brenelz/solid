import {
  DEV,
  createEffect,
  createMemo,
  createRoot,
  createSignal,
  flush,
  getOwner,
  isDisposed,
  refresh
} from "../src/index.js";

afterEach(() => flush());

describe("#3621 memo disposing its owner during recompute", () => {
  it("stays disposed and refresh() does not rerun it (issue repro)", () => {
    let n!: () => number;
    let setN!: (v: number) => void;
    let nNode!: any;
    let memo!: () => number;
    let memoOwner!: any;
    let runs = 0;

    createRoot(dispose => {
      [n, setN] = createSignal(0);
      nNode = DEV!.getSignals(getOwner()!)[0];
      memo = createMemo(() => {
        memoOwner = getOwner();
        runs++;
        if (n() === 1) dispose();
        return n();
      });
      createEffect(memo, () => {});
    });
    flush();
    expect(runs).toBe(1);

    setN(1);
    flush();
    expect(runs).toBe(2);
    expect(isDisposed(memoOwner)).toBe(true);
    expect(DEV!.getObservers(nNode)).toHaveLength(0);

    refresh(memo);
    flush();
    expect(runs).toBe(2);

    setN(2);
    flush();
    expect(runs).toBe(2);
  });

  it("effect twin: an effect disposing its root in its compute phase stays disposed", () => {
    const [n, setN] = createSignal(0);
    let effectOwner!: any;
    let computes = 0;
    let effects = 0;

    createRoot(dispose => {
      createEffect(
        () => {
          effectOwner = getOwner();
          computes++;
          if (n() === 1) dispose();
          return n();
        },
        () => {
          effects++;
        }
      );
    });
    flush();
    expect(computes).toBe(1);
    expect(effects).toBe(1);

    setN(1);
    flush();
    expect(computes).toBe(2);
    expect(effects).toBe(1);
    expect(isDisposed(effectOwner)).toBe(true);

    setN(2);
    flush();
    expect(computes).toBe(2);
    expect(effects).toBe(1);
  });
});
