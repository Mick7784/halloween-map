import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import AccountPolicy from "../components/AccountPolicy";
import {
  publicLegalDocuments,
  type LegalDocument,
  type LegalKind,
} from "../lib/legal-documents";
import type { PublicState } from "../components/common";
import { requiresTermsAcceptance } from "../lib/legal-acceptance";
it("never treats a matching legacy version without an acceptance timestamp as evidence", () => {
  const d = { version: "2026.2", requires_reaccept: true };
  expect(
    requiresTermsAcceptance(d, {
      terms_version: "2026.2",
      terms_accepted_at: null,
    }),
  ).toBe(true);
  expect(
    requiresTermsAcceptance(d, {
      terms_version: "2026.2",
      terms_accepted_at: "2026-10-18",
    }),
  ).toBe(false);
  expect(requiresTermsAcceptance(undefined)).toBe(false);
});
it("serves published rich privacy in the account even when an old policy override remains configured", () => {
  const doc = {
    kind: "PRIVACY",
    title: "Confidentialité",
    version: "2026.2",
    body: "Document actif",
    format: "tiptap",
    content_json: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Document actif" }],
        },
      ],
    },
    status: "PUBLISHED",
    active: true,
    requires_reaccept: false,
    published_at: null,
  } as LegalDocument;
  const state = {
    privacy: { policyBody: "Ancien texte personnalisé" },
    documents: { PRIVACY: doc },
  } as PublicState;
  const html = renderToStaticMarkup(h(AccountPolicy, { state }));
  expect(html).toContain("Document actif");
  expect(html).not.toContain("Ancien texte personnalisé");
});
it("does not expose internal author references or draft concurrency metadata on public document surfaces", () => {
  const docs = {
    PRIVACY: {
      kind: "PRIVACY",
      title: "Confidentialité",
      version: "2026.2",
      body: "Public",
      status: "PUBLISHED",
      active: true,
      requires_reaccept: false,
      published_at: null,
      created_by: "private-author",
      published_by: "private-publisher",
      revision: 4,
      base_version: "2026.1",
    },
  } as Record<LegalKind, LegalDocument>;
  const output = publicLegalDocuments(docs);
  expect(output.PRIVACY.body).toBe("Public");
  expect(JSON.stringify(output)).not.toMatch(
    /private-author|private-publisher|revision|base_version/,
  );
});
