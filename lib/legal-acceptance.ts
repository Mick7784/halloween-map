import type { LegalDocument } from "./legal-documents";
export type TermsAcceptanceState = {
  terms_version?: string | null;
  terms_accepted_at?: unknown;
};
/** A legacy version field without a timestamp is never evidence of acceptance. */
export function requiresTermsAcceptance(
  document: Pick<LegalDocument, "version" | "requires_reaccept"> | undefined,
  participation?: TermsAcceptanceState,
) {
  return (
    !!document?.requires_reaccept &&
    (!participation?.terms_accepted_at ||
      participation.terms_version !== document.version)
  );
}
