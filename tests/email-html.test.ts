import { describe, expect, it } from "vitest";
import { renderEmailHtmlDocument, emailDocumentText } from "../lib/email-html";
import { renderMessage, messageDefaults } from "../lib/message-templates";

const variables = ["name", "house_name"] as const;
describe("V0.9.5 — safe full HTML email documents", () => {
  it("turns validated tables and images into readable multipart text", () => {
    const html = renderEmailHtmlDocument(
      '<body><h1>Halloween</h1><p>Bonjour {{name}}</p>' +
      '<table><tr><td>Première case</td><td>Seconde case</td></tr></table>' +
      '<img src="https://example.org/logo.webp" alt="Logo Halloween Map"></body>',
      { allowedVariables: variables, variables: { name: "Camille" } },
    );
    const plain = emailDocumentText(html);
    expect(plain).toContain("Bonjour Camille");
    expect(plain).toContain("Première case");
    expect(plain).toContain("Logo Halloween Map");
    expect(plain).not.toContain("<td>");
  });
  it("preserves legacy template email and switches to HTML only on opt-in", () => {
    const legacy = renderMessage(messageDefaults.VERIFY, { name: "Camille" },
      { label: "Vérifier mon email", url: "https://example.org/verify?t=1" });
    expect(legacy.html).toContain("Halloween Map");
    const modern = renderMessage({
      ...messageDefaults.VERIFY,
      html_body: '<body><p>Bonjour {{name}}</p>' +
        '<a href="{{secure_action_url}}">Vérifier mon adresse</a></body>',
    }, { name: "Camille" },
    { label: "Vérifier mon email", url: "https://example.org/verify?t=1" });
    expect(modern.html).toContain('href="https://example.org/verify?t=1"');
    expect(modern.html).toContain("Bonjour Camille");
    expect(modern.text).toContain("Vérifier mon adresse");
    expect(legacy.html).not.toBe(modern.html);
  });
  it("preserves mandatory account-safety notices in custom HTML and plain text", () => {
    const notice = "Ce lien est valable pendant 1 heure.\nIgnorez ce message.";
    const rendered = renderMessage({
      ...messageDefaults.RESET,
      html_body: '<body><p>Bonjour {{name}}</p>' +
        '<a href="{{secure_action_url}}">Réinitialiser</a></body>',
    }, { name: "Camille" }, {
      label: "Réinitialiser", url: "https://example.org/reset?token=secret", notice,
    });
    expect(rendered.html).toContain("Ce lien est valable pendant 1 heure.");
    expect(rendered.html).toContain("<br>Ignorez ce message.");
    expect(rendered.text).toContain("Ignorez ce message.");
    expect(rendered.text).toContain("https://example.org/reset?token=secret");
  });

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
  it("escapes interpolated alt and title exactly once", () => {
    const html = renderEmailHtmlDocument(
      '<body><p>{{name}}</p><img src="https://example.org/a.png" alt="{{name}}" title="{{name}}"></body>',
      { allowedVariables: variables, variables: { name: 'Camille & Co <Alice> "test"' } },
    );
    expect(html).toContain("Camille &amp; Co &lt;Alice&gt; &quot;test&quot;");
    expect(html).not.toContain("&amp;amp;");
    expect(emailDocumentText(html)).toContain('Camille & Co <Alice> "test"');
  });
  it("rejects account actions hidden directly or in a parent container", () => {
    for (const html of [
      '<a href="{{secure_action_url}}" style="display:none">Activer</a>',
      '<div style="display:none"><a href="{{secure_action_url}}">Activer</a></div>',
      '<table><tr><td style="font-size:0px"><a href="{{secure_action_url}}">Activer</a></td></tr></table>',
      '<a href="{{secure_action_url}}">    </a>',
      '<a href="{{secure_action_url}}"><span style="display:none">Activer</span></a>',
      '<body style="display:none"><a href="{{secure_action_url}}">Activer</a></body>',
    ]) expect(() => renderEmailHtmlDocument(html, {
      allowedVariables: variables, requireSecureAction: true,
    })).toThrow(/visible|lisible/);
  });
  it("rejects lossy HTML constructs instead of silently stripping them", () => {
    expect(() => renderEmailHtmlDocument("<p style='position:absolute'>Contenu</p>", {
      allowedVariables: variables,
    })).toThrow("Style non autorisé : position");
  });
});
