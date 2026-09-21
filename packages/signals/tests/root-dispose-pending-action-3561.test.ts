import {
  action,
  createEffect,
  createMemo,
  createRoot,
  createSignal,
  flush,
  getOwner,
  isDisposed,
  onCleanup,
  type Owner
} from "../src/index.js";

afterEach(() => flush());

it("retires a memo's parked frame when its root is disposed under a pending action", async () => {
  const cleanups: string[] = [];
  let setVisible!: (v: boolean) => void;
  let resolve!: () => void;
  const pending = new Promise<void>(r => (resolve = r));

  const dispose = createRoot(d => {
    const [visible, _setVisible] = createSignal(true);
    setVisible = _setVisible;
    const branch = createMemo(() => {
      if (!visible()) {
        onCleanup(() => cleanups.push("live"));
        return false;
      }
      onCleanup(() => cleanups.push("parked"));
      createEffect(
        () => visible(),
        () => () => cleanups.push("parked child")
      );
      return true;
    });
    createEffect(branch, () => {});
    return d;
  });
  flush();

  const change = action(function* () {
    setVisible(false);
    yield pending;
  }) as () => Promise<void>;
  const changed = change();
  flush();
  expect(cleanups).toEqual([]);

  dispose();
  flush();
  expect(cleanups).toEqual(["parked child", "parked", "live"]);

  resolve();
  await changed;
  flush();
  expect(cleanups).toEqual(["parked child", "parked", "live"]);
});

it("marks the memo disposed and drops its parked frame when a parked cleanup throws", async () => {
  let frameCleanups = 0;
  let childCleanups = 0;
  let memoRuns = 0;
  let memo!: Owner;
  let setVisible!: (v: boolean) => void;
  let resolve!: () => void;
  const pending = new Promise<void>(r => (resolve = r));

  const dispose = createRoot(d => {
    const [visible, _setVisible] = createSignal(true);
    setVisible = _setVisible;
    const branch = createMemo(() => {
      memo = getOwner()!;
      memoRuns++;
      if (!visible()) return false;
      onCleanup(() => {
        frameCleanups++;
        throw new Error("parked boom");
      });
      createEffect(
        () => visible(),
        () => () => childCleanups++
      );
      return true;
    });
    createEffect(branch, () => {});
    return d;
  });
  flush();

  const change = action(function* () {
    setVisible(false);
    yield pending;
  }) as () => Promise<void>;
  const changed = change();
  flush();
  expect(memoRuns).toBe(2);

  expect(() => dispose()).toThrow("parked boom");
  flush();
  expect(isDisposed(memo)).toBe(true);
  expect(frameCleanups).toBe(1);
  expect(childCleanups).toBe(1);

  resolve();
  await changed;
  flush();
  setVisible(true);
  flush();
  expect(frameCleanups).toBe(1);
  expect(childCleanups).toBe(1);
  expect(memoRuns).toBe(2);
});
