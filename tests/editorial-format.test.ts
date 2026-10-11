import { expect, it } from "vitest";
import { editorialHtml, editorialText } from "../lib/editorial-format";
it("renders combined editor marks and formatted links in the shared public/email renderer", () => {
  const value = "***Accueil*** [**Lire**](https://example.invalid)";
  expect(editorialHtml(value)).toContain("<strong><em>Accueil</em></strong>");
  expect(editorialHtml(value)).toContain("<strong>Lire</strong></a>");
  expect(editorialText(value)).toBe("Accueil Lire (https://example.invalid)");
});
it("keeps HTML and unsafe links inert, including substituted variables", () => {
  const html = editorialHtml(
    "<img src=x onerror=alert(1)> [danger](javascript:alert) **{{name}}**",
    { name: "<script>alert(1)</script>" },
  );
  expect(html).not.toContain("<img");
  expect(html).not.toContain("<script");
  expect(html).not.toContain('href="javascript');
  expect(html).toContain("&lt;script&gt;");
});
