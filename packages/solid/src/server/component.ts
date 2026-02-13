import { createMemo, NotReadyError } from "./signals.js";
import { sharedConfig } from "./shared.js";
import type { JSX } from "../jsx.js";

export function enableHydration() {}

/**
 * A general `Component` has no implicit `children` prop.  If desired, you can
 * specify one as in `Component<{name: String, children: JSX.Element}>`.
 */
export type Component<P extends Record<string, any> = {}> = (props: P) => JSX.Element;

/**
 * Extend props to forbid the `children` prop.
 */
export type VoidProps<P extends Record<string, any> = {}> = P & { children?: never };
/**
 * `VoidComponent` forbids the `children` prop.
 */
export type VoidComponent<P extends Record<string, any> = {}> = Component<VoidProps<P>>;

/**
 * Extend props to allow an optional `children` prop with the usual type in JSX.
 */
export type ParentProps<P extends Record<string, any> = {}> = P & { children?: JSX.Element };
/**
 * `ParentComponent` allows an optional `children` prop with the usual type in JSX.
 */
export type ParentComponent<P extends Record<string, any> = {}> = Component<ParentProps<P>>;

/**
 * Extend props to require a `children` prop with the specified type.
 */
export type FlowProps<P extends Record<string, any> = {}, C = JSX.Element> = P & { children: C };
/**
 * `FlowComponent` requires a `children` prop with the specified type.
 */
export type FlowComponent<P extends Record<string, any> = {}, C = JSX.Element> = Component<
  FlowProps<P, C>
>;

export type ValidComponent = keyof JSX.IntrinsicElements | Component<any> | (string & {});

/**
 * Takes the props of the passed component and returns its type
 */
export type ComponentProps<T extends ValidComponent> =
  T extends Component<infer P>
    ? P
    : T extends keyof JSX.IntrinsicElements
      ? JSX.IntrinsicElements[T]
      : Record<string, unknown>;

/**
 * Type of `props.ref`, for use in `Component` or `props` typing.
 */
export type Ref<T> = T | ((val: T) => void);

/**
 * Creates a component. On server, just calls the function directly (no untrack needed).
 */
export function createComponent<T extends Record<string, any>>(
  Comp: Component<T>,
  props: T
): JSX.Element {
  return Comp(props || ({} as T));
}

/**
 * Lazy load a function component asynchronously.
 * On server, caches the promise and throws NotReadyError if not yet loaded.
 */
export function lazy<T extends Component<any>>(
  fn: () => Promise<{ default: T }>
): T & { preload: () => Promise<{ default: T }> } {
  let p: Promise<{ default: T; __url: string }> & { v?: T };
  let load = (id?: string) => {
    if (!p) {
      p = fn() as any;
      p.then(mod => {
        p.v = mod.default;
      });
    }
    return p;
  };
  const wrap: Component<ComponentProps<T>> & {
    preload?: () => Promise<{ default: T }>;
  } = props => {
    const id = sharedConfig.getNextContextId();
    load(id);
    if (p.v) return p.v(props);
    if (sharedConfig.context?.async) {
      sharedConfig.context.block(
        p.then(() => {
          (p as any).s = "success";
        })
      );
    }
    throw new NotReadyError(p);
  };
  wrap.preload = load;
  return wrap as T & { preload: () => Promise<{ default: T }> };
}

export function createUniqueId(): string {
  return sharedConfig.getNextContextId();
}
