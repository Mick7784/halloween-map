"use client";
import type { Editor } from "@tiptap/react";
import { Button } from "./ui";

/**
 * Presentation-only formatting action. The caller owns editor commands,
 * extensions and document-specific rules.
 */
export function StudioEditorTool({
  editor,
  label,
  run,
  active = false,
  disabled = false,
}: {
  editor: Editor | null;
  label: string;
  run: (editor: Editor) => void;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <Button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={!editor || disabled}
      onClick={() => editor && run(editor)}
    >
      {label}
    </Button>
  );
}

