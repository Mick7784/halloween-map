"use client";
import { useEffect, useState } from "react";
import { api, Notice } from "./common";
export default function RefusalPreview({
  id,
  reason,
}: {
  id: string;
  reason: string;
}) {
  const [preview, setPreview] = useState<{
      subject: string;
      html: string;
      text: string;
    } | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    const timer = setTimeout(() => {
      void api<{ subject: string; html: string; text: string }>(
        "admin/refusal-preview?" + new URLSearchParams({ id, reason }),
      )
        .then((p) => {
          if (alive) {
            setPreview(p);
            setError("");
          }
        })
        .catch((e) => {
          if (alive) setError(e.message);
        });
    }, 350);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [id, reason]);
  return (
    <details>
      <summary>Aperçu de l’email de refus</summary>
      <Notice error={error} />
      {preview && (
        <>
          <p>{preview.subject}</p>
          <iframe
            title="Email de refus personnalisé"
            sandbox=""
            srcDoc={preview.html}
            style={{ width: "100%", height: 440, border: 0 }}
          />
          <details>
            <summary>Texte brut</summary>
            <pre style={{ whiteSpace: "pre-wrap" }}>{preview.text}</pre>
          </details>
        </>
      )}
    </details>
  );
}
