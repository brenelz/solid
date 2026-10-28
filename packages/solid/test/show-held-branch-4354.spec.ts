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
