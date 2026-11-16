import { defineConfig } from "tsup"

export default defineConfig({
  entry: { index: "src/index.ts", client: "src/client.ts" },
  format: ["esm"],
  dts: true,
  splitting: false,
  clean: true,
  target: "es2022",
  sourcemap: true,
  platform: "node",
  external: ["@quartz-community/types"],
})
