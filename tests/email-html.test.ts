import { describe, expect, it } from "vitest";
import { renderEmailHtmlDocument } from "../lib/email-html";

const variables = ["name", "house_name"] as const;
describe("V0.9.5 — safe full HTML email documents", () => {
  it("keeps nested email tables, inline styles and absolute images", () => {
    const html = renderEmailHtmlDocument(
      '<!doctype html><html><body style="background-color:#121021">' +
      '<table role="presentation" width="100%" cellpadding="8">' +
      '<tr><td style="padding:12px;text-align:center">' +
      '<img src="https://example.org/image.png" width="180" alt="Citrouille">' +
      '<p>Bonjour {{name}}</p></td></tr></table></body></html>',
      { allowedVariables: variables, variables: { name: "<Camille>" } },
    );
    expect(html).toContain("<table");
    expect(html).toContain('width="100%"');
    expect(html).toContain("Bonjour &lt;Camille&gt;");
    expect(html).toContain('src="https://example.org/image.png"');
    expect(html).toContain('background-color:#121021');
    expect(html).not.toContain("<script");
  });
  it("substitutes the secure action URL only in a protected link", () => {
    const html = renderEmailHtmlDocument(
      '<body><a href="{{secure_action_url}}" style="background:#ff922f;padding:12px">' +
      "Activer mon compte</a></body>",
      {
        allowedVariables: variables,
        requireSecureAction: true,
        secureActionUrl: "https://example.org/account/verify?token=abc&x=2",
      },
    );
    expect(html).toContain('href="https://example.org/account/verify?token=abc&amp;x=2"');
    expect(html).toContain("Activer mon compte");
  });
  it("requires exactly one secure action in transactional emails", () => {
    expect(() => renderEmailHtmlDocument("<p>Bonjour</p>", {
      allowedVariables: variables,
      requireSecureAction: true,
    })).toThrow(/exactement un lien/);
    expect(() => renderEmailHtmlDocument(
      '<a href="{{secure_action_url}}">Premier</a><a href="{{secure_action_url}}">Second</a>',
      { allowedVariables: variables, requireSecureAction: true },
    )).toThrow(/exactement un lien/);
  });
  it.each([
    ['<img src="javascript:alert(1)">', /Image HTTPS/],
    ['<img src="data:image/png;base64,AAA">', /Image HTTPS/],
    ['<img src="http://insecure.test/a.png">', /Image HTTPS/],
    ['<script>alert(1)</script><p>Bonjour</p>', /Balise HTML/],
    ['<p onclick="alert(1)">Bonjour</p>', /Attribut HTML/],
    ['<p style="background:url(https://evil.test/a)">Bonjour</p>', /CSS/],
    ['<div class="hidden">Bonjour</div>', /Attribut HTML/],
    ['<p>{{secure_action_url}}</p>', /Variable d’email/],
    ['<p>{{secret_token}}</p>', /Variable d’email/],
    ['<iframe src="https://evil.test"></iframe>', /Balise HTML/],
    ['<style>@import "https://evil.test"</style><p>Bonjour</p>', /CSS doit être intégré/],
  ])("rejects unsafe or unsupported HTML: %s", (source, error) => {
    expect(() => renderEmailHtmlDocument(source, {
      allowedVariables: variables,
    })).toThrow(error);
  });
  it("rejects lossy HTML constructs instead of silently stripping them", () => {
    expect(() => renderEmailHtmlDocument("<p style='position:absolute'>Contenu</p>", {
      allowedVariables: variables,
    })).toThrow("Style non autorisé : position");
  });
});
