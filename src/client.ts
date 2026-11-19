import { marked } from "marked"
import {
  Document, Packer, Paragraph, TextRun, HeadingLevel,
  ImageRun, Table, TableRow, TableCell, WidthType, BorderStyle,
} from "docx"
import html2pdf from "html2pdf.js"
import katex from "katex"
import html2canvas from "html2canvas"
import { jsPDF } from "jspdf"

declare global {
  interface Window {
    __TDOC_EXPORT_CONFIG__?: {
      manifestPath: string
      iconPath: string
      iconPathLight?: string
      iconPathDark?: string
      toolbarSelector: string
      explorerSelector: string
      buttonLabel: string
      customCss?: string
      themeXml?: string
      mathCss?: string
    }
  }
}

type Doc = { slug: string; title: string; folder: string; markdown: string; url: string }
type Manifest = { version: 1; generatedAt: string; siteBaseUrl: string; documents: Doc[] }
type ExportOptions = { images: boolean; toc: boolean }
type Theme = {
  margins: [number, number, number, number]
  font: string
  fontSize: string
  color: string
  headings: Map<number, { size?: string; color?: string; before?: string; after?: string }>
  tableBorder: string
  tableHeader: string
  tablePadding: string
}

const config = window.__TDOC_EXPORT_CONFIG__
if (config) void boot(config).catch((error) => console.error("TDOC Export:", error))

async function boot(cfg: NonNullable<typeof config>) {
  if (document.getElementById("tdoc-export-button")) return

  // The export control must remain visible even if the manifest or optional
  // stylesheets fail to load. Fetch the document index only after a click.
  injectStyles()
  const button = document.createElement("button")
  button.id = "tdoc-export-button"
  button.type = "button"
  button.className = "tdoc-export-trigger"
  button.title = "Экспортировать документы"
  const icon = document.createElement("img")
  icon.alt = ""
  const updateIconForTheme = () => {
    const theme = document.documentElement.getAttribute("saved-theme")
    icon.src = theme === "dark" ? (cfg.iconPathDark ?? cfg.iconPath) : (cfg.iconPathLight ?? cfg.iconPath)
  }
  updateIconForTheme()
  icon.onerror = () => { icon.remove() }
  document.addEventListener("themechange", updateIconForTheme)
  const label = document.createElement("span")
  label.textContent = cfg.buttonLabel
  button.append(icon, label)
  button.addEventListener("click", async () => {
    button.disabled = true
    try {
      const response = await fetch(cfg.manifestPath)
      if (!response.ok) throw new Error(`Не удалось загрузить индекс документов: ${response.status}`)
      const manifest = await response.json() as Manifest
      if (cfg.mathCss && !document.querySelector(`link[href="${cfg.mathCss}"]`)) {
        const mathLink = document.createElement("link")
        mathLink.rel = "stylesheet"
        mathLink.href = cfg.mathCss
        document.head.append(mathLink)
      }
      if (cfg.customCss && !document.querySelector(`link[href="${cfg.customCss}"]`)) {
        const link = document.createElement("link")
        link.rel = "stylesheet"
        link.href = cfg.customCss
        document.head.append(link)
      }
      openDialog(manifest, cfg)
    } catch (error) {
      console.error("TDOC Export:", error)
      window.alert(`Не удалось открыть экспорт: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      button.disabled = false
    }
  })
  mountButton(button, cfg.toolbarSelector)
  const observer = new MutationObserver(() => mountButton(button, cfg.toolbarSelector))
  observer.observe(document.body, { childList: true, subtree: true })
}

function mountButton(button: HTMLButtonElement, selector: string) {
  const controls = selector.split(",").map((s) => s.trim()).filter(Boolean)
    .map((s) => document.querySelector(s)).filter((node): node is Element => Boolean(node))
  if (!controls.length) return

  // Only target the dedicated toolbar group. Do not change the sidebar's
  // vertical flex sizing: a 100% flex-basis here would push the Explorer away.
  const toolbar = controls[0].closest(".flex-component")
  if (!toolbar || !controls.every((control) => toolbar.contains(control))) return

  let row = document.getElementById("tdoc-export-row") as HTMLDivElement | null
  if (!row) {
    row = document.createElement("div")
    row.id = "tdoc-export-row"
    row.className = "tdoc-export-row"
  }
  if (row.parentElement !== toolbar) toolbar.append(row)
  if (button.parentElement !== row) row.append(button)
  button.classList.remove("tdoc-export-floating")

  const search = document.querySelector(".search")
  const measuredHeight = (search ?? controls[0]).getBoundingClientRect().height
  row.style.setProperty("--tdoc-export-height", measuredHeight > 0 ? measuredHeight + "px" : "40px")
}
function injectStyles() {
  if (document.getElementById("tdoc-export-styles")) return
  const style = document.createElement("style")
  style.id = "tdoc-export-styles"
  style.textContent = `
    .sidebar.left > .flex-component{display:flex;flex-direction:row;flex-wrap:wrap !important;
      box-sizing:border-box;width:100%;max-width:100%;min-width:0}
    .sidebar.left > .flex-component > #tdoc-export-row{display:block;position:relative;
      box-sizing:border-box;width:100% !important;max-width:100% !important;min-width:0;
      flex:0 0 100% !important;order:999;margin:.5rem 0 0}
    .tdoc-export-trigger{display:flex;box-sizing:border-box;width:100%;height:var(--tdoc-export-height,40px);
      min-width:0;align-items:center;justify-content:center;gap:.4rem;border:1px solid var(--lightgray);
      border-radius:8px;padding:.4rem .6rem;background:var(--light);color:var(--dark);
      cursor:pointer;font:inherit;font-size:.9rem}
    .tdoc-export-trigger{display:flex;box-sizing:border-box;width:100%;height:var(--tdoc-export-height,40px);
      align-items:center;justify-content:center;gap:.4rem;border:1px solid var(--lightgray);
      border-radius:8px;padding:.4rem .6rem;background:var(--light);color:var(--dark);
      cursor:pointer;font:inherit;font-size:.9rem}
    .tdoc-export-trigger:hover{background:var(--highlight);border-color:var(--secondary)}
    .tdoc-export-trigger img{width:18px;height:18px;object-fit:contain}
    .tdoc-export-backdrop{position:fixed;inset:0;z-index:10000;background:#0008;display:grid;
      place-items:center;padding:1rem}
    .tdoc-export-dialog{box-sizing:border-box;width:min(780px,96vw);max-height:90vh;overflow:auto;
      background:var(--light);color:var(--dark);border:1px solid var(--lightgray);
      border-radius:14px;padding:1.2rem;box-shadow:0 18px 60px #0004;font:inherit}
    .tdoc-export-dialog h2{margin:.1rem 0 1rem;font-size:1.25rem}
    .tdoc-export-toolbar{display:flex;gap:.5rem;flex-wrap:wrap;margin:.7rem 0}
    .tdoc-export-dialog button,.tdoc-export-dialog select{font:inherit}
    .tdoc-export-action{border:1px solid var(--lightgray);background:var(--light);color:var(--dark);
      border-radius:8px;padding:.5rem .8rem;cursor:pointer}
    .tdoc-export-primary{background:var(--secondary);color:white;border-color:var(--secondary)}
    .tdoc-export-action:disabled{opacity:.55;cursor:wait}
    .tdoc-export-tree{border:1px solid var(--lightgray);border-radius:8px;padding:.6rem;
      max-height:43vh;overflow:auto}
    .tdoc-export-node{display:flex;align-items:center;gap:.5rem;padding:.22rem .1rem}
    .tdoc-export-node label{cursor:pointer}
    .tdoc-export-muted{opacity:.72;font-size:.86rem}
    .tdoc-export-footer{display:flex;justify-content:space-between;gap:.8rem;align-items:center;
      flex-wrap:wrap;margin-top:1rem}
    .tdoc-export-close{float:right;border:0;background:transparent;color:var(--dark);
      font-size:1.4rem;cursor:pointer}
    .tdoc-export-status{min-height:1.3em;margin-top:.6rem;color:var(--secondary);font-size:.9rem}
    @media(max-width:600px){
      .tdoc-export-dialog{padding:.9rem}
      /* On phones, keep search, theme, reader mode and export in one compact row. */
      .sidebar.left > .flex-component{flex-wrap:nowrap !important;align-items:center;gap:.35rem}
      .sidebar.left > .flex-component > #tdoc-export-row{
        display:flex;flex:0 0 40px !important;width:40px !important;max-width:40px !important;
        min-width:40px;margin:0;order:999;align-items:center;justify-content:center
      }
      #tdoc-export-button{width:40px;height:var(--tdoc-export-height,40px);min-width:40px;
        padding:0;gap:0;flex:0 0 40px;justify-content:center}
      #tdoc-export-button span{display:none}
      #tdoc-export-button img{width:20px;height:20px}
    }
  `
  document.head.append(style)
}

function openDialog(manifest: Manifest, cfg: NonNullable<typeof config>) {
  const backdrop = document.createElement("div")
  backdrop.className = "tdoc-export-backdrop"
  const dialog = document.createElement("section")
  dialog.className = "tdoc-export-dialog"
  dialog.setAttribute("role", "dialog")
  dialog.setAttribute("aria-modal", "true")
  dialog.setAttribute("aria-label", "Экспорт документов")
  dialog.innerHTML = `
    <button class="tdoc-export-close" type="button" aria-label="Закрыть">×</button>
    <h2>Экспорт документов</h2>
    <p class="tdoc-export-muted">Выберите папки или отдельные документы, затем формат файла.</p>
    <div class="tdoc-export-toolbar">
      <button class="tdoc-export-action" type="button" data-action="all">Выбрать всё</button>
      <button class="tdoc-export-action" type="button" data-action="none">Снять выбор</button>
      <button class="tdoc-export-action" type="button" data-action="explorer">Выбрать видимые в проводнике</button>
    </div>
    <div class="tdoc-export-tree"></div>
    <div class="tdoc-export-footer">
      <label>Формат:
        <select id="tdoc-export-format"><option value="docx">Word (.docx)</option><option value="pdf">PDF (.pdf)</option></select>
      </label>
      <label><input id="tdoc-export-images" type="checkbox" checked> Изображения</label>
      <label><input id="tdoc-export-toc" type="checkbox" checked> Содержание</label>
      <button class="tdoc-export-action tdoc-export-primary" type="button" data-action="export">Экспортировать</button>
    </div>
    <div class="tdoc-export-status" aria-live="polite"></div>
  `
  backdrop.append(dialog)
  document.body.append(backdrop)
  const tree = dialog.querySelector<HTMLElement>(".tdoc-export-tree")!
  renderTree(tree, manifest.documents)
  const close = () => backdrop.remove()
  dialog.querySelector(".tdoc-export-close")!.addEventListener("click", close)
  backdrop.addEventListener("click", (event) => { if (event.target === backdrop) close() })
  document.addEventListener("keydown", function escape(event) {
    if (event.key === "Escape") { close(); document.removeEventListener("keydown", escape) }
  })
  dialog.addEventListener("click", async (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-action]")
    if (!button) return
    const action = button.dataset.action
    if (action === "all" || action === "none") {
      tree.querySelectorAll<HTMLInputElement>("input[type=checkbox]").forEach((box) => {
        box.checked = action === "all"
        box.indeterminate = false
      })
      return
    }
    if (action === "explorer") {
      selectExplorerEntries(tree, manifest.documents, cfg.explorerSelector)
      return
    }
    if (action !== "export") return
    const selectedSlugs = new Set([...tree.querySelectorAll<HTMLInputElement>("input[data-slug]:checked")]
      .map((box) => box.dataset.slug!))
    const selected = manifest.documents.filter((doc) => selectedSlugs.has(doc.slug))
    if (!selected.length) { setStatus("Выберите хотя бы один документ."); return }
    button.disabled = true
    setStatus("Подготовка файлов…")
    try {
      const options = {
        images: dialog.querySelector<HTMLInputElement>("#tdoc-export-images")!.checked,
        toc: dialog.querySelector<HTMLInputElement>("#tdoc-export-toc")!.checked,
      }
      const format = dialog.querySelector<HTMLSelectElement>("#tdoc-export-format")!.value
      const theme = await loadTheme(cfg.themeXml)
      if (format === "docx") await exportDocx(selected, options, theme)
      else await exportPdf(selected, options, theme)
      setStatus("Файл сформирован.")
    } catch (error) {
      console.error(error)
      setStatus(`Ошибка экспорта: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      button.disabled = false
    }
  })
  function setStatus(message: string) {
    dialog.querySelector<HTMLElement>(".tdoc-export-status")!.textContent = message
  }
}

function renderTree(root: HTMLElement, docs: Doc[]) {
  const folders = new Map<string, Doc[]>()
  for (const doc of docs) {
    const key = doc.folder || "Документы"
    if (!folders.has(key)) folders.set(key, [])
    folders.get(key)!.push(doc)
  }
  root.innerHTML = [...folders.entries()].sort(([a], [b]) => a.localeCompare(b, "ru"))
    .map(([folder, entries]) => {
      const folderId = idFor("folder:" + folder)
      return `<div class="tdoc-export-folder">
        <div class="tdoc-export-node"><input type="checkbox" data-folder="${escapeAttr(folder)}" id="${folderId}">
        <label for="${folderId}"><strong>📁 ${escapeHtml(folder)}</strong></label></div>
        <div style="padding-left:1.5rem">${entries.map((doc) => {
          const id = idFor(doc.slug)
          return `<div class="tdoc-export-node"><input type="checkbox" data-slug="${escapeAttr(doc.slug)}" id="${id}">
            <label for="${id}">${escapeHtml(doc.title)}</label></div>`
        }).join("")}</div></div>`
    }).join("")

  root.querySelectorAll<HTMLInputElement>("input[data-folder]").forEach((folderBox) => {
    folderBox.addEventListener("change", () => {
      const parent = folderBox.closest(".tdoc-export-folder")!
      parent.querySelectorAll<HTMLInputElement>("input[data-slug]").forEach((box) => { box.checked = folderBox.checked })
      folderBox.indeterminate = false
    })
  })
  root.querySelectorAll<HTMLInputElement>("input[data-slug]").forEach((docBox) => {
    docBox.addEventListener("change", () => updateFolderState(docBox.closest(".tdoc-export-folder")!))
  })
}

function updateFolderState(folder: Element) {
  const docs = [...folder.querySelectorAll<HTMLInputElement>("input[data-slug]")]
  const parent = folder.querySelector<HTMLInputElement>("input[data-folder]")!
  parent.checked = docs.length > 0 && docs.every((box) => box.checked)
  parent.indeterminate = docs.some((box) => box.checked) && !parent.checked
}

function selectExplorerEntries(tree: HTMLElement, docs: Doc[], selector: string) {
  const explorer = document.querySelector(selector)
  if (!explorer) return
  const hrefs = new Set([...explorer.querySelectorAll<HTMLAnchorElement>(".explorer-content a[href], a[href]")]
    .filter((anchor) => anchor.getClientRects().length > 0)
    .map((anchor) => {
      try { return normalizePath(new URL(anchor.getAttribute("href")!, location.href).pathname) }
      catch { return "" }
    }))
  for (const box of tree.querySelectorAll<HTMLInputElement>("input[data-slug]")) {
    const doc = docs.find((item) => item.slug === box.dataset.slug)
    box.checked = Boolean(doc && hrefs.has(normalizePath(new URL(doc.url, location.origin).pathname)))
    updateFolderState(box.closest(".tdoc-export-folder")!)
  }
}

function normalizePath(path: string) {
  return decodeURIComponent(path).replace(/\\/g, "/").replace(/\/+$/, "") || "/"
}

async function loadTheme(url?: string): Promise<Theme> {
  const theme: Theme = {
    margins: [12, 14, 15, 14],
    font: "Arial",
    fontSize: "11pt",
    color: "#222222",
    headings: new Map(),
    tableBorder: "#B8B8B8",
    tableHeader: "#EAF0F5",
    tablePadding: "5pt",
  }
  if (!url) return theme
  try {
    const response = await fetch(url)
    if (!response.ok) return theme
    const xml = new DOMParser().parseFromString(await response.text(), "application/xml")
    if (xml.querySelector("parsererror")) return theme
    const margins = xml.querySelector("margins")
    if (margins) theme.margins = ["top", "right", "bottom", "left"].map((key, index) =>
      parseFloat(margins.getAttribute(key) ?? String(theme.margins[index]))) as Theme["margins"]
    const font = xml.querySelector("document > font")
    if (font) {
      theme.font = font.getAttribute("family") ?? theme.font
      theme.fontSize = font.getAttribute("size") ?? theme.fontSize
      theme.color = font.getAttribute("color") ?? theme.color
    }
    xml.querySelectorAll("heading").forEach((node) => {
      const level = Number(node.getAttribute("level"))
      if (level) theme.headings.set(level, {
        size: node.getAttribute("size") ?? undefined,
        color: node.getAttribute("color") ?? undefined,
        before: node.getAttribute("before") ?? undefined,
        after: node.getAttribute("after") ?? undefined,
      })
    })
    const table = xml.querySelector("table")
    if (table) {
      theme.tableBorder = table.getAttribute("border-color") ?? theme.tableBorder
      theme.tableHeader = table.getAttribute("header-background") ?? theme.tableHeader
      theme.tablePadding = table.getAttribute("cell-padding") ?? theme.tablePadding
    }
  } catch (error) {
    console.warn("TDOC Export: не удалось прочитать XML-тему", error)
  }
  return theme
}

async function markdownHtml(doc: Doc) {
  let source = doc.markdown.replace(/!\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g,
    (_all, target: string, alt?: string) => "![" + (alt ?? target.trim()) + "](" + resolveAssetUrl(target.trim(), doc) + ")")
  const math: Array<{ latex: string; display: boolean }> = []
  source = source.replace(/\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]|\\\(([\s\S]+?)\\\)|(?<!\$)\$([^\n$]+?)\$(?!\$)/g,
    (_all, blockDollar: string, blockBracket: string, inlineParen: string, inlineDollar: string) => {
      const display = blockDollar !== undefined || blockBracket !== undefined
      const latex = blockDollar ?? blockBracket ?? inlineParen ?? inlineDollar ?? ""
      const token = "TDOCMATHPLACEHOLDER" + math.length + "END"
      math.push({ latex, display })
      return display ? "\n\n" + token + "\n\n" : token
    })
  let html = await marked.parse(source, { gfm: true, breaks: false })
  math.forEach((item, index) => {
    const rendered = katex.renderToString(item.latex, { displayMode: item.display, throwOnError: false, strict: "ignore" })
    html = html.replaceAll("TDOCMATHPLACEHOLDER" + index + "END", rendered)
  })
  return html
}

function resolveAssetUrl(source: string, doc: Doc) {
  const cleaned = source.trim().replace(/^<|>$/g, "").replace(/\\/g, "/")
  if (/^(https?:|data:|blob:)/i.test(cleaned)) return cleaned
  const pageUrl = new URL(doc.url, location.origin)
  const segments = pageUrl.pathname.split("/").filter(Boolean)
  const prefix = segments.length > 1 ? "/" + segments[0] : ""
  const target = cleaned.replace(/^\/+/, "")
  if (cleaned.startsWith(prefix + "/")) return new URL(cleaned, location.origin).href
  if (/^(media|files|static)\//i.test(target)) return new URL(prefix + "/" + target, location.origin).href
  return new URL(target, pageUrl).href
}

async function exportDocx(docs: Doc[], options: ExportOptions, theme: Theme) {
  const blocks: any[] = []
  if (options.toc) {
    blocks.push(new Paragraph({ text: "Содержание", heading: HeadingLevel.HEADING_1 }))
    for (const doc of docs) {
      blocks.push(new Paragraph({ children: [new TextRun({ text: doc.title, bold: true })], spacing: { after: 80 } }))
      const headings = [...doc.markdown.matchAll(/^#{1,3}\s+(.+)$/gm)]
      for (const match of headings) blocks.push(new Paragraph({ text: "  " + match[1].replace(/[#*_`]/g, ""), spacing: { after: 40 } }))
    }
    blocks.push(new Paragraph({ pageBreakBefore: true, text: "" }))
  }
  for (let index = 0; index < docs.length; index++) {
    const doc = docs[index]
    if (index > 0) blocks.push(new Paragraph({ pageBreakBefore: true, text: "" }))
    blocks.push(new Paragraph({
      text: doc.title,
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 360, after: 200 },
    }))
    const html = await markdownHtml(doc)
    blocks.push(...await htmlToDocxBlocks(html, doc, options.images, theme))
  }
  const docx = new Document({
    sections: [{
      properties: {
        page: {
          size: { width: 11906, height: 16838 },
          margin: {
            top: mmToTwip(theme.margins[0]),
            right: mmToTwip(theme.margins[1]),
            bottom: mmToTwip(theme.margins[2]),
            left: mmToTwip(theme.margins[3]),
          },
        },
      },
      children: blocks,
    }],
    styles: { default: { document: { run: { font: theme.font, size: ptToHalfPoint(theme.fontSize), color: theme.color.replace("#", "") } } } },
  })
  downloadBlob(await Packer.toBlob(docx), makeFilename(docs, "docx"))
}

async function htmlToDocxBlocks(html: string, doc: Doc, includeImages: boolean, theme: Theme): Promise<any[]> {
  const parsed = new DOMParser().parseFromString(`<main>${html}</main>`, "text/html")
  const main = parsed.querySelector("main")!
  const result: any[] = []
  for (const node of [...main.children]) {
    const tag = node.tagName.toLowerCase()
    if (/^h[1-6]$/.test(tag)) {
      const level = Number(tag[1])
      result.push(new Paragraph({
        text: node.textContent ?? "",
        heading: headingLevel(level),
        spacing: { before: ptToTwip(parseFloat(theme.headings.get(level)?.before ?? "10")), after: ptToTwip(parseFloat(theme.headings.get(level)?.after ?? "6")) },
      }))
    } else if (tag === "p" || tag === "blockquote" || tag === "pre") {
      const runs = await inlineRuns(node, doc, includeImages)
      result.push(new Paragraph({
        children: runs.length ? runs : [new TextRun(node.textContent ?? "")],
        indent: tag === "blockquote" ? { left: 500 } : undefined,
        spacing: { after: 120 },
      }))
    } else if (tag === "ul" || tag === "ol") {
      const items = [...node.querySelectorAll(":scope > li")]
      for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
        const runs = await inlineRuns(items[itemIndex], doc, includeImages)
        if (tag === "ol") runs.unshift(new TextRun({ text: `${itemIndex + 1}. ` }))
        result.push(new Paragraph({ children: runs, bullet: tag === "ul" ? { level: 0 } : undefined, spacing: { after: 60 } }))
      }
    } else if (tag === "table") {
      const rows = [...node.querySelectorAll("tr")].map((tr) => new TableRow({
        children: [...tr.querySelectorAll("th,td")].map((cell) => new TableCell({
          children: [new Paragraph(cell.textContent ?? "")],
          shading: cell.tagName.toLowerCase() === "th" ? { fill: theme.tableHeader.replace("#", "") } : undefined,
          width: { size: 100 / Math.max(1, tr.children.length), type: WidthType.PERCENTAGE },
        })),
      }))
      if (rows.length) result.push(new Table({
        rows,
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: Object.fromEntries(["top", "bottom", "left", "right", "insideHorizontal", "insideVertical"].map((edge) => [edge, { style: BorderStyle.SINGLE, size: 1, color: theme.tableBorder.replace("#", "") }])) as any,
      }))
    } else if (tag === "hr") result.push(new Paragraph({ text: " " }))
    else if (node.textContent?.trim()) result.push(new Paragraph({ text: node.textContent.trim() }))
  }
  return result
}

async function inlineRuns(node: Element, doc: Doc, includeImages: boolean): Promise<any[]> {
  const runs: any[] = []
  const visit = async (current: Node, flags = { bold: false, italic: false, code: false }) => {
    if (current.nodeType === Node.TEXT_NODE) {
      const value = current.textContent ?? ""
      if (value) runs.push(new TextRun({ text: value, bold: flags.bold, italics: flags.italic, font: flags.code ? "Consolas" : undefined }))
      return
    }
    if (!(current instanceof Element)) return
    const tag = current.tagName.toLowerCase()
    if (current.classList.contains("katex")) {
      try {
        const holder = document.createElement("div")
        holder.style.cssText = "position:fixed;left:-10000px;top:0;background:#fff;color:#000;padding:5px;font-size:18px"
        holder.innerHTML = current.outerHTML
        document.body.append(holder)
        const canvas = await html2canvas(holder, { backgroundColor: "#ffffff", scale: 2 })
        holder.remove()
        const bytes = new Uint8Array(await (await fetch(canvas.toDataURL("image/png"))).arrayBuffer())
        const factor = Math.min(1, 520 / canvas.width)
        runs.push(new ImageRun({ type: "png", data: bytes, transformation: { width: Math.max(1, canvas.width * factor), height: Math.max(1, canvas.height * factor) } }))
      } catch { runs.push(new TextRun({ text: current.textContent ?? "" })) }
      return
    }
    if (tag === "img" && includeImages) {
      const src = current.getAttribute("src") ?? ""
      try {
        const response = await fetch(resolveAssetUrl(src, doc), { mode: "cors", credentials: "same-origin" })
        if (!response.ok) throw new Error(String(response.status))
        const blob = await response.blob()
        const objectUrl = URL.createObjectURL(blob)
        try {
          const image = new Image()
          image.src = objectUrl
          await image.decode()
          const factor = Math.min(1, 1400 / image.naturalWidth, 1800 / image.naturalHeight)
          const canvas = document.createElement("canvas")
          canvas.width = Math.max(1, Math.round(image.naturalWidth * factor))
          canvas.height = Math.max(1, Math.round(image.naturalHeight * factor))
          const context = canvas.getContext("2d")!
          context.fillStyle = "#ffffff"
          context.fillRect(0, 0, canvas.width, canvas.height)
          context.drawImage(image, 0, 0, canvas.width, canvas.height)
          const png = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error("PNG conversion failed")), "image/png"))
          const bytes = new Uint8Array(await png.arrayBuffer())
          const scale = Math.min(1, 520 / canvas.width, 680 / canvas.height)
          runs.push(new ImageRun({ type: "png", data: bytes, transformation: { width: Math.max(1, canvas.width * scale), height: Math.max(1, canvas.height * scale) } }))
        } finally { URL.revokeObjectURL(objectUrl) }
      } catch {
        runs.push(new TextRun({ text: "[Изображение недоступно: " + (current.getAttribute("alt") ?? src) + "]" }))
      }
      return
    }
    const next = {
      bold: flags.bold || ["strong", "b"].includes(tag),
      italic: flags.italic || ["em", "i"].includes(tag),
      code: flags.code || tag === "code",
    }
    for (const child of [...current.childNodes]) await visit(child, next)
  }
  for (const child of [...node.childNodes]) await visit(child)
  return runs
}

async function imageDimensions(bytes: Uint8Array, mime: string): Promise<{ width: number; height: number }> {
  const blob = new Blob([bytes.slice().buffer as ArrayBuffer], { type: mime })
  const url = URL.createObjectURL(blob)
  try {
    const image = new Image()
    image.src = url
    await image.decode()
    return { width: image.naturalWidth || 320, height: image.naturalHeight || 240 }
  } finally {
    URL.revokeObjectURL(url)
  }
}

async function exportPdf(docs: Doc[], options: ExportOptions, theme: Theme) {
  const wrapper = document.createElement("article")
  wrapper.className = "tdoc-export-print"
  wrapper.style.cssText = "position:fixed;left:0;top:0;z-index:-1;width:182mm;background:#fff;color:#222;padding:0;box-sizing:border-box"
  const contents = options.toc
    ? `<nav class="tdoc-export-toc"><h1>Содержание</h1><ol>${docs.map((doc) =>
        `<li><strong>${escapeHtml(doc.title)}</strong><ol>${[...doc.markdown.matchAll(/^#{1,3}\s+(.+)$/gm)]
          .map((match) => `<li>${escapeHtml(match[1].replace(/[#*_`]/g, ""))}</li>`).join("")}</ol></li>`).join("")}</ol></nav>`
    : ""
  const pages = await Promise.all(docs.map(async (doc, index) => {
    const parsed = new DOMParser().parseFromString(await markdownHtml(doc), "text/html")
    parsed.querySelectorAll<HTMLImageElement>("img[src]").forEach((image) => {
      try {
        image.setAttribute("src", resolveAssetUrl(image.getAttribute("src")!, doc))
      } catch {}
    })
    return `<section class="tdoc-export-page ${index ? "tdoc-export-break" : ""}">
      <h1>${escapeHtml(doc.title)}</h1>${parsed.body.innerHTML}</section>`
  }))
  wrapper.innerHTML = contents + pages.join("")
  if (!options.images) wrapper.querySelectorAll("img").forEach((image) => image.remove())
  wrapper.querySelectorAll<HTMLImageElement>("img").forEach((image) => {
    image.crossOrigin = "anonymous"
  })
  const style = document.createElement("style")
  style.textContent = `
    .tdoc-export-print{box-sizing:border-box;background:#fff;color:${theme.color};font-family:${theme.font},Arial,sans-serif;
      font-size:${theme.fontSize};line-height:1.5;padding:0}
    .tdoc-export-print h1{font-size:${theme.headings.get(1)?.size ?? "20pt"};color:${theme.headings.get(1)?.color ?? "#26384A"}}
    .tdoc-export-print h2{font-size:${theme.headings.get(2)?.size ?? "16pt"};color:${theme.headings.get(2)?.color ?? "#365B78"}}
    .tdoc-export-print h3{font-size:${theme.headings.get(3)?.size ?? "13pt"}}
    .tdoc-export-print img{max-width:100%;height:auto;object-fit:contain}
    .tdoc-export-print table{border-collapse:collapse;width:100%}
    .tdoc-export-print td,.tdoc-export-print th{border:1px solid ${theme.tableBorder};padding:${theme.tablePadding}}
    .tdoc-export-print th{background:${theme.tableHeader}}
    .tdoc-export-print pre{white-space:pre-wrap;background:#f3f3f3;padding:8px}
    .tdoc-export-print blockquote{border-left:3px solid #aaa;margin-left:0;padding-left:12px}
    .tdoc-export-break{page-break-before:always;break-before:page}
    .tdoc-export-toc{page-break-after:always;break-after:page}
    .tdoc-export-toc li{margin:.2rem 0}
  `
  document.head.append(style)
  document.body.append(wrapper)
  try {
    await Promise.all([...wrapper.querySelectorAll("img")].map((img) => img.decode().catch(() => undefined)))
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
    const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait", compress: true })
    const [top, right, bottom, left] = theme.margins
    const pageWidth = 210 - left - right
    const pageHeight = 297 - top - bottom
    let hasPage = false
    for (const target of [...wrapper.children] as HTMLElement[]) {
      const canvas = await html2canvas(target, { scale: 1.5, useCORS: true, allowTaint: false, backgroundColor: "#ffffff", logging: false, windowWidth: Math.max(900, wrapper.scrollWidth), scrollX: 0, scrollY: 0 })
      if (!canvas.width || !canvas.height) continue
      const sliceHeight = Math.max(1, Math.floor(canvas.width * pageHeight / pageWidth))
      for (let offset = 0; offset < canvas.height; offset += sliceHeight) {
        if (hasPage) pdf.addPage()
        const height = Math.min(sliceHeight, canvas.height - offset)
        const slice = document.createElement("canvas")
        slice.width = canvas.width
        slice.height = height
        slice.getContext("2d")!.drawImage(canvas, 0, offset, canvas.width, height, 0, 0, canvas.width, height)
        pdf.addImage(slice.toDataURL("image/jpeg", 0.94), "JPEG", left, top, pageWidth, height * pageWidth / canvas.width, undefined, "FAST")
        hasPage = true
      }
    }
    if (!hasPage) throw new Error("Не удалось отрисовать содержимое PDF.")
    pdf.save(makeFilename(docs, "pdf"))
  } finally {
    wrapper.remove()
    style.remove()
  }
}

function headingLevel(level: number) {
  return [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3,
    HeadingLevel.HEADING_4, HeadingLevel.HEADING_5, HeadingLevel.HEADING_6][level - 1]
}
function mmToTwip(mm: number) { return Math.round(mm * 56.6929) }
function ptToTwip(pt: number) { return Math.round(pt * 20) }
function ptToHalfPoint(value: string) { return Math.round(parseFloat(value) * 2) || 22 }
function makeFilename(docs: Doc[], extension: string) {
  const base = docs.length === 1 ? docs[0].title : `TDOC-export-${docs.length}-documents`
  return base.replace(/[\\/:*?"<>|]+/g, "-").slice(0, 100) + "." + extension
}
function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = name
  anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
function idFor(value: string) {
  let hash = 2166136261
  for (let i = 0; i < value.length; i++) hash = Math.imul(hash ^ value.charCodeAt(i), 16777619)
  return "tdoc-" + (hash >>> 0).toString(36)
}
function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!)
}
function escapeAttr(value: string) { return escapeHtml(value) }
