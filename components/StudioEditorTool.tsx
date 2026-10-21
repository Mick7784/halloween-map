"use client";
import {
  Bold, Italic, Underline, Strikethrough, Undo2, Redo2,
  Highlighter, List, ListOrdered, ListTodo, Quote, Minus,
  Link2, Unlink2, Table2, ListPlus, ListMinus, Columns3,
  Columns2, Trash2, RemoveFormatting,
  type LucideIcon,
} from "lucide-react";
import { Button } from "./ui";

/** Conventional word-processor pictograms; text remains the accessible name. */
const formattingIcons: Record<string, LucideIcon> = {
  "Annuler": Undo2,
  "Rétablir": Redo2,
  "Gras": Bold,
  "Italique": Italic,
  "Souligné": Underline,
  "Barré": Strikethrough,
  "Surligner": Highlighter,
  "Puces": List,
  "Numérotation": ListOrdered,
  "Cases à cocher": ListTodo,
  "Citation": Quote,
  "Séparateur": Minus,
  "Lien": Link2,
  "Supprimer le lien": Unlink2,
  "Tableau": Table2,
  "Ajouter une ligne": ListPlus,
  "Supprimer la ligne": ListMinus,
  "Ajouter une colonne": Columns3,
  "Supprimer la colonne": Columns2,
  "Supprimer le tableau": Trash2,
  "Effacer la mise en forme": RemoveFormatting,
};

/**
 * Presentation-only formatting action. The caller owns editor commands,
 * extensions and document-specific rules. No Tiptap dependency.
 */
export function StudioEditorTool<TEditor>({
  editor,
  label,
  run,
  active = false,
  disabled = false,
}: {
  editor: TEditor | null;
  label: string;
  run: (editor: TEditor) => void;
  active?: boolean;
  disabled?: boolean;
}) {
  const Icon = formattingIcons[label];
  return (
    <Button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={!editor || disabled}
      onClick={() => editor && run(editor)}
    >
      {Icon ? <Icon size={17} strokeWidth={1.9} aria-hidden="true" focusable="false" /> : label}
    </Button>
  );
}
