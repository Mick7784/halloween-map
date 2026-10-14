import { parse } from "parse5";
import { escapeHtml } from "./editorial-format";

type EmailNode = {
  nodeName: string;
  tagName?: string;
  value?: string;
  attrs?: { name: string; value: string }[];
  childNodes?: EmailNode[];
};
type RenderOptions = {
  allowedVariables: readonly string[];
  variables?: Record<string, string>;
  secureActionUrl?: string;
  requireSecureAction?: boolean;
};
const tags = new Set([
  "a", "b", "blockquote", "br", "center", "div", "em", "h1", "h2", "h3",
  "h4", "hr", "i", "img", "li", "ol", "p", "s", "small", "span", "strong",
  "table", "tbody", "td", "th", "thead", "tfoot", "tr", "u", "ul",
]);
const voidTags = new Set(["br", "hr", "img"]);
const commonAttributes = new Set(["style", "title", "align", "valign", "width", "height"]);
const styleProperties = new Set([
  "background", "background-color", "border", "border-bottom", "border-collapse",
  "border-color", "border-radius", "border-spacing", "border-style", "border-width",
  "color", "display", "font-family", "font-size", "font-style", "font-weight",
  "height", "letter-spacing", "line-height", "margin", "margin-bottom",
  "margin-left", "margin-right", "margin-top", "max-width", "min-width",
  "padding", "padding-bottom", "padding-left", "padding-right", "padding-top",
  "text-align", "text-decoration", "vertical-align", "white-space", "width",
  "word-break",
]);
const variablePattern = /\{\{\s*([\w.]+)\s*\}\}/g;
function replaceVariables(text: string, options: RenderOptions, inText: boolean): string {
  return text.replace(variablePattern, (_, key: string) => {
    if (key === "secure_action_url" || !options.allowedVariables.includes(key))
      throw new Error("Variable d’email non autorisée : " + key);
    if (!options.variables) return "{{" + key + "}}";
    const value = options.variables[key] ?? "";
    return inText ? escapeHtml(value).replace(/\n/g, "<br>") : escapeHtml(value);
  });
}
function cssValue(value: string): string {
  if (
    value.length > 220 ||
    /[<>\\{}]|url\s*\(|expression\s*\(|@import|@supports|!important|;|(?:data|javascript|vbscript)\s*:/i.test(value) ||
    !/^[#\w\s.,()%+\/-]*$/.test(value)
  ) throw new Error("Valeur CSS non autorisée dans l’email");
  return value.trim();
}
function style(source: string): string {
  if (source.length > 2500) throw new Error("Style d'email trop long");
  return source.split(";").filter((v) => v.trim()).map((v) => {
    const pos = v.indexOf(":");
    if (pos < 1) throw new Error("Déclaration CSS invalide");
    const key = v.slice(0, pos).trim().toLowerCase();
    if (!styleProperties.has(key)) throw new Error("Style non autorisé : " + key);
    return key + ":" + cssValue(v.slice(pos + 1));
  }).join(";");
}
function attribute(node: EmailNode, name: string) {
  return node.attrs?.find((v) => v.name.toLowerCase() === name)?.value;
}
function find(node: EmailNode, name: string): EmailNode | undefined {
  if (node.nodeName === name) return node;
  for (const child of node.childNodes ?? []) {
    const match = find(child, name);
    if (match) return match;
  }
}
function safeLink(url: string): boolean {
  if (url === "{{secure_action_url}}") return true;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "mailto:";
  } catch {
    return false;
  }
}
/**
 * Strict allowlist for email documents. Unsupported HTML and CSS are rejected
 * (not silently stripped), preventing destructive round-trips in source mode.
 * This never executes imported markup and must run on the server before saving
 * and again before sending.
 */
export function renderEmailHtmlDocument(
  source: string,
  options: RenderOptions,
): string {
  if (source.length > 100000) throw new Error("Document HTML trop long");
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(source))
    throw new Error("Caractères interdits");
  const parsed = parse(source) as unknown as EmailNode;
  const head = find(parsed, "head");
  for (const node of head?.childNodes ?? []) {
    if (node.tagName === "style")
      throw new Error("Le CSS doit être intégré dans les éléments de l’email");
    if (node.tagName && !["meta", "title"].includes(node.tagName))
      throw new Error("Balise HTML non autorisée : " + node.tagName);
  }
  const body = find(parsed, "body");
  if (!body) throw new Error("Corps HTML manquant");
  let actionLinks = 0;
  function walk(node: EmailNode): string {
    if (node.nodeName === "#comment") return "";
    if (node.nodeName === "#text")
      return replaceVariables(escapeHtml(node.value ?? ""), options, true);
    const tag = node.tagName ?? node.nodeName;
    if (!tags.has(tag)) throw new Error("Balise HTML non autorisée : " + tag);
    const attr: string[] = [];
    for (const item of node.attrs ?? []) {
      const name = item.name.toLowerCase();
      const val = item.value;
      if (name.startsWith("on") || name === "srcset" || name === "class" || name === "id")
        throw new Error("Attribut HTML non autorisé : " + name);
      let safe: string;
      if (name === "style") safe = style(val);
      else if (name === "href" && tag === "a") {
        if (!safeLink(val)) throw new Error("Lien d'email invalide");
        if (val === "{{secure_action_url}}") {
          actionLinks++;
          if (!options.requireSecureAction)
            throw new Error("Lien sécurisé réservé aux emails de compte");
          if (options.secureActionUrl && !safeLink(options.secureActionUrl))
            throw new Error("URL sécurisée invalide");
          safe = options.secureActionUrl ?? val;
        } else safe = val;
      } else if (name === "src" && tag === "img") {
        if (!/^https:\/\/[^\s<>"']+$/i.test(val) || val.includes("{{"))
          throw new Error("Image HTTPS publique requise");
        safe = val;
      } else if (name === "alt" && tag === "img") {
        safe = replaceVariables(val, options, false);
      } else if (name === "title") {
        safe = replaceVariables(val, options, false);
      } else if (
        commonAttributes.has(name) ||
        (["table","td","th"].includes(tag) &&
          ["border","cellpadding","cellspacing","colspan","rowspan","role"].includes(name))
      ) {
        if (name === "width" || name === "height" || name === "colspan" || name === "rowspan" || name === "cellpadding" || name === "cellspacing" || name === "border") {
          if (!/^\d{1,4}%?$/.test(val)) throw new Error("Dimension invalide");
        } else if (name === "role" && val !== "presentation")
          throw new Error("Rôle de tableau invalide");
        else if (["align","valign"].includes(name) && !/^(left|right|center|top|middle|bottom)$/i.test(val))
          throw new Error("Alignement invalide");
        safe = val;
      } else throw new Error("Attribut HTML non autorisé : " + name);
      attr.push(" " + name + '="' + escapeHtml(safe) + '"');
    }
    if (tag === "img" && !attribute(node, "src"))
      throw new Error("Une image doit posséder une URL HTTPS");
    if (tag === "a" && !attribute(node, "href"))
      throw new Error("Lien sans destination");
    const opening = "<" + tag + attr.join("") + ">";
    return voidTags.has(tag)
      ? opening
      : opening + (node.childNodes ?? []).map(walk).join("") + "</" + tag + ">";
  }
  const content = (body.childNodes ?? []).map(walk).join("");
  if (!content.trim()) throw new Error("Email vide");
  if (options.requireSecureAction && actionLinks !== 1)
    throw new Error("L’email de compte doit inclure exactement un lien sécurisé");
  const bodyStyle = attribute(body, "style");
  const bodyAttrs = bodyStyle ? ' style="' + escapeHtml(style(bodyStyle)) + '"' : "";
  return '<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body' + bodyAttrs + ">" + content + "</body></html>";
}
