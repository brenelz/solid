/** @vitest-environment node */
import { describe, expect, test } from "vitest";
import { createRoot, For, Repeat, Show, Switch, Match, Errored } from "../../src/server/index.js";

describe("Server For", () => {
  test("maps array to elements", () => {
    createRoot(
      () => {
        const result = For({
          each: [1, 2, 3] as const,
          children: (item, index) => `${item()}-${index()}`
        });
        // For wraps mapArray in createMemo, so result is an accessor
        expect(typeof result === "function" ? (result as any)() : result).toEqual([
          "1-0",
          "2-1",
          "3-2"
        ]);
      },
      { id: "test" }
    );
  });

  test("returns fallback for empty array", () => {
    createRoot(
      () => {
        const result = For({
          each: [] as number[],
          fallback: "empty",
          children: (item, index) => `${item()}`
        });
        expect(typeof result === "function" ? (result as any)() : result).toEqual(["empty"]);
      },
      { id: "test" }
    );
  });
});

describe("Server Repeat", () => {
  test("repeats count times", () => {
    const result = Repeat({
      count: 3,
      children: (i: number) => `item-${i}`
    });
    // Repeat returns an accessor from repeat()
    const val = typeof result === "function" ? (result as any)() : result;
    expect(val).toEqual(["item-0", "item-1", "item-2"]);
  });
});

describe("Server Show", () => {
  test("shows children when truthy", () => {
    const result = Show({
      when: true,
      children: "visible"
    });
    expect(result).toBe("visible");
  });

  test("shows fallback when falsy", () => {
    const result = Show({
      when: false,
      fallback: "hidden",
      children: "visible"
    });
    expect(result).toBe("hidden");
  });

  test("passes accessor to function children", () => {
    const result = Show({
      when: "hello",
      children: ((item: () => string) => `got: ${item()}`) as any
    });
    expect(result).toBe("got: hello");
  });
});

describe("Server Switch/Match", () => {
  test("renders matching case", () => {
    createRoot(
      () => {
        const result = Switch({
          children: [
            Match({ when: false, children: "first" }),
            Match({ when: true, children: "second" }),
            Match({ when: true, children: "third" })
          ] as any
        });
        // Switch wraps in createMemo, so result is an accessor
        expect(typeof result === "function" ? (result as any)() : result).toBe("second");
      },
      { id: "test" }
    );
  });

  test("renders fallback when no match", () => {
    createRoot(
      () => {
        const result = Switch({
          fallback: "default",
          children: [Match({ when: false, children: "first" })] as any
        });
        expect(typeof result === "function" ? (result as any)() : result).toBe("default");
      },
      { id: "test" }
    );
  });
});

describe("Server Errored", () => {
  test("renders children when no error", () => {
    createRoot(
      () => {
        const result = Errored({
          fallback: "error",
          children: "ok"
        });
        // Errored wraps createErrorBoundary which returns an accessor
        expect(typeof result === "function" ? (result as any)() : result).toBe("ok");
      },
      { id: "test" }
    );
  });

  // Note: Errored catches errors thrown during rendering/evaluation of children.
  // In SSR, errors in children would be caught by the error boundary during rendering.
  // A direct throw in the children prop value happens before Errored runs.
  // This is tested via createErrorBoundary in signals.spec.ts instead.
});
