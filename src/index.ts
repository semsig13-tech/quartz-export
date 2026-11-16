import fs from "node:fs/promises"
import fsSync from "node:fs"
import path from "node:path"
import type { QuartzEmitterPlugin } from "@quartz-community/types"
import type { TdocExportOptions, ExportManifest, ExportDocument } from "./types.js"

export const TdocExport: QuartzEmitterPlugin<TdocExportOptions> = (opts = {}) => {
  const options = {
    manifestPath: opts.manifestPath ?? "static/tdoc-export-index.json",
    iconPath: opts.iconPath ?? "static/icon.svg",
    toolbarSelector: opts.toolbarSelector ?? ".search, .darkmode, .readermode",
    explorerSelector: opts.explorerSelector ?? ".explorer",
    includeDrafts: opts.includeDrafts ?? false,
    buttonLabel: opts.buttonLabel ?? "Экспорт",
    customCss: opts.customCss ?? "",
    themeXml: opts.themeXml ?? "",
  }

  return {
    name: "TdocExport",
    async emit(ctx, content) {
      const documents: ExportDocument[] = content.map(([, file]) => {
        const data = file.data as Record<string, any>
        const slug = String(data.slug ?? "")
        const frontmatter = data.frontmatter ?? {}
        const title = String(frontmatter.title ?? data.title ?? path.posix.basename(slug))
        const folder = path.posix.dirname(slug) === "." ? "" : path.posix.dirname(slug)
        const markdown = typeof file.value === "string" ? file.value : String(file.value ?? "")
        return { slug, title, folder, markdown, url: `/${slug}` }
      }).filter((doc) => {
        const source = content.find(([, file]) => String((file.data as any).slug ?? "") === doc.slug)?.[1]
        const fm = (source?.data as any)?.frontmatter ?? {}
        return !!doc.slug && !doc.slug.startsWith("tags/") && (options.includeDrafts || fm.draft !== true)
      }).sort((a, b) => a.slug.localeCompare(b.slug, "ru"))

      const manifest: ExportManifest = {
        version: 1,
        generatedAt: new Date().toISOString(),
        siteBaseUrl: String(ctx.cfg.configuration.baseUrl ?? ""),
        documents,
      }

      const outputRoot = ctx.argv.output
      const manifestFile = path.join(outputRoot, options.manifestPath)
      await fs.mkdir(path.dirname(manifestFile), { recursive: true })
      await fs.writeFile(manifestFile, JSON.stringify(manifest), "utf8")

      // Publish the bundled browser client and default icon beside the manifest.
      const staticDir = path.join(outputRoot, "static")
      await fs.mkdir(staticDir, { recursive: true })
      const clientSource = new URL("./client.js", import.meta.url)
      const clientTarget = path.join(staticDir, "tdoc-export.js")
      await fs.copyFile(clientSource, clientTarget)

      const iconTarget = path.join(outputRoot, options.iconPath)
      await fs.mkdir(path.dirname(iconTarget), { recursive: true })
      try {
        await fs.access(iconTarget)
      } catch {
        const iconSource = new URL("../static/icon.svg", import.meta.url)
        await fs.copyFile(iconSource, iconTarget)
      }

      return [manifestFile, clientTarget, iconTarget].map((p) => p as any)
    },

    getQuartzComponents() {
      return []
    },

    externalResources(ctx) {
      const baseUrl = String(ctx.cfg.configuration.baseUrl ?? "")
      const basePath = baseUrl.includes("/") ? `/${baseUrl.split("/").slice(1).join("/")}` : ""
      const manifestUrl = `${basePath}/${options.manifestPath.replace(/^\\//, "")}`
      const clientBundle = fsSync.readFileSync(new URL("./client.js", import.meta.url), "utf8")
      const config = {
        manifestPath: manifestUrl,
        iconPath: `${basePath}/${options.iconPath.replace(/^\\//, "")}`,
        toolbarSelector: options.toolbarSelector,
        explorerSelector: options.explorerSelector,
        buttonLabel: options.buttonLabel,
        customCss: options.customCss ? `${basePath}/${options.customCss.replace(/^\\//, "")}` : "",
        themeXml: options.themeXml ? `${basePath}/${options.themeXml.replace(/^\\//, "")}` : "",
      }
      return {
        js: [{
          loadTime: "afterDOMReady",
          contentType: "inline",
          module: true,
          script: `window.__TDOC_EXPORT_CONFIG__=${JSON.stringify(config)};\\n${clientBundle}`,
        }],
      } as any
    },
  }
}

export default TdocExport
