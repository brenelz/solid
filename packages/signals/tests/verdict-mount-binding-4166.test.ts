// A binding created by a verdict reader's mount waits behind the fallback.
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
  onCleanup,
  untrack
} from "../src/index.js";

const settle = async () => {
  for (let i = 0; i < 3; i++) {
    await new Promise(r => setTimeout(r, 0));
    flush();
  }
};

async function mountUnderVerdict(
  contentInMemo: boolean,
  hooks?: {
    setup(condition: () => boolean, children: () => unknown): void;
    beforeAction(): Promise<void>;
    inContent(): void;
    release(): void;
  }
) {
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
      hooks?.inContent();
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
    hooks?.setup(condition, children);
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
  await hooks?.beforeAction();

  let release!: () => void;
  const done = action(function* () {
    setX(1);
    yield new Promise<void>(r => (release = r));
  })();
  await settle();
  screens.push([screenX, slot, inner]);

  release();
  hooks?.release();
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

  it("same after a pulled re-pass threw from a cleanup inside the content", async () => {
    const [y, setY] = createSignal(0);
    let probe!: () => number;
    let releaseY!: () => void;
    let thrown = false;
    const screens = mountUnderVerdict(false, {
      setup(condition, children) {
        probe = createMemo(() => {
          onCleanup(() => {
            if (thrown) return;
            thrown = true;
            throw new Error("cleanup");
          });
          children();
          condition();
          return y();
        });
        createRenderEffect(probe, () => {});
      },
      async beforeAction() {
        action(function* () {
          setY(1);
          yield new Promise<void>(r => (releaseY = r));
        })();
        await settle();
      },
      inContent() {
        try {
          probe();
        } catch {}
      },
      release: () => releaseY()
    });
    expect(await screens).toEqual([
      [0, "closed", undefined],
      [0, "fallback", undefined],
      [1, "content", 1]
    ]);
  });
});
