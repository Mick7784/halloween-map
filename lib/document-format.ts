import { escapeHtml } from "./editorial-format";

export type DocumentNode = {
  type: string;
  text?: string;
  attrs?: Record<string, unknown>;
  marks?: { type: string; attrs?: Record<string, unknown> }[];
  content?: DocumentNode[];
};
export const documentColors = ["#202b3b", "#ffffff", "#b23a49", "#26734e", "#076d96", "#7951b5", "#fff4a3"];
export function safeDocumentLink(value: unknown): value is string {
  return typeof value === "string" && value.length <= 2048 &&
    /^(https:\/\/|\/(?![\/\\])|mailto:)[^\s<>"'\\\u0000-\u001f]*$/i.test(value);
}
const blocks = ["paragraph", "heading", "bulletList", "orderedList", "taskList", "blockquote", "horizontalRule", "table"];
const inline = ["text", "hardBreak"];
/** Closed grammar shared by API, preview and public renderer. No HTML input. */
export function validateDocument(value: unknown): DocumentNode {
  if (JSON.stringify(value ?? null).length > 500000) throw Error("Document trop volumineux (500 Ko maximum)");
  let count = 0;
  function node(raw: unknown, parent: string, depth: number): DocumentNode {
    if (++count > 20000 || depth > 32) throw Error("Document trop complexe");
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw Error("Nœud documentaire invalide");
    const n = raw as DocumentNode;
    if (Object.keys(n).some(k => !["type", "text", "attrs", "marks", "content"].includes(k))) throw Error("Propriété documentaire interdite");
    const allowed = parent === "root" ? ["doc"] : parent === "doc" || ["blockquote", "listItem", "taskItem", "tableCell", "tableHeader"].includes(parent) ? blocks :
      ["paragraph", "heading"].includes(parent) ? inline : parent === "table" ? ["tableRow"] : parent === "tableRow" ? ["tableCell", "tableHeader"] :
      ["bulletList", "orderedList"].includes(parent) ? ["listItem"] : parent === "taskList" ? ["taskItem"] : [];
    if (!allowed.includes(n.type)) throw Error("Structure documentaire non autorisée : " + n.type);
    const out: DocumentNode = { type: n.type };
    const attrs = n.attrs ?? {};
    if (!attrs || typeof attrs !== "object" || Array.isArray(attrs)) throw Error("Attributs invalides");
    const keys = n.type === "heading" ? ["level", "textAlign"] : n.type === "paragraph" ? ["textAlign"] : n.type === "orderedList" ? ["start", "type"] :
      n.type === "taskItem" ? ["checked"] : ["tableCell", "tableHeader"].includes(n.type) ? ["colspan", "rowspan", "colwidth", "align"] : [];
    if (Object.keys(attrs).some(k => !keys.includes(k))) throw Error("Attribut documentaire interdit");
    const a: Record<string, unknown> = {};
    if (n.type === "heading") {
      if (![1, 2, 3].includes(Number(attrs.level))) throw Error("Titre invalide");
      a.level = Number(attrs.level);
    }
    if (attrs.textAlign != null) {
      if (!["left", "center", "right", "justify"].includes(String(attrs.textAlign))) throw Error("Alignement invalide");
      a.textAlign = attrs.textAlign;
    }
    if (n.type === "taskItem") {
      if (typeof attrs.checked !== "boolean") throw Error("Case invalide");
      a.checked = attrs.checked;
    }
    if (n.type === "orderedList") {
      const start = attrs.start ?? 1;
      if (!Number.isInteger(start) || Number(start) < 1 || Number(start) > 10000) throw Error("Numérotation invalide");
      a.start = start;
      if (attrs.type != null && attrs.type !== "1") throw Error("Type de liste invalide");
    }
    if (["tableCell", "tableHeader"].includes(n.type)) {
      for (const key of ["colspan", "rowspan"]) {
        const size = attrs[key] ?? 1;
        if (!Number.isInteger(size) || Number(size) < 1 || Number(size) > 50) throw Error("Dimension de cellule invalide");
        a[key] = size;
      }
      // Widths are controlled by responsive CSS, never by arbitrary pasted styles.
      if (attrs.colwidth != null && (!Array.isArray(attrs.colwidth) || attrs.colwidth.some(v => !Number.isInteger(v) || v < 25 || v > 2000))) throw Error("Largeur invalide");
      if (attrs.align != null && !["left", "center", "right"].includes(String(attrs.align))) throw Error("Alignement invalide");
    }
    if (Object.keys(a).length) out.attrs = a;
    if (n.type === "text") {
      if (typeof n.text !== "string" || !n.text || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(n.text)) throw Error("Texte invalide");
      out.text = n.text;
    } else if (n.text !== undefined) throw Error("Texte hors paragraphe");
    if (n.marks) {
      if (n.type !== "text" || !Array.isArray(n.marks) || n.marks.length > 7) throw Error("Styles invalides");
      out.marks = n.marks.map(m => {
        if (!m || Object.keys(m).some(k => !["type", "attrs"].includes(k))) throw Error("Style invalide");
        if (["bold", "italic", "underline", "strike"].includes(m.type) && !Object.keys(m.attrs ?? {}).length) return { type: m.type };
        if (m.type === "link") {
          if (!safeDocumentLink(m.attrs?.href) || Object.keys(m.attrs ?? {}).some(k => !["href", "target", "rel", "class"].includes(k))) throw Error("Lien non sûr");
          return { type: "link", attrs: { href: m.attrs.href } };
        }
        if (["textStyle", "highlight"].includes(m.type)) {
          if (Object.keys(m.attrs ?? {}).some(k => k !== "color")) throw Error("Style arbitraire interdit");
          if (!documentColors.includes(String(m.attrs?.color))) throw Error("Couleur non autorisée");
          return { type: m.type, attrs: { color: m.attrs!.color } };
        }
        throw Error("Style non autorisé");
      });
    }
    if (n.content !== undefined) {
      if (!Array.isArray(n.content) || ["text", "hardBreak", "horizontalRule"].includes(n.type)) throw Error("Contenu invalide");
      out.content = n.content.map(c => node(c, n.type, depth + 1));
    }
    if (["doc", "bulletList", "orderedList", "taskList", "listItem", "taskItem", "table", "tableRow", "tableCell", "tableHeader", "blockquote"].includes(n.type) && !out.content?.length) throw Error("Structure vide");
    if (["listItem", "taskItem"].includes(n.type) && out.content?.[0]?.type !== "paragraph") throw Error("Liste sans paragraphe");
    return out;
  }
  return node(value, "root", 0);
}
export function documentText(n: DocumentNode): string {
  return n.text ?? (n.type === "hardBreak" ? "\n" : (n.content ?? []).map(documentText).join(["paragraph", "heading"].includes(n.type) ? "" : "\n"));
}
export function documentOutline(n: DocumentNode) {
  const headings: { id: string; text: string; level: number }[] = [];
  function visit(n: DocumentNode) {
    if (n.type === "heading") headings.push({ id: "document-section-" + headings.length, text: documentText(n), level: Number(n.attrs?.level) });
    n.content?.forEach(visit);
  }
  visit(n);
  return headings;
}
export function documentHtml(value: unknown): string {
  const root = validateDocument(value);
  let heading = 0;
  function render(n: DocumentNode): string {
    const a = n.attrs ?? {};
    if (n.type === "text") return (n.marks ?? []).reduce((s, m) => {
      const tag = ({ bold: "strong", italic: "em", underline: "u", strike: "s" } as Record<string, string>)[m.type];
      if (tag) return `<${tag}>${s}</${tag}>`;
      if (m.type === "link") return `<a href="${escapeHtml(String(m.attrs!.href))}" rel="noopener noreferrer">${s}</a>`;
      return m.type === "highlight" ? `<mark style="background-color:${m.attrs!.color}">${s}</mark>` : `<span style="color:${m.attrs!.color}">${s}</span>`;
    }, escapeHtml(n.text!));
    const children = (n.content ?? []).map(render).join("");
    if (n.type === "doc") return children;
    if (n.type === "hardBreak") return "<br>";
    if (n.type === "horizontalRule") return "<hr>";
    const tag = n.type === "heading" ? "h" + a.level : ({ paragraph: "p", bulletList: "ul", orderedList: "ol", taskList: "ul", listItem: "li", taskItem: "li", blockquote: "blockquote", table: "table", tableRow: "tr", tableCell: "td", tableHeader: "th" } as Record<string, string>)[n.type];
    const attributes = (n.type === "heading" ? ` id="document-section-${heading++}"` : "") +
      (a.textAlign ? ` style="text-align:${a.textAlign}"` : "") +
      (n.type === "orderedList" ? ` start="${a.start}"` : "") +
      (["tableCell", "tableHeader"].includes(n.type) ? ` colspan="${a.colspan}" rowspan="${a.rowspan}"` : "") +
      (n.type === "taskList" ? ' class="document-tasks"' : "");
    const checkbox = n.type === "taskItem" ? `<input type="checkbox" disabled aria-label="Consigne"${a.checked ? " checked" : ""}>` : "";
    return `<${tag}${attributes}>${checkbox}${children}</${tag}>`;
  }
  return render(root);
}
