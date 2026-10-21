/**
 * @jsxImportSource @solidjs/web
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  configureServerErrors,
  renderToStream,
  Loading,
  type ServerErrorContext
} from "@solidjs/web";
import { createHydrationSerializer } from "@solidjs/web/serialization";
import { createMemo, onCleanup } from "solid-js";
import { sharedConfig } from "solid-js/internal";

function delay(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

/** Own the process's uncaught channels so an escape fails THIS test. */
async function watchEscapes(run: () => Promise<void>) {
  const events = ["uncaughtException", "unhandledRejection"] as const;
  const previous = events.map(e => process.listeners(e));
  events.forEach(e => process.removeAllListeners(e));
  const escaped: unknown[] = [];
  const capture = (reason: unknown) => escaped.push(reason);
  events.forEach(e => process.on(e, capture));
  try {
    await run();
    for (let turn = 0; turn < 4; turn++) await delay(20);
    return escaped;
  } finally {
    events.forEach((e, i) => {
      process.off(e, capture);
      for (const listener of previous[i]) process.on(e, listener as any);
    });
  }
}

function stream(code: () => any): Promise<string> {
  return new Promise(resolve => {
    const chunks: string[] = [];
    renderToStream(code).pipe({
      write(chunk: string) {
        chunks.push(String(chunk));
      },
      end() {
        resolve(chunks.join(""));
      }
    });
  });
}

let heard: { error: unknown; context: ServerErrorContext }[];
beforeEach(() => {
  heard = [];
  configureServerErrors({
    onError: (error, context) => {
      heard.push({ error, context });
    }
  });
});
afterEach(() => {
  configureServerErrors({ onError: undefined });
});

async function settles(code: () => any) {
  let settled = false;
  const escaped = await watchEscapes(async () => {
    const done = stream(code).then(() => {
      settled = true;
    });
    await Promise.race([done, delay(1000)]);
  });
  return { settled, escaped };
}

describe("renderToStream without a local onError (#4193)", () => {
  test.each([
    ["a value that will not serialize", () => new WeakMap(), false],
    [
      "a promise of a value that will not serialize",
      () => delay(20).then(() => new WeakMap()),
      false
    ],
    [
      "a deferStream promise of a value that will not serialize",
      () => delay(10).then(() => new WeakMap()),
      true
    ]
  ])("%s reaches the ambient hook and the render settles", async (_, value, deferStream) => {
    const { settled, escaped } = await settles(() => {
      (sharedConfig.context as any).serialize("lib:value", value(), deferStream);
      return <div>a</div>;
    });

    expect(settled).toBe(true);
    expect(escaped).toEqual([]);
    expect(heard.map(h => h.context)).toMatchObject([{ kind: "render", handling: "serialize" }]);
  });

  test("a cleanup that throws at the render's final dispose reaches the ambient hook", async () => {
    const escaped = await watchEscapes(async () => {
      await stream(() => {
        onCleanup(() => {
          throw new Error("cleanup threw");
        });
        return (
          <Loading fallback="waiting">
            {(() => {
              const value = createMemo(async () => {
                await delay(10);
                return "ready";
              });
              return <p>{value()}</p>;
            })()}
          </Loading>
        );
      });
    });

    expect(escaped).toEqual([]);
    expect(heard.map(h => (h.error as Error).message)).toEqual(["cleanup threw"]);
    expect(heard[0].context).toMatchObject({ kind: "render", handling: "failed" });
  });

  test("a serializer close() that throws at an abort reaches console.error when there is no hook at all", async () => {
    configureServerErrors({ onError: undefined });
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const controller = new AbortController();
    const serializer = (opts: any) => ({
      ...createHydrationSerializer(opts),
      close() {
        throw new Error("close threw");
      }
    });
    const escaped = await watchEscapes(async () => {
      const result = renderToStream(
        () => (
          <Loading fallback="waiting">
            {(() => {
              const value = createMemo(async () => new Promise<string>(() => {}));
              return <p>{value()}</p>;
            })()}
          </Loading>
        ),
        { signal: controller.signal, serializer } as any
      );
      const { readable, writable } = new TransformStream();
      result.pipeTo(writable).catch(() => {});
      await readable.getReader().read();
      expect(() => controller.abort()).not.toThrow();
    });
    const seen = error.mock.calls.map(c => (c[0] as Error).message);
    error.mockRestore();

    expect(escaped).toEqual([]);
    expect(seen).toEqual(["close threw"]);
  });
});
