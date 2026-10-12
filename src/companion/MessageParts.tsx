import { useEffect, useState } from "react";
import { ArrowUpRight, Check, Copy } from "lucide-react";
import { safeUrl } from "../api/tauri";
import type { ChatMessage } from "../ai/api";

export function relativeTime(iso: string, now: number): string {
  const time = new Date(iso).getTime();
  if (Number.isNaN(time)) return "";
  const minutes = Math.max(0, Math.floor((now - time) / 60000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const date = new Date(time);
  const day = date.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
  });
  return `${day}, ${date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}`;
}

function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30000);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}

export function MessageMeta({ message }: { message: ChatMessage }) {
  const now = useNow();
  const [copied, setCopied] = useState(false);
  const assistant = message.role === "assistant";
  return (
    <div className="message-meta">
      {assistant && (
        <button
          type="button"
          className="message-copy"
          aria-label="Copy answer"
          title="Copy answer"
          onClick={() => {
            void navigator.clipboard
              ?.writeText(message.text)
              .then(() => {
                setCopied(true);
                window.setTimeout(() => setCopied(false), 1500);
              })
              .catch(() => undefined);
          }}
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
        </button>
      )}
      <time
        dateTime={message.created_at}
        title={new Date(message.created_at).toLocaleString()}
      >
        {relativeTime(message.created_at, now)}
      </time>
    </div>
  );
}

function domain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function Sources({
  resources,
  disabled,
  onOpen,
}: {
  resources: ChatMessage["resources"];
  disabled: boolean;
  onOpen: (url: string) => void;
}) {
  if (!resources.length) return null;
  return (
    <section className="message-sources" aria-label="Sources">
      <h4>Sources</h4>
      <ol>
        {resources.map((resource, index) => (
          <li key={resource.url}>
            <button
              type="button"
              disabled={!safeUrl(resource.url) || disabled}
              title={resource.whyRelevant}
              onClick={() => onOpen(resource.url)}
            >
              <span className="source-number">{index + 1}</span>
              <span className="source-text">
                <span className="source-title">{resource.title}</span>
                <span className="source-domain">{domain(resource.url)}</span>
              </span>
              <ArrowUpRight size={13} aria-hidden="true" />
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}
