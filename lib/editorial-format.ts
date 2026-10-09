export const escapeHtml = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
export function editorialHtml(
  value: string,
  variables?: Record<string, string>,
) {
  function inline(text: string): string {
    return text
      .split(/(\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\([^)]+\))/g)
      .map((part) => {
        if (part.startsWith("**"))
          return `<strong>${escapeHtml(part.slice(2, -2))}</strong>`;
        if (part.startsWith("*"))
          return `<em>${escapeHtml(part.slice(1, -1))}</em>`;
        const link = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
        if (link && /^(https:\/\/|\/(?!\/)|mailto:)[^\s]*$/i.test(link[2]))
          return `<a href="${escapeHtml(link[2])}" rel="noopener noreferrer">${escapeHtml(link[1])}</a>`;
        return escapeHtml(part);
      })
      .join("");
  }
  const html = value
    .split(/\n\s*\n/)
    .map((block) => {
      if (block.startsWith("- "))
        return `<ul>${block
          .split("\n")
          .map((line) => `<li>${inline(line.replace(/^- /, ""))}</li>`)
          .join("")}</ul>`;
      if (block.startsWith("## ")) return `<h3>${inline(block.slice(3))}</h3>`;
      if (block.startsWith("# ")) return `<h2>${inline(block.slice(2))}</h2>`;
      return `<p>${block.split("\n").map(inline).join("<br>")}</p>`;
    })
    .join("");
  return variables
    ? html.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key) =>
        escapeHtml(variables[key] ?? "").replace(/\n/g, "<br>"),
      )
    : html;
}
export function editorialText(value: string) {
  return value
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/^#{1,2} /gm, "");
}
