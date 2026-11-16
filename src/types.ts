export interface ExportDocument {
  slug: string
  title: string
  folder: string
  markdown: string
  url: string
}

export interface ExportManifest {
  version: 1
  generatedAt: string
  siteBaseUrl: string
  documents: ExportDocument[]
}

export interface TdocExportOptions {
  /** Path to generated JSON manifest, relative to site root. */
  manifestPath?: string
  /** Button icon path relative to site root. */
  iconPath?: string
  /** CSS selector for the toolbar container. */
  toolbarSelector?: string
  /** CSS selector for the custom Explorer root. */
  explorerSelector?: string
  /** Include pages marked draft in frontmatter. */
  includeDrafts?: boolean
  /** Label displayed in toolbar. */
  buttonLabel?: string
  /** User CSS URL, relative to site root. */
  customCss?: string
  /** XML theme URL, relative to site root. */
  themeXml?: string
}
