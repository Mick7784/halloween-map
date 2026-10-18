// @vitest-environment jsdom
import { it, expect } from "vitest";
import { Editor } from "@tiptap/core";
import { cleanDocumentPaste, documentExtensions } from "../components/DocumentEditor";
import { validateDocument, documentHtml } from "../lib/document-format";
it("roundtrips actual Tiptap commands through the server grammar without losing rich features", () => {
  const editor = new Editor({ extensions: documentExtensions(), content: "<p>Texte</p>" });
  try {
    editor.commands.selectAll();
    editor.chain().toggleBold().toggleItalic().toggleUnderline().toggleStrike().setColor("#076d96").toggleHighlight({ color: "#fff4a3" }).setLink({ href: "https://example.org" }).run();
    editor.commands.setTextAlign("center");
    let html = documentHtml(editor.getJSON());
    for (const tag of ["<strong>", "<em>", "<u>", "<s>", "<mark", "<a ", "color:#076d96", "text-align:center"]) expect(html).toContain(tag);
    editor.commands.toggleHeading({ level: 1 });
    expect(documentHtml(editor.getJSON())).toContain("<h1");
    editor.commands.setParagraph();
    editor.commands.toggleTaskList();
    expect(documentHtml(editor.getJSON())).toContain("checkbox");
    editor.commands.toggleTaskList();
    editor.commands.insertTable({ rows: 2, cols: 2, withHeaderRow: true });
    editor.commands.addColumnAfter(); editor.commands.addRowAfter();
    html = documentHtml(editor.getJSON());
    expect(html).toContain("<table>");
    expect(html.match(/<tr>/g)?.length).toBe(3);
    editor.commands.deleteColumn(); editor.commands.deleteRow();
    expect(() => validateDocument(editor.getJSON())).not.toThrow();
    editor.commands.undo();
    expect(() => validateDocument(editor.getJSON())).not.toThrow();
  } finally { editor.destroy(); }
});
it("cleans office HTML and unsafe clipboard attributes before schema parsing", () => {
  const clean = cleanDocumentPaste('<script>alert(1)</script><h2 onclick="evil()" style="text-align:center;position:fixed">Titre</h2><a href="javascript:evil()">danger</a><table><tr><td colspan="2">Cellule</td></tr></table>');
  expect(clean).not.toMatch(/script|onclick|position|javascript/);
  const editor = new Editor({ extensions: documentExtensions(), content: clean });
  try {
    const html = documentHtml(editor.getJSON());
    expect(html).toContain('text-align:center');
    expect(html).toContain('colspan="2"');
    expect(html).toContain('danger');
  } finally { editor.destroy(); }
});
