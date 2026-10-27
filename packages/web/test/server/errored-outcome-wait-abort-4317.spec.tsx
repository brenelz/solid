/**
 * @jsxImportSource @solidjs/web
 */
import { describe, expect, test } from "vitest";
import { renderToStream } from "@solidjs/web";
import { createMemo, Errored, Loading, NotReadyError } from "solid-js";

function deferred<T = void>() {
  let resolve!: (value: T) => void;
  let reject!: (error: any) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const settle = () => new Promise<void>(r => setImmediate(r));

describe("#4317 Errored fallback wait on an aborted request", () => {
  test("the fallback's pending hole is not re-pulled after the abort", async () => {
    let pulls = 0;
    let ready = false;
    const hint = deferred();
    const hole = () => {
      pulls++;
      if (!ready) throw new NotReadyError(hint.promise);
      return "HINT";
    };
    const user = deferred<string>();
    const App = () => {
      const data = createMemo(() => user.promise);
      return (
        <Errored fallback={() => <p>{hole()}</p>}>
          <Loading fallback="loading">
            <div>{data()}</div>
          </Loading>
        </Errored>
      );
    };
    const controller = new AbortController();
    const heard: string[] = [];
    const shell = deferred();
    let html = "";
    renderToStream(() => <App />, {
      signal: controller.signal,
      onCompleteShell: () => shell.resolve(),
      onError: (_: unknown, site: { handling: string }) => void heard.push(site.handling)
    }).pipe({
      write: (c: unknown) => void (html += String(c)),
      end: () => {}
    } as any);
    await shell.promise;
    expect(html).toContain("loading");

    user.reject(new Error("no user"));
    await settle();
    expect(pulls).toBe(1);
    expect(heard).toEqual(["fallback"]);

    controller.abort();
    ready = true;
    hint.resolve();
    await settle();

    expect(pulls).toBe(1);
    expect(html).not.toContain("HINT");
    expect(heard).toEqual(["fallback"]);
  });
});
