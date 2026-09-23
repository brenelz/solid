import {
  createEffect,
  createMemo,
  createRoot,
  createSignal,
  flush,
  onCleanup
} from "../src/index.js";

afterEach(() => flush());

it("a memo cleanup that disposes the root during recomputation runs once (#3601)", () => {
  const [version, setVersion] = createSignal(0);
  const cleanup = vi.fn();

  createRoot(dispose => {
    const memo = createMemo(() => {
      const current = version();
      if (current === 0) {
        onCleanup(() => {
          cleanup();
          dispose();
        });
      }
      return current;
    });
    createEffect(memo, () => {});
  });
  flush();

  setVersion(1);
  flush();

  expect(cleanup).toHaveBeenCalledTimes(1);
});

it("an effect cleanup that disposes the root during rerun runs once", () => {
  const [version, setVersion] = createSignal(0);
  const cleanup = vi.fn();

  createRoot(dispose => {
    createEffect(
      () => {
        if (version() === 0) {
          onCleanup(() => {
            cleanup();
            dispose();
          });
        }
      },
      () => {}
    );
  });
  flush();

  setVersion(1);
  flush();

  expect(cleanup).toHaveBeenCalledTimes(1);
});

it("sibling cleanups on the same owner still run once each when one disposes the root", () => {
  const [version, setVersion] = createSignal(0);
  const first = vi.fn();
  const second = vi.fn();

  createRoot(dispose => {
    const memo = createMemo(() => {
      const current = version();
      if (current === 0) {
        onCleanup(first);
        onCleanup(() => {
          second();
          dispose();
        });
      }
      return current;
    });
    createEffect(memo, () => {});
  });
  flush();

  setVersion(1);
  flush();

  expect(second).toHaveBeenCalledTimes(1);
  expect(first).toHaveBeenCalledTimes(1);
});
