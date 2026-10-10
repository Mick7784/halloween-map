"use client";
import { Button, Select } from "./ui";
import { useEffect, useRef } from "react";
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
function serialize(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? "";
  const element = node as HTMLElement,
    children = Array.from(node.childNodes).map(serialize).join("");
  switch (element.tagName) {
    case "STRONG":
    case "B":
      return `**${children}**`;
    case "EM":
    case "I":
      return `*${children}*`;
    case "A": {
      const url = element.getAttribute("href") ?? "";
      return /^(https:\/\/|mailto:)[^\s]*$/i.test(url)
        ? `[${children}](${url})`
        : children;
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
  const ref = useRef<HTMLDivElement>(null),
    last = useRef<string | null>(null);
  useEffect(() => {
    if (ref.current && last.current !== value) {
      ref.current.innerHTML = editorialHtml(value);
      last.current = value;
    }
  }, [value]);
  function update() {
    if (ref.current) {
      const next = Array.from(ref.current.childNodes)
        .map(serialize)
        .join("")
        .trim();
      last.current = next;
      onChange(next);
    }
  }
  function command(name: string, arg?: string) {
    ref.current?.focus();
    document.execCommand(name, false, arg);
    update();
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
            if (url && /^(https:\/\/|mailto:)[^\s]*$/i.test(url))
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
      <div
        ref={ref}
        role="textbox"
        aria-label={label}
        aria-multiline="true"
        contentEditable={!disabled}
        suppressContentEditableWarning
        className="editor-surface"
        onInput={update}
        onPaste={(e) => {
          e.preventDefault();
          command("insertText", e.clipboardData.getData("text/plain"));
        }}
      />
      {value.length > maxLength && (
        <p role="alert">Texte trop long : {maxLength} caractères maximum.</p>
      )}
    </div>
  );
}
