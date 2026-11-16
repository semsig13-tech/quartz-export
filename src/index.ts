import fs from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import type { QuartzEmitterPlugin } from "@quartz-community/types"
import type { TdocExportOptions, ExportManifest, ExportDocument } from "./types.js"

const DEFAULTS: Required<TdocExportOptions> = {
  manifestPath: "static/tdoc-export-index.json",
  iconPath: "static/tdoc-export.svg",
  toolbarSelector: ".search, .darkmode, .readermode",
  explorerSelector: ".explorer",
  includeDrafts: false,
  buttonLabel: "Экспорт",
  customCss: "static/export.css",
  themeXml: "themes/export-theme.xml",
}

function safeAssetPath(value: string, fallback: string): string {
  const normalized = value.replace(/\\/g, "/").replace(/^\/+/, "")
  if (!normalized || normalized.split("/").some((part) => part === "." || part === "..")) return fallback
  return normalized
}

function sitePath(baseUrl: string, relativePath: string): string {
  const prefix = baseUrl.split("/").filter(Boolean).slice(1).join("/")
  return "/" + [prefix, relativePath.replace(/^\/+/, "")].filter(Boolean).join("/")
}

function makeClientConfig(baseUrl: string, options: {
  manifestPath: string
  iconPath: string
  toolbarSelector: string
  explorerSelector: string
  buttonLabel: string
  customCss: string
  themeXml: string
}) {
  return {
    manifestPath: sitePath(baseUrl, options.manifestPath),
    iconPath: sitePath(baseUrl, options.iconPath),
    toolbarSelector: options.toolbarSelector,
    explorerSelector: options.explorerSelector,
    buttonLabel: options.buttonLabel,
    customCss: options.customCss ? sitePath(baseUrl, options.customCss) : "",
    themeXml: options.themeXml ? sitePath(baseUrl, options.themeXml) : "",
  }
}

export const TdocExport: QuartzEmitterPlugin<TdocExportOptions> = (userOptions = {}) => {
  const options = { ...DEFAULTS, ...userOptions }
  const manifestPath = safeAssetPath(options.manifestPath, DEFAULTS.manifestPath)
  const iconPath = safeAssetPath(options.iconPath, DEFAULTS.iconPath)
  const cssPath = options.customCss ? safeAssetPath(options.customCss, DEFAULTS.customCss) : ""
  const themePath = options.themeXml ? safeAssetPath(options.themeXml, DEFAULTS.themeXml) : ""

  return {
    name: "TdocExport",
    async emit(ctx, content) {
      const baseUrl = String(ctx.cfg.configuration.baseUrl ?? "")
      // Quartz may append virtual pages (plain objects) to the processed
      // Markdown tuples before calling emitters. Only real VFile tuples can be
      // exported; virtual pages do not contain a source Markdown file.
      const documents: ExportDocument[] = (content as unknown[]).flatMap((entry) => {
        if (!Array.isArray(entry) || entry.length < 2) return []
        const file = entry[1] as { data?: Record<string, any>; value?: unknown } | undefined
        if (!file || typeof file !== "object") return []

        const data = file.data ?? {}
        const slug = String(data.slug ?? data.relativePath ?? "").replace(/^\/+|\/+$/g, "")
        if (!slug || slug.startsWith("tags/")) return []

        const frontmatter = data.frontmatter ?? {}
        if (!options.includeDrafts && frontmatter.draft === true) return []

        const title = String(frontmatter.title ?? data.title ?? path.posix.basename(slug))
        const folder = path.posix.dirname(slug) === "." ? "" : path.posix.dirname(slug)
        const markdown = typeof file.value === "string" ? file.value : String(file.value ?? "")
        return [{ slug, title, folder, markdown, url: sitePath(baseUrl, slug) }]
      }).sort((a, b) => a.slug.localeCompare(b.slug, "ru"))

      const manifest: ExportManifest = {
        version: 1,
        generatedAt: new Date().toISOString(),
        siteBaseUrl: baseUrl,
        documents,
      }
      const outputRoot = ctx.argv.output
      const outputFiles: string[] = []
      const pluginRoot = path.dirname(fileURLToPath(import.meta.url))

      const writeAsset = async (relativePath: string, data: string | Buffer) => {
        const target = path.join(outputRoot, relativePath)
        await fs.mkdir(path.dirname(target), { recursive: true })
        await fs.writeFile(target, data)
        outputFiles.push(target)
      }
      const copyAsset = async (source: string, relativePath: string) => {
        const target = path.join(outputRoot, relativePath)
        await fs.mkdir(path.dirname(target), { recursive: true })
        await fs.copyFile(source, target)
        outputFiles.push(target)
      }

      await writeAsset(manifestPath, JSON.stringify(manifest))
      await copyAsset(path.join(pluginRoot, "../static/icon.svg"), iconPath)
      if (cssPath) await copyAsset(path.join(pluginRoot, "../static/export.css"), cssPath)
      if (themePath) await copyAsset(path.join(pluginRoot, "../themes/export-theme.xml"), themePath)

      // Publish a self-contained browser script with the site-specific settings prepended.
      const clientBundle = await fs.readFile(path.join(pluginRoot, "client.js"), "utf8")
      const clientConfig = makeClientConfig(baseUrl, {
        manifestPath, iconPath, toolbarSelector: options.toolbarSelector,
        explorerSelector: options.explorerSelector, buttonLabel: options.buttonLabel,
        customCss: cssPath, themeXml: themePath,
      })
      await writeAsset("static/tdoc-export.js", `window.__TDOC_EXPORT_CONFIG__=${JSON.stringify(clientConfig)};\\n${clientBundle}`)
      return outputFiles as any
    },

    getQuartzComponents() {
      return []
    },

    externalResources(ctx) {
      const baseUrl = String(ctx.cfg.configuration.baseUrl ?? "")
      return {
        js: [{
          loadTime: "afterDOMReady",
          contentType: "external",
          moduleType: "module",
          src: sitePath(baseUrl, "static/tdoc-export.js"),
        }],
      }
    },
  }
}

export default TdocExport
