import { Fragment, useState, type ReactNode } from "react";
import { Check, Copy } from "lucide-react";
import { safeUrl, desktop } from "../api/tauri";
import { openUrl } from "@tauri-apps/plugin-opener";

/** Some models return markdown on a single line; put the obvious block breaks back. */
export function repairMarkdown(text: string): string {
  if (text.includes("\n") || text.length < 160) return text;
  return text
    .replace(/(\S)(#{1,3} )/g, "$1\n\n$2")
    .replace(/(#{1,3} [A-Za-z][A-Za-z ]*?)(\d{1,2}\. )/g, "$1\n\n$2")
    .replace(/([.:;!?)*])\s*(\d{1,2}\. )(?=\*\*|[A-Z])/g, "$1\n$2")
    .replace(/([.:;!?)*])\s+([-•] )(?=[A-Z0-9*`])/g, "$1\n$2");
}

function inline(text: string, key: string): ReactNode[] {
  const parts: ReactNode[] = [];
  const pattern =
    /(`[^`\n]+`|\[[^\]\n]+\]\(https?:\/\/[^\s)]+\)|\*\*[^*\n]+\*\*|\*[^*\s][^*\n]*\*)/g;
  let last = 0;
  let index = 0;
  for (const match of text.matchAll(pattern)) {
    const start = match.index ?? 0;
    if (start > last) parts.push(text.slice(last, start));
    const token = match[0];
    const id = `${key}-${index++}`;
    const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(token);
    if (link && safeUrl(link[2]))
      parts.push(
        <a
          key={id}
          href={link[2]}
          onClick={(event) => {
            event.preventDefault();
            const url = safeUrl(link[2]);
            if (!url) return;
            if (desktop) void openUrl(url).catch(() => undefined);
            else window.open(url, "_blank", "noopener,noreferrer");
          }}
        >
          {link[1]}
        </a>,
      );
    else if (token.startsWith("`"))
      parts.push(<code key={id}>{token.slice(1, -1)}</code>);
    else if (token.startsWith("**"))
      parts.push(<strong key={id}>{inline(token.slice(2, -2), id)}</strong>);
    else if (token.startsWith("*"))
      parts.push(<em key={id}>{inline(token.slice(1, -1), id)}</em>);
    else parts.push(token);
    last = start + token.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

function CodeBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="md-code">
      <button
        type="button"
        className="md-copy"
        aria-label="Copy"
        onClick={() => {
          void navigator.clipboard
            ?.writeText(code)
            .then(() => {
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1500);
            })
            .catch(() => undefined);
        }}
      >
        {copied ? <Check size={13} /> : <Copy size={13} />}
        {copied ? "Copied" : "Copy"}
      </button>
      <pre>
        <code>{code}</code>
      </pre>
    </div>
  );
}

type Block =
  | { kind: "p"; text: string }
  | { kind: "h"; level: number; text: string }
  | { kind: "ul" | "ol"; items: string[] }
  | { kind: "quote"; text: string }
  | { kind: "code"; code: string }
  | { kind: "hr" };

function blocks(source: string): Block[] {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const result: Block[] = [];
  let paragraph: string[] = [];
  const flush = () => {
    if (paragraph.length)
      result.push({ kind: "p", text: paragraph.join("\n") });
    paragraph = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*```/.test(line)) {
      flush();
      const code: string[] = [];
      i++;
      while (i < lines.length && !/^\s*```/.test(lines[i]))
        code.push(lines[i++]);
      result.push({ kind: "code", code: code.join("\n") });
      continue;
    }
    if (!line.trim()) {
      flush();
      continue;
    }
    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    if (heading) {
      flush();
      result.push({ kind: "h", level: heading[1].length, text: heading[2] });
      continue;
    }
    if (/^\s*([-*_])\1{2,}\s*$/.test(line)) {
      flush();
      result.push({ kind: "hr" });
      continue;
    }
    const bullet = /^\s*[-*•]\s+(.*)$/.exec(line);
    const numbered = /^\s*\d{1,3}[.)]\s+(.*)$/.exec(line);
    if (bullet || numbered) {
      flush();
      const kind = bullet ? "ul" : "ol";
      const last = result[result.length - 1];
      const item = (bullet ?? numbered)![1];
      if (last?.kind === kind) last.items.push(item);
      else result.push({ kind, items: [item] });
      continue;
    }
    const quote = /^\s*>\s?(.*)$/.exec(line);
    if (quote) {
      flush();
      const last = result[result.length - 1];
      if (last?.kind === "quote") last.text += `\n${quote[1]}`;
      else result.push({ kind: "quote", text: quote[1] });
      continue;
    }
    const last = result[result.length - 1];
    // A wrapped line directly under a list item belongs to that item.
    if (
      !paragraph.length &&
      (last?.kind === "ul" || last?.kind === "ol") &&
      /^\s+\S/.test(line)
    ) {
      last.items[last.items.length - 1] += ` ${line.trim()}`;
      continue;
    }
    paragraph.push(line);
  }
  flush();
  return result;
}

export function Markdown({ text }: { text: string }) {
  const parsed = blocks(repairMarkdown(text));
  return (
    <div className="markdown">
      {parsed.map((block, index) => {
        const key = `b${index}`;
        switch (block.kind) {
          case "h": {
            const Tag = (["h3", "h3", "h4", "h5"] as const)[block.level - 1];
            return <Tag key={key}>{inline(block.text, key)}</Tag>;
          }
          case "ul":
          case "ol": {
            const List = block.kind;
            return (
              <List key={key}>
                {block.items.map((item, n) =>
                  /^\[([ xX])\]\s+/.test(item) ? (
                    <li key={`${key}-${n}`} className="md-task">
                      <input
                        type="checkbox"
                        checked={/^\[[xX]\]/.test(item)}
                        disabled
                        aria-label={item.replace(/^\[[ xX]\]\s+/, "")}
                      />
                      <span>
                        {inline(
                          item.replace(/^\[[ xX]\]\s+/, ""),
                          `${key}-${n}`,
                        )}
                      </span>
                    </li>
                  ) : (
                    <li key={`${key}-${n}`}>{inline(item, `${key}-${n}`)}</li>
                  ),
                )}
              </List>
            );
          }
          case "quote":
            return <blockquote key={key}>{inline(block.text, key)}</blockquote>;
          case "code":
            return <CodeBlock key={key} code={block.code} />;
          case "hr":
            return <hr key={key} />;
          default:
            return (
              <p key={key}>
                {block.text.split("\n").map((row, n) => (
                  <Fragment key={`${key}-${n}`}>
                    {n > 0 && <br />}
                    {inline(row, `${key}-${n}`)}
                  </Fragment>
                ))}
              </p>
            );
        }
      })}
    </div>
  );
}
