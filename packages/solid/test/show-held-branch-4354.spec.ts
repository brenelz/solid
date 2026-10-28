import { afterEach, expect, test, vi } from "vitest";
import {
  createLoadingBoundary,
  createMemo,
  createRenderEffect,
  createRoot,
  createSignal,
  flush,
  Match,
  resetErrorHalt,
  Show,
  Switch
} from "../src/index.js";

afterEach(() => {
  resetErrorHalt();
  vi.restoreAllMocks();
});

async function settle() {
  for (let i = 0; i < 3; i++) {
    await Promise.resolve();
    flush();
  }
}

for (const kind of ["Show", "Switch"] as const) {
  test(`${kind}: an on-screen branch re-run during the hold that closes it does not halt`, async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const [open, setOpen] = createSignal(true);
    const [fmt, setFmt] = createSignal("ru");
    const resolvers: ((v: string) => void)[] = [];
    const screen: Record<string, unknown> = {};
    let dispose!: () => void;
    createRoot(d => {
      dispose = d;
      const data = createMemo(() => {
        const o = open();
        return new Promise<string>(r => resolvers.push(() => r(`data-${o}`)));
      });
      const when = () => open() && "sel";
      const child = (v: () => string) => {
        createRenderEffect(
          () => `${fmt()}:${v()}`,
          t => void (screen.p = t)
        );
        return "branch";
      };
      const view =
        kind === "Show"
          ? Show({
              get when() {
                return when();
              },
              fallback: "closed",
              children: child
            })
          : Switch({
              fallback: "closed",
              get children() {
                return Match({
                  get when() {
                    return when();
                  },
                  children: child
                }) as any;
              }
            });
      createRenderEffect(
        () => (view as any)(),
        v => void (screen.view = v)
      );
      createRenderEffect(
        createLoadingBoundary(
          () => data(),
          () => "wait"
        ),
        v => void (screen.data = v)
      );
    });
    flush();
    resolvers.shift()!("");
    await settle();
    expect(screen).toEqual({ view: "branch", p: "ru:sel", data: "data-true" });

    setOpen(false);
    flush();
    expect(screen).toEqual({ view: "branch", p: "ru:sel", data: "data-true" });

    setFmt("en");
    flush();
    expect(screen).toEqual({ view: "branch", p: "en:sel", data: "data-true" });

    resolvers.shift()!("");
    await settle();
    expect(screen.view).toBe("closed");
    expect(screen.data).toBe("data-false");
    expect(error.mock.calls.map(c => String(c[0]).split("\n")[0])).toEqual([]);
    dispose();
  });
}

for (const kind of ["Show", "Switch"] as const) {
  test(`${kind}: an ownerless read of the narrowed accessor during the hold serves the on-screen value`, async () => {
    const [open, setOpen] = createSignal(true);
    const resolvers: ((v: string) => void)[] = [];
    const screen: Record<string, unknown> = {};
    let accessor!: () => string;
    let dispose!: () => void;
    createRoot(d => {
      dispose = d;
      const data = createMemo(() => {
        const o = open();
        return new Promise<string>(r => resolvers.push(() => r(`data-${o}`)));
      });
      const when = () => open() && "sel";
      const child = (v: () => string) => {
        accessor = v;
        return "branch";
      };
      const view =
        kind === "Show"
          ? Show({
              get when() {
                return when();
              },
              fallback: "closed",
              children: child
            })
          : Switch({
              fallback: "closed",
              get children() {
                return Match({
                  get when() {
                    return when();
                  },
                  children: child
                }) as any;
              }
            });
      createRenderEffect(
        () => (view as any)(),
        v => void (screen.view = v)
      );
      createRenderEffect(
        createLoadingBoundary(
          () => data(),
          () => "wait"
        ),
        v => void (screen.data = v)
      );
    });
    flush();
    resolvers.shift()!("");
    await settle();
    expect(screen).toEqual({ view: "branch", data: "data-true" });

    setOpen(false);
    flush();
    expect(screen).toEqual({ view: "branch", data: "data-true" });
    expect(await new Promise(r => setTimeout(() => r(accessor()), 0))).toBe("sel");

    resolvers.shift()!("");
    await settle();
    expect(screen).toEqual({ view: "closed", data: "data-false" });
    expect(() => accessor()).toThrow(new RegExp(`<${kind === "Show" ? "Show" : "Match"}>`));
    dispose();
  });
}

test("Show: a binding mounted by a held pass re-runs on a live write during the hold", async () => {
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  const [selected, setSelected] = createSignal<{ name: string } | null>(null);
  const [suffix, setSuffix] = createSignal("");
  const answer = Promise.withResolvers<number>();
  const screen: Record<string, unknown> = {};
  let dispose!: () => void;
  createRoot(d => {
    dispose = d;
    const count = createMemo(() => (selected() ? answer.promise : 0));
    const view = Show({
      get when() {
        return selected();
      },
      fallback: "choose",
      children: (item: () => { name: string }) => {
        createRenderEffect(
          () => item().name + suffix(),
          v => void (screen.label = v)
        );
        createRenderEffect(
          () => count(),
          v => void (screen.count = v)
        );
        return "section";
      }
    });
    createRenderEffect(
      createLoadingBoundary(
        () => (view as any)(),
        () => "wait"
      ),
      v => void (screen.view = v)
    );
  });
  flush();
  expect(screen).toEqual({ view: "choose" });

  setSelected({ name: "Example" });
  flush();
  setSuffix("!");
  flush();
  expect(screen.view).toBe("choose");

  answer.resolve(1);
  await settle();
  expect(screen).toEqual({ view: "section", label: "Example!", count: 1 });
  expect(error.mock.calls.map(c => String(c[0]).split("\n")[0])).toEqual([]);
  dispose();
});

test("Show: a child body's direct read of the narrowed accessor warns once", () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  const [name, setName] = createSignal<string | false>(false);
  let seen: unknown;
  let dispose!: () => void;
  createRoot(d => {
    dispose = d;
    const view = Show({
      get when() {
        return name();
      },
      children: (n: () => string) => {
        seen = n();
        return "branch";
      }
    });
    createRenderEffect(
      () => (view as any)(),
      () => {}
    );
  });
  flush();
  setName("x");
  flush();
  expect(seen).toBe("x");
  expect(warn.mock.calls.map(c => String(c[0]).split("\n")[0])).toEqual([
    expect.stringMatching(
      /^\[STRICT_READ_UNTRACKED\] Reactive value "condition value" read directly in <Show>/
    )
  ]);
  dispose();
});
