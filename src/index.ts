import fs from "node:fs/promises"
import fsSync from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import type { QuartzEmitterPlugin } from "@quartz-community/types"
import type { TdocExportOptions, ExportManifest, ExportDocument } from "./types.js"

const DEFAULTS: Required<TdocExportOptions> = {
  manifestPath: "static/tdoc-export-index.json",
  iconPath: "static/icon.svg",
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
      const documents: ExportDocument[] = content.map(([, file]) => {
        const data = file.data as Record<string, any>
        const slug = String(data.slug ?? "").replace(/^\/+|\/+$/g, "")
        const frontmatter = data.frontmatter ?? {}
        const title = String(frontmatter.title ?? data.title ?? path.posix.basename(slug))
        const folder = path.posix.dirname(slug) === "." ? "" : path.posix.dirname(slug)
        return { slug, title, folder, markdown: file.value.toString(), url: sitePath(baseUrl, slug) }
      }).filter((doc) => {
        const source = content.find(([, file]) => String((file.data as any).slug ?? "").replace(/^\/+|\/+$/g, "") === doc.slug)?.[1]
        const frontmatter = (source?.data as any)?.frontmatter ?? {}
        return Boolean(doc.slug) && !doc.slug.startsWith("tags/") && (options.includeDrafts || frontmatter.draft !== true)
      }).sort((a, b) => a.slug.localeCompare(b.slug, "ru"))

      const manifest: ExportManifest = { version: 1, generatedAt: new Date().toISOString(), siteBaseUrl: baseUrl, documents }
      const outputRoot = ctx.argv.output
      const outputFiles: string[] = []
      const pluginRoot = path.dirname(fileURLToPath(import.meta.url))

      const copyAsset = async (source: string, targetRelative: string) => {
        const target = path.join(outputRoot, targetRelative)
        await fs.mkdir(path.dirname(target), { recursive: true })
        await fs.copyFile(source, target)
        outputFiles.push(target)
      }

      const manifestFile = path.join(outputRoot, manifestPath)
      await fs.mkdir(path.dirname(manifestFile), { recursive: true })
      await fs.writeFile(manifestFile, JSON.stringify(manifest), "utf8")
      outputFiles.push(manifestFile)

      await copyAsset(path.join(pluginRoot, "client.js"), "static/tdoc-export.js")
      await copyAsset(path.join(pluginRoot, "../static/icon.svg"), iconPath)
      if (cssPath) await copyAsset(path.join(pluginRoot, "../static/export.css"), cssPath)
      if (themePath) await copyAsset(path.join(pluginRoot, "../themes/export-theme.xml"), themePath)
      return outputFiles as any
    },

    getQuartzComponents() {
      return []
    },

    externalResources(ctx) {
      const baseUrl = String(ctx.cfg.configuration.baseUrl ?? "")
      const config = {
        manifestPath: sitePath(baseUrl, manifestPath),
        iconPath: sitePath(baseUrl, iconPath),
        toolbarSelector: options.toolbarSelector,
        explorerSelector: options.explorerSelector,
        buttonLabel: options.buttonLabel,
        customCss: cssPath ? sitePath(baseUrl, cssPath) : "",
        themeXml: themePath ? sitePath(baseUrl, themePath) : "",
      }
      const clientPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "client.js")
      const clientBundle = fsSync.readFileSync(clientPath, "utf8")
      return {
        js: [{
          loadTime: "afterDOMReady",
          contentType: "inline",
          moduleType: "module",
          script: `window.__TDOC_EXPORT_CONFIG__=${JSON.stringify(config)};\\n${clientBundle}`,
        }],
      }
    },
  }
}

export default TdocExport
