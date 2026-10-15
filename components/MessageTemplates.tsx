"use client";
import useDraftGuard from "./useDraftGuard";
import { Select, Input } from "./ui";
import { useEffect, useState } from "react";
import type { User } from "../lib/domain";
import {
  messageKinds,
  messageDefaults,
  messageVariables,
  templateLabels,
  templateExamples,
  renderMessage,
  type MessageKind,
  type MessageTemplate,
} from "../lib/message-templates";
import { api, AsyncButton, Notice } from "./common";
import VisualEditor from "./VisualEditor";
import EmailHtmlEditor from "./EmailHtmlEditor";
import { editorialHtml } from "../lib/editorial-format";
import { Button } from "./ui";
export default function MessageTemplates({ user }: { user: User }) {
  const [models, setModels] = useState<Record<
      MessageKind,
      MessageTemplate
    > | null>(null),
    [kind, setKind] = useState<MessageKind>("VERIFY"),
    [template, setTemplate] = useState<MessageTemplate>(messageDefaults.VERIFY),
    [error, setError] = useState(""),
    [result, setResult] = useState("");
  const manage = user.permissions.includes("communications.manage");
  useEffect(() => {
    void api<Record<MessageKind, MessageTemplate>>("admin/templates")
      .then((data) => {
        setModels(data);
        setTemplate(data.VERIFY);
      })
      .catch((e) => setError(e.message));
  }, []);
  const dirty =
    models &&
    (models[kind].subject !== template.subject ||
      models[kind].body !== template.body ||
      (models[kind].html_body ?? null) !== (template.html_body ?? null));
  useDraftGuard(!!dirty);
  async function act(action: "save" | "reset" | "test") {
    setResult("");
    const answer = await api<{ message?: string }>("admin/templates", {
      action,
      kind,
      template,
    });
    if (action !== "test") {
      const next = action === "reset" ? messageDefaults[kind] : template;
      setModels((old) => ({ ...old!, [kind]: next }));
      setTemplate(next);
    }
    setResult(answer.message ?? "Modèle enregistré.");
  }
  let preview: ReturnType<typeof renderMessage> | null = null;
  let previewError = "";
  try {
    preview = renderMessage(
    template,
    templateExamples,
    ["VERIFY", "INVITE", "RESET"].includes(kind)
      ? { label: "Exemple inactif", url: "https://example.invalid/preview" }
      : undefined,
    );
  } catch (e) {
    previewError = (e as Error).message;
  }
  return (
    <section className="beta-card">
      <h2>Modèles des emails de service</h2>
      <Notice error={error} />
      <label className="field">
        <span>Type de message</span>
        <Select
          value={kind}
          disabled={!models}
          onChange={(e) => {
            if (
              dirty &&
              !window.confirm("Abandonner les modifications non sauvegardées ?")
            )
              return;
            const k = e.target.value as MessageKind;
            setKind(k);
            setTemplate(models?.[k] ?? messageDefaults[k]);
            setResult("");
          }}
        >
          {messageKinds.map((k) => (
            <option key={k} value={k}>
              {templateLabels[k]}
            </option>
          ))}
        </Select>
      </label>
      <label className="field">
        <span>Objet</span>
        <Input
          value={template.subject}
          disabled={!manage || !models}
          maxLength={150}
          onChange={(e) =>
            setTemplate({ ...template, subject: e.target.value })
          }
        />
      </label>

      {template.html_body ? (
        <>
          <p className="small muted">
            Document HTML complet : personnalisez librement son en-tête,
            ses images, ses tableaux, ses couleurs et son pied de page.
          </p>
          <EmailHtmlEditor
            key={kind}
            disabled={!manage || !models}
            value={template.html_body}
            onChange={(html_body) => setTemplate((prev) => ({ ...prev, html_body }))}
            variables={messageVariables}
            requireSecureAction={["VERIFY", "INVITE", "RESET"].includes(kind)}
          />
          {manage && <Button type="button" onClick={() => {
            if (!window.confirm("Revenir au format simple ? Le brouillon HTML sera abandonné.")) return;
            setTemplate({ ...template, html_body: null });
          }}>Revenir à l’éditeur simple</Button>}
        </>
      ) : (
        <>
          <VisualEditor
            saveStatus={dirty ? "Modifications non enregistrées" : "Modèle enregistré"}
            disabled={!manage || !models}
            value={template.body}
            onChange={(body) => setTemplate({ ...template, body })}
            variables={messageVariables}
            maxLength={5000}
          />
          {manage && <Button type="button" onClick={() => {
            const action = ["VERIFY", "INVITE", "RESET"].includes(kind)
              ? '<p><a href="{{secure_action_url}}" style="display:inline-block;padding:14px;background-color:#ff922f;color:#17171e">Ouvrir mon compte</a></p>'
              : "";
            setTemplate({ ...template,
              html_body: '<!doctype html><html lang="fr"><body style="margin:0;background-color:#17171e;color:#ffffff;font-family:Arial,sans-serif">' +
                '<table role="presentation" width="100%" cellpadding="20"><tbody><tr><td>' +
                '<h1>Halloween Map</h1>' + editorialHtml(template.body) + action +
                '<hr style="border-top:1px solid #777777"><p>Halloween Map · Une nuit à partager.</p>' +
                '</td></tr></tbody></table></body></html>',
            });
          }}>Passer à l’éditeur HTML complet</Button>}
        </>
      )}
      <p className="small muted">
        Les boutons sécurisés et la durée de validité sont ajoutés par le
        serveur aux messages de compte. Les notifications de maison sont
        envoyées uniquement lors d’une transition réelle, sur une saison réelle.
      </p>
      <div className="actions">
        {manage && (
          <>
            <AsyncButton onClick={() => act("save")}>
              Enregistrer le modèle
            </AsyncButton>
            <AsyncButton onClick={() => act("reset")}>
              Restaurer l’original
            </AsyncButton>
          </>
        )}
        {user.role_name === "SUPER_ADMIN" && (
          <AsyncButton onClick={() => act("test")}>
            Envoyer un test au Super Admin
          </AsyncButton>
        )}
      </div>
      {result && (
        <p role="status" className="notice info">
          {result}
        </p>
      )}

      {previewError && <p role="alert" className="notice error">
        Document HTML invalide : {previewError}
      </p>}
      {preview && (
        <>
          <details open>
            <summary>Aperçu du véritable email envoyé</summary>
            <iframe title="Aperçu du modèle" sandbox=""
              srcDoc={preview.html} className="mail-frame" />
          </details>
          <details>
            <summary>Texte brut</summary>
            <pre className="mail-preview">{preview.text}</pre>
          </details>
        </>
      )}
    </section>
  );
}
