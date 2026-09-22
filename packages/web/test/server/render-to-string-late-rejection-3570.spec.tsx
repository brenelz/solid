/**
 * @jsxImportSource @solidjs/web
 */
import { describe, expect, test } from "vitest";
import { Errored, Loading, renderToStream, renderToString } from "@solidjs/web";
import { createMemo, createProjection, createStore } from "solid-js";

function delay(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

async function failLater(): Promise<never> {
  await delay(5);
  throw new Error("fetch failed");
}

async function rejectionsEscaping<T>(run: () => T | PromiseLike<T>) {
  const previous = process.listeners("unhandledRejection");
  process.removeAllListeners("unhandledRejection");
  const escaped: unknown[] = [];
  const capture = (reason: unknown) => escaped.push(reason);
  process.on("unhandledRejection", capture);
  try {
    const value = await run();
    await delay(30);
    return { value, escaped };
  } finally {
    process.off("unhandledRejection", capture);
    for (const listener of previous) process.on("unhandledRejection", listener as any);
  }
}

function Guarded(props: { children: any }) {
  return (
    <Errored fallback="error">
      <Loading fallback="loading">{props.children}</Loading>
    </Errored>
  );
}

describe("renderToString: an async source that rejects after the render (#3570)", () => {
  test("a memo that is never read", async () => {
    const App = () => {
      createMemo(failLater);
      return <div>static</div>;
    };
    const { value, escaped } = await rejectionsEscaping(() => renderToString(() => <App />));
    expect(value).toContain("static");
    expect(escaped).toEqual([]);
  });

  test("a memo read under Loading", async () => {
    const App = () => {
      const data = createMemo(failLater);
      return <Loading fallback="loading">{data()}</Loading>;
    };
    const { value, escaped } = await rejectionsEscaping(() => renderToString(() => <App />));
    expect(value).toContain("loading");
    expect(escaped).toEqual([]);
  });

  test("a memo read under Errored around Loading", async () => {
    const App = () => {
      const data = createMemo(failLater);
      return <Guarded>{data()}</Guarded>;
    };
    const { value, escaped } = await rejectionsEscaping(() => renderToString(() => <App />));
    expect(value).toContain("loading");
    expect(escaped).toEqual([]);
  });

  test("a store derived from a rejecting promise", async () => {
    const App = () => {
      const [store] = createStore<{ n: number }>(failLater, { n: 0 });
      return (
        <Guarded>
          <p>{store.n}</p>
        </Guarded>
      );
    };
    const { value, escaped } = await rejectionsEscaping(() => renderToString(() => <App />));
    expect(value).toContain("loading");
    expect(escaped).toEqual([]);
  });

  test("a projection derived from a rejecting promise", async () => {
    const App = () => {
      const store = createProjection<{ n: number }>(failLater, { n: 0 });
      return (
        <Guarded>
          <p>{store.n}</p>
        </Guarded>
      );
    };
    const { value, escaped } = await rejectionsEscaping(() => renderToString(() => <App />));
    expect(value).toContain("loading");
    expect(escaped).toEqual([]);
  });

  test("an async generator that throws before its first yield", async () => {
    const App = () => {
      const data = createMemo(async function* () {
        await failLater();
        yield "never";
      });
      return <Guarded>{data()}</Guarded>;
    };
    const { value, escaped } = await rejectionsEscaping(() => renderToString(() => <App />));
    expect(value).toContain("loading");
    expect(escaped).toEqual([]);
  });

  test("renderToStream still hands the rejection to the Errored boundary", async () => {
    const App = () => {
      const data = createMemo(failLater);
      return (
        <Errored fallback={(e: any) => <span>err: {e().message}</span>}>
          <Loading fallback="loading">{data()}</Loading>
        </Errored>
      );
    };
    const { value, escaped } = await rejectionsEscaping(() =>
      renderToStream(() => <App />, { onError() {} })
    );
    expect(value).toContain("fetch failed");
    expect(escaped).toEqual([]);
  });
});
