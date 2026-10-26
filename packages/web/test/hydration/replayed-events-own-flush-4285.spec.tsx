/**
 * @jsxImportSource @solidjs/web
 * @vitest-environment jsdom
 */
import { describe, expect, test, beforeEach, afterEach } from "vitest";
import { action, createSignal, enableHydration } from "solid-js";
import { hydrate } from "@solidjs/web";

enableHydration();

describe("#4285: each event replayed after hydration is its own flush", () => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  let dispose: (() => void) | undefined;

  beforeEach(() => {
    container.innerHTML = "";
    (globalThis as any)._$HY = { events: [], completed: new WeakSet(), r: {}, fe() {} };
  });

  afterEach(() => {
    dispose?.();
    dispose = undefined;
  });

  function clickTwiceBeforeHydration() {
    // Server output for the tree below, captured from renderToString
    container.innerHTML = "<div _hk=0><p>0</p><button>+</button></div>";
    const root = container.firstElementChild!;
    const button = container.querySelector("button")!;
    // Queue the clicks the way the hydration script does: under the nearest keyed element.
    button.addEventListener("click", event => (globalThis as any)._$HY.events.push([root, event]));
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  }

  test("two queued clicks through an action count twice", async () => {
    clickTwiceBeforeHydration();
    dispose = hydrate(() => {
      const [n, setN] = createSignal(0);
      const bump = action(function* () {
        setN(n() + 1);
      });
      return (
        <div>
          <p>{n()}</p>
          <button onClick={() => bump()}>+</button>
        </div>
      );
    }, container);

    await new Promise(r => setTimeout(r, 50));
    expect(container.querySelector("p")!.textContent).toBe("2");
  });

  test("two queued clicks through a plain write count twice", async () => {
    clickTwiceBeforeHydration();
    dispose = hydrate(() => {
      const [n, setN] = createSignal(0);
      return (
        <div>
          <p>{n()}</p>
          <button onClick={() => setN(n() + 1)}>+</button>
        </div>
      );
    }, container);

    await new Promise(r => setTimeout(r, 50));
    expect(container.querySelector("p")!.textContent).toBe("2");
  });
});
