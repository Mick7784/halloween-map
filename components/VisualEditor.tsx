"use client";
import { Button, Select } from "./ui";
import { useEffect, useRef } from "react";
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
}: {
  value: string;
  onChange: (value: string) => void;
  variables?: readonly string[];
  label?: string;
  maxLength?: number;
  disabled?: boolean;
}) {
  const last = useRef(value);
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
    if (name === "formatBlock") chain.toggleHeading({ level: 3 }).run();
    if (name === "createLink" && arg)
      chain.extendMarkRange("link").setLink({ href: arg }).run();
    if (name === "insertText" && arg)
      chain.insertContent({ type: "text", text: arg }).run();
  }
  return (
    <div className="visual-editor">
      <span className="small">{label}</span>
      <div role="toolbar" aria-label="Mise en forme" className="editor-toolbar">
        {[
          ["Gras", "bold"],
          ["Italique", "italic"],
          ["Liste", "insertUnorderedList"],
        ].map(([title, name]) => (
          <Button
            key={name}
            disabled={disabled}
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => command(name)}
          >
            {title}
          </Button>
        ))}
        <Button
          disabled={disabled || !editor}
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => editor?.chain().focus().undo().run()}
        >
          Annuler
        </Button>
        <Button
          disabled={disabled || !editor}
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => editor?.chain().focus().redo().run()}
        >
          Rétablir
        </Button>
        <Button
          disabled={disabled}
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => command("formatBlock", "h3")}
        >
          Titre
        </Button>
        <Button
          disabled={disabled}
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            const url = window.prompt("Lien HTTPS ou mailto");
            if (url && /^(https:\/\/|\/(?!\/)|mailto:)[^\s]*$/i.test(url))
              command("createLink", url);
          }}
        >
          Lien
        </Button>
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
      <EditorContent editor={editor} />
      {value.length > maxLength && (
        <p role="alert">Texte trop long : {maxLength} caractères maximum.</p>
      )}
    </div>
  );
}
