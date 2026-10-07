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

function mount(content: (x: () => number) => () => unknown, open: () => boolean = () => true) {
  const [x, setX] = createSignal(0);
  let screenX: unknown;
  let slot: unknown;
  createRoot(() => {
    createRenderEffect(x, v => {
      screenX = v;
    });
    const when = createMemo(() => latest(x) > 0 && open());
    const children = createMemo(() =>
      when() ? untrack(() => createLoadingBoundary(content(x), () => "fallback")) : "closed"
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
  return { setX, screen: () => [screenX, slot] };
}

describe("a mount a verdict lane triggers stays mainline (#3851)", () => {
  it("a Loading mounted by latest() shows its fallback beside the committed value", async () => {
    const { setX, screen } = mount(x => () => `content ${x()}`);
    expect(screen()).toEqual([0, "closed"]);

    let release!: () => void;
    const done = action(function* () {
      setX(1);
      yield new Promise<void>(r => (release = r));
    })();
    await settle();
    expect(screen()).toEqual([0, "fallback"]);

    release();
    await done;
    await settle();
    expect(screen()).toEqual([1, "content 1"]);
  });

  it("a Loading mounted after the park, by a plain write the verdict reader also reads", async () => {
    const [open, setOpen] = createSignal(false);
    const { setX, screen } = mount(x => () => `content ${x()}`, open);
    expect(screen()).toEqual([0, "closed"]);

    let release!: () => void;
    const done = action(function* () {
      setX(1);
      yield new Promise<void>(r => (release = r));
    })();
    await settle();
    expect(screen()).toEqual([0, "closed"]);

    setOpen(true);
    await settle();
    expect(screen()).toEqual([0, "fallback"]);

    release();
    await done;
    await settle();
    expect(screen()).toEqual([1, "content 1"]);
  });

  it("the same with the content behind a memo", async () => {
    const { setX, screen } = mount(x => createMemo(() => `content ${x()}`));
    expect(screen()).toEqual([0, "closed"]);

    let release!: () => void;
    const done = action(function* () {
      setX(1);
      yield new Promise<void>(r => (release = r));
    })();
    await settle();
    expect(screen()).toEqual([0, "fallback"]);

    release();
    await done;
    await settle();
    expect(screen()).toEqual([1, "content 1"]);
  });
});
