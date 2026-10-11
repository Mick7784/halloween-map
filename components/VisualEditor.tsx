"use client";
import { Button, Select } from "./ui";
import { useEffect, useRef, useState } from "react";
import {
  Bold,
  Italic,
  List,
  Undo2,
  Redo2,
  Link2,
  Unlink,
  Eye,
  Pencil,
} from "lucide-react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { ListItem } from "@tiptap/extension-list";
const FlatListItem = ListItem.extend({
  content: "paragraph",
  addKeyboardShortcuts() {
    return { Enter: () => this.editor.commands.splitListItem(this.name) };
  },
});
import { editorialHtml } from "../lib/editorial-format";
const variableLabels: Record<string, string> = {
  name: "Prénom / pseudo",
  user_name: "Prénom / pseudo",
  event_name: "Événement",
  territory: "Territoire",
  season_year: "Année",
  house_name: "Maison",
  house_start_time: "Horaire maison",
  refusal_reason: "Motif du refus",
  map_open_date: "Ouverture",
  map_close_date: "Fermeture",
  registration_date: "Inscriptions",
  purge_date: "Purge",
  house_count: "Nombre de maisons",
};
function serialize(
  node: Node,
  marks: { bold?: boolean; italic?: boolean; href?: string } = {},
): string {
  if (node.nodeType === Node.TEXT_NODE) {
    let text = node.textContent ?? "";
    if (!text) return "";
    const delimiter =
      marks.bold && marks.italic
        ? "***"
        : marks.bold
          ? "**"
          : marks.italic
            ? "*"
            : "";
    text = delimiter + text + delimiter;
    return marks.href ? `[${text}](${marks.href})` : text;
  }
  const element = node as HTMLElement;
  const next = { ...marks };
  if (["STRONG", "B"].includes(element.tagName)) next.bold = true;
  if (["EM", "I"].includes(element.tagName)) next.italic = true;
  const href = element.getAttribute("href") ?? "";
  if (
    element.tagName === "A" &&
    /^(https:\/\/|\/(?!\/)|mailto:)[^\s]*$/i.test(href)
  )
    next.href = href;
  const children = Array.from(node.childNodes)
    .map((child) => serialize(child, next))
    .join("");
  switch (element.tagName) {
    case "STRONG":
    case "B":
      return children;
    case "EM":
    case "I":
      return children;
    case "A": {
      return children;
    }
    case "H2":
      return `# ${children}\n\n`;
    case "H3":
      return `## ${children}\n\n`;
    case "LI":
      return `- ${children.trim()}\n`;
    case "UL":
      return children + "\n";
    case "BR":
      return "\n";
    case "DIV":
    case "P":
      return children + "\n\n";
    default:
      return children;
  }
}
export default function VisualEditor({
  value,
  onChange,
  variables = [],
  label = "Message",
  maxLength = 10000,
  disabled = false,
  saveStatus,
}: {
  value: string;
  onChange: (value: string) => void;
  variables?: readonly string[];
  label?: string;
  maxLength?: number;
  disabled?: boolean;
  saveStatus?: string;
}) {
  const last = useRef(value);
  const [preview, setPreview] = useState(false),
    [linkOpen, setLinkOpen] = useState(false),
    [linkUrl, setLinkUrl] = useState(""),
    [linkError, setLinkError] = useState("");
  const [, refreshToolbar] = useState(0);
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      FlatListItem,
      StarterKit.configure({
        listItem: false,
        heading: { levels: [2, 3] },
        blockquote: false,
        code: false,
        codeBlock: false,
        horizontalRule: false,
        orderedList: false,
        strike: false,
        underline: false,
        link: {
          openOnClick: false,
          autolink: false,
          linkOnPaste: false,
          isAllowedUri: (url) =>
            /^(https:\/\/|\/(?!\/)|mailto:)[^\s]*$/i.test(url),
        },
      }),
    ],
    content: editorialHtml(value),
    editable: !disabled,
    onSelectionUpdate: () => refreshToolbar((n) => n + 1),
    onTransaction: () => refreshToolbar((n) => n + 1),
    editorProps: {
      attributes: {
        role: "textbox",
        "aria-label": label,
        "aria-multiline": "true",
        class: "editor-surface",
      },
      handlePaste: (view, event) => {
        event.preventDefault();
        const text = event.clipboardData?.getData("text/plain") ?? "";
        view.dispatch(view.state.tr.insertText(text));
        return true;
      },
    },
    onUpdate: ({ editor }) => {
      const doc = new DOMParser().parseFromString(
        editor.getHTML(),
        "text/html",
      );
      const next = Array.from(doc.body.childNodes)
        .map((node) => serialize(node))
        .join("")
        .trim();
      last.current = next;
      onChange(next);
    },
  });
  useEffect(() => {
    if (editor && last.current !== value) {
      editor.commands.setContent(editorialHtml(value), { emitUpdate: false });
      last.current = value;
    }
  }, [editor, value]);
  useEffect(() => {
    editor?.setEditable(!disabled);
  }, [editor, disabled]);
  function command(name: string, arg?: string) {
    if (!editor || disabled) return;
    const chain = editor.chain().focus();
    if (name === "bold") chain.toggleBold().run();
    if (name === "italic") chain.toggleItalic().run();
    if (name === "insertUnorderedList") chain.toggleBulletList().run();
    if (name === "createLink" && arg)
      chain.extendMarkRange("link").setLink({ href: arg }).run();
    if (name === "insertText" && arg)
      chain.insertContent({ type: "text", text: arg }).run();
  }
  return (
    <div className="visual-editor">
      <div className="editor-header">
        <strong>{label}</strong>
        <div role="group" aria-label="Mode de l’éditeur">
          <Button
            type="button"
            aria-pressed={!preview}
            onClick={() => setPreview(false)}
          >
            <Pencil size={15} /> Rédiger
          </Button>
          <Button
            type="button"
            aria-pressed={preview}
            onClick={() => setPreview(true)}
          >
            <Eye size={15} /> Aperçu
          </Button>
        </div>
      </div>
      <div hidden={preview}>
        <div
          role="toolbar"
          aria-label="Mise en forme"
          className="editor-toolbar"
        >
          <Select
            aria-label="Style de paragraphe"
            disabled={disabled || !editor}
            value={
              editor?.isActive("heading", { level: 2 })
                ? "2"
                : editor?.isActive("heading", { level: 3 })
                  ? "3"
                  : "paragraph"
            }
            onChange={(e) => {
              const chain = editor?.chain().focus();
              if (editor?.isActive("bulletList"))
                chain?.liftListItem("listItem");
              if (e.target.value === "paragraph") chain?.setParagraph().run();
              else
                chain
                  ?.setHeading({ level: Number(e.target.value) as 2 | 3 })
                  .run();
            }}
          >
            <option value="paragraph">Paragraphe</option>
            <option value="2">Titre principal</option>
            <option value="3">Sous-titre</option>
          </Select>
          <div
            className="editor-tool-group"
            role="group"
            aria-label="Texte et listes"
          >
            {[
              ["Gras", "bold"],
              ["Italique", "italic"],
              ["Liste", "insertUnorderedList"],
            ].map(([title, name]) => (
              <Button
                key={name}
                disabled={disabled || !editor}
                title={title}
                aria-label={title}
                aria-pressed={
                  !!editor?.isActive(
                    name === "insertUnorderedList" ? "bulletList" : name,
                  )
                }
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => command(name)}
              >
                {name === "bold" ? (
                  <Bold size={17} />
                ) : name === "italic" ? (
                  <Italic size={17} />
                ) : (
                  <List size={17} />
                )}
              </Button>
            ))}
          </div>
          <div
            className="editor-tool-group"
            role="group"
            aria-label="Historique"
          >
            <Button
              disabled={disabled || !editor?.can().undo()}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => editor?.chain().focus().undo().run()}
            >
              <Undo2 size={16} /> Annuler
            </Button>
            <Button
              disabled={disabled || !editor?.can().redo()}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => editor?.chain().focus().redo().run()}
            >
              <Redo2 size={16} /> Rétablir
            </Button>
          </div>
          <div className="editor-tool-group" role="group" aria-label="Liens">
            <Button
              disabled={disabled}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                setLinkUrl(editor?.getAttributes("link").href ?? "");
                setLinkError("");
                setLinkOpen(!linkOpen);
              }}
            >
              <Link2 size={16} /> Lien
            </Button>
            {editor?.isActive("link") && (
              <Button
                type="button"
                disabled={disabled}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() =>
                  editor
                    .chain()
                    .focus()
                    .extendMarkRange("link")
                    .unsetLink()
                    .run()
                }
              >
                <Unlink size={16} /> Retirer le lien
              </Button>
            )}
          </div>
          {variables.length > 0 && (
            <Select
              disabled={disabled}
              aria-label="Insérer une variable"
              defaultValue=""
              onChange={(e) => {
                command("insertText", `{{${e.target.value}}}`);
                e.target.value = "";
              }}
            >
              <option value="" disabled>
                Insérer une variable
              </option>
              {variables.map((v) => (
                <option key={v} value={v}>
                  {variableLabels[v] ?? v}
                </option>
              ))}
            </Select>
          )}
        </div>
        {linkOpen && (
          <div
            className="editor-link-panel"
            role="group"
            aria-label="Éditer le lien"
          >
            <label>
              Adresse du lien
              <input
                aria-label="Adresse du lien"
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                placeholder="https://…"
                disabled={disabled}
              />
            </label>
            <Button
              type="button"
              disabled={disabled}
              onClick={() => {
                if (!/^(https:\/\/|\/(?!\/)|mailto:)[^\s]*$/i.test(linkUrl)) {
                  setLinkError(
                    "Utilisez un lien HTTPS, mailto ou une page interne.",
                  );
                  return;
                }
                command("createLink", linkUrl);
                setLinkOpen(false);
              }}
            >
              Appliquer le lien
            </Button>
            <Button type="button" onClick={() => setLinkOpen(false)}>
              Fermer
            </Button>
            {linkError && <p role="alert">{linkError}</p>}
          </div>
        )}
        <EditorContent editor={editor} />
      </div>
      {preview && (
        <section className="editor-preview" aria-label="Aperçu du contenu">
          <div dangerouslySetInnerHTML={{ __html: editorialHtml(value) }} />
          {!value && <p>Votre aperçu apparaîtra ici.</p>}
        </section>
      )}
      <div className="editor-footer">
        <span>
          {value.length.toLocaleString("fr-FR")} /{" "}
          {maxLength.toLocaleString("fr-FR")} caractères
        </span>
        <span>
          {disabled
            ? "Lecture seule"
            : (saveStatus ?? "Utilisez Enregistrer pour sauvegarder")}
        </span>
      </div>
      {value.length > maxLength && (
        <p role="alert">Texte trop long : {maxLength} caractères maximum.</p>
      )}
    </div>
  );
}
