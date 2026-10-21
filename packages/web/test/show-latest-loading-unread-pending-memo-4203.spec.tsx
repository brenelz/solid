/**
 * @jsxImportSource @solidjs/web
 * @vitest-environment jsdom
 *
 * #4203: a `<Loading>` that `<Show when={latest(() => gate()) ?? gate()}>`
 * mounts reveals its content although a memo nothing reads stays pending
 * under it: the component writes an `ownedWrite` signal during its mount and
 * then creates a memo that reads it and never settles.
 */
import { expect, test } from "vitest";
import { Loading, Show, createMemo, createSignal, flush, latest } from "solid-js";
import { render } from "../src/index.js";

async function settle() {
  for (let i = 0; i < 3; i++) {
    await new Promise(r => setTimeout(r, 0));
    flush();
  }
}

function Child() {
  const [version, setVersion] = createSignal(0, { ownedWrite: true });
  setVersion(1);
  createMemo(() => {
    version();
    return new Promise(() => {});
  });
  return "CHILD";
}

test("a verdict-mounted Loading reveals beside an unread pending memo (#4203)", async () => {
  const root = document.createElement("div");
  const dispose = render(() => {
    const gate = createMemo(async () => "x");
    return (
      <Loading fallback="OUTER">
        <Show when={latest(() => gate()) ?? gate()}>
          <Loading fallback="INNER">
            <Child />
          </Loading>
        </Show>
      </Loading>
    );
  }, root);
  flush();
  expect(root.textContent).toBe("OUTER");

  await settle();
  expect(root.textContent).toBe("CHILD");
  dispose();
});
