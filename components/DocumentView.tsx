import type { LegalDocument } from "../lib/content";
import { documentHtml } from "../lib/document-format";
import Editorial from "./Editorial";
import "./document.css";

/** Markdown keeps its original renderer. Rich documents share this exact preview/public path. */
export default function DocumentView({
  document,
}: {
  document: Pick<LegalDocument, "body" | "format" | "content_json">;
}) {
  if (document.format !== "tiptap") return <Editorial text={document.body} />;
  let html: string | null = null;
  try {
    html = documentHtml(document.content_json);
  } catch {
    /* Fail closed on malformed stored data. */
  }
  return html === null ? (
    <p role="alert">
      Ce document ne peut pas être affiché. Contactez l’organisateur.
    </p>
  ) : (
    <div className="document-copy" dangerouslySetInnerHTML={{ __html: html }} />
  );
}
