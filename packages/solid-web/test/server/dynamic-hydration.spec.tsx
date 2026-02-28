/**
 * @jsxImportSource solid-js
 */
import { describe, expect, test } from "vitest";
import { createDynamic, Dynamic } from "@solidjs/web";
import { createRoot, getOwner, Show } from "solid-js";

describe("Dynamic hydration key alignment", () => {
  test("createDynamic consumes 2 parent slots (cached memo + outer memo)", () => {
    createRoot(
      () => {
        let innerChildId: string | undefined;

        function Wrapper(props: any) {
          innerChildId = (getOwner() as any)?.id;
          return props.children;
        }

        createDynamic(() => Wrapper, { children: "test-child" } as any);

        expect(innerChildId).toBe("t1");
      },
      { id: "t" }
    );
  });

  test("createDynamic followed by Show - sibling IDs are aligned", () => {
    createRoot(
      () => {
        let dynamicChildId: string | undefined;
        let showChildId: string | undefined;

        function Wrapper(props: any) {
          dynamicChildId = (getOwner() as any)?.id;
          return props.children;
        }

        createDynamic(() => Wrapper, { children: "dynamic-child" } as any);

        Show({
          when: true,
          get children() {
            showChildId = (getOwner() as any)?.id;
            return "show-child";
          }
        });

        expect(dynamicChildId).toBe("t1");
        expect(showChildId).toBe("t4");
      },
      { id: "t" }
    );
  });

  test("Dynamic component - uses createDynamic internally", () => {
    createRoot(
      () => {
        let innerChildId: string | undefined;

        function Wrapper(props: any) {
          innerChildId = (getOwner() as any)?.id;
          return props.children;
        }

        Dynamic({ component: Wrapper, children: "test" } as any);

        expect(innerChildId).toBe("t1");
      },
      { id: "t" }
    );
  });
});
