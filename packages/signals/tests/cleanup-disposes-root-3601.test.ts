import {
  createEffect,
  createMemo,
  createRoot,
  createSignal,
  flush,
  getOwner,
  onCleanup,
  runWithOwner
} from "../src/index.js";

afterEach(() => {
  flush();
  vi.restoreAllMocks();
});

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

it("a memo cleanup that disposes the root keeps unwind order: the rest of the memo's list, then the root's", () => {
  const [version, setVersion] = createSignal(0);
  const order: string[] = [];

  createRoot(dispose => {
    onCleanup(() => order.push("root"));
    const memo = createMemo(() => {
      const current = version();
      if (current === 0) {
        onCleanup(() => order.push("first"));
        onCleanup(() => {
          order.push("second");
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

  expect(order).toEqual(["second", "first", "root"]);
});

it("an effect cleanup that disposes the root keeps unwind order: the rest of the effect's list, then the root's", () => {
  const [version, setVersion] = createSignal(0);
  const order: string[] = [];

  createRoot(dispose => {
    onCleanup(() => order.push("root"));
    createEffect(
      () => {
        if (version() === 0) {
          onCleanup(() => order.push("first"));
          onCleanup(() => {
            order.push("second");
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

  expect(order).toEqual(["second", "first", "root"]);
});

it("a cleanup registered on an owner during its own teardown runs in that teardown", () => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  const order: string[] = [];

  const dispose = createRoot(dispose => {
    const owner = getOwner()!;
    onCleanup(() => order.push("first"));
    onCleanup(() => {
      order.push("second");
      runWithOwner(owner, () => onCleanup(() => order.push("late")));
    });
    return dispose;
  });
  dispose();

  expect(order).toEqual(["second", "late", "first"]);
});

it("a cleanup that throws during a rerun leaves the earlier registrations for the next teardown", () => {
  const [version, setVersion] = createSignal(0);
  const order: string[] = [];

  createRoot(() => {
    createEffect(
      () => {
        if (version() === 0) {
          onCleanup(() => order.push("a"));
          onCleanup(() => {
            order.push("b");
            throw new Error("boom");
          });
          onCleanup(() => order.push("c"));
        }
      },
      () => {}
    );
  });
  flush();

  setVersion(1);
  expect(() => flush()).toThrow("boom");
  expect(order).toEqual(["c", "b"]);

  setVersion(2);
  flush();
  expect(order).toEqual(["c", "b", "a"]);
});
