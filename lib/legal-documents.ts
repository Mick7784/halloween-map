import { legalDefaults } from "./legal-defaults";
export { legalDefaults } from "./legal-defaults";
import { db, type Database } from "./db";
import type { DocumentNode } from "./document-format";
export type LegalKind = keyof typeof legalDefaults;
export type LegalEvidence = {
  id: string;
  kind: LegalKind;
  version: string;
  action: string;
  occurred_at: string;
  expires_at: string;
  user_id: string | null;
  document_id: string | null;
};
export type LegalDocument = {
  format?: "markdown" | "tiptap";
  content_json?: DocumentNode | null;
  revision?: number;
  base_version?: string | null;
  prepared?: boolean;
  created_by?: string | null;
  published_by?: string | null;
  created_at?: string;
  updated_at?: string;
  id?: string;
  kind: LegalKind;
  version: string;
  title: string;
  body: string;
  status: string;
  active: boolean;
  requires_reaccept: boolean;
  published_at: string | null;
};
export async function initializeLegalDocuments(
  instanceId: string,
  client: Database = db(),
) {
  for (const [kind, d] of Object.entries(legalDefaults))
    await client.query(
      "INSERT INTO legal_documents(instance_id,kind,version,title,body,status,active,published_at) VALUES($1,$2,'2026.1',$3,$4,'PUBLISHED',true,now()) ON CONFLICT DO NOTHING",
      [instanceId, kind, d.title, d.body],
    );
}
export async function legalState(
  instanceId: string,
  client: Database = db(),
): Promise<Record<LegalKind, LegalDocument>> {
  const rows = (
    await client.query(
      "SELECT * FROM legal_documents WHERE instance_id=$1 AND active=true AND status='PUBLISHED'",
      [instanceId],
    )
  ).rows;
  return Object.fromEntries(
    Object.entries(legalDefaults).map(([kind, d]) => [
      kind,
      rows.find((r) => r.kind === kind) ?? {
        ...d,
        kind,
        version: "2026.1",
        status: "PUBLISHED",
        active: true,
        requires_reaccept: false,
        published_at: null,
      },
    ]),
  ) as Record<LegalKind, LegalDocument>;
}
