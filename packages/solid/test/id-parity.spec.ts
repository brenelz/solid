import { describe, expect, test } from "vitest";
import { createRoot, getOwner, getNextChildId, createMemo, untrack } from "@solidjs/signals";
import { devComponent } from "../src/client/core.js";

/**
 * ID Parity Tests
 *
 * Verify that dev-mode wrappers (devComponent) produce the same owner IDs
 * as production code (no wrapper). This is critical for SSR/hydration: the
 * server runs without wrappers, the client runs with them in dev mode.
 * Transparent owners make the wrappers invisible to the ID scheme.
 */

describe("ID Parity: devComponent transparent wrapper", () => {
  test("devComponent produces same child IDs as direct call", () => {
    const idsWithWrapper: string[] = [];
    const idsWithoutWrapper: string[] = [];

    // With devComponent (dev mode, transparent wrapper)
    createRoot(
      () => {
        devComponent(() => {
          const a = createMemo(() => {
            idsWithWrapper.push(getOwner()!.id!);
            return "a";
          });
          const b = createMemo(() => {
            idsWithWrapper.push(getOwner()!.id!);
            return "b";
          });
          untrack(() => {
            a();
            b();
          });
          return undefined as any;
        }, {} as any);
      },
      { id: "t" }
    );

    // Without wrapper (production / server)
    createRoot(
      () => {
        const Comp = () => {
          const a = createMemo(() => {
            idsWithoutWrapper.push(getOwner()!.id!);
            return "a";
          });
          const b = createMemo(() => {
            idsWithoutWrapper.push(getOwner()!.id!);
            return "b";
          });
          untrack(() => {
            a();
            b();
          });
          return undefined as any;
        };
        Comp();
      },
      { id: "t" }
    );

    expect(idsWithWrapper).toEqual(idsWithoutWrapper);
    expect(idsWithWrapper.length).toBe(2);
  });

  test("devComponent does not shift sibling IDs", () => {
    const ids: string[] = [];

    createRoot(
      () => {
        // Component wrapped in devComponent
        devComponent(() => {
          const cm = createMemo(() => {
            ids.push("comp-memo:" + getOwner()!.id!);
            return "x";
          });
          untrack(cm);
          return undefined as any;
        }, {} as any);

        // Sibling memo created after the devComponent
        createMemo(() => {
          ids.push("sibling:" + getOwner()!.id!);
          return "y";
        })();
      },
      { id: "t" }
    );

    // comp-memo should be t0, sibling should be t1
    // Without transparent, comp wrapper would be t0, comp-memo would be t00,
    // and sibling would be t1. With transparent, comp-memo is t0 and sibling is t1.
    expect(ids).toContain("comp-memo:t0");
    expect(ids).toContain("sibling:t1");
  });

  test("nested devComponent wrappers produce correct IDs", () => {
    const ids: string[] = [];

    createRoot(
      () => {
        devComponent(() => {
          ids.push("outer-owner:" + getOwner()!.id!);

          devComponent(() => {
            const m = createMemo(() => {
              ids.push("inner-memo:" + getOwner()!.id!);
              return "nested";
            });
            untrack(m);
            return undefined as any;
          }, {} as any);
          return undefined as any;
        }, {} as any);
      },
      { id: "t" }
    );

    // The transparent devComponent root has id = parent's id ("t")
    // Inner memo should get id from the root's counter (delegated through transparent wrappers)
    expect(ids).toContain("outer-owner:t");
    expect(ids).toContain("inner-memo:t0");
  });

  test("multiple components produce sequential IDs matching server", () => {
    const serverIds: string[] = [];
    const clientIds: string[] = [];

    function MyComp(props: { label: string }) {
      const m = createMemo(() => {
        return getOwner()!.id!;
      });
      return untrack(m);
    }

    // Server-style: direct calls
    createRoot(
      () => {
        serverIds.push(MyComp({ label: "A" }));
        serverIds.push(MyComp({ label: "B" }));
        serverIds.push(MyComp({ label: "C" }));
      },
      { id: "t" }
    );

    // Client dev-style: wrapped in devComponent
    createRoot(
      () => {
        clientIds.push(devComponent(MyComp, { label: "A" }) as any);
        clientIds.push(devComponent(MyComp, { label: "B" }) as any);
        clientIds.push(devComponent(MyComp, { label: "C" }) as any);
      },
      { id: "t" }
    );

    expect(clientIds).toEqual(serverIds);
    expect(serverIds).toEqual(["t0", "t1", "t2"]);
  });
});
