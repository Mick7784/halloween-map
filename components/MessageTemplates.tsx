"use client";
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
      models[kind].body !== template.body);
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
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
  const preview = renderMessage(
    template,
    templateExamples,
    ["VERIFY", "INVITE", "RESET"].includes(kind)
      ? { label: "Exemple inactif", url: "https://example.invalid/preview" }
      : undefined,
  );
  return (
    <section className="beta-card">
      <h2>Modèles des emails de service</h2>
      <Notice error={error} />
      <label className="field">
        <span>Type de message</span>
        <select
          value={kind}
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
        </select>
      </label>
      <label className="field">
        <span>Objet</span>
        <input
          value={template.subject}
          disabled={!manage}
          maxLength={150}
          onChange={(e) =>
            setTemplate({ ...template, subject: e.target.value })
          }
        />
      </label>
      <VisualEditor
        disabled={!manage}
        value={template.body}
        onChange={(body) => setTemplate({ ...template, body })}
        variables={messageVariables}
        maxLength={5000}
      />
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
      <details open>
        <summary>Aperçu HTML</summary>
        <iframe
          title="Aperçu du modèle"
          sandbox=""
          srcDoc={preview.html}
          className="mail-frame"
        />
      </details>
      <details>
        <summary>Texte brut</summary>
        <pre className="mail-preview">{preview.text}</pre>
      </details>
    </section>
  );
}
