"use client";
import { useState } from "react";
import type { LegalDocument, LegalEvidence } from "../lib/content";
import { documentText, type DocumentNode } from "../lib/document-format";
import { api, Notice } from "./common";
import { Button, Select } from "./ui";
import useDraftGuard from "./useDraftGuard";
import DocumentEditor from "./DocumentEditor";
import DocumentView from "./DocumentView";
import { SaveStatus, StudioPanel, StudioEmpty } from "./Studio";

type Review = { document: LegalDocument; previous: LegalDocument; affected: number; issues: string[]; visibility: string };
function nextVersion(version: string) { const [year, n] = version.split("."); return `${year}.${Number(n) + 1}`; }
export default function DocumentWorkspace({ active, documents, evidence = [], reload, onBack }: { active: LegalDocument; documents: LegalDocument[]; evidence?: LegalEvidence[]; reload: () => Promise<void>; onBack: () => void }) {
  const draft = documents.find(d => d.status === "DRAFT");
  const [saved, setSaved] = useState<LegalDocument>(draft ?? { ...active, id: undefined, status: "DRAFT", active: false, version: nextVersion(active.version), prepared: false, requires_reaccept: false });
  const [title, setTitle] = useState(saved.title), [version, setVersion] = useState(saved.version), [prepared, setPrepared] = useState(saved.prepared ?? false), [reaccept, setReaccept] = useState(saved.requires_reaccept);
  const [json, setJson] = useState<DocumentNode | null>(saved.content_json ?? null), [dirty, setDirty] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState(""), [done, setDone] = useState(false);
  const [tab, setTab] = useState("edit"), [historyId, setHistoryId] = useState(""), [review, setReview] = useState<Review | null>(null), [confirmed, setConfirmed] = useState(false), [editorKey, setEditorKey] = useState(0);
  useDraftGuard(dirty);
  const history = documents.filter(d => d.status === "PUBLISHED"), selected = history.find(d => d.id === historyId);
  async function save() {
    if (!json) return;
    setBusy(true); setError(""); setDone(false);
    try {
      const result = await api<{ document: LegalDocument }>("admin/content", { action: "draft", id: saved.id, revision: saved.revision, active_version: active.version,
        document: { kind: active.kind, title, version, body: documentText(json), format: "tiptap", content_json: json, prepared, requires_reaccept: reaccept } });
      setSaved(result.document); setDirty(false); setDone(true); setReview(null);
      await reload();
    } catch(e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function inspect() {
    setError(""); setBusy(true); setConfirmed(false);
    try { setReview(await api<Review>("admin/content", { action: "review", id: saved.id, revision: saved.revision, active_version: active.version })); setTab("publish"); }
    catch(e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  function restore(d: LegalDocument) {
    if (dirty && !window.confirm("Remplacer les modifications non enregistrées par cette version ?")) return;
    setSaved({ ...d, id: draft?.id, revision: draft?.revision, status: "DRAFT", active: false, version: nextVersion(active.version), prepared: false, requires_reaccept: false });
    setTitle(d.title); setVersion(nextVersion(active.version)); setPrepared(false); setReaccept(false); setJson(d.content_json ?? null); setDirty(true); setDone(false); setEditorKey(n => n + 1); setTab("edit"); setReview(null);
  }
  return <div>
    <div className="studio-actions"><Button type="button" disabled={busy} onClick={() => { if (!dirty || window.confirm("Quitter ce document sans enregistrer ?")) onBack(); }}>← Documents officiels</Button><SaveStatus dirty={dirty} busy={busy} saved={done} /></div>
    <h3>{active.title}</h3><p>Version publique {active.version} · Le brouillon reste privé jusqu’à sa publication.</p>
    <div className="studio-actions" aria-label="Espace documentaire">
      <Button type="button" aria-pressed={tab === "edit"} onClick={() => setTab("edit")}>Rédaction</Button>
      <Button type="button" aria-pressed={tab === "history"} onClick={() => setTab("history")}>Historique & comparaison</Button>
      <Button type="button" disabled={busy || dirty || !saved.id} onClick={() => void inspect()}>Vérifier avant publication</Button>
      <Button type="button" onClick={() => void reload()} disabled={busy}>Actualiser les versions</Button>
    </div>
    <Notice error={error} />
    {draft && saved.id === draft.id && saved.revision !== draft.revision && <StudioPanel title="Modifications concurrentes détectées" description="Comparez votre travail avec le brouillon enregistré. Vos modifications locales sont toujours présentes.">
      <div className="studio-comparison"><div><h4>Votre travail</h4><DocumentView document={{ body: "", format: "tiptap", content_json: json }} /></div><div><h4>Brouillon enregistré · révision {draft.revision}</h4><DocumentView document={draft} /></div></div>
      <Button type="button" onClick={() => { setSaved(draft); setDirty(true); setReview(null); setTab("edit"); }}>Reprendre mon travail sur cette révision</Button>
      <p className="field-help">Cette action conserve votre texte local ; le prochain enregistrement remplacera le brouillon affiché à droite.</p>
    </StudioPanel>}
    {tab === "history" && <StudioPanel title="Traçabilité" description="Événements conservés cinq ans, indépendamment du journal métier et des maisons saisonnières. Les anciennes traces sont importées seulement si un horodatage réel existe.">
      {!evidence.length ? <StudioEmpty>Aucun événement durable enregistré pour ce document.</StudioEmpty> : <details><summary>Consulter les événements récents ({evidence.length})</summary><ol>{evidence.map(event => <li key={event.id}>{new Date(event.occurred_at).toLocaleString("fr-FR")} · {event.action === "PUBLISHED" ? "Publication" : event.action === "ACCEPTED" ? "Acceptation des CGU" : "Prise de connaissance"} · {event.version} · {event.user_id ? "Compte " + event.user_id : "Compte supprimé"}</li>)}</ol></details>}
    </StudioPanel>}
    <div hidden={tab !== "edit"}>
      <StudioPanel title="Préparer le document" description="Enregistrez librement votre travail. La confirmation de préparation est vérifiée avant publication.">
        <div className="studio-metadata"><label>Titre<input value={title} maxLength={100} onChange={e => { setTitle(e.target.value); setDirty(true); }} /></label><label>Version<input value={version} pattern="[0-9]{4}\.[0-9]{1,3}" onChange={e => { setVersion(e.target.value); setDirty(true); }} /></label></div>
        <label className="check"><input type="checkbox" checked={prepared} onChange={e => { setPrepared(e.target.checked); setDirty(true); }} />Les informations sont complètes et le document est prêt à publier.</label>
        {["TERMS", "GUIDELINES"].includes(active.kind) && <label className="check"><input type="checkbox" checked={reaccept} onChange={e => { setReaccept(e.target.checked); setDirty(true); }} />Changement important : demander une nouvelle {active.kind === "TERMS" ? "acceptation des CGU" : "prise de connaissance des consignes"}.</label>}
        <p className="field-help">Les modèles initiaux doivent être adaptés par l’exploitant. Cet état de préparation ne constitue pas une validation juridique.</p>
      </StudioPanel>
      <DocumentEditor key={editorKey} initial={saved} onReady={setJson} onChange={value => { setJson(value); setDirty(true); setDone(false); }} />
      <div className="studio-actions"><Button type="button" className="primary" disabled={busy || !json || (!dirty && !!saved.id)} onClick={() => void save()}>Enregistrer le brouillon</Button><SaveStatus dirty={dirty} busy={busy} saved={done} /></div>
      <p className="field-help">En cas de coupure réseau, vos modifications restent dans cet éditeur ouvert. Réessayez l’enregistrement avant de quitter. En cas de conflit, actualisez les versions puis comparez avant de reprendre.</p>
    </div>
    {tab === "history" && <StudioPanel title="Versions publiées" description="Les anciennes versions conservent leur contenu et leur rendu d’origine. Restaurer prépare un brouillon de nouvelle version.">
      <label>Version à consulter<Select value={historyId} onChange={e => setHistoryId(e.target.value)}><option value="">Choisir une version</option>{history.map(d => <option key={d.id} value={d.id}>{d.version} · {d.title}{d.active ? " · Active" : ""}</option>)}</Select></label>
      {!history.length && <StudioEmpty>Aucune version enregistrée dans l’historique. Le modèle public initial sera conservé lors de la première publication.</StudioEmpty>}
      {selected && <><p>Publication : {selected.published_at ? new Date(selected.published_at).toLocaleString("fr-FR") : "Modèle initial"} · Référence : {selected.id}</p><div className="studio-comparison"><div><h4>Version {selected.version}</h4><DocumentView document={selected} /></div><div><h4>Version active {active.version}</h4><DocumentView document={active} /></div></div><Button type="button" onClick={() => restore(selected)}>Restaurer dans un nouveau brouillon</Button></>}
    </StudioPanel>}
    {tab === "publish" && review && <StudioPanel title="Vérification finale" description="Vérifiez les deux versions, les informations manquantes et les conséquences avant de confirmer.">
      <p>{review.affected} participant(s) concerné(s) par la nouvelle acceptation.</p><p>{review.visibility}</p>
      <p>{review.document.requires_reaccept ? "Les participants devront relire et confirmer les documents depuis leur formulaire de participation." : "Aucune nouvelle acceptation demandée."}</p>
      {review.issues.length > 0 && <div role="alert" className="studio-warning"><ul>{review.issues.map(issue => <li key={issue}>{issue}</li>)}</ul></div>}
      <div className="studio-comparison"><div><h4>Actuelle · {review.previous.version}</h4><DocumentView document={review.previous} /></div><div><h4>À publier · {review.document.version}</h4><DocumentView document={review.document} /></div></div>
      <label className="check"><input type="checkbox" checked={confirmed} disabled={!!review.issues.length} onChange={e => setConfirmed(e.target.checked)} />J’ai vérifié l’aperçu et l’impact ; je confirme la publication de la version {review.document.version}.</label>
      <Button type="button" className="primary" disabled={busy || !confirmed || !!review.issues.length || dirty} onClick={async () => {
        setBusy(true); setError("");
        try { await api("admin/content", { action: "publish", id: review.document.id, revision: review.document.revision, active_version: review.previous.version, confirmed: true, affected: review.affected }); await reload(); onBack(); }
        catch(e) { setError((e as Error).message); setConfirmed(false); } finally { setBusy(false); }
      }}>Publier la version {review.document.version}</Button>
    </StudioPanel>}
  </div>;
}
