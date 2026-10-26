import {
  createErrorBoundary,
  createMemo,
  createRenderEffect,
  createRoot,
  createSignal,
  flush,
  untrack
} from "../src/index.js";

class NotFound extends Error {}
class Other extends Error {}

it("outer boundary recovers after catching a rethrow from the inner fallback (#4270)", () => {
  const [which, setWhich] = createSignal(0);
  let screen = "";
  createRoot(() => {
    const m = createMemo(() => {
      const w = which();
      if (w === 1) throw new NotFound("nf");
      if (w === 2) throw new Other("other");
      return "ok" + w;
    });
    const inner = untrack(() =>
      createErrorBoundary(
        () => m(),
        err => {
          const e = err();
          if (!(e instanceof NotFound)) throw e;
          return "inner:" + e.message;
        }
      )
    );
    const outer = untrack(() =>
      createErrorBoundary(
        () => inner(),
        err => "outer:" + (err() as Error).message
      )
    );
    createRenderEffect(
      () => outer(),
      v => {
        screen = v as string;
      }
    );
  });
  flush();
  const seen = [screen];
  for (const w of [1, 0, 2, 0, 1, 0]) {
    setWhich(w);
    flush();
    seen.push(screen);
  }
  expect(seen).toEqual(["ok0", "inner:nf", "ok0", "outer:other", "ok0", "inner:nf", "ok0"]);
});
