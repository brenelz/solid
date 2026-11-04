import { describe, expect, it } from "vitest";
import {
  createEffect,
  createMemo,
  createRenderEffect,
  createRoot,
  createSignal,
  flush,
  isPending
} from "../src/index.js";

const tick = async () => {
  for (let i = 0; i < 8; i++) await Promise.resolve();
  flush();
};

type Screen = { id: number; details: string; pending: boolean; badge: string };

describe.each(["probe after read", "probe before read"] as const)(
  "an async memo over `[id(), isPending(id)]` beside a binding of isPending(id) (%s)",
  order => {
    it("shows the verdict and its derivation together, then lands once", async () => {
      const [id, setId] = createSignal(0);
      const detailsFlights: (() => void)[] = [];
      const badgeFlights: (() => void)[] = [];
      const badgeRuns: string[] = [];
      const effects: string[] = [];
      const screen = {} as Screen;
      createRoot(() => {
        const details = createMemo(() => {
          const i = id();
          if (i === 0) return "Item 0";
          return new Promise<string>(r => detailsFlights.push(() => r(`Item ${i}`)));
        });
        let first = true;
        const badge = createMemo(() => {
          let i = 0,
            p: boolean;
          if (order === "probe after read") i = id();
          p = isPending(id);
          if (order === "probe before read") i = id();
          const out = `ID: ${i}, pending: ${p}`;
          badgeRuns.push(out);
          if (first) return ((first = false), out);
          return new Promise<string>(r => badgeFlights.push(() => r(out)));
        });
        createRenderEffect(id, v => void (screen.id = v));
        createRenderEffect(details, v => void (screen.details = v));
        createRenderEffect(
          () => isPending(id),
          v => void (screen.pending = v)
        );
        createRenderEffect(badge, v => void (screen.badge = v));
        createEffect(badge, v => void effects.push(v));
      });
      flush();
      const initial = { id: 0, details: "Item 0", pending: false, badge: "ID: 0, pending: false" };
      expect(screen).toEqual(initial);
      badgeRuns.length = 0;
      setId(1);
      flush();
      await tick();
      expect(badgeRuns).toEqual(["ID: 0, pending: true"]);
      expect(screen).toEqual(initial);
      detailsFlights.shift()!();
      await tick();
      expect(screen).toEqual(initial);
      badgeFlights.shift()!();
      await tick();
      expect(screen).toEqual({ ...initial, pending: true, badge: "ID: 0, pending: true" });
      expect(badgeRuns).toEqual(["ID: 0, pending: true", "ID: 1, pending: false"]);
      badgeFlights.shift()!();
      await tick();
      expect(screen).toEqual({
        id: 1,
        details: "Item 1",
        pending: false,
        badge: "ID: 1, pending: false"
      });
      expect(effects).toEqual([
        "ID: 0, pending: false",
        "ID: 0, pending: true",
        "ID: 1, pending: false"
      ]);
      expect(badgeFlights).toEqual([]);
      expect(detailsFlights).toEqual([]);
    });
  }
);
