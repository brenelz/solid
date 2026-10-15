/** @jsxImportSource @solidjs/web */

import type { ComponentProps, JSX } from "@solidjs/web";
import type { ParentProps } from "solid-js";

const text = document.createTextNode("hello");
const span = document.createElement("span");

<div>{text}</div>;
<div>{[text, span]}</div>;

function Parent(props: ParentProps) {
  return <section>{props.children}</section>;
}

<Parent>{text}</Parent>;
<Parent>{[text, span]}</Parent>;

<selectedcontent />;

const divAttributes: JSX.HTMLAttributes<HTMLDivElement> = { "data-state": "open" };
const divProps: ComponentProps<"div"> = { role: "button", "data-state": "open" };
function disclosure(): ComponentProps<"button"> {
  return { "aria-expanded": "false", "data-state": "closed" };
}
<div {...divProps} />;
<div data-n={1} data-b={true} data-s="x" data-u={undefined} />;
// @ts-expect-error unknown non-data keys are still rejected
const unknownKey: ComponentProps<"div"> = { foo: 1 };
// @ts-expect-error data values stay primitive
const objectValue: ComponentProps<"div"> = { "data-x": {} };
