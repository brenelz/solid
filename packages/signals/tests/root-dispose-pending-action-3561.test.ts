import {
  action,
  createEffect,
  createMemo,
  createRoot,
  createSignal,
  flush,
  onCleanup
} from "../src/index.js";

afterEach(() => flush());

it("retires a memo's parked frame when its root is disposed under a pending action", async () => {
  let frameCleanups = 0;
  let childCleanups = 0;
  let setVisible!: (v: boolean) => void;
  let resolve!: () => void;
  const pending = new Promise<void>(r => (resolve = r));

  const dispose = createRoot(d => {
    const [visible, _setVisible] = createSignal(true);
    setVisible = _setVisible;
    const branch = createMemo(() => {
      if (!visible()) return false;
      onCleanup(() => frameCleanups++);
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
  expect(frameCleanups).toBe(0);
  expect(childCleanups).toBe(0);

  dispose();
  flush();
  expect(frameCleanups).toBe(1);
  expect(childCleanups).toBe(1);

  resolve();
  await changed;
  flush();
  expect(frameCleanups).toBe(1);
  expect(childCleanups).toBe(1);
});
