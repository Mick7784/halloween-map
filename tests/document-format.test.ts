import { describe, it, expect } from "vitest";
import { documentHtml, documentText, documentOutline, validateDocument, safeDocumentLink } from "../lib/document-format";
const doc = (child: unknown) => ({ type: "doc", content: [child] });
const p = (text = "Texte") => ({ type: "paragraph", content: [{ type: "text", text }] });
describe("closed documentary grammar", () => {
  it("escapes text and renders headings, tables, tasks, styles and safe links", () => {
    const d = { type: "doc", content: [
      { type: "heading", attrs: { level: 2, textAlign: "center" }, content: [{ type: "text", text: "<script>Bonjour</script>", marks: [{ type: "bold" }] }] },
      { type: "table", content: [{ type: "tableRow", content: [{ type: "tableCell", content: [p()] }] }] },
      { type: "taskList", content: [{ type: "taskItem", attrs: { checked: true }, content: [p()] }] },
      { type: "paragraph", content: [{ type: "text", text: "Lien", marks: [{ type: "link", attrs: { href: "https://example.org/?x=1&y=2", target: "evil" } }, { type: "textStyle", attrs: { color: "#076d96" } }] }] },
    ] };
    const html = documentHtml(d);
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script>');
    expect(html).toContain('id="document-section-0"');
    expect(html).toContain('<td colspan="1" rowspan="1">');
    expect(html).toContain('disabled aria-label="Consigne" checked');
    expect(html).not.toContain('evil');
    expect(documentOutline(d)).toEqual([{ id: "document-section-0", text: "<script>Bonjour</script>", level: 2 }]);
    expect(documentText(d)).toContain("Lien");
  });
  it.each(["javascript:alert(1)", "data:text/html,bad", "//evil.org", "/\\evil.org", "https://a.org/\" onclick=bad", "https://a.org/\n"])('rejects unsafe link %s', href => {
    expect(safeDocumentLink(href)).toBe(false);
    expect(() => validateDocument(doc({ type: "paragraph", content: [{ type: "text", text: "x", marks: [{ type: "link", attrs: { href } }] }] }))).toThrow();
  });
  it("rejects events, arbitrary styles, unsupported nodes and malformed structure", () => {
    for (const child of [
      { ...p(), attrs: { onclick: "bad" } },
      { ...p(), attrs: { textAlign: "left;background:red" } },
      { type: "script", content: [] },
      { type: "paragraph", content: [{ type: "table" }] },
      { type: "paragraph", content: [{ type: "text", text: "x", marks: [{ type: "textStyle", attrs: { color: "url(evil)" } }] }] },
    ]) expect(() => validateDocument(doc(child))).toThrow();
  });
  it("allows an empty draft but keeps bounded complexity and size", () => {
    expect(documentText(validateDocument(doc({ type: "paragraph" })))).toBe("");
    expect(() => validateDocument(doc(p("x".repeat(500001))))).toThrow();
    let node: unknown = p();
    for (let i = 0; i < 40; i++) node = { type: "blockquote", content: [node] };
    expect(() => validateDocument(doc(node))).toThrow();
  });
});
