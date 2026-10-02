import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Mic, Send, X, Trash2 } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { api, desktop, safeUrl } from "../api/tauri";
import type { AvatarState, Goal, GoalPlan } from "../types";
import type { CompanionAction, CompanionReply, CompanionView } from "./types";

export function CompanionChat({
  view,
  goal,
  plan,
  onChanged,
  onState,
}: {
  view: CompanionView;
  goal: Goal | null;
  plan: GoalPlan | null;
  onChanged: () => Promise<void>;
  onState: (state: AvatarState) => void;
}) {
  const [text, setText] = useState(view.seed.slice(0, 500));
  const [action, setAction] = useState<CompanionAction>(
    view.intent === "selection" ? "task" : view.intent,
  );
  const [reply, setReply] = useState<CompanionReply | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [voice, setVoice] = useState(false);
  const input = useRef<HTMLTextAreaElement>(null);
  const successTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    input.current?.focus();
    return () => {
      if (successTimer.current) clearTimeout(successTimer.current);
    };
  }, []);
  useEffect(() => {
    setText(view.seed.slice(0, 500));
    setAction(view.intent === "selection" ? "task" : view.intent);
    setReply(null);
  }, [view.seed, view.intent]);
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        void api
          .closeChat()
          .then(onChanged)
          .catch((e) => setError(String(e)));
      }
    };
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, [onChanged]);
  async function run(work: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await work();
      await onChanged();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  async function submit() {
    if (!text.trim() || busy || !desktop) return;
    onState("thinking");
    let succeeded = false;
    await run(async () => {
      setReply(
        await api.companionSubmit(
          text.trim(),
          action,
          goal?.id ?? null,
          plan?.revision ?? null,
        ),
      );
      succeeded = true;
      if (action === "task" || action === "save") setText("");
    });
    if (succeeded && (action === "task" || action === "save")) {
      onState("success");
      if (successTimer.current) clearTimeout(successTimer.current);
      successTimer.current = setTimeout(() => onState("idle"), 1600);
    } else onState("idle");
  }
  return (
    <section className="companion-chat" aria-label="Buddy mini chat">
      <header>
        <div>
          <strong>Buddy</strong>
          <small>A thought, a task, a little help.</small>
        </div>
        <button
          className="text-button"
          title="Open full app"
          onClick={() => void run(api.openWorkspace)}
        >
          <ArrowUpRight size={15} />
          Open app
        </button>
        <button
          className="companion-icon"
          aria-label="Close mini chat"
          onClick={() => void run(api.closeChat)}
        >
          <X size={16} />
        </button>
      </header>
      <div className="companion-chat-scroll">
        {goal && (
          <p className="companion-goal">
            <span>Current goal</span>
            {goal.text}
          </p>
        )}
        <div className="companion-intents" aria-label="Choose an action">
          {(
            [
              ["ask", "Ask Buddy"],
              ["task", "Add task"],
              ["research", "Research"],
              ...(view.intent === "selection"
                ? [
                    ["explain", "Explain"],
                    ["save", "Save for later"],
                  ]
                : []),
            ] as [CompanionAction, string][]
          ).map(([value, label]) => (
            <button
              className={action === value ? "selected" : ""}
              aria-pressed={action === value}
              key={value}
              onClick={() => setAction(value)}
            >
              {label}
            </button>
          ))}
        </div>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <label htmlFor="companion-input" className="sr-only">
            Your message or task
          </label>
          <textarea
            id="companion-input"
            ref={input}
            value={text}
            maxLength={500}
            rows={3}
            disabled={busy}
            placeholder={
              action === "task"
                ? "What would you like to do?"
                : "What is on your mind?"
            }
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
                event.preventDefault();
                void submit();
              }
            }}
          />
          <div className="companion-composer-actions">
            <button
              type="button"
              className="companion-icon"
              aria-label={
                voice
                  ? "Stop Windows voice typing"
                  : "Start Windows voice typing"
              }
              title="Voice typing · Windows + H"
              disabled={!desktop || busy}
              onClick={() => {
                input.current?.focus();
                setVoice(!voice);
                onState(voice ? "idle" : "listening");
                void api.voiceInput().catch((e) => {
                  setError(String(e));
                  setVoice(false);
                  onState("idle");
                });
              }}
            >
              <Mic size={16} />
            </button>
            <span>{busy ? "Thinking…" : "Ctrl + Enter to send"}</span>
            <button type="submit" disabled={!desktop || busy || !text.trim()}>
              <Send size={14} />
              {action === "task"
                ? "Add task"
                : action === "save"
                  ? "Save"
                  : "Send"}
            </button>
          </div>
        </form>
        <p className="companion-disclosure">
          {action === "task" || action === "save"
            ? goal && action === "task"
              ? "Adds a step to your current goal after you press Add task."
              : "Saved locally in your Buddy inbox."
            : action === "research"
              ? "Sends this topic to web search. Nothing opens automatically."
              : "Sends your message and current goal context to the connected AI service."}
        </p>
        <p className="companion-disclosure">
          Voice input uses Windows voice typing and its speech privacy settings.
        </p>
        {voice && (
          <p className="companion-disclosure" role="status">
            Windows voice typing was requested. Press Windows + H to stop or
            open it manually.
          </p>
        )}
        {view.shortcut_available && (
          <p className="companion-disclosure">
            Select text in another app, then press Ctrl + Alt + B.
          </p>
        )}
        {(view.notice || error) && (
          <p className="companion-error" role="alert">
            {error || view.notice}
          </p>
        )}
        {reply && (
          <section className="companion-reply" aria-live="polite">
            <p>{reply.message}</p>
            {reply.resources.map((resource) => (
              <button
                className="companion-resource"
                key={resource.url}
                disabled={!safeUrl(resource.url)}
                onClick={() =>
                  void run(async () => {
                    const url = safeUrl(resource.url);
                    if (url) await openUrl(url);
                  })
                }
              >
                <span>{resource.title}</span>
                <ArrowUpRight size={14} />
              </button>
            ))}
          </section>
        )}
        {view.inbox.length > 0 && (
          <details className="companion-inbox">
            <summary>
              Buddy inbox · {view.inbox.filter((t) => !t.done).length} open
            </summary>
            <ul>
              {view.inbox.map((task) => (
                <li key={task.id}>
                  <label>
                    <input
                      type="checkbox"
                      checked={task.done}
                      disabled={!desktop || busy || task.done}
                      onChange={() =>
                        void run(() => api.companionInbox(task.id, "complete"))
                      }
                    />
                    <span>{task.text}</span>
                  </label>
                  <button
                    className="companion-icon"
                    aria-label={`Remove ${task.text}`}
                    disabled={!desktop || busy}
                    onClick={() =>
                      void run(() => api.companionInbox(task.id, "remove"))
                    }
                  >
                    <Trash2 size={13} />
                  </button>
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </section>
  );
}
