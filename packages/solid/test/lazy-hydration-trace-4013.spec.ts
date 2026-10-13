/** @vitest-environment jsdom */
import { expect, test } from "vitest";
import { subFetch } from "../src/client/hydration.js";
import { lazy, lazyModule } from "../src/client/component.js";

const loader =
  <T>(mod: T, calls: { n: number }) =>
  () =>
    new Promise<T>(resolve => {
      calls.n++;
      setTimeout(() => resolve(mod), 0);
    });

test("lazy().preload() after a hydration trace returns a real promise that settles", async () => {
  const calls = { n: 0 };
  const Lazy = lazy(loader({ default: () => "ok" }, calls));

  expect(subFetch(() => Lazy.preload())).not.toBeInstanceOf(Promise);

  const real = Lazy.preload();
  expect(real).toBeInstanceOf(Promise);
  expect(calls.n).toBe(1);
  expect(Lazy.preload()).toBe(real);
  expect((await real).default()).toBe("ok");
});

test("lazyModule() after a hydration trace returns a real promise that settles", async () => {
  const calls = { n: 0 };
  const admin = lazyModule(loader({ routes: ["admin"] }, calls));

  expect(subFetch(() => admin())).not.toBeInstanceOf(Promise);

  const real = admin();
  expect(real).toBeInstanceOf(Promise);
  expect(calls.n).toBe(1);
  expect(admin.preload()).toBe(real);
  expect(await real).toEqual({ routes: ["admin"] });
  expect(admin.peek()).toEqual({ routes: ["admin"] });
});

test("lazy() caches again after a traced compute throws", async () => {
  const calls = { n: 0 };
  const Lazy = lazy(loader({ default: () => "ok" }, calls));

  expect(() =>
    subFetch(() => {
      Lazy.preload();
      throw new Error("boom");
    })
  ).toThrow("boom");

  const real = Lazy.preload();
  expect(real).toBeInstanceOf(Promise);
  expect(Lazy.preload()).toBe(real);
  expect(calls.n).toBe(1);
  expect((await real).default()).toBe("ok");
});
