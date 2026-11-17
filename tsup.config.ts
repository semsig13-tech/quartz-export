import { defineConfig } from "tsup"

export default defineConfig([
  {
    entry: ["src/index.ts"],
    format: ["esm"],
    dts: true,
    splitting: false,
    clean: true,
    target: "es2022",
    sourcemap: true,
    platform: "node",
    external: ["@quartz-community/types"],
    outDir: "dist",
  },
  {
    entry: ["src/client.ts"],
    format: ["esm"],
    dts: false,
    bundle: true,
    splitting: false,
    clean: false,
    minify: true,
    target: "es2022",
    platform: "browser",
    noExternal: ["docx", "html2pdf.js", "marked", "katex", "html2canvas", "jspdf"],
    outDir: "dist",
  },
])
