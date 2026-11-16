import { marked } from "marked"
import {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
  ImageRun, Table, TableRow, TableCell, WidthType, BorderStyle,
} from "docx"
import html2pdf from "html2pdf.js"

declare global {
  interface Window {
    __TDOC_EXPORT_CONFIG__?: {
      manifestPath: string
      iconPath: string
      toolbarSelector: string
      explorerSelector: string
      buttonLabel: string
      customCss?: string
      themeXml?: string
    }
  }
}

type Doc = { slug: string; title: string; folder: string; markdown: string; url: string }
type Manifest = { version: 1; generatedAt: string; siteBaseUrl: string; documents: Doc[] }

const cfg = window.__TDOC_EXPORT_CONFIG__
if (cfg) void boot(cfg)

async function boot(config: NonNullable<typeof cfg>) {
  if (document.getElementById("tdoc-export-button")) return
  const manifestUrl = new URL(config.manifestPath, location.origin)
  const response = await fetch(manifestUrl)
  if (!response.ok) throw new Error(`TDOC Export: cannot load ${manifestUrl}`)
  const manifest = await response.json() as Manifest

  if (config.customCss) {
    const link = document.createElement("link")
    link.rel = "stylesheet"
    link.href = config.customCss
    document.head.append(link)
  }
  injectStyles()
  const button = document.createElement("button")
  button.id = "tdoc-export-button"
  button.type = "button"
  button.className = "tdoc-export-trigger"
  button.title = "Экспортировать документы"
  button.innerHTML = `<img alt="" src="${escapeAttr(config.iconPath)}"><span>${escapeHtml(config.buttonLabel)}</span>`
  button.addEventListener("click", () => openDialog(manifest, config))
  mountButton(button, config.toolbarSelector)
  // Quartz layouts may hydrate toolbar items after DOMContentLoaded.
  new MutationObserver(() => mountButton(button, config.toolbarSelector))
    .observe(document.body, { childList: true, subtree: true })
}

function mountButton(button: HTMLButtonElement, selector: string) {
  if (button.isConnected) return
  const candidates = selector.split(",").map(s => s.trim()).filter(Boolean)
  const target = candidates.map(s => document.querySelector(s)).find(Boolean)
  if (!target) {
    const right = document.querySelector(".right, .header, header")
    if (right) right.append(button)
    return
  }
  target.append(button)
}

function injectStyles() {
  if (document.getElementById("tdoc-export-styles")) return
  const style = document.createElement("style")
  style.id = "tdoc-export-styles"
  style.textContent = `
    .tdoc-export-trigger{display:inline-flex;align-items:center;gap:.45rem;border:1px solid var(--lightgray);
      border-radius:8px;padding:.45rem .65rem;background:var(--light);color:var(--dark);cursor:pointer;
      font:inherit;font-size:.9rem;transition:background .15s,border-color .15s}
    .tdoc-export-trigger:hover{background:var(--highlight);border-color:var(--secondary)}
    .tdoc-export-trigger img{width:18px;height:18px;object-fit:contain}
    .tdoc-export-backdrop{position:fixed;inset:0;z-index:10000;background:#0008;display:grid;place-items:center;padding:1rem}
    .tdoc-export-dialog{width:min(760px,96vw);max-height:88vh;overflow:auto;background:var(--light);
      color:var(--dark);border:1px solid var(--lightgray);border-radius:14px;padding:1.2rem;
      box-shadow:0 18px 60px #0004;font:inherit}
    .tdoc-export-dialog h2{margin:.1rem 0 1rem;font-size:1.25rem}
    .tdoc-export-toolbar{display:flex;gap:.6rem;flex-wrap:wrap;margin:.7rem 0}
    .tdoc-export-dialog button,.tdoc-export-dialog select{font:inherit}
    .tdoc-export-action{border:1px solid var(--lightgray);background:var(--light);color:var(--dark);border-radius:8px;padding:.5rem .8rem;cursor:pointer}
    .tdoc-export-primary{background:var(--secondary);color:white;border-color:var(--secondary)}
    .tdoc-export-tree{border:1px solid var(--lightgray);border-radius:8px;padding:.6rem;max-height:42vh;overflow:auto}
    .tdoc-export-node{display:flex;align-items:center;gap:.5rem;padding:.22rem .1rem}
    .tdoc-export-node label{cursor:pointer}
    .tdoc-export-muted{opacity:.72;font-size:.86rem}
    .tdoc-export-footer{display:flex;justify-content:space-between;gap:.8rem;align-items:center;flex-wrap:wrap;margin-top:1rem}
    .tdoc-export-close{float:right;border:0;background:transparent;color:var(--dark);font-size:1.4rem;cursor:pointer}
    .tdoc-export-status{min-height:1.3em;margin-top:.5rem;color:var(--secondary);font-size:.9rem}
    @media(max-width:600px){.tdoc-export-trigger span{display:none}.tdoc-export-dialog{padding:.9rem}}
  `
  document.head.append(style)
}

function openDialog(manifest: Manifest, config: NonNullable<typeof cfg>) {
  const backdrop = document.createElement("div")
  backdrop.className = "tdoc-export-backdrop"
  const dialog = document.createElement("section")
  dialog.className = "tdoc-export-dialog"
  dialog.setAttribute("role", "dialog")
  dialog.setAttribute("aria-modal", "true")
  dialog.setAttribute("aria-label", "Экспорт документов")
  dialog.innerHTML = `
    <button class="tdoc-export-close" aria-label="Закрыть">×</button>
    <h2>Экспорт документов</h2>
    <p class="tdoc-export-muted">Выберите разделы или отдельные документы, затем формат файла.</p>
    <div class="tdoc-export-toolbar">
      <button class="tdoc-export-action" data-action="all">Выбрать всё</button>
      <button class="tdoc-export-action" data-action="none">Снять выбор</button>
      <button class="tdoc-export-action" data-action="explorer">Выбрать видимые в проводнике</button>
    </div>
    <div class="tdoc-export-tree"></div>
    <div class="tdoc-export-footer">
      <label>Формат:
        <select id="tdoc-export-format"><option value="docx">Word (.docx)</option><option value="pdf">PDF (.pdf)</option></select>
      </label>
      <label><input id="tdoc-export-images" type="checkbox" checked> Изображения</label>
      <label><input id="tdoc-export-toc" type="checkbox" checked> Содержание</label>
      <button class="tdoc-export-action tdoc-export-primary" data-action="export">Экспортировать</button>
    </div>
    <div class="tdoc-export-status" aria-live="polite"></div>
  `
  backdrop.append(dialog)
  document.body.append(backdrop)
  const tree = dialog.querySelector(".tdoc-export-tree") as HTMLElement
  renderTree(tree, manifest.documents)
  const close = () => backdrop.remove()
  dialog.querySelector(".tdoc-export-close")!.addEventListener("click", close)
  backdrop.addEventListener("click", e => { if (e.target === backdrop) close() })
  dialog.addEventListener("click", async e => {
    const button = (e.target as HTMLElement).closest<HTMLButtonElement>("button[data-action]")
    if (!button) return
    const action = button.dataset.action
    if (action === "all" || action === "none") {
      tree.querySelectorAll<HTMLInputElement>("input[type=checkbox]").forEach(x => x.checked = action === "all")
      return
    }
    if (action === "explorer") {
      selectExplorerEntries(tree, config.explorerSelector)
      return
    }
    if (action === "export") {
      const ids = [...tree.querySelectorAll<HTMLInputElement>("input[data-slug]:checked")].map(x => x.dataset.slug!)
      const selected = manifest.documents.filter(d => ids.includes(d.slug))
      if (!selected.length) { status("Выберите хотя бы один документ."); return }
      button.disabled = true
      try {
        const opts = {
          images: (dialog.querySelector("#tdoc-export-images") as HTMLInputElement).checked,
          toc: (dialog.querySelector("#tdoc-export-toc") as HTMLInputElement).checked,
        }
        const format = (dialog.querySelector("#tdoc-export-format") as HTMLSelectElement).value
        if (format === "docx") await exportDocx(selected, opts)
        else await exportPdf(selected, opts, config.themeXml)
        status("Документ сформирован.")
      } catch (err) {
        console.error(err); status(`Ошибка экспорта: ${err instanceof Error ? err.message : String(err)}`)
      } finally { button.disabled = false }
    }
  })
  function status(message: string) {
    ;(dialog.querySelector(".tdoc-export-status") as HTMLElement).textContent = message
  }
}

function renderTree(root: HTMLElement, docs: Doc[]) {
  const folders = new Map<string, Doc[]>()
  for (const doc of docs) {
    const key = doc.folder || "Документы"
    folders.set(key, [...(folders.get(key) ?? []), doc])
  }
  root.innerHTML = [...folders.entries()].sort(([a],[b]) => a.localeCompare(b,"ru")).map(([folder, entries]) => `
    <div class="tdoc-export-folder">
      <div class="tdoc-export-node"><input type="checkbox" data-folder="${escapeAttr(folder)}" id="${idFor(folder)}">
      <label for="${idFor(folder)}"><strong>📁 ${escapeHtml(folder)}</strong></label></div>
      <div style="padding-left:1.5rem">${entries.map(doc => `
        <div class="tdoc-export-node"><input type="checkbox" data-slug="${escapeAttr(doc.slug)}" id="${idFor(doc.slug)}">
        <label for="${idFor(doc.slug)}">${escapeHtml(doc.title)}</label></div>`).join("")}</div>
    </div>`).join("")
  root.querySelectorAll<HTMLInputElement>("input[data-folder]").forEach(folderBox => {
    folderBox.addEventListener("change", () => {
      const parent = folderBox.closest(".tdoc-export-folder")!
      parent.querySelectorAll<HTMLInputElement>("input[data-slug]").forEach(x => x.checked = folderBox.checked)
    })
  })
  root.querySelectorAll<HTMLInputElement>("input[data-slug]").forEach(docBox => {
    docBox.addEventListener("change", () => {
      const parent = docBox.closest(".tdoc-export-folder")!
      const children = [...parent.querySelectorAll<HTMLInputElement>("input[data-slug]")]
      const folder = parent.querySelector<HTMLInputElement>("input[data-folder]")!
      folder.checked = children.every(x => x.checked)
      folder.indeterminate = children.some(x => x.checked) && !folder.checked
    })
  })
}

function selectExplorerEntries(tree: HTMLElement, selector: string) {
  const explorer = document.querySelector(selector)
  if (!explorer) return
  // Generic DOM adapter: links in custom-explorer are matched by their href
  // against the build manifest slugs. No private Explorer API is assumed.
  const hrefs = new Set([...explorer.querySelectorAll<HTMLAnchorElement>("a[href]")].map(a => {
    try { return decodeURIComponent(new URL(a.href).pathname).replace(/\/$/, "") } catch { return "" }
  }))
  tree.querySelectorAll<HTMLInputElement>("input[data-slug]").forEach(box => {
    const slug = box.dataset.slug ?? ""
    const path = new URL(slug, document.baseURI).pathname.replace(/\/$/, "")
    box.checked = hrefs.has(path) || hrefs.has(`${path}/`)
    box.dispatchEvent(new Event("change", { bubbles: true }))
  })
}

async function exportDocx(docs: Doc[], opts: { images: boolean; toc: boolean }) {
  const children: (Paragraph | Table)[] = []
  for (let i = 0; i < docs.length; i++) {
    const doc = docs[i]
    if (i > 0) children.push(new Paragraph({ pageBreakBefore: true, text: "" }))
    children.push(new Paragraph({ text: doc.title, heading: HeadingLevel.HEADING_1, spacing: { after: 240 } }))
    const html = await marked.parse(doc.markdown)
    children.push(...await htmlToDocxBlocks(html, doc.url, opts.images))
  }
  const document = new Document({
    sections: [{ properties: {}, children }],
    styles: { default: { document: { run: { font: "Arial", size: 22 } } } },
  })
  const blob = await Packer.toBlob(document)
  downloadBlob(blob, "tdoc-export.docx")
}

async function htmlToDocxBlocks(html: string, baseUrl: string, includeImages: boolean): Promise<(Paragraph | Table)[]> {
  const parsed = new DOMParser().parseFromString(`<main>${html}</main>`, "text/html")
  const result: (Paragraph | Table)[] = []
  for (const node of [...parsed.querySelector("main")!.children]) {
    const tag = node.tagName.toLowerCase()
    if (/^h[1-6]$/.test(tag)) {
      const level = Number(tag[1])
      result.push(new Paragraph({ text: node.textContent ?? "", heading: ([HeadingLevel.HEADING_1,HeadingLevel.HEADING_2,HeadingLevel.HEADING_3,HeadingLevel.HEADING_4,HeadingLevel.HEADING_5,HeadingLevel.HEADING_6][level-1]), spacing:{before:160,after:100} }))
    } else if (tag === "p" || tag === "blockquote" || tag === "pre" || tag === "li") {
      const runs = await inlineRuns(node, baseUrl, includeImages)
      result.push(new Paragraph({ children: runs.length ? runs : [new TextRun(node.textContent ?? "")], bullet: tag === "li" ? { level: 0 } : undefined, indent: tag === "blockquote" ? { left: 500 } : undefined, spacing: { after: 120 } }))
    } else if (tag === "ul" || tag === "ol") {
      for (const li of [...node.querySelectorAll(":scope > li")]) {
        result.push(new Paragraph({ children: await inlineRuns(li, baseUrl, includeImages), bullet: { level: 0 }, spacing: { after: 60 } }))
      }
    } else if (tag === "table") {
      const rows = [...node.querySelectorAll("tr")].map(tr => new TableRow({ children: [...tr.querySelectorAll("th,td")].map(cell => new TableCell({ children: [new Paragraph(cell.textContent ?? "")], width: { size: 100 / Math.max(1,tr.children.length), type: WidthType.PERCENTAGE } })) }))
      if (rows.length) result.push(new Table({ rows, width: { size: 100, type: WidthType.PERCENTAGE }, borders: { insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: "B8B8B8" }, insideVertical: { style: BorderStyle.SINGLE, size: 1, color: "B8B8B8" }, top: { style: BorderStyle.SINGLE, size: 1, color: "B8B8B8" }, bottom: { style: BorderStyle.SINGLE, size: 1, color: "B8B8B8" }, left: { style: BorderStyle.SINGLE, size: 1, color: "B8B8B8" }, right: { style: BorderStyle.SINGLE, size: 1, color: "B8B8B8" } } }))
    } else if (tag === "hr") result.push(new Paragraph({ text: " " }))
    else if (node.textContent?.trim()) result.push(new Paragraph({ text: node.textContent.trim() }))
  }
  return result
}

async function inlineRuns(node: Element, baseUrl: string, includeImages: boolean): Promise<TextRun[]> {
  const runs: TextRun[] = []
  const walk = async (n: Node, flags = { bold: false, italic: false, code: false }) => {
    if (n.nodeType === Node.TEXT_NODE) {
      const value = n.textContent ?? ""
      if (value) runs.push(new TextRun({ text: value, bold: flags.bold, italics: flags.italic, font: flags.code ? "Consolas" : "Arial" }))
      return
    }
    if (!(n instanceof Element)) return
    const tag = n.tagName.toLowerCase()
    if (tag === "img" && includeImages) {
      try {
        const src = new URL(n.getAttribute("src") ?? "", baseUrl).href
        const res = await fetch(src)
        const bytes = new Uint8Array(await res.arrayBuffer())
        runs.push(new TextRun({ text: `[Изображение: ${n.getAttribute("alt") ?? src}]` }))
        // Image embedding in Word is added as a paragraph in a later enhancement;
        // retain a readable caption rather than silently dropping inaccessible media.
      } catch { runs.push(new TextRun({ text: `[Не удалось загрузить изображение: ${n.getAttribute("alt") ?? ""}]` })) }
      return
    }
    const next = { bold: flags.bold || ["strong","b"].includes(tag), italic: flags.italic || ["em","i"].includes(tag), code: flags.code || tag === "code" }
    for (const child of [...n.childNodes]) await walk(child, next)
  }
  for (const child of [...node.childNodes]) await walk(child)
  return runs
}

async function exportPdf(docs: Doc[], opts: { images: boolean; toc: boolean }, themeXml?: string) {
  const wrapper = document.createElement("article")
  wrapper.className = "tdoc-export-print"
  wrapper.innerHTML = docs.map((doc, i) => `<section class="tdoc-export-page ${i ? "tdoc-export-break" : ""}">
    <h1>${escapeHtml(doc.title)}</h1>${marked.parse(doc.markdown) as string}</section>`).join("")
  if (!opts.images) wrapper.querySelectorAll("img").forEach(x => x.remove())
  const css = document.createElement("style")
  css.textContent = `body{font-family:Arial,sans-serif;color:#222}.tdoc-export-print{font:11pt Arial;line-height:1.5}
    .tdoc-export-print h1,.tdoc-export-print h2{page-break-after:avoid}.tdoc-export-print img{max-width:100%;height:auto}
    .tdoc-export-print table{border-collapse:collapse;width:100%}.tdoc-export-print td,.tdoc-export-print th{border:1px solid #aaa;padding:5px}
    .tdoc-export-break{page-break-before:always;break-before:page}`
  wrapper.prepend(css)
  document.body.append(wrapper)
  try {
    await (html2pdf() as any).set({
      margin: [12, 14, 15, 14],
      filename: "tdoc-export.pdf",
      image: { type: "jpeg", quality: .96 },
      html2canvas: { scale: 2, useCORS: true, logging: false },
      jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
      pagebreak: { mode: ["css", "legacy"] },
    }).from(wrapper).save()
  } finally { wrapper.remove() }
}

function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a"); a.href = url; a.download = name; a.click()
  URL.revokeObjectURL(url)
}
function idFor(s: string) { return `tdoc-${btoa(unescape(encodeURIComponent(s))).replace(/[^a-z0-9]/gi,"").slice(0,32)}` }
function escapeHtml(s: string) { return s.replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]!)) }
function escapeAttr(s: string) { return escapeHtml(s) }
