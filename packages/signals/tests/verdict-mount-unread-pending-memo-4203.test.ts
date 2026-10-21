/**
 * #4203: a `<Loading>` that `<Show when={latest(() => gate()) ?? gate()}>`
 * mounts reveals its content when the only pending node under it is a memo
 * nothing reads. The content writes an `ownedWrite` signal during its mount
 * and then creates a memo that reads that signal and never settles; the
 * memo has no render-effect reader, so it holds nothing (RULES-FUNDAMENTALS,
 * Reader). Before, the mount's staged write counted as a held read and the
 * boundary stayed on its fallback.
 */
import { describe, expect, it } from "vitest";
import {
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

describe("#4203: a verdict-mounted boundary ignores an unread pending memo", () => {
  it("reveals the content after the gate resolves", async () => {
    let slot: unknown;
    createRoot(() => {
      const gate = createMemo(async () => "x");
      const child = () => {
        const [version, setVersion] = createSignal(0, { ownedWrite: true });
        setVersion(1);
        createMemo(() => {
          version();
          return new Promise(() => {});
        });
        return "CHILD";
      };
      const when = createMemo(() => latest(() => gate()) ?? gate());
      const children = createMemo(() =>
        when() ? untrack(() => createLoadingBoundary(child, () => "INNER")) : "closed"
      );
      const outer = createLoadingBoundary(
        () => {
          const c = children();
          return typeof c === "function" ? c() : c;
        },
        () => "OUTER"
      );
      createRenderEffect(outer, v => {
        slot = v;
      });
    });
    flush();
    expect(slot).toBe("OUTER");
    await settle();
    expect(slot).toBe("CHILD");
  });
});
