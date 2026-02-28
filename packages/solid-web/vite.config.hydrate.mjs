/// <reference types="vitest" />

import { defineConfig } from "vitest/config";
import solidPlugin from "vite-plugin-solid";
import { resolve } from "path";

const rootDir = resolve(__dirname);

export default defineConfig({
  plugins: [solidPlugin({ solid: { dev: true, hydratable: true } })],
  test: {
    environment: "jsdom",
    transformMode: { web: [/\.[jt]sx?$/] },
    deps: { registerNodeLoader: true },
    threads: false,
    isolate: false,
    globals: true,
    include: ["test/hydration/**/*.spec.tsx"]
  },
  resolve: {
    conditions: ["development", "browser"],
    alias: {
      rxcore: [resolve(rootDir, "../../packages/solid-web/src/core")],
      "@solidjs/web": resolve(rootDir, "src/index.ts")
    }
  }
});
