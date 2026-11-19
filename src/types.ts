export interface ExportDocument {
  slug: string
  title: string
  folder: string
  markdown: string
  /** Site-relative URL, including the Quartz baseUrl prefix. */
  url: string
}

export interface ExportManifest {
  version: 1
  generatedAt: string
  siteBaseUrl: string
  documents: ExportDocument[]
}

export interface TdocExportOptions {
  manifestPath?: string
  iconPath?: string
  iconPathLight?: string
  iconPathDark?: string
  toolbarSelector?: string
  explorerSelector?: string
  includeDrafts?: boolean
  buttonLabel?: string
  customCss?: string
  themeXml?: string
}
