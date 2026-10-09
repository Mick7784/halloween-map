import { editorialHtml } from "./editorial-format";
const escape = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
export function mailLayout(
  title: string,
  text: string,
  cta?: { label: string; url: string },
  variables?: Record<string, string>,
) {
  const mailLogo = `<img src="${escape((process.env.APP_ORIGIN ?? "").replace(/\/$/, "") + "/pwa/icon-192.png")}" width="40" height="40" alt="" style="vertical-align:middle;margin-right:10px">`;
  const url = cta ? new URL(cta.url) : null;
  if (url && !["http:", "https:"].includes(url.protocol))
    throw new Error("Invalid email link");
  return `<!doctype html><html lang="fr"><head><meta name="viewport" content="width=device-width,initial-scale=1"><meta charset="utf-8"></head><body style="margin:0;background:#17171e;color:#eee9e2;font-family:Arial,sans-serif"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px"><table role="presentation" width="100%" style="max-width:560px;background:#24232b;border-radius:12px" cellpadding="24"><tr><td><p style="color:#ff922f;font-size:18px;font-weight:bold">${mailLogo}Halloween Map</p><h1 style="font-size:24px;color:#fff">${escape(title)}</h1><div style="font-size:16px;line-height:1.6">${editorialHtml(text, variables)}</div>${cta ? `<p style="margin:28px 0"><a href="${escape(url!.href)}" style="display:inline-block;padding:14px 24px;background:#ff922f;color:#17171e;font-weight:bold;text-decoration:none;border-radius:6px">${escape(cta.label)}</a></p>` : ""}<hr style="border:0;border-top:1px solid #49454e"><p style="font-size:12px;color:#bbb5c1">Halloween Map · Une nuit à partager.<br>Si vous n’êtes pas à l’origine de cette demande, ignorez ce message.</p></td></tr></table></td></tr></table></body></html>`;
}
