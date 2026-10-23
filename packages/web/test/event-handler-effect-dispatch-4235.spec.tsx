/**
 * @jsxImportSource @solidjs/web
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, test, vi } from "vitest";
import { render } from "@solidjs/web";
import { createEffect, createRoot, createSignal, flush, OBSERVE, resetErrorHalt } from "solid-js";

function arm() {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  const events: any[] = [];
  const unsubscribe = OBSERVE!.diagnostics.subscribe(e => {
    if (e.code === "STRICT_READ_UNTRACKED") events.push(e);
  });
  return { events, unsubscribe };
}

let container: HTMLDivElement;
let dispose: (() => void) | undefined;

afterEach(() => {
  dispose?.();
  dispose = undefined;
  container?.remove();
  resetErrorHalt();
  flush();
  vi.restoreAllMocks();
});

function mount(fn: () => any) {
  container = document.createElement("div");
  document.body.appendChild(container);
  dispose = render(fn, container);
  flush();
}

describe("#4235 event handlers dispatched from an effect callback", () => {
  test("a delegated handler fired by focus() in an effect reads props without a strict-read warning", () => {
    const { events, unsubscribe } = arm();
    const [label] = createSignal("Name", { name: "label" });
    const [open, setOpen] = createSignal(false);
    const seen: string[] = [];
    let box!: HTMLDivElement;

    function Field(props: { label: string }) {
      return <input onFocusIn={() => seen.push(props.label)} />;
    }

    mount(() => {
      createEffect(open, isOpen => {
        if (isOpen) box.querySelector("input")!.focus();
      });
      return (
        <div ref={box}>
          <Field label={label()} />
        </div>
      );
    });

    setOpen(true);
    flush();
    unsubscribe();

    expect(seen).toEqual(["Name"]);
    expect(events).toHaveLength(0);
  });

  test("a delegated handler fired from an effect is not in the effect-callback phase", () => {
    const [open, setOpen] = createSignal(false);
    let box!: HTMLDivElement;
    let created = 0;

    mount(() => {
      createEffect(open, isOpen => {
        if (isOpen) box.querySelector("input")!.focus();
      });
      return (
        <div ref={box}>
          <input
            onFocusIn={() => {
              createRoot(dispose => {
                created++;
                dispose();
              });
            }}
          />
        </div>
      );
    });

    setOpen(true);
    expect(() => flush()).not.toThrow();
    expect(created).toBe(1);
  });

  test("an addEvent handler fired by focus() in an effect reads props without a strict-read warning", () => {
    const { events, unsubscribe } = arm();
    const [label] = createSignal("Name", { name: "label" });
    const [open, setOpen] = createSignal(false);
    const seen: string[] = [];
    let box!: HTMLDivElement;

    function Field(props: {
      label: string;
      onFocus: () => void;
      onBlur: [(data: string) => void, string];
    }) {
      return <input onFocus={props.onFocus} onBlur={props.onBlur} />;
    }

    mount(() => {
      createEffect(open, isOpen => {
        if (isOpen) box.querySelector("input")!.focus();
        else box.querySelector("input")!.blur();
      });
      return (
        <div ref={box}>
          <Field
            label={label()}
            onFocus={() => seen.push(label())}
            onBlur={[data => seen.push(data, label()), "blur"]}
          />
        </div>
      );
    });

    setOpen(true);
    flush();
    setOpen(false);
    flush();
    unsubscribe();

    expect(seen).toEqual(["Name", "blur", "Name"]);
    expect(events).toHaveLength(0);
  });

  test("control: a direct read in the effect callback still warns", () => {
    const { events, unsubscribe } = arm();
    const [label] = createSignal("Name", { name: "label" });
    const [open, setOpen] = createSignal(false);

    mount(() => {
      createEffect(open, isOpen => {
        if (isOpen) label();
      });
      return <div />;
    });

    setOpen(true);
    flush();
    unsubscribe();

    expect(events).toHaveLength(1);
    expect(events[0].data?.strictRead).toBe("an effect callback");
  });
});
