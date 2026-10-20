/**
 * @jsxImportSource @solidjs/web
 * @vitest-environment jsdom
 */
import { expect, test } from "vitest";
import { Loading, Show, action, createSignal, flush, latest } from "solid-js";
import { render } from "../src/index.js";

async function settle() {
  for (let i = 0; i < 3; i++) {
    await new Promise(r => setTimeout(r, 0));
    flush();
  }
}

// #4166: `<Show when={latest(n) > 0}>` opens at once while an action holds
// `n = 1` and mounts a `<Loading>` whose content binds `n`. The binding is
// the content's mount, not the verdict lane's; it waits behind the fallback
// like a direct read of `n` in the content (#3851) and lands with the action.
test("a Loading mounted by a verdict reader shows its fallback while the action holds (#4166)", async () => {
  const root = document.createElement("div");
  const [n, setN] = createSignal(0);
  let release!: () => void;
  const save = action(function* () {
    setN(1);
    yield new Promise<void>(r => (release = r));
  });

  const dispose = render(
    () => (
      <>
        <i>{n()}</i>
        <Show when={latest(n) > 0}>
          <Loading fallback="pending">
            <p>{n()}</p>
          </Loading>
        </Show>
      </>
    ),
    root
  );
  flush();
  expect(root.innerHTML).toBe("<i>0</i>");

  const pending = save();
  flush();
  await settle();
  expect(root.innerHTML).toBe("<i>0</i>pending");

  release();
  await pending;
  await settle();
  expect(root.innerHTML).toBe("<i>1</i><p>1</p>");
  dispose();
});
