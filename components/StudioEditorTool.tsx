"use client";
import { Button } from "./ui";

/**
 * Presentation-only formatting action. The caller owns editor commands,
 * extensions and document-specific rules. The component has no Tiptap dependency.
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

