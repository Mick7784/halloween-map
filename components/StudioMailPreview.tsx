import type { ReactNode } from "react";

type MailPreviewProps = {
  title: string;
  frameTitle: string;
  html?: string | null;
  text?: string | null;
  error?: string;
  htmlLabel?: string;
  textLabel?: string;
  collapsibleHtml?: boolean;
  afterPreview?: ReactNode;
};

/**
 * Read-only Studio preview of the email produced by Halloween Map's existing
 * server-compatible rendering pipeline. Never inject HTML into the admin DOM:
 * the preview stays inside an isolated, script-disabled iframe.
 */
export default function StudioMailPreview({
  title,
  frameTitle,
  html,
  text,
  error,
  htmlLabel,
  textLabel = "Version texte",
  collapsibleHtml = false,
  afterPreview,
}: MailPreviewProps) {
  const frame = html != null ? (
    <iframe
      title={frameTitle}
      sandbox=""
      srcDoc={html}
      className="mail-frame studio-mail-preview-frame"
    />
  ) : null;
  return (
    <section className="studio-mail-preview" aria-label={title}>
      <div className="studio-mail-preview-heading">
        <h3>{title}</h3>
        <span className="small muted">Rendu réel · environnement isolé</span>
      </div>
      {error && (
        <p role="alert" className="notice error">
          Document HTML invalide : {error}
        </p>
      )}
      {frame && (
        collapsibleHtml ? (
          <details open>
            <summary>{htmlLabel ?? "Aperçu HTML"}</summary>
            {frame}
          </details>
        ) : frame
      )}
      {text != null && (
        <details>
          <summary>{textLabel}</summary>
          <pre className="mail-preview">{text}</pre>
        </details>
      )}
      {afterPreview}
    </section>
  );
}
