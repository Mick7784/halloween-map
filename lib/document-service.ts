import { z } from "zod";
import { transaction, type Database } from "./db";
import { HttpError } from "./auth";
import type { User } from "./domain";
import { documentText, validateDocument } from "./document-format";
import { legalState, legalDefaults, sanitizeContent, type LegalDocument } from "./content";

const request = z.object({
  action: z.enum(["draft", "review", "publish"]),
  id: z.uuid().optional(),
  revision: z.number().int().positive().optional(),
  active_version: z.string().optional(),
  confirmed: z.boolean().optional(),
  affected: z.number().int().nonnegative().optional(),
  document: z.object({
    kind: z.enum(["TERMS", "GUIDELINES", "PRIVACY", "NOTICE"]),
    version: z.string().regex(/^[0-9]{4}\.[0-9]{1,3}$/),
    title: z.string().trim().min(1).max(100),
    body: z.string().max(500000),
    format: z.enum(["markdown", "tiptap"]).default("markdown"),
    content_json: z.unknown().optional(),
    requires_reaccept: z.boolean(),
    prepared: z.boolean().default(false),
  }).optional(),
});
function successor(v: string, active: string) {
  const number = (s: string) => Number(s.split(".")[0]) * 1000 + Number(s.split(".")[1]);
  return number(v) > number(active);
}
async function impact(c: Database, instanceId: string, d: LegalDocument) {
  if (!d.requires_reaccept || !["TERMS", "GUIDELINES"].includes(d.kind)) return 0;
  const column = d.kind === "TERMS" ? "terms_version" : "guidelines_version";
  return Number((await c.query(`SELECT count(DISTINCT p.user_id)::int AS n FROM participations p JOIN seasons s ON s.id=p.season_id WHERE p.instance_id=$1 AND NOT s.archived AND s.purged_at IS NULL AND s.closes_at>now() AND p.${column} IS DISTINCT FROM $2`, [instanceId, d.version])).rows[0].n);
}
export async function documentAction(u: User, input: unknown) {
  const p = request.parse(input);
  return transaction(async c => {
    await c.query("SELECT id FROM instances WHERE id=$1 FOR UPDATE", [u.instance_id]);
    const active = await legalState(u.instance_id, c);
    if (p.action === "draft") {
      if (!p.document) throw new HttpError(400, "Document requis");
      const d = p.document;
      if (!successor(d.version, active[d.kind].version)) throw new HttpError(409, "La version doit suivre la version active");
      if (p.active_version !== active[d.kind].version) throw new HttpError(409, "La version publiée a changé. Rechargez avant de sauvegarder.");
      let json = null, body = d.body;
      if (d.format === "tiptap") {
        try { json = validateDocument(d.content_json); } catch (e) { throw new HttpError(400, (e as Error).message); }
        body = documentText(json);
      } else body = sanitizeContent(body, []);
      if (d.requires_reaccept && !["TERMS", "GUIDELINES"].includes(d.kind)) throw new HttpError(400, "Seules les CGU et consignes peuvent demander une nouvelle acceptation");
      const args = [d.version, sanitizeContent(d.title, []), body, d.requires_reaccept, d.format, json ? JSON.stringify(json) : null, d.prepared, active[d.kind].version];
      let rows;
      if (p.id) {
        rows = (await c.query("UPDATE legal_documents SET version=$1,title=$2,body=$3,requires_reaccept=$4,format=$5,content_json=$6::jsonb,prepared=$7,base_version=$8,revision=revision+1,updated_at=now() WHERE id=$9 AND instance_id=$10 AND kind=$11 AND status='DRAFT' AND revision=$12 RETURNING *", [...args, p.id, u.instance_id, d.kind, p.revision])).rows;
        if (!rows.length) throw new HttpError(409, "Ce brouillon a changé. Vos modifications sont conservées dans l’éditeur ; rechargez pour comparer.");
      } else {
        const existing = await c.query("SELECT id FROM legal_documents WHERE instance_id=$1 AND kind=$2 AND status='DRAFT'", [u.instance_id, d.kind]);
        if (existing.rows.length) throw new HttpError(409, "Un brouillon existe déjà. Ouvrez-le avant de continuer.");
        rows = (await c.query("INSERT INTO legal_documents(version,title,body,requires_reaccept,format,content_json,prepared,base_version,instance_id,kind,created_by) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10,$11) RETURNING *", [...args, u.instance_id, d.kind, u.id])).rows;
      }
      await c.query("INSERT INTO audit_logs(instance_id,actor_id,action,target_id) VALUES($1,$2,'content.draft',$3)", [u.instance_id, u.id, rows[0].id]);
      return { ok: true, document: rows[0] };
    }
    const d = (await c.query("SELECT * FROM legal_documents WHERE id=$1 AND instance_id=$2 AND status='DRAFT' FOR UPDATE", [p.id, u.instance_id])).rows[0] as LegalDocument | undefined;
    if (!d) throw new HttpError(404, "Brouillon introuvable");
    if (p.revision !== d.revision || p.active_version !== active[d.kind].version) throw new HttpError(409, "Le document a changé. Recommencez la vérification.");
    const affected = await impact(c, u.instance_id, d);
    const issues: string[] = [];
    if (!d.body.trim()) issues.push("Le document est vide.");
    if (!d.prepared) issues.push("Confirmez que les informations de l’exploitant sont complètes et que le document est prêt à publier.");
    if (/\{\{|\[à compléter\]|l’exploitant doit|l'exploitant doit|à renseigner|TODO/i.test(d.body)) issues.push("Le document contient des informations à compléter.");
    if (!successor(d.version, active[d.kind].version) || (d.base_version && d.base_version !== active[d.kind].version)) issues.push("La version active a changé ; sauvegardez une version actualisée du brouillon.");
    if (d.format === "tiptap") {
      try { validateDocument(d.content_json); } catch { issues.push("Structure documentaire invalide."); }
    }
    if (p.action === "review") return { document: d, previous: active[d.kind], affected, issues, visibility: "Les maisons restent visibles pendant la régularisation." };
    if (!p.confirmed || p.affected !== affected) throw new HttpError(409, "Confirmation et analyse d’impact actualisée requises");
    if (issues.length) throw new HttpError(400, issues.join(" "));
    await c.query("INSERT INTO legal_documents(instance_id,kind,version,title,body,status,active,published_at) VALUES($1,$2,'2026.1',$3,$4,'PUBLISHED',false,now()) ON CONFLICT DO NOTHING", [u.instance_id, d.kind, legalDefaults[d.kind].title, legalDefaults[d.kind].body]);
    await c.query("UPDATE legal_documents SET active=false WHERE instance_id=$1 AND kind=$2 AND active=true", [u.instance_id, d.kind]);
    await c.query("UPDATE legal_documents SET status='PUBLISHED',active=true,published_at=now(),published_by=$2 WHERE id=$1", [d.id, u.id]);
    await c.query("INSERT INTO legal_events(instance_id,user_id,document_id,kind,version,action) VALUES($1,$2,$3,$4,$5,'PUBLISHED')", [u.instance_id, u.id, d.id, d.kind, d.version]);
    await c.query("INSERT INTO audit_logs(instance_id,actor_id,action,target_id) VALUES($1,$2,'content.publish',$3)", [u.instance_id, u.id, d.id]);
    return { ok: true };
  });
}

export async function recordLegalAcceptance(c: Database, u: User, accepted: { terms: boolean; terms_version: string | null; guidelines_version: string }) {
  for (const kind of accepted.terms ? ["TERMS", "GUIDELINES"] : ["GUIDELINES"]) {
    const version = kind === "TERMS" ? accepted.terms_version : accepted.guidelines_version;
    await c.query("INSERT INTO legal_events(instance_id,user_id,document_id,kind,version,action) SELECT $1,$2,(SELECT id FROM legal_documents WHERE instance_id=$1 AND kind=$3 AND version=$4 AND status='PUBLISHED'),$3,$4,$5 ON CONFLICT DO NOTHING", [u.instance_id, u.id, kind, version, kind === "TERMS" ? "ACCEPTED" : "ACKNOWLEDGED"]);
  }
}
