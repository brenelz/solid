/** A `Show` fallback mounts a component that reads `isPending(project)` in
 * the tick a `refresh` signal refetches every async memo. */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  createLoadingBoundary,
  createMemo,
  createRenderEffect,
  createRoot,
  createSignal,
  flush,
  isPending,
  untrack
} from "../src/index.js";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

type Cell = { value: unknown };
const INNER = {};

/** `insert`'s child resolution: an accessor's nested functions. */
const resolve = (v: unknown): unknown => {
  while (typeof v === "function") v = (v as () => unknown)();
  return v;
};

/** `insert(parent, accessor)`: the outer effect, and the inner one it
 * creates to resolve an accessor that returned a function. */
function insert(accessor: () => unknown, cell: Cell) {
  createRenderEffect(
    () => {
      const v = accessor();
      if (typeof v !== "function") return v;
      createRenderEffect(
        () => resolve(v),
        inner => {
          cell.value = inner;
        }
      );
      return INNER;
    },
    v => {
      if (v !== INNER) cell.value = v;
    }
  );
}

/** `<Show when={when} fallback={fallback}>{children}</Show>`, created
 * untracked as createComponent does. */
function Show(when: () => unknown, children: () => unknown, fallback?: () => unknown) {
  return untrack(() => {
    const conditionValue = createMemo(when);
    const condition = createMemo(conditionValue, { equals: (a, b) => !a === !b, sync: true });
    return createMemo(() => (condition() ? children() : fallback?.()), {
      name: "value",
      sync: true
    });
  });
}

/** A component under `solid-js/refresh`: its body runs in a transparent memo. */
const component = (body: () => unknown) => createMemo(() => untrack(body), { transparent: true });

type Scope = { spinner: () => unknown; label: () => string };

function mount(fallback: (scope: Scope) => unknown) {
  const [refresh, setRefresh] = createSignal(0);
  const fetchAfter = <T>(value: T) => (refresh(), sleep(20).then(() => value));
  const [selected, setSelected] = createSignal(false);
  const slot: Cell = { value: undefined };
  const row: Cell = { value: undefined };
  const screen: Cell = { value: undefined };
  createRoot(() => {
    const project = createMemo(() => fetchAfter({ id: "a" }));
    const rows = createMemo(() => fetchAfter([{ id: project().id }]));
    const tags = createMemo(() => fetchAfter(["A", "B"]));
    const label = createMemo(() => (selected() ? "on" : "off"));
    const Spinner = (props: { on: () => boolean }) =>
      Show(
        () => props.on(),
        () => "updating"
      );
    const boundary = untrack(() =>
      createLoadingBoundary(
        () => {
          const show = Show(
            () => createMemo(() => tags().length > 0)() && selected(),
            () => "selected",
            () => fallback({ spinner: Spinner({ on: () => isPending(project) }), label })
          );
          insert(show, slot);
          insert(() => rows()[0].id, row);
          return "div";
        },
        () => "loading"
      )
    );
    insert(boundary, screen);
  });
  const save = () => {
    setRefresh(n => n + 1);
    setSelected(false);
  };
  return { slot, row, screen, setSelected, save };
}

describe("a pending indicator component mounted by a Show fallback during a refetch (#3969)", () => {
  test("save settles without the flush loop guard", async () => {
    const errors: unknown[] = [];
    const onError = (e: any) => errors.push(e?.reason ?? e);
    process.on("unhandledRejection", onError);
    process.on("uncaughtException", onError);
    try {
      const m = mount(({ spinner }) => component(() => spinner));
      await vi.advanceTimersByTimeAsync(60);
      expect(m.screen.value).toBe("div");
      expect(m.row.value).toBe("a");
      expect(m.slot.value).toBeUndefined();

      m.setSelected(true);
      flush();
      expect(m.slot.value).toBe("selected");

      m.save();
      await vi.advanceTimersByTimeAsync(20);
      expect(errors).toEqual([]);
      expect(m.slot.value).toBe("updating");

      await vi.advanceTimersByTimeAsync(40);
      expect(errors).toEqual([]);
      expect(m.row.value).toBe("a");
      expect(m.slot.value).toBeUndefined();
    } finally {
      process.off("unhandledRejection", onError);
      process.off("uncaughtException", onError);
    }
  });

  test("a fallback that reads a held memo and the lane before the born memo shows the staged label, once", async () => {
    let runs = 0;
    const m = mount(({ spinner, label }) => {
      const body = component(() => "body");
      return () => (runs++, [label(), spinner(), body()].filter(Boolean).join(" "));
    });
    await vi.advanceTimersByTimeAsync(60);
    m.setSelected(true);
    flush();
    expect(m.slot.value).toBe("selected");

    runs = 0;
    m.save();
    await vi.advanceTimersByTimeAsync(20);
    expect(m.slot.value).toBe("off updating body");
    expect(runs).toBe(1);

    await vi.advanceTimersByTimeAsync(40);
    expect(m.slot.value).toBe("off body");
    expect(m.row.value).toBe("a");
  });
});
