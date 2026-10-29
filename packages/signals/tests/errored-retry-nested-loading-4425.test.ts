import { expect, it } from "vitest";
import {
  createErrorBoundary,
  createLoadingBoundary,
  createMemo,
  createRenderEffect,
  createRoot,
  flush,
  refresh,
  type Refreshable
} from "../src/index.js";

const tick = async () => {
  for (let i = 0; i < 4; i++) {
    await new Promise(r => setTimeout(r, 0));
    flush();
  }
};

for (const nested of [true, false])
  it(`#4425: an Errored recovers at its retry's landing (nested Loading: ${nested})`, async () => {
    const asks: { key: string; res: (v: any) => void }[] = [];
    const ask = (key: string) => new Promise<any>(res => asks.push({ key, res }));
    const land = async (key: string, v: any) => {
      const i = asks.findIndex(a => a.key === key);
      if (i < 0) throw new Error(`not asked ${key}: ${asks.map(a => a.key)}`);
      asks.splice(i, 1)[0].res(v);
      await tick();
    };
    let screen: unknown;
    let detail!: Refreshable<() => any>;
    const dispose = createRoot(d => {
      detail = createMemo(async () => {
        const res = await ask("detail");
        if (!res) throw new Error("not found");
        return res;
      });
      const out = createLoadingBoundary(
        () =>
          createErrorBoundary(
            () => {
              const title = createMemo(() => detail().title);
              const when = createMemo(() => detail());
              const cond = createMemo(when, { equals: (a, b) => !a === !b });
              const related = createMemo(() => {
                if (!cond()) return undefined;
                const hits = createMemo(() => ask(`search:${when().title}`));
                return createLoadingBoundary(
                  () => createMemo(() => hits().join("")),
                  () => "finding"
                );
              });
              return nested ? [title, related] : [title];
            },
            e => `err ${(e() as Error).message}`
          ),
        () => "loading"
      );
      createRenderEffect(
        () => {
          const walk = (v: unknown): string => {
            while (typeof v === "function") v = v();
            return Array.isArray(v) ? v.map(walk).join("") : String(v ?? "");
          };
          return walk(out());
        },
        v => void (screen = v)
      );
      return d;
    });
    try {
      await tick();
      expect(screen).toBe("loading");
      await land("detail", null);
      expect(screen).toBe("err not found");
      refresh(detail);
      flush();
      await tick();
      expect(screen).toBe("err not found");
      await land("detail", { title: "Crash" });
      expect(screen).toBe(nested ? "Crashfinding" : "Crash");
      if (nested) {
        await land("search:Crash", ["a", "b"]);
        expect(screen).toBe("Crashab");
      }
    } finally {
      dispose();
    }
  });
