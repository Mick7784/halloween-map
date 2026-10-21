"use client";
import { useState, useRef } from "react";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { TaskList, TaskItem } from "@tiptap/extension-list";
import { TableKit } from "@tiptap/extension-table";
import { TextStyle, Color } from "@tiptap/extension-text-style";
import TextAlign from "@tiptap/extension-text-align";
import Highlight from "@tiptap/extension-highlight";
import { Button, Select } from "./ui";
import { StudioEditorTool } from "./StudioEditorTool";
import DocumentView from "./DocumentView";
import type { LegalDocument } from "../lib/content";
import {
  documentColors,
  documentOutline,
  documentText,
  safeDocumentLink,
  type DocumentNode,
} from "../lib/document-format";
import { editorialHtml } from "../lib/editorial-format";

export const documentExtensions = () => [
  StarterKit.configure({
    heading: { levels: [1, 2, 3] },
    code: false,
    codeBlock: false,
    link: {
      openOnClick: false,
      autolink: false,
      linkOnPaste: false,
      isAllowedUri: safeDocumentLink,
    },
  }),
  TaskList,
  TaskItem.configure({ nested: true }),
  TableKit.configure({ table: { resizable: false } }),
  TextStyle,
  Color,
  Highlight.configure({ multicolor: true }),
  TextAlign.configure({ types: ["heading", "paragraph"] }),
];

export function cleanDocumentPaste(html: string): string {
  const dom = new DOMParser().parseFromString(html, "text/html");
  dom
    .querySelectorAll(
      "script,style,iframe,object,embed,img,svg,math,form,input",
    )
    .forEach((n) => n.remove());
  for (const element of dom.body.querySelectorAll("*")) {
    const style = (element as HTMLElement).style;
    const align = ["left", "center", "right", "justify"].includes(
      style?.textAlign,
    )
      ? style.textAlign
      : "";
    const href = element.getAttribute("href");
    const colspan = element.getAttribute("colspan"),
      rowspan = element.getAttribute("rowspan");
    for (const attr of Array.from(element.attributes))
      element.removeAttribute(attr.name);
    if (align) element.setAttribute("style", "text-align:" + align);
    if (element.tagName === "A" && safeDocumentLink(href))
      element.setAttribute("href", href);
    if (["TD", "TH"].includes(element.tagName)) {
      if (colspan && /^[1-9][0-9]?$/.test(colspan) && Number(colspan) <= 50)
        element.setAttribute("colspan", colspan);
      if (rowspan && /^[1-9][0-9]?$/.test(rowspan) && Number(rowspan) <= 50)
        element.setAttribute("rowspan", rowspan);
    }
  }
  return dom.body.innerHTML;
}

export default function DocumentEditor({
  initial,
  onChange,
  onReady,
}: {
  initial: LegalDocument;
  onChange: (value: DocumentNode) => void;
  onReady: (value: DocumentNode) => void;
}) {
  const [preview, setPreview] = useState(false),
    [mobile, setMobile] = useState(false),
    [sidebar, setSidebar] = useState(true);
  const [json, setJson] = useState<DocumentNode>(
    initial.content_json ?? { type: "doc", content: [{ type: "paragraph" }] },
  );
  const [link, setLink] = useState<string | null>(null),
    [linkError, setLinkError] = useState("");
  const [, refresh] = useState(0);
  const host = useRef<HTMLDivElement>(null);
  const editor = useEditor({
    immediatelyRender: false,
    extensions: documentExtensions(),
    content:
      initial.format === "tiptap" && initial.content_json
        ? initial.content_json
        : editorialHtml(initial.body),
    editorProps: {
      attributes: {
        role: "textbox",
        "aria-label": "Corps du document",
        "aria-multiline": "true",
        class: "document-copy document-surface",
      },
      transformPastedHTML: cleanDocumentPaste,
    },
    onCreate: ({ editor }) => {
      const value = editor.getJSON() as DocumentNode;
      setJson(value);
      onReady(value);
    },
    onUpdate: ({ editor }) => {
      const value = editor.getJSON() as DocumentNode;
      setJson(value);
      onChange(value);
    },
    onSelectionUpdate: () => refresh((n) => n + 1),
    onTransaction: () => refresh((n) => n + 1),
  });
  const outline = documentOutline(json),
    text = documentText(json);
  function tool(
    label: string,
    run: (editor: Editor) => void,
    active = false,
    disabled = false,
  ) {
    return (
      <StudioEditorTool
        editor={editor}
        label={label}
        run={run}
        active={active}
        disabled={disabled}
      />
    );
  }
  return (
    <div className="document-editor" ref={host}>
      <div className="studio-actions">
        <Button type="button" aria-pressed={preview} onClick={() => setPreview(!preview)}>
          {preview ? "Rédiger" : "Aperçu fidèle"}
        </Button>
        {preview && (
          <Select
            aria-label="Format de l’aperçu"
            value={mobile ? "mobile" : "desktop"}
            onChange={(e) => setMobile(e.target.value === "mobile")}
          >
            <option value="desktop">Ordinateur</option>
            <option value="mobile">Mobile</option>
          </Select>
        )}
        <Button
          type="button"
          aria-expanded={sidebar}
          onClick={() => setSidebar(!sidebar)}
        >
          Sommaire & informations
        </Button>
      </div>
      {!preview && (
        <div
          className="document-toolbar"
          role="toolbar"
          aria-orientation="horizontal"
          aria-label="Mise en forme du document"
        >
          {tool(
            "Annuler",
            (e) => e.chain().focus().undo().run(),
            false,
            !editor?.can().undo(),
          )}
          {tool(
            "Rétablir",
            (e) => e.chain().focus().redo().run(),
            false,
            !editor?.can().redo(),
          )}
          <span className="document-toolbar-divider" role="separator" aria-orientation="vertical" />
          <Select
            aria-label="Style de paragraphe"
            value={
              editor?.isActive("heading")
                ? String(editor.getAttributes("heading").level)
                : "paragraph"
            }
            onChange={(e) =>
              e.target.value === "paragraph"
                ? editor?.chain().focus().setParagraph().run()
                : editor
                    ?.chain()
                    .focus()
                    .toggleHeading({
                      level: Number(e.target.value) as 1 | 2 | 3,
                    })
                    .run()
            }
          >
            <option value="paragraph">Paragraphe</option>
            <option value="1">Titre 1</option>
            <option value="2">Titre 2</option>
            <option value="3">Titre 3</option>
          </Select>
          <span className="document-toolbar-divider" role="separator" aria-orientation="vertical" />
          {tool(
            "Gras",
            (e) => e.chain().focus().toggleBold().run(),
            editor?.isActive("bold"),
          )}
          {tool(
            "Italique",
            (e) => e.chain().focus().toggleItalic().run(),
            editor?.isActive("italic"),
          )}
          {tool(
            "Souligné",
            (e) => e.chain().focus().toggleUnderline().run(),
            editor?.isActive("underline"),
          )}
          {tool(
            "Barré",
            (e) => e.chain().focus().toggleStrike().run(),
            editor?.isActive("strike"),
          )}
          <span className="document-toolbar-divider" role="separator" aria-orientation="vertical" />
          <Select
            aria-label="Couleur du texte"
            value={editor?.getAttributes("textStyle").color ?? ""}
            onChange={(e) =>
              e.target.value
                ? editor?.chain().focus().setColor(e.target.value).run()
                : editor?.chain().focus().unsetColor().run()
            }
          >
            <option value="">Couleur du texte</option>
            {documentColors.map((c) => (
              <option key={c} value={c}>
                {
                  {
                    "#202b3b": "Encre",
                    "#ffffff": "Blanc",
                    "#b23a49": "Rouge",
                    "#26734e": "Vert",
                    "#076d96": "Bleu",
                    "#7951b5": "Violet",
                    "#fff4a3": "Jaune",
                  }[c]
                }
              </option>
            ))}
          </Select>
          {tool(
            "Surligner",
            (e) =>
              e.chain().focus().toggleHighlight({ color: "#fff4a3" }).run(),
            editor?.isActive("highlight"),
          )}
          <span className="document-toolbar-divider" role="separator" aria-orientation="vertical" />
          <Select
            aria-label="Alignement"
            value={
              editor?.getAttributes(
                editor.isActive("heading") ? "heading" : "paragraph",
              ).textAlign ?? "left"
            }
            onChange={(e) =>
              editor?.chain().focus().setTextAlign(e.target.value).run()
            }
          >
            {[
              ["left", "Gauche"],
              ["center", "Centre"],
              ["right", "Droite"],
              ["justify", "Justifié"],
            ].map(([v, t]) => (
              <option key={v} value={v}>
                {t}
              </option>
            ))}
          </Select>
          <span className="document-toolbar-divider" role="separator" aria-orientation="vertical" />
          {tool(
            "Puces",
            (e) => e.chain().focus().toggleBulletList().run(),
            editor?.isActive("bulletList"),
          )}
          {tool(
            "Numérotation",
            (e) => e.chain().focus().toggleOrderedList().run(),
            editor?.isActive("orderedList"),
          )}
          {tool(
            "Cases à cocher",
            (e) => e.chain().focus().toggleTaskList().run(),
            editor?.isActive("taskList"),
          )}
          {tool(
            "Citation",
            (e) => e.chain().focus().toggleBlockquote().run(),
            editor?.isActive("blockquote"),
          )}
          {tool("Séparateur", (e) =>
            e.chain().focus().setHorizontalRule().run(),
          )}
          <span className="document-toolbar-divider" role="separator" aria-orientation="vertical" />
          {tool(
            "Lien",
            (e) => {
              setLink(String(e.getAttributes("link").href ?? ""));
              setLinkError("");
            },
            editor?.isActive("link"),
          )}
          {tool(
            "Supprimer le lien",
            (e) => e.chain().focus().extendMarkRange("link").unsetLink().run(),
            false,
            !editor?.isActive("link"),
          )}
          {tool(
            "Tableau",
            (e) =>
              e
                .chain()
                .focus()
                .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
                .run(),
            false,
            !!editor?.isActive("table"),
          )}
          {editor?.isActive("table") && (
            <>
              {tool("Ajouter une ligne", (e) =>
                e.chain().focus().addRowAfter().run(),
              )}
              {tool("Supprimer la ligne", (e) =>
                e.chain().focus().deleteRow().run(),
              )}
              {tool("Ajouter une colonne", (e) =>
                e.chain().focus().addColumnAfter().run(),
              )}
              {tool("Supprimer la colonne", (e) =>
                e.chain().focus().deleteColumn().run(),
              )}
              {tool("Supprimer le tableau", (e) =>
                e.chain().focus().deleteTable().run(),
              )}
            </>
          )}
          <span className="document-toolbar-divider" role="separator" aria-orientation="vertical" />
          {tool("Effacer la mise en forme", (e) =>
            e.chain().focus().unsetAllMarks().clearNodes().run(),
          )}
        </div>
      )}
      {link !== null && (
        <div className="studio-panel" role="group" aria-label="Insérer un lien">
          <label>
            Adresse du lien
            <input
              autoFocus
              value={link}
              onChange={(e) => { setLink(e.target.value); setLinkError(""); }}
              placeholder="https://…"
            />
          </label>
          {linkError && <p role="alert">{linkError}</p>}
          <Button
            type="button"
            onClick={() => {
              if (!safeDocumentLink(link)) {
                setLinkError(
                  "Utilisez une adresse HTTPS, mailto ou un chemin interne sûr.",
                );
                return;
              }
              editor
                ?.chain()
                .focus()
                .extendMarkRange("link")
                .setLink({ href: link })
                .run();
              setLink(null);
            }}
          >
            Appliquer le lien
          </Button>
          <Button type="button" onClick={() => setLink(null)}>
            Annuler
          </Button>
        </div>
      )}
      <div className={"document-workarea" + (sidebar ? " with-sidebar" : "")}>
        {sidebar && (
          <aside className="document-sidebar" aria-label="Sommaire du document">
            <h3>Sommaire</h3>
            {!outline.length && (
              <p>Ajoutez des titres pour structurer votre document.</p>
            )}
            {outline.map((h, i) => (
              <Button
                type="button"
                key={h.id}
                className={"outline-level-" + h.level}
                onClick={() => {
                  const headings = host.current?.querySelectorAll(
                    preview
                      ? ".document-preview h1,.document-preview h2,.document-preview h3"
                      : ".document-surface h1,.document-surface h2,.document-surface h3",
                  );
                  headings?.[i]?.scrollIntoView({
                    block: "center",
                    behavior: "smooth",
                  });
                  if (!preview && editor) {
                    let index = 0;
                    editor.state.doc.descendants((n, pos) => {
                      if (n.type.name === "heading" && index++ === i)
                        editor.commands.setTextSelection(pos + 1);
                    });
                    editor.commands.focus();
                  }
                }}
              >
                {h.text || "Titre sans texte"}
              </Button>
            ))}
            <h3>Informations</h3>
            <p>{initial.title}</p>
            <p>
              {text.trim() ? text.trim().split(/\s+/).length : 0} mots ·{" "}
              {text.length} caractères
            </p>
            <p>
              Ctrl/Cmd Z : annuler · B : gras · I : italique · U : souligner.
            </p>
            <p>Collage : structure conservée, styles externes nettoyés.</p>
          </aside>
        )}
        <div
          className={
            "document-page" + (preview && mobile ? " document-mobile" : "")
          }
        >
          <div hidden={preview}>
            <EditorContent editor={editor} />
          </div>
          {preview && (
            <div className="document-preview">
              <DocumentView
                document={{ body: "", format: "tiptap", content_json: json }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
