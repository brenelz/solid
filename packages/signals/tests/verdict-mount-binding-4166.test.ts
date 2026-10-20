/**
 * #4166: a mount a verdict reader makes stays mainline through its content's
 * own mounts. `<Show when={latest(x) > 0}>` opens at once while an action
 * holds `x = 1` and mounts a `<Loading>` whose content does not read `x`
 * itself: a binding it creates does (`<p>{x()}</p>`), the DOM shape. The
 * binding is the content's mount, not the verdict lane's, so the #3851 arm
 * (`prevLane` set, a staged read) did not see it and it published the held
 * `x` at once — `1` beside the committed `x = 0`. It waits behind the fresh
 * boundary's fallback and appears at the action's landing, as a direct read
 * of `x` in the content does.
 */
import { describe, expect, it } from "vitest";
import {
  action,
  createLoadingBoundary,
  createMemo,
  createRenderEffect,
  createRoot,
  createSignal,
  flush,
  latest,
  untrack
} from "../src/index.js";

const settle = async () => {
  for (let i = 0; i < 3; i++) {
    await new Promise(r => setTimeout(r, 0));
    flush();
  }
};

async function mountUnderVerdict(contentInMemo: boolean) {
  const [x, setX] = createSignal(0);
  let screenX: unknown;
  let slot: unknown;
  let inner: unknown;
  createRoot(() => {
    // <p>{x()}</p>
    createRenderEffect(x, v => {
      screenX = v;
    });
    // <Show when={latest(x) > 0}>
    //   <Loading fallback="fallback"><p>{x()}</p></Loading>
    // </Show>
    const conditionValue = createMemo(() => latest(x) > 0);
    const condition = createMemo(conditionValue, { equals: (a, b) => !a === !b });
    const content = () => {
      createRenderEffect(x, v => {
        inner = v;
      });
      return "content";
    };
    const children = createMemo(() =>
      condition()
        ? untrack(() =>
            createLoadingBoundary(
              contentInMemo ? () => createMemo(content)() : content,
              () => "fallback"
            )
          )
        : "closed"
    );
    createRenderEffect(
      () => {
        const c = children();
        return typeof c === "function" ? c() : c;
      },
      v => {
        slot = v;
      }
    );
  });
  flush();
  const screens: unknown[] = [[screenX, slot, inner]];

  let release!: () => void;
  const done = action(function* () {
    setX(1);
    yield new Promise<void>(r => (release = r));
  })();
  await settle();
  screens.push([screenX, slot, inner]);

  release();
  await done;
  await settle();
  screens.push([screenX, slot, inner]);
  return screens;
}

describe("#4166: a verdict reader's mount stays mainline through its content's mounts", () => {
  it("a binding the mounted boundary's content creates waits behind the fallback", async () => {
    expect(await mountUnderVerdict(false)).toEqual([
      [0, "closed", undefined],
      [0, "fallback", undefined],
      [1, "content", 1]
    ]);
  });

  it("same with the content in a memo", async () => {
    expect(await mountUnderVerdict(true)).toEqual([
      [0, "closed", undefined],
      [0, "fallback", undefined],
      [1, "content", 1]
    ]);
  });
});
