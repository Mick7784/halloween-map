import { Fragment, type ReactNode } from "react";
// Only a small Markdown vocabulary is rendered. Never inject HTML.
function inline(text: string): ReactNode[] {
  return text
    .split(/(\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\([^)]+\))/g)
    .map((part, n) => {
      if (part.startsWith("**"))
        return <strong key={n}>{part.slice(2, -2)}</strong>;
      if (part.startsWith("*")) return <em key={n}>{part.slice(1, -1)}</em>;
      const link = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      if (link && /^(https?:\/\/|\/(?!\/)|mailto:)[^\s]*$/i.test(link[2]))
        return (
          <a key={n} href={link[2]} rel="noopener noreferrer">
            {link[1]}
          </a>
        );
      return part;
    });
}
export default function Editorial({ text }: { text: string }) {
  const blocks = text.split(/\n\s*\n/);
  return (
    <div className="editorial-copy">
      {blocks.map((block, n) => {
        if (block.startsWith("- "))
          return (
            <ul key={n}>
              {block.split("\n").map((line, i) => (
                <li key={i}>{inline(line.replace(/^- /, ""))}</li>
              ))}
            </ul>
          );
        if (block.startsWith("## "))
          return <h3 key={n}>{inline(block.slice(3))}</h3>;
        if (block.startsWith("# "))
          return <h2 key={n}>{inline(block.slice(2))}</h2>;
        return (
          <p key={n}>
            {block.split("\n").map((line, i) => (
              <Fragment key={i}>
                {i > 0 && <br />}
                {inline(line)}
              </Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}
