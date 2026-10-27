/**
 * @jsxImportSource @solidjs/web
 *
 * #4317: a failed `<Loading>` waits for its `<Errored>`'s fallback holes
 * (#4306); an aborted request ends that wait instead of re-rendering the
 * fallback when the hole lands.
 */
import { describe, expect, test } from "vitest";
import { renderToStream } from "@solidjs/web";
import { createMemo, Errored, Loading, NotReadyError } from "solid-js";

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

describe("#4317 Errored fallback wait on an aborted request", () => {
  test("the fallback's pending hole is not re-pulled after the abort", async () => {
    let pulls = 0;
    let ready = false;
    let resolveHint!: () => void;
    const hint = new Promise<void>(r => (resolveHint = r));
    const hole = () => {
      pulls++;
      if (!ready) throw new NotReadyError(hint);
      return "HINT";
    };
    const App = () => {
      const user = createMemo(async (): Promise<string> => {
        await sleep(5);
        throw new Error("no user");
      });
      return (
        <Errored fallback={() => <p>{hole()}</p>}>
          <Loading fallback="loading">
            <div>{user()}</div>
          </Loading>
        </Errored>
      );
    };
    const controller = new AbortController();
    let html = "";
    renderToStream(() => <App />, { signal: controller.signal }).pipe({
      write: (c: unknown) => void (html += String(c)),
      end: () => {}
    } as any);
    await sleep(30);
    expect(html).toContain("loading");
    expect(pulls).toBe(1);

    controller.abort();
    await sleep(5);
    ready = true;
    resolveHint();
    await sleep(30);

    expect(pulls).toBe(1);
    expect(html).not.toContain("HINT");
  });
});
